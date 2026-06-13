import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'
import { calculateWeeklyBlockForecasts, type SectionGdhInfo } from '@/lib/harvest-weekly-forecast'

export const dynamic = 'force-dynamic'

const GDH_UPPER_TEMP = 26.0

interface DailyAgg {
  date: Date
  cnt: number
  sum_gdh: number
}

export async function GET() {
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
      return NextResponse.json({ blocks: [], sections: [] })
    }

    // --- 1. Compute fruit dates from GDH (same logic as /api/gdh) ---
    const allSections = farm.blocks.flatMap(b =>
      b.sections.map(s => ({ ...s, blockName: b.name }))
    )

    // Also fetch forecast cache for GDH projection beyond logger data
    const forecastCache = await prisma.forecastCache.findUnique({
      where: { farmId: farm.id },
    })

    const sectionInfos: SectionGdhInfo[] = []

    for (const section of allSections) {
      const v = section.variety
      const baseTemp = v?.baseTemp ?? null
      if (baseTemp === null) continue

      // GDH start date for summer
      const gdhStartDate = (!section.winteredInTunnel && section.plantingDate)
        ? new Date(section.plantingDate)
        : null

      // Compute cumulative GDH from logger readings
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
        lastLoggerDate = String(d.date).slice(0, 10)
      }

      // Determine fruit threshold (summer)
      let fruitThresholdSummer: number | null = null
      if (section.winteredInTunnel) {
        fruitThresholdSummer = section.gdhWinteredFruitSummer ?? v?.gdhWinteredFruitSummer ?? null
      } else if (section.plantMaterialType === 'LONGCANE') {
        fruitThresholdSummer = section.gdhLcFruitSummer ?? v?.gdhLcFruitSummer ?? null
      } else {
        fruitThresholdSummer = section.gdhPlantedFruitSummer ?? v?.gdhPlantedFruitSummer ?? null
      }

      // Find fruit date from logger data
      let fruitDateSummer: string | null = null
      let cumCheck = 0
      if (fruitThresholdSummer) {
        for (const d of dailyAgg) {
          const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
          cumCheck += daily
          if (cumCheck >= fruitThresholdSummer) {
            fruitDateSummer = String(d.date).slice(0, 10)
            break
          }
        }

        // If not reached in logger data, check forecast
        if (!fruitDateSummer && forecastCache) {
          const meteoDays = (forecastCache.meteoDays as Array<{ date: string; avgTunnelTemp?: number }>) || []
          const scenarios = forecastCache.scenarios as { p50?: Array<{ date: string; avgTunnelTemp?: number }> } | null
          const forecastDays = [
            ...meteoDays,
            ...(scenarios?.p50 || []),
          ]

          let projGdh = cumGdh
          for (const day of forecastDays) {
            if (day.date <= lastLoggerDate) continue
            if (gdhStartDate && day.date < gdhStartDate.toISOString().slice(0, 10)) continue
            const avgTemp = day.avgTunnelTemp ?? 0
            const dailyGdh = Math.max(0, Math.min(avgTemp, GDH_UPPER_TEMP) - baseTemp) * 24
            projGdh += dailyGdh
            if (projGdh >= fruitThresholdSummer) {
              fruitDateSummer = day.date
              break
            }
          }
        }
      }

      // Autumn fruit date
      let fruitDateAutumn: string | null = null
      const fruitThresholdAutumn = section.gdhFruitAutumn ?? v?.gdhFruitAutumn ?? null
      if (section.autumnShootDate && fruitThresholdAutumn) {
        const autumnStart = new Date(section.autumnShootDate)
        const autumnAgg: DailyAgg[] = await prisma.$queryRaw`
          SELECT DATE("timestamp") as date, COUNT(*)::int as cnt,
            COALESCE(SUM(GREATEST(0, LEAST("temperature", ${GDH_UPPER_TEMP}) - ${baseTemp})), 0)::float as sum_gdh
          FROM temperature_readings
          WHERE "sectionId" = ${section.id} AND "timestamp" >= ${autumnStart}
          GROUP BY DATE("timestamp") ORDER BY date
        `
        let autumnCum = 0
        for (const d of autumnAgg) {
          const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
          autumnCum += daily
          if (autumnCum >= fruitThresholdAutumn) {
            fruitDateAutumn = String(d.date).slice(0, 10)
            break
          }
        }
        // forecast projection for autumn if not reached
        if (!fruitDateAutumn && forecastCache) {
          const meteoDays = (forecastCache.meteoDays as Array<{ date: string; avgTunnelTemp?: number }>) || []
          const scenarios = forecastCache.scenarios as { p50?: Array<{ date: string; avgTunnelTemp?: number }> } | null
          const forecastDays = [...meteoDays, ...(scenarios?.p50 || [])]
          const autumnLastDate = autumnAgg.length > 0 ? String(autumnAgg[autumnAgg.length - 1].date).slice(0, 10) : ''
          let projGdh = autumnCum
          for (const day of forecastDays) {
            if (day.date <= autumnLastDate) continue
            const avgTemp = day.avgTunnelTemp ?? 0
            const dailyGdh = Math.max(0, Math.min(avgTemp, GDH_UPPER_TEMP) - baseTemp) * 24
            projGdh += dailyGdh
            if (projGdh >= fruitThresholdAutumn) {
              fruitDateAutumn = day.date
              break
            }
          }
        }
      }

      // Harvest curve: always from variety
      const curveSummer = ((v?.harvestCurveSummer as number[] | null) || []) as number[]
      const curveAutumn = ((v?.harvestCurveAutumn as number[] | null) || []) as number[]

      // Total planned kg
      const pots = (section.potsOverride && section.potsOverride > 0)
        ? section.potsOverride
        : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const yieldSummer = section.yieldSummerPerShoot ?? v?.yieldSummerPerShoot ?? 0
      const yieldAutumn = section.yieldAutumnPerShoot ?? v?.yieldAutumnPerShoot ?? 0

      sectionInfos.push({
        id: section.id,
        name: section.name || 'Sekcja',
        blockName: section.blockName,
        varietyName: v?.name || 'Nieznana',
        fruitDateSummer,
        totalKgSummer: shoots * yieldSummer,
        harvestCurveSummer: curveSummer,
        fruitDateAutumn,
        totalKgAutumn: shoots * yieldAutumn,
        harvestCurveAutumn: curveAutumn,
      })
    }

    // --- 2. Fetch actual harvest entries ---
    const currentYear = new Date().getFullYear()
    const harvestEntries = await prisma.harvestEntry.findMany({
      where: {
        farmId: farm.id,
        date: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      include: { block: { select: { name: true } } },
    })

    const entries = harvestEntries.map(e => ({
      date: e.date.toISOString().slice(0, 10),
      blockName: e.block?.name || e.areaName,
      weightKg: e.weightKg,
    }))

    // --- 3. Calculate weekly forecasts ---
    const blocks = calculateWeeklyBlockForecasts(sectionInfos, entries)

    // --- 4. Build daily cumulative plan vs actual for chart ---
    // Plan: distribute each section's kg across days using fruit date + curve
    const dailyPlanMap = new Map<string, number>()
    for (const section of sectionInfos) {
      // Summer
      if (section.fruitDateSummer && section.harvestCurveSummer.length > 0 && section.totalKgSummer > 0) {
        const rushWeeks = 0 // rush weeks already baked into curve alignment
        const startDate = new Date(section.fruitDateSummer)
        section.harvestCurveSummer.forEach((pct, i) => {
          const weekStart = new Date(startDate)
          weekStart.setDate(weekStart.getDate() + i * 7)
          const weekKg = (pct / 100) * section.totalKgSummer
          const dayKg = weekKg / 7
          for (let d = 0; d < 7; d++) {
            const day = new Date(weekStart)
            day.setDate(day.getDate() + d)
            const key = day.toISOString().slice(0, 10)
            dailyPlanMap.set(key, (dailyPlanMap.get(key) || 0) + dayKg)
          }
        })
      }
      // Autumn
      if (section.fruitDateAutumn && section.harvestCurveAutumn.length > 0 && section.totalKgAutumn > 0) {
        const startDate = new Date(section.fruitDateAutumn)
        section.harvestCurveAutumn.forEach((pct, i) => {
          const weekStart = new Date(startDate)
          weekStart.setDate(weekStart.getDate() + i * 7)
          const weekKg = (pct / 100) * section.totalKgAutumn
          const dayKg = weekKg / 7
          for (let d = 0; d < 7; d++) {
            const day = new Date(weekStart)
            day.setDate(day.getDate() + d)
            const key = day.toISOString().slice(0, 10)
            dailyPlanMap.set(key, (dailyPlanMap.get(key) || 0) + dayKg)
          }
        })
      }
    }

    // Actual: aggregate entries per day
    const dailyActualMap = new Map<string, number>()
    for (const e of entries) {
      dailyActualMap.set(e.date, (dailyActualMap.get(e.date) || 0) + e.weightKg)
    }

    // Merge into sorted daily array with cumulative values
    const allDates = new Set([...dailyPlanMap.keys(), ...dailyActualMap.keys()])
    const sortedDates = Array.from(allDates).sort()
    let cumPlan = 0
    let cumActual = 0
    const dailyPlanVsActual = sortedDates.map(date => {
      const planKg = dailyPlanMap.get(date) || 0
      const actualKg = dailyActualMap.get(date) || 0
      cumPlan += planKg
      cumActual += actualKg
      return {
        date,
        planKg: Math.round(planKg * 10) / 10,
        actualKg: Math.round(actualKg * 10) / 10,
        cumPlan: Math.round(cumPlan * 10) / 10,
        cumActual: Math.round(cumActual * 10) / 10,
      }
    })

    const totalPlannedKg = Math.round(
      sectionInfos.reduce((s, sec) => s + sec.totalKgSummer + sec.totalKgAutumn, 0) * 10
    ) / 10

    return NextResponse.json({ blocks, sections: sectionInfos, dailyPlanVsActual, totalPlannedKg })
  } catch (error) {
    console.error('Weekly forecast error:', error)
    return NextResponse.json({ error: 'Failed to calculate weekly forecast' }, { status: 500 })
  }
}
