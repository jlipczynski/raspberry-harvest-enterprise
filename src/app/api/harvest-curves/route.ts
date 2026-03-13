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
    const where: Record<string, unknown> = {}
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
    if (Array.isArray(body.curves)) {
      const created = await prisma.$transaction(
        body.curves.map((c: Record<string, unknown>) => {
          const data: Record<string, unknown> = {
            year: c.year,
            season: c.season,
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
          }
          if (c.sectionId) data.section = { connect: { id: c.sectionId } }
          if (c.varietyId) data.variety = { connect: { id: c.varietyId } }
          return prisma.harvestCurve.create({ data: data as Parameters<typeof prisma.harvestCurve.create>[0]['data'] })
        })
      )
      return NextResponse.json({ curves: created })
    }
    const data: Record<string, unknown> = {
      year: body.year,
      season: body.season,
      curve: body.curve,
      totalKg: body.totalKg,
      startWeek: body.startWeek,
      sourceFile: body.sourceFile || null,
      dailyCurve: body.dailyCurve || [],
      startDate: body.startDate || null,
      winteredInTunnel: body.winteredInTunnel ?? null,
      plantingDate: body.plantingDate ? new Date(body.plantingDate as string) : null,
      plantSource: body.plantSource || null,
      plantingYear: body.plantingYear ?? null,
      autumnShootDate: body.autumnShootDate ? new Date(body.autumnShootDate as string) : null,
    }
    if (body.sectionId) data.section = { connect: { id: body.sectionId } }
    if (body.varietyId) data.variety = { connect: { id: body.varietyId } }
    const curve = await prisma.harvestCurve.create({
      data: data as Parameters<typeof prisma.harvestCurve.create>[0]['data'],
      include: {
        section: { select: { id: true, name: true } },
        variety: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json({ curve })
  } catch (error) {
    console.error('Error creating harvest curve:', error)
    return NextResponse.json({ error: 'Failed to create harvest curve' }, { status: 500 })
  }
}
