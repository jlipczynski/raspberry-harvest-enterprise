// Daily Harvest Forecast — GDH-weighted distribution within weeks
//
// Takes the weekly harvest curve (% per week) and distributes kg
// within each week proportionally to daily GDH from temperature forecast.
// Hotter day (including warm nights) → more GDH → more kg.
//
// NO historical correction multiplier — prediction is pure GDH × curve.

export interface DailyForecastPoint {
  date: string           // ISO YYYY-MM-DD
  blockName: string
  predictedKg: number    // GDH-weighted prediction
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

function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Calculate daily GDH for a day from hourly tunnel temperature.
 * If we only have daily avg, compute as: max(0, min(avg, 26) - baseTemp) × 24
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
 * Main function: compute daily harvest forecast for next N days.
 *
 * Steps:
 * 1. For each section, find which weeks overlap with forecast window
 * 2. Get weekly kg from curve
 * 3. Get daily GDH from forecast for those days
 * 4. Distribute weekly kg proportionally to daily GDH
 * 5. Aggregate per block per day
 *
 * No historical correction multiplier is applied — the prediction is the
 * pure harvest curve distributed across days by the weather forecast GDH.
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

    // For each target date, find which week of the curve it falls in
    for (const dateStr of targetDates) {
      const date = new Date(dateStr)
      const daysSinceFruit = Math.floor((date.getTime() - fruitStart.getTime()) / 86400000)
      if (daysSinceFruit < 0) continue

      const weekIdx = Math.floor(daysSinceFruit / 7)
      if (weekIdx >= section.harvestCurve.length) continue

      const weekPct = section.harvestCurve[weekIdx]
      if (weekPct <= 0) continue

      const weekKg = (weekPct / 100) * section.totalKg

      // Get GDH for all 7 days of this week to compute proportional weight
      const weekStartDate = new Date(fruitStart)
      weekStartDate.setDate(weekStartDate.getDate() + weekIdx * 7)

      let weekGdhSum = 0
      const dayGdhs: Array<{ date: string; gdh: number }> = []
      for (let d = 0; d < 7; d++) {
        const wd = new Date(weekStartDate)
        wd.setDate(wd.getDate() + d)
        const wdStr = toKey(wd)
        const gdh = gdhMap.get(wdStr) ?? dailyGdh(18, baseTemp) // fallback to moderate temp if no forecast
        dayGdhs.push({ date: wdStr, gdh })
        weekGdhSum += gdh
      }

      // This day's share of the week
      const thisGdh = gdhMap.get(dateStr) ?? dailyGdh(18, baseTemp)
      const share = weekGdhSum > 0 ? thisGdh / weekGdhSum : 1 / 7
      const dayKg = weekKg * share

      // Accumulate per block
      if (!blockDayKg.has(section.blockName)) {
        blockDayKg.set(section.blockName, new Map())
      }
      const dayMap = blockDayKg.get(section.blockName)!
      const existing = dayMap.get(dateStr) || { predicted: 0, gdh: 0 }
      existing.predicted += dayKg
      existing.gdh = thisGdh // same GDH for all sections in block
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

    for (const dateStr of targetDates) {
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
      total7d += predicted
    }

    results.push({
      blockName,
      days,
      totalPredicted7d: Math.round(total7d * 10) / 10,
    })
  }

  return results
}
