import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Pobierz status sezonu zbiorów dla sekcji
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sectionId = searchParams.get('sectionId')
    const year = searchParams.get('year')
    const season = searchParams.get('season')

    const where: Record<string, unknown> = {}
    if (sectionId) where.sectionId = sectionId
    if (year) where.year = parseInt(year)
    if (season) where.season = season

    const harvestSeasons = await prisma.harvestSeason.findMany({
      where,
      include: {
        section: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ year: 'desc' }, { season: 'asc' }],
    })

    return NextResponse.json({ harvestSeasons })
  } catch (error) {
    console.error('Error fetching harvest seasons:', error)
    return NextResponse.json({ error: 'Failed to fetch harvest seasons' }, { status: 500 })
  }
}

// Utwórz/zaktualizuj sezon — w szczególności zakotwiczenie (commercialStartDate)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sectionId, year, season, commercialStartDate, gdhPredictedStartDate } = body

    if (!sectionId || !year || !season) {
      return NextResponse.json(
        { error: 'Missing required fields: sectionId, year, season' },
        { status: 400 }
      )
    }

    // Sprawdź czy istnieje już — upsert
    const existing = await prisma.harvestSeason.findUnique({
      where: {
        sectionId_year_season: { sectionId, year, season },
      },
    })

    // Jeśli commercialStartDate jest już ustawione, nie nadpisuj (jednorazowa decyzja)
    if (existing?.commercialStartDate && commercialStartDate) {
      return NextResponse.json({
        harvestSeason: existing,
        message: 'Commercial start date already set — cannot change',
      })
    }

    const harvestSeason = await prisma.harvestSeason.upsert({
      where: {
        sectionId_year_season: { sectionId, year, season },
      },
      create: {
        sectionId,
        year,
        season,
        commercialStartDate: commercialStartDate ? new Date(commercialStartDate) : null,
        gdhPredictedStartDate: gdhPredictedStartDate ? new Date(gdhPredictedStartDate) : null,
      },
      update: {
        ...(commercialStartDate && !existing?.commercialStartDate
          ? { commercialStartDate: new Date(commercialStartDate) }
          : {}),
        ...(gdhPredictedStartDate
          ? { gdhPredictedStartDate: new Date(gdhPredictedStartDate) }
          : {}),
      },
    })

    return NextResponse.json({ harvestSeason })
  } catch (error) {
    console.error('Error saving harvest season:', error)
    return NextResponse.json({ error: 'Failed to save harvest season' }, { status: 500 })
  }
}
