import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sectionId = searchParams.get('sectionId')
    const year = searchParams.get('year')
    const season = searchParams.get('season')

    const where: Record<string, unknown> = {}
    if (sectionId) where.sectionId = sectionId
    if (season) where.season = season
    if (year) {
      where.date = {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      }
    }

    const harvests = await prisma.harvest.findMany({
      where,
      orderBy: { date: 'asc' },
    })

    return NextResponse.json({ harvests })
  } catch (error) {
    console.error('Error fetching harvests:', error)
    return NextResponse.json({ error: 'Failed to fetch harvests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (Array.isArray(body.harvests)) {
      const created = await prisma.$transaction(
        body.harvests.map((h: {
          date: string
          yieldKg: number
          season?: string
          isPreHarvest?: boolean
          sectionId: string
          notes?: string
        }) =>
          prisma.harvest.create({
            data: {
              date: new Date(h.date),
              yieldKg: h.yieldKg,
              season: h.season || null,
              isPreHarvest: h.isPreHarvest || false,
              sectionId: h.sectionId,
              notes: h.notes || null,
            },
          })
        )
      )
      return NextResponse.json({ harvests: created })
    }

    const harvest = await prisma.harvest.create({
      data: {
        date: new Date(body.date),
        yieldKg: body.yieldKg,
        season: body.season || null,
        isPreHarvest: body.isPreHarvest || false,
        sectionId: body.sectionId,
        notes: body.notes || null,
      },
    })

    return NextResponse.json({ harvest })
  } catch (error) {
    console.error('Error creating harvests:', error)
    return NextResponse.json({ error: 'Failed to create harvests' }, { status: 500 })
  }
}
