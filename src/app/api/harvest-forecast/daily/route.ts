import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'
import { calculateDailyForecast } from '@/lib/harvest-daily-forecast'

export const dynamic = 'force-dynamic'

const GDH_UPPER_TEMP = 26.0

function toISODate(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

interface DailyAgg {
  date: Date
  cnt: number
  sum_gdh: number
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get('days') || '14', 10)
  const daysAhead = Math.min(Math.max(daysParam, 7), 30)
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({
      where: { tenantId },
      include: {
        blocks: {
          include: {
            sections: {
              include: { variety: true },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!farm) {
      return NextResponse.json({ blocks: [], predictions: [] })
    }

    const forecastCache = await prisma.forecastCache.findUnique({
      where: { farmId: farm.id },
    })

    // --- 1. Build section infos with fruit dates (same as weekly) ---
    const allSections = farm.blocks.flatMap(b =>
      b.sections.map(s => ({ ...s, blockName: b.name }))
    )

    // Collect all baseTamps per section for GDH map
    const baseTempSet = new Set<number>()

    interface SectionForDaily {
      blockName: string
      fruitDate: string
      harvestCurve: number[]
      totalKg: number
    }

    const sectionInfos: SectionForDaily[] = []

    for (const section of allSections) {
      const v = section.variety
      const baseTemp = v?.baseTemp ?? null
      if (baseTemp === null) continue
      baseTempSet.add(baseTemp)

      // --- Compute fruit date from GDH (summer) ---
      const gdhStartDate = (!section.winteredInTunnel && section.plantingDate)
        ? new Date(section.plantingDate)
        : null

      const dailyAgg: DailyAgg[] = gdhStartDate
        ? await prisma.$queryRaw`
            SELECT DATE("timestamp") as date, COUNT(*)::int as cnt,
              COALESCE(SUM(GREATEST(0, LEAST("temperature", ${GDH_UPPER_TEMP}) - ${baseTemp})), 0)::float as sum_gdh
            FROM temperature_readings
            WHERE "sectionId" = ${section.id} AND "timestamp" >= ${gdhStartDate}
            GROUP BY DATE("timestamp") ORDER BY date
          `
        : await prisma.$queryRaw`
            SELECT DATE("timestamp") as date, COUNT(*)::int as cnt,
              COALESCE(SUM(GREATEST(0, LEAST("temperature", ${GDH_UPPER_TEMP}) - ${baseTemp})), 0)::float as sum_gdh
            FROM temperature_readings
            WHERE "sectionId" = ${section.id}
            GROUP BY DATE("timestamp") ORDER BY date
          `

      let cumGdh = 0
      let lastLoggerDate = ''
      for (const d of dailyAgg) {
        const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
        cumGdh += daily
        lastLoggerDate = toISODate(d.date)
      }

      // Fruit threshold
      let fruitThreshold: number | null = null
      if (section.winteredInTunnel) {
        fruitThreshold = section.gdhWinteredFruitSummer ?? v?.gdhWinteredFruitSummer ?? null
      } else if (section.plantMaterialType === 'LONGCANE') {
        fruitThreshold = section.gdhLcFruitSummer ?? v?.gdhLcFruitSummer ?? null
      } else {
        fruitThreshold = section.gdhPlantedFruitSummer ?? v?.gdhPlantedFruitSummer ?? null
      }

      let fruitDate: string | null = null
      let cumCheck = 0
      if (fruitThreshold) {
        for (const d of dailyAgg) {
          const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
          cumCheck += daily
          if (cumCheck >= fruitThreshold) {
            fruitDate = toISODate(d.date)
            break
          }
        }

        if (!fruitDate && forecastCache) {
          const meteoDays = (forecastCache.meteoDays as Array<{ date: string; avgTunnelTemp?: number }>) || []
          const scenarios = forecastCache.scenarios as { p50?: Array<{ date: string; avgTunnelTemp?: number }> } | null
          const forecastDays = [...meteoDays, ...(scenarios?.p50 || [])]
          let projGdh = cumGdh
          for (const day of forecastDays) {
            if (day.date <= lastLoggerDate) continue
            if (gdhStartDate && day.date < gdhStartDate.toISOString().slice(0, 10)) continue
            const avgTemp = day.avgTunnelTemp ?? 0
            const dailyGdh = Math.max(0, Math.min(avgTemp, GDH_UPPER_TEMP) - baseTemp) * 24
            projGdh += dailyGdh
            if (projGdh >= fruitThreshold) {
              fruitDate = day.date
              break
            }
          }
        }
      }

      if (!fruitDate) continue

      const curveSummer = ((v?.harvestCurveSummer as number[] | null) || []) as number[]
      if (curveSummer.length === 0) continue

      const pots = (section.potsOverride && section.potsOverride > 0)
        ? section.potsOverride
        : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const yieldPerShoot = section.yieldSummerPerShoot ?? v?.yieldSummerPerShoot ?? 0
      if (yieldPerShoot <= 0) continue

      sectionInfos.push({
        blockName: section.blockName,
        fruitDate,
        harvestCurve: curveSummer,
        totalKg: shoots * yieldPerShoot,
      })
    }

    // --- 2. Build forecast temperature data ---
    // Use the most common baseTemp for GDH map
    const baseTemp = baseTempSet.size > 0 ? Array.from(baseTempSet)[0] : 6.0

    let forecastDays: Array<{ date: string; avgTunnelTemp: number }> = []
    if (forecastCache) {
      const meteo = (forecastCache.meteoDays as Array<{ date: string; avgTunnelTemp?: number }>) || []
      const scenarios = forecastCache.scenarios as { p50?: Array<{ date: string; avgTunnelTemp?: number }> } | null
      const p50 = scenarios?.p50 || []

      // Merge meteo (priority) + p50 fallback
      const dateMap = new Map<string, number>()
      for (const d of [...p50, ...meteo]) {
        if (d.avgTunnelTemp != null) {
          dateMap.set(d.date, d.avgTunnelTemp)
        }
      }
      forecastDays = Array.from(dateMap.entries())
        .map(([date, avgTunnelTemp]) => ({ date, avgTunnelTemp }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }

    // --- 3. Fetch actual harvest entries ---
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const harvestEntries = await prisma.harvestEntry.findMany({
      where: {
        farmId: farm.id,
        date: { gte: sevenDaysAgo },
      },
      include: { block: { select: { name: true } } },
    })

    const entries = harvestEntries.map(e => ({
      date: e.date.toISOString().slice(0, 10),
      blockName: e.block?.name || e.areaName,
      weightKg: e.weightKg,
    }))

    // --- 4. Calculate daily forecast (pure GDH × curve, no correction) ---
    const blocks = calculateDailyForecast(
      sectionInfos,
      forecastDays,
      baseTemp,
      entries,
      daysAhead,
      today,
    )

    // --- 6. Also return recent history (last 7 days) for comparison ---
    const historyDates: string[] = []
    for (let i = 7; i >= 1; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      historyDates.push(d.toISOString().slice(0, 10))
    }

    const historyPredictions = await prisma.harvestPrediction.findMany({
      where: {
        farmId: farm.id,
        date: { gte: sevenDaysAgo, lt: new Date(todayStr) },
      },
      include: { block: { select: { name: true } } },
      orderBy: { date: 'asc' },
    })

    const history = historyPredictions.map(p => ({
      date: p.date.toISOString().slice(0, 10),
      blockName: p.block.name,
      predictedKg: p.predictedKg,
      actualKg: p.actualKg,
      ratio: p.ratio,
      gdhDaily: p.gdhDaily,
    }))

    // --- 7. Build forecast temperatures for display ---
    const forecastTemps: Array<{ date: string; avgTunnelTemp: number }> = []
    const targetDates: string[] = []
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      targetDates.push(d.toISOString().slice(0, 10))
    }
    for (const dateStr of targetDates) {
      const fd = forecastDays.find(f => f.date === dateStr)
      if (fd) {
        forecastTemps.push({ date: dateStr, avgTunnelTemp: Math.round(fd.avgTunnelTemp * 10) / 10 })
      }
    }

    return NextResponse.json({ blocks, history, todayStr, forecastTemps })
  } catch (error) {
    console.error('Daily forecast error:', error)
    return NextResponse.json({ error: 'Failed to calculate daily forecast' }, { status: 500 })
  }
}
