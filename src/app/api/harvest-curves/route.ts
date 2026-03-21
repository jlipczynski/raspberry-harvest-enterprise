import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const varietyId = searchParams.get('varietyId')
    const season = searchParams.get('season')
    const sectionId = searchParams.get('sectionId')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const where: Record<string, unknown> = {}
    if (!includeArchived) where.isArchived = false
    if (year) where.year = parseInt(year)
    if (varietyId) where.varietyId = varietyId
    if (season) where.season = season
    if (sectionId) where.sectionId = sectionId
    const curves = await prisma.harvestCurve.findMany({
      where,
      include: {
        section: { select: { id: true, name: true } },
        variety: { select: { id: true, name: true } },
      },
      orderBy: [{ year: 'desc' }, { season: 'asc' }],
    })
    return NextResponse.json({ curves })
  } catch (error) {
    console.error('Error fetching harvest curves:', error)
    return NextResponse.json({ error: 'Failed to fetch harvest curves' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[harvest-curves POST] Received', Array.isArray(body.curves) ? `${body.curves.length} curves` : 'single curve')

    const buildData = (c: Record<string, unknown>) => {
      const data: Record<string, unknown> = {
        name: c.name || null,
        year: c.year,
        season: c.season ?? null,
        curve: c.curve,
        totalKg: c.totalKg,
        startWeek: c.startWeek,
        sourceFile: c.sourceFile || null,
        dailyCurve: c.dailyCurve || [],
        startDate: c.startDate || null,
        winteredInTunnel: c.winteredInTunnel ?? null,
        plantingDate: c.plantingDate ? new Date(c.plantingDate as string) : null,
        plantSource: c.plantSource || null,
        plantingYear: c.plantingYear ?? null,
        autumnShootDate: c.autumnShootDate ? new Date(c.autumnShootDate as string) : null,
        sectionId: c.sectionId || null,
        varietyId: c.varietyId || null,
      }
      return data
    }

    // Upsert: find existing by (name, year) — used during XLSX import
    const upsertCurve = async (c: Record<string, unknown>) => {
      const data = buildData(c)
      const name = data.name as string | null
      const year = data.year as number
      if (name && year) {
        const existing = await prisma.harvestCurve.findFirst({
          where: { name, year },
        })
        if (existing) {
          return prisma.harvestCurve.update({
            where: { id: existing.id },
            data,
          })
        }
      }
      return prisma.harvestCurve.create({ data: data as Parameters<typeof prisma.harvestCurve.create>[0]['data'] })
    }

    if (Array.isArray(body.curves)) {
      const results = []
      for (const c of body.curves) {
        results.push(await upsertCurve(c as Record<string, unknown>))
      }
      console.log('[harvest-curves POST] Upserted', results.length, 'curves successfully')
      return NextResponse.json({ curves: results })
    }

    const curve = await upsertCurve(body)
    return NextResponse.json({ curve })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Error creating harvest curve:', errMsg, error)
    return NextResponse.json({ error: `Failed to create harvest curve: ${errMsg}` }, { status: 500 })
  }
}
