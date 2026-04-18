import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { calculateHarvestForecast, type HarvestDay } from '@/lib/harvest-forecast'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  try {
    const { sectionId } = await params
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const season = searchParams.get('season') || 'summer'

    // Pobierz sekcję z odmianą
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        variety: true,
        harvestSeasons: {
          where: { year, season },
        },
      },
    })

    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }

    const variety = section.variety

    // Krzywa z odmiany (% na tydzień) — brak = błąd, nie generuj danych
    const rawCurve = season === 'summer'
      ? (variety.harvestCurveSummer as number[])
      : (variety.harvestCurveAutumn as number[])
    if (!rawCurve || rawCurve.length === 0) {
      return NextResponse.json({ error: 'Brak krzywej zbiorów dla odmiany — uzupełnij dane odmiany' }, { status: 422 })
    }
    const varietyCurve = rawCurve

    // Szacowany plon: shoots * yieldPerShoot
    const pots = (section.potsOverride != null && section.potsOverride > 0) ? section.potsOverride : section.metersLength * section.potsPerMeter
    const shoots = pots * section.shootsPerPot
    const yieldPerShoot = season === 'summer'
      ? (section.yieldSummerPerShoot || variety.yieldSummerPerShoot || 0)
      : (section.yieldAutumnPerShoot || variety.yieldAutumnPerShoot || 0)
    const estimatedTotalKg = shoots * yieldPerShoot

    // Realne dane zbiorów
    const harvests = await prisma.harvest.findMany({
      where: {
        sectionId,
        date: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`),
        },
        ...(season ? { season } : {}),
      },
      orderBy: { date: 'asc' },
    })

    const actualHarvests: HarvestDay[] = harvests.map(h => ({
      date: h.date.toISOString().split('T')[0],
      kg: h.yieldKg,
      isPreHarvest: h.isPreHarvest,
    }))

    // HarvestSeason — status zakotwiczenia
    const harvestSeason = section.harvestSeasons[0] || null

    // GDH start — z harvestSeason lub domyślny
    const gdhPredictedStartDate = harvestSeason?.gdhPredictedStartDate
      ? harvestSeason.gdhPredictedStartDate.toISOString().split('T')[0]
      : null
    const commercialStartDate = harvestSeason?.commercialStartDate
      ? harvestSeason.commercialStartDate.toISOString().split('T')[0]
      : null

    let gdhPredictedStartWeek: number | null = null
    if (gdhPredictedStartDate) {
      const d = new Date(gdhPredictedStartDate)
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      gdhPredictedStartWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    }

    const forecast = calculateHarvestForecast({
      varietyCurve,
      estimatedTotalKg,
      gdhPredictedStartWeek,
      gdhPredictedStartDate,
      commercialStartDate,
      actualHarvests,
      year,
    })

    return NextResponse.json({
      sectionId,
      sectionName: section.name,
      varietyName: variety.name,
      season,
      year,
      shoots,
      yieldPerShoot,
      ...forecast,
    })
  } catch (error) {
    console.error('Error calculating harvest forecast:', error)
    return NextResponse.json({ error: 'Failed to calculate forecast' }, { status: 500 })
  }
}
