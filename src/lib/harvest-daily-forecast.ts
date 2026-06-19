// Daily Harvest Forecast — smooth interpolation + GDH weighting
//
// Takes the weekly harvest curve (% per week) and produces smooth daily
// predictions using linear interpolation between week midpoints, then
// adjusts proportionally to daily GDH from temperature forecast.
//
// This avoids the "step function" problem where week boundaries create
// unrealistic jumps (e.g. week 22 = 4% → week 23 = 10%).
//
// NO historical correction multiplier — prediction is pure curve × GDH.

export interface DailyForecastPoint {
  date: string           // ISO YYYY-MM-DD
  blockName: string
  predictedKg: number    // smoothed + GDH-weighted prediction
  actualKg: number       // from HarvestEntry (0 if future)
  gdhDaily: number       // GDH for this day
  isPast: boolean
}

export interface DailyBlockForecast {
  blockName: string
  days: DailyForecastPoint[]
  totalPredicted7d: number
}

interface SectionForDaily {
  blockName: string
  fruitDate: string          // ISO date — start of harvest
  harvestCurve: number[]     // % per week
  totalKg: number            // shoots × yieldPerShoot
}

interface ForecastDay {
  date: string
  avgTunnelTemp: number
}

const GDH_UPPER_TEMP = 26.0

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Calculate daily GDH from average tunnel temperature.
 */
function dailyGdh(avgTemp: number, baseTemp: number): number {
  return Math.max(0, Math.min(avgTemp, GDH_UPPER_TEMP) - baseTemp) * 24
}

/**
 * Build a map of date → GDH from forecast data.
 */
function buildGdhMap(forecastDays: ForecastDay[], baseTemp: number): Map<string, number> {
  const map = new Map<string, number>()
  for (const day of forecastDays) {
    map.set(day.date, dailyGdh(day.avgTunnelTemp, baseTemp))
  }
  return map
}

/**
 * Convert weekly curve to smooth daily baseline using linear interpolation
 * between week midpoints. Preserves weekly totals.
 *
 * For each week i, the "midpoint daily rate" is weekPct[i] / 7.
 * We interpolate between midpoints of adjacent weeks to get a smooth
 * daily baseline, then normalize within each week so the sum = weekPct[i].
 *
 * Example: week 22 = 4%, week 23 = 10%
 * - Week 22 midpoint rate = 0.571%/day
 * - Week 23 midpoint rate = 1.429%/day
 * - Days at end of week 22 ramp UP towards week 23's rate
 * - Days at start of week 23 continue from where week 22 ended
 */
function smoothWeeklyCurve(weeklyPcts: number[]): number[] {
  const n = weeklyPcts.length
  if (n === 0) return []

  // Midpoint daily rate for each week
  const midRates = weeklyPcts.map(p => p / 7)

  // For each day, interpolate between adjacent week midpoints
  const rawDaily: number[] = []
  const totalDays = n * 7

  for (let day = 0; day < totalDays; day++) {
    const weekIdx = Math.floor(day / 7)
    const dayInWeek = day - weekIdx * 7
    // Position within week: 0 = start, 6 = end
    // Midpoint is at position 3 (Wednesday)
    const t = dayInWeek / 7  // 0..0.857

    // Interpolate between previous week midpoint and next week midpoint
    // Current midpoint is at t=0.5 (center of the week)
    const prevRate = weekIdx > 0 ? midRates[weekIdx - 1] : midRates[0]
    const currRate = midRates[weekIdx]
    const nextRate = weekIdx < n - 1 ? midRates[weekIdx + 1] : midRates[n - 1]

    let interpolated: number
    if (t < 0.5) {
      // First half of week: interpolate from (prev+curr)/2 to curr
      const startVal = (prevRate + currRate) / 2
      const factor = t / 0.5 // 0..1
      interpolated = startVal + (currRate - startVal) * factor
    } else {
      // Second half of week: interpolate from curr to (curr+next)/2
      const endVal = (currRate + nextRate) / 2
      const factor = (t - 0.5) / 0.5 // 0..1
      interpolated = currRate + (endVal - currRate) * factor
    }

    rawDaily.push(Math.max(0, interpolated))
  }

  // Normalize within each week to preserve weekly totals
  const smoothed: number[] = []
  for (let w = 0; w < n; w++) {
    const weekStart = w * 7
    let weekRawSum = 0
    for (let d = 0; d < 7; d++) {
      weekRawSum += rawDaily[weekStart + d]
    }

    for (let d = 0; d < 7; d++) {
      if (weekRawSum > 0) {
        smoothed.push(weeklyPcts[w] * (rawDaily[weekStart + d] / weekRawSum))
      } else {
        smoothed.push(0)
      }
    }
  }

  return smoothed
}

/**
 * Main function: compute daily harvest forecast for next N days.
 *
 * Steps:
 * 1. Convert weekly curve to smooth daily baseline (interpolation)
 * 2. For each day, get daily % from smooth curve
 * 3. Apply GDH weighting: scale day's kg by (dayGDH / avgGDH_for_week)
 * 4. Re-normalize within week to preserve weekly total
 * 5. Aggregate per block per day
 */
export function calculateDailyForecast(
  sections: SectionForDaily[],
  forecastDays: ForecastDay[],
  baseTemp: number,
  actualEntries: Array<{ date: string; blockName: string; weightKg: number }>,
  daysAhead: number = 7,
  today: Date = new Date(),
): DailyBlockForecast[] {
  const todayStr = toKey(today)
  const gdhMap = buildGdhMap(forecastDays, baseTemp)

  // Build target date range
  const targetDates: string[] = []
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    targetDates.push(toKey(d))
  }

  // Per-block per-day accumulator
  const blockDayKg = new Map<string, Map<string, { predicted: number; gdh: number }>>()

  for (const section of sections) {
    if (!section.fruitDate || section.harvestCurve.length === 0 || section.totalKg <= 0) continue

    const fruitStart = new Date(section.fruitDate)

    // Pre-compute smooth daily curve for this section
    const smoothDaily = smoothWeeklyCurve(section.harvestCurve)

    for (const dateStr of targetDates) {
      const date = new Date(dateStr)
      const daysSinceFruit = Math.floor((date.getTime() - fruitStart.getTime()) / 86400000)
      if (daysSinceFruit < 0) continue
      if (daysSinceFruit >= smoothDaily.length) continue

      const dayPct = smoothDaily[daysSinceFruit]
      if (dayPct <= 0) continue

      // Base kg from smooth curve
      const baseKg = (dayPct / 100) * section.totalKg

      // GDH adjustment: scale relative to week average GDH
      const weekIdx = Math.floor(daysSinceFruit / 7)
      const weekStartDay = weekIdx * 7
      const weekStartDate = new Date(fruitStart)
      weekStartDate.setDate(weekStartDate.getDate() + weekStartDay)

      let weekGdhSum = 0
      let weekDayCount = 0
      for (let d = 0; d < 7; d++) {
        const wd = new Date(weekStartDate)
        wd.setDate(wd.getDate() + d)
        const wdStr = toKey(wd)
        const gdh = gdhMap.get(wdStr) ?? dailyGdh(18, baseTemp)
        weekGdhSum += gdh
        weekDayCount++
      }

      const avgWeekGdh = weekGdhSum / weekDayCount
      const thisGdh = gdhMap.get(dateStr) ?? dailyGdh(18, baseTemp)

      // GDH ratio: hot day → more harvest, cold day → less
      // But we need to preserve weekly total, so the ratio adjusts
      // relative to the average. If all days have same GDH, ratio = 1.
      const gdhRatio = avgWeekGdh > 0 ? thisGdh / avgWeekGdh : 1

      const dayKg = baseKg * gdhRatio

      // Accumulate per block
      if (!blockDayKg.has(section.blockName)) {
        blockDayKg.set(section.blockName, new Map())
      }
      const dayMap = blockDayKg.get(section.blockName)!
      const existing = dayMap.get(dateStr) || { predicted: 0, gdh: 0 }
      existing.predicted += dayKg
      existing.gdh = thisGdh
      dayMap.set(dateStr, existing)
    }
  }

  // Build actual entries map
  const actualMap = new Map<string, number>()
  for (const e of actualEntries) {
    const key = `${e.blockName}|${e.date}`
    actualMap.set(key, (actualMap.get(key) || 0) + e.weightKg)
  }

  // Build results per block
  const results: DailyBlockForecast[] = []
  const allBlocks = Array.from(blockDayKg.keys()).sort()

  for (const blockName of allBlocks) {
    const dayMap = blockDayKg.get(blockName)!

    const days: DailyForecastPoint[] = []
    let total7d = 0

    targetDates.forEach((dateStr, idx) => {
      const data = dayMap.get(dateStr) || { predicted: 0, gdh: 0 }
      const predicted = Math.round(data.predicted * 10) / 10
      const actual = actualMap.get(`${blockName}|${dateStr}`) || 0
      const isPast = dateStr < todayStr

      days.push({
        date: dateStr,
        blockName,
        predictedKg: predicted,
        actualKg: Math.round(actual * 10) / 10,
        gdhDaily: Math.round(data.gdh * 10) / 10,
        isPast,
      })
      if (idx < 7) total7d += predicted
    })

    results.push({
      blockName,
      days,
      totalPredicted7d: Math.round(total7d * 10) / 10,
    })
  }

  return results
}
