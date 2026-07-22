import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import { sessionSchema, buildSessionData } from '@/lib/piece-rate-session'

export const dynamic = 'force-dynamic'

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

    const built = buildSessionData(parsed.data)
    if (built === null) {
      return NextResponse.json(
        { error: 'Nie da się policzyć stawki — brak pracowników wzorcowych z dodatnimi godzinami' },
        { status: 400 }
      )
    }

    const session = await prisma.pieceRateSession.create({
      data: {
        tenantId,
        farmId,
        ...built.scalars,
        rows: { create: built.rowData },
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
