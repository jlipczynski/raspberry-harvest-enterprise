/**
 * Daily Harvest Prediction Script
 *
 * Runs after MaxCrop sync (e.g., 21:15).
 * 1. Updates yesterday's (and older) predictions with actual harvest data
 *    (records actual/ratio for accuracy tracking — NOT used to adjust forecasts)
 * 2. Generates predictions for next 7 days (pure GDH × curve, no correction)
 * 3. Saves predictions to HarvestPrediction table
 *
 * Usage: npx tsx scripts/harvest-predict.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const GDH_UPPER_TEMP = 26.0
const DAYS_AHEAD = 7

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface DailyAgg {
  date: Date
  cnt: number
  sum_gdh: number
}

async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toKey(today)

  console.log(`[Predict] ${todayStr} — start`)

  // Find farm (first farm with harvest entries)
  const farm = await prisma.farm.findFirst({
    where: { harvestEntries: { some: {} } },
    include: {
      blocks: {
        include: {
          sections: { include: { variety: true } },
        },
      },
    },
  })

  if (!farm) {
    console.error('[Predict] Brak farmy z danymi zbiorowymi')
    process.exit(1)
  }

  console.log(`[Predict] Farma: ${farm.name}`)

  // --- 1. Update past predictions with actual data ---
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - 14) // check last 2 weeks

  const pastPredictions = await prisma.harvestPrediction.findMany({
    where: {
      farmId: farm.id,
      actualKg: null, // not yet filled
      date: { gte: windowStart, lt: today },
    },
    include: { block: true },
  })

  let updated = 0
  for (const pred of pastPredictions) {
    // Sum actual harvest for this block on this date
    const actual = await prisma.harvestEntry.aggregate({
      where: {
        farmId: farm.id,
        blockId: pred.blockId,
        date: pred.date,
      },
      _sum: { weightKg: true },
    })

    const actualKg = actual._sum.weightKg || 0
    const ratio = pred.predictedKg > 0 ? actualKg / pred.predictedKg : null

    await prisma.harvestPrediction.update({
      where: { id: pred.id },
      data: { actualKg, ratio },
    })
    updated++
  }
  console.log(`[Predict] Zaktualizowano ${updated} predykcji z danymi actual`)

  // --- 2. Get forecast cache for temperatures ---
  const forecastCache = await prisma.forecastCache.findUnique({
    where: { farmId: farm.id },
  })

  const forecastTemps = new Map<string, number>() // date → avgTunnelTemp
  if (forecastCache) {
    const meteo = (forecastCache.meteoDays as Array<{ date: string; avgTunnelTemp?: number }>) || []
    const scenarios = forecastCache.scenarios as { p50?: Array<{ date: string; avgTunnelTemp?: number }> } | null
    for (const d of [...(scenarios?.p50 || []), ...meteo]) {
      if (d.avgTunnelTemp != null) forecastTemps.set(d.date, d.avgTunnelTemp)
    }
  }

  // --- 3. Generate predictions for next 7 days ---
  let created = 0

  for (const block of farm.blocks) {
    const sections = block.sections

    // Compute fruit dates per section
    const sectionData: Array<{
      fruitDate: string
      curve: number[]
      totalKg: number
    }> = []

    for (const section of sections) {
      const v = section.variety
      const baseTemp = v?.baseTemp ?? null
      if (baseTemp === null) continue

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
        lastLoggerDate = toKey(d.date instanceof Date ? d.date : new Date(d.date))
      }

      let fruitThreshold: number | null = null
      if (section.winteredInTunnel) {
        fruitThreshold = section.gdhWinteredFruitSummer ?? v?.gdhWinteredFruitSummer ?? null
      } else if (section.plantMaterialType === 'LONGCANE') {
        fruitThreshold = section.gdhLcFruitSummer ?? v?.gdhLcFruitSummer ?? null
      } else {
        fruitThreshold = section.gdhPlantedFruitSummer ?? v?.gdhPlantedFruitSummer ?? null
      }

      let fruitDate: string | null = null
      if (fruitThreshold) {
        let cumCheck = 0
        for (const d of dailyAgg) {
          const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
          cumCheck += daily
          if (cumCheck >= fruitThreshold) {
            fruitDate = toKey(d.date instanceof Date ? d.date : new Date(d.date))
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
            const dailyGdhVal = Math.max(0, Math.min(avgTemp, GDH_UPPER_TEMP) - baseTemp) * 24
            projGdh += dailyGdhVal
            if (projGdh >= fruitThreshold) {
              fruitDate = day.date
              break
            }
          }
        }
      }

      if (!fruitDate) continue
      const curve = ((v?.harvestCurveSummer as number[] | null) || []) as number[]
      if (curve.length === 0) continue

      const pots = (section.potsOverride && section.potsOverride > 0)
        ? section.potsOverride
        : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const yieldPerShoot = section.yieldSummerPerShoot ?? v?.yieldSummerPerShoot ?? 0
      if (yieldPerShoot <= 0) continue

      sectionData.push({
        fruitDate,
        curve,
        totalKg: shoots * yieldPerShoot,
      })
    }

    if (sectionData.length === 0) continue

    // Average baseTemp for this block's sections
    const blockBaseTemp = sections.reduce((s, sec) => {
      const bt = sec.variety?.baseTemp ?? 6.0
      return s + bt
    }, 0) / sections.length

    // Generate prediction for each of next 7 days
    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const targetDate = new Date(today)
      targetDate.setDate(targetDate.getDate() + dayOffset)
      const targetStr = toKey(targetDate)

      let dayPredicted = 0
      const forecastTemp = forecastTemps.get(targetStr)
      const dayGdh = forecastTemp != null
        ? Math.max(0, Math.min(forecastTemp, GDH_UPPER_TEMP) - blockBaseTemp) * 24
        : 0

      for (const sec of sectionData) {
        const fruitStart = new Date(sec.fruitDate)
        const daysSinceFruit = Math.floor((targetDate.getTime() - fruitStart.getTime()) / 86400000)
        if (daysSinceFruit < 0) continue

        const weekIdx = Math.floor(daysSinceFruit / 7)
        if (weekIdx >= sec.curve.length) continue

        const weekPct = sec.curve[weekIdx]
        if (weekPct <= 0) continue
        const weekKg = (weekPct / 100) * sec.totalKg

        // Compute GDH for all 7 days of this week
        const weekStart = new Date(fruitStart)
        weekStart.setDate(weekStart.getDate() + weekIdx * 7)
        let weekGdhSum = 0
        for (let d = 0; d < 7; d++) {
          const wd = new Date(weekStart)
          wd.setDate(wd.getDate() + d)
          const wdStr = toKey(wd)
          const temp = forecastTemps.get(wdStr)
          const gdh = temp != null
            ? Math.max(0, Math.min(temp, GDH_UPPER_TEMP) - blockBaseTemp) * 24
            : Math.max(0, Math.min(18, GDH_UPPER_TEMP) - blockBaseTemp) * 24 // fallback
          weekGdhSum += gdh
        }

        const share = weekGdhSum > 0 ? (dayGdh > 0 ? dayGdh / weekGdhSum : 1 / 7) : 1 / 7
        dayPredicted += weekKg * share
      }

      dayPredicted = Math.round(dayPredicted * 10) / 10

      // Upsert prediction (pure GDH × curve, no correction multiplier)
      await prisma.harvestPrediction.upsert({
        where: {
          farmId_date_blockId: {
            farmId: farm.id,
            date: targetDate,
            blockId: block.id,
          },
        },
        update: {
          predictedKg: dayPredicted,
          gdhDaily: Math.round(dayGdh * 10) / 10,
        },
        create: {
          date: targetDate,
          blockId: block.id,
          farmId: farm.id,
          predictedKg: dayPredicted,
          gdhDaily: Math.round(dayGdh * 10) / 10,
        },
      })
      created++
    }
  }

  console.log(`[Predict] Zapisano ${created} predykcji na ${DAYS_AHEAD} dni`)
  console.log('[Predict] Gotowe.')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('[Predict] Błąd:', e)
  process.exit(1)
})
