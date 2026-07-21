import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import { computePieceRate } from '@/lib/piece-rate'

export const dynamic = 'force-dynamic'

const rowSchema = z.object({
  workerName: z.string().min(1),
  externalId: z.string().nullable().optional(),
  kg: z.number().finite().nonnegative(),
  industrialKg: z.number().finite().nonnegative().optional(),
  hours: z.number().finite().nonnegative(),
  isReference: z.boolean().optional(),
  isHarvestWorker: z.boolean().optional(),
  currentAmount: z.number().finite().nullable().optional(),
})

const sessionSchema = z.object({
  harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie YYYY-MM-DD'),
  fileName: z.string().min(1),
  mode: z.enum(['MANUAL', 'AUTO_MEDIAN']),
  targetHourly: z.number().finite().positive(),
  medianCount: z.number().int().positive(),
  breakMinutes: z.number().finite().nonnegative(),
  roundingStep: z.number().finite().positive(),
  /** Ręcznie narzucona stawka zł/kg — zapisujemy ją zamiast wyliczonej */
  rateOverride: z.number().finite().positive().nullable().optional(),
  /** Stała stawka zł/kg za przemysł */
  industrialRate: z.number().finite().positive().nullable().optional(),
  /** Odcięcie najsłabszych poniżej tej wydajności kg/h */
  cutoffKgPerHour: z.number().finite().nonnegative().nullable().optional(),
  note: z.string().nullable().optional(),
  rows: z.array(rowSchema).min(1, 'Brak wierszy do zapisania'),
})

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePieceRateContext()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: { tenantId: string; harvestDate?: { gte?: Date; lte?: Date } } = { tenantId }
    if (from || to) {
      where.harvestDate = {}
      if (from) where.harvestDate.gte = new Date(from)
      if (to) where.harvestDate.lte = new Date(to)
    }

    const sessions = await prisma.pieceRateSession.findMany({
      where,
      orderBy: [{ harvestDate: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { rows: true } } },
    })

    return NextResponse.json({
      sessions: sessions.map((session) => ({
        ...session,
        workerCount: session._count.rows,
      })),
    })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/sessions GET] Error:', error)
    return NextResponse.json({ error: 'Nie udało się pobrać sesji' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, farmId } = await requirePieceRateContext()

    const parsed = sessionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Nieprawidłowe dane', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const body = parsed.data

    // Stawkę przeliczamy na serwerze tą samą funkcją co na kliencie — zapisujemy
    // wynik policzony tutaj, żeby podmiana w przeglądarce nic nie zmieniła.
    const result = computePieceRate(body.rows, {
      mode: body.mode,
      targetHourly: body.targetHourly,
      medianCount: body.medianCount,
      roundingStep: body.roundingStep,
      breakHours: body.breakMinutes / 60,
      rateOverride: body.rateOverride === undefined ? null : body.rateOverride,
      industrialRate: body.industrialRate === undefined ? null : body.industrialRate,
    })

    if (result.rate === null) {
      return NextResponse.json(
        { error: 'Nie da się policzyć stawki — brak pracowników wzorcowych z dodatnimi godzinami' },
        { status: 400 }
      )
    }

    const session = await prisma.pieceRateSession.create({
      data: {
        tenantId,
        farmId,
        harvestDate: new Date(body.harvestDate),
        fileName: body.fileName,
        mode: body.mode,
        targetHourly: body.targetHourly,
        medianCount: body.medianCount,
        breakMinutes: Math.round(body.breakMinutes),
        roundingStep: body.roundingStep,
        industrialRate: body.industrialRate === undefined ? null : body.industrialRate,
        cutoffKgPerHour: body.cutoffKgPerHour === undefined ? null : body.cutoffKgPerHour,
        computedRate: result.rate,
        note: body.note || null,
        rows: {
          create: result.rows.map((row) => ({
            workerName: row.workerName,
            externalId: row.externalId || null,
            kg: row.kg,
            industrialKg: row.industrialKg,
            dessertKg: row.dessertKg,
            hours: row.hours,
            effectiveHours: row.effectiveHours,
            kgPerHour: row.kgPerHour === null ? 0 : row.kgPerHour,
            isReference: row.isReference,
            isHarvestWorker: row.isHarvestWorker !== false,
            earnings: row.earnings,
            effectiveHourly: row.effectiveHourly,
            currentAmount: row.currentAmount === undefined ? null : row.currentAmount,
          })),
        },
      },
      include: { _count: { select: { rows: true } } },
    })

    return NextResponse.json({ session: { ...session, workerCount: session._count.rows } })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/sessions POST] Error:', error)
    return NextResponse.json({ error: 'Nie udało się zapisać sesji' }, { status: 500 })
  }
}
