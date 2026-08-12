// Weekly Harvest Forecast — GDH-driven, per-block projection
//
// Logic:
// 1. For each section, determine fruit start date from GDH (actual + forecast)
// 2. Map section onto its variety harvest curve: week 0 = fruit date
// 3. For each calendar week, compute expected kg = curve[week_on_curve] * total_kg
// 4. Aggregate per block
// 5. Compare with actual harvest data → derive calibration factor
// 6. Apply calibration to future weeks (total stays constant, distribution shifts)

export interface WeeklyBlockForecast {
  blockName: string
  weeks: WeekRow[]
  totalPlannedKg: number
  totalHarvestedKg: number
  calibrationFactor: number // actual/predicted ratio for past weeks
}

export interface WeekRow {
  weekStart: string       // YYYY-MM-DD (Monday)
  weekLabel: string       // "9-15 cze"
  forecastKg: number      // GDH-curve based prediction
  calibratedKg: number    // forecast * calibration
  actualKg: number        // real harvest
  diffKg: number          // actual - forecast
  diffPct: number         // (actual - forecast) / forecast * 100
  isPast: boolean         // week already completed
  isCurrent: boolean      // current week
}

export interface SectionGdhInfo {
  id: string
  name: string
  blockName: string
  varietyName: string
  fruitDateSummer: string | null   // from GDH calculation
  totalKgSummer: number            // shoots * yieldPerShoot
  harvestCurveSummer: number[]     // % per week from variety or section
  fruitDateAutumn: string | null
  totalKgAutumn: number
  harvestCurveAutumn: number[]
}

// Get ISO week Monday for a date
function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7 // Mon=1..Sun=7
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru']
  const d1 = monday.getDate()
  const d2 = sunday.getDate()
  const m1 = months[monday.getMonth()]
  const m2 = months[sunday.getMonth()]
  if (m1 === m2) return `${d1}-${d2} ${m1}`
  return `${d1} ${m1}-${d2} ${m2}`
}

function mondayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function weeksBetween(monday1: Date, monday2: Date): number {
  return Math.round((monday2.getTime() - monday1.getTime()) / (7 * 86400000))
}

interface HarvestEntrySimple {
  date: string // ISO date
  blockName: string
  weightKg: number
}

export function calculateWeeklyBlockForecasts(
  sections: SectionGdhInfo[],
  harvestEntries: HarvestEntrySimple[],
  today: Date = new Date(),
): WeeklyBlockForecast[] {
  const todayMonday = getWeekMonday(today)

  // --- 1. Build per-block weekly forecast from sections ---
  // Map: blockName -> weekMonday -> forecastKg
  const blockForecastMap = new Map<string, Map<string, number>>()
  const blockTotalPlanned = new Map<string, number>()

  for (const section of sections) {
    // Process summer
    if (section.fruitDateSummer && section.harvestCurveSummer.length > 0 && section.totalKgSummer > 0) {
      addSectionToForecast(
        section.blockName,
        section.fruitDateSummer,
        section.harvestCurveSummer,
        section.totalKgSummer,
        blockForecastMap,
      )
      blockTotalPlanned.set(
        section.blockName,
        (blockTotalPlanned.get(section.blockName) || 0) + section.totalKgSummer,
      )
    }

    // Process autumn
    if (section.fruitDateAutumn && section.harvestCurveAutumn.length > 0 && section.totalKgAutumn > 0) {
      addSectionToForecast(
        section.blockName,
        section.fruitDateAutumn,
        section.harvestCurveAutumn,
        section.totalKgAutumn,
        blockForecastMap,
      )
      blockTotalPlanned.set(
        section.blockName,
        (blockTotalPlanned.get(section.blockName) || 0) + section.totalKgAutumn,
      )
    }
  }

  // --- 2. Aggregate actual harvest per block per week ---
  const blockActualMap = new Map<string, Map<string, number>>()
  const blockTotalHarvested = new Map<string, number>()

  for (const entry of harvestEntries) {
    const entryMonday = getWeekMonday(new Date(entry.date))
    const key = mondayKey(entryMonday)

    if (!blockActualMap.has(entry.blockName)) blockActualMap.set(entry.blockName, new Map())
    const weekMap = blockActualMap.get(entry.blockName)!
    weekMap.set(key, (weekMap.get(key) || 0) + entry.weightKg)

    blockTotalHarvested.set(
      entry.blockName,
      (blockTotalHarvested.get(entry.blockName) || 0) + entry.weightKg,
    )
  }

  // --- 3. Build result per block ---
  const allBlockNames = new Set([...blockForecastMap.keys(), ...blockActualMap.keys()])
  const results: WeeklyBlockForecast[] = []

  for (const blockName of Array.from(allBlockNames).sort()) {
    const forecastWeeks = blockForecastMap.get(blockName) || new Map<string, number>()
    const actualWeeks = blockActualMap.get(blockName) || new Map<string, number>()

    // Collect all week keys
    const allWeekKeys = new Set([...forecastWeeks.keys(), ...actualWeeks.keys()])
    const sortedKeys = Array.from(allWeekKeys).sort()

    // Calibration: ratio of actual/forecast for completed past weeks
    let pastForecastSum = 0
    let pastActualSum = 0
    for (const key of sortedKeys) {
      const weekMonday = new Date(key)
      if (weekMonday >= todayMonday) break // only past weeks
      const forecast = forecastWeeks.get(key) || 0
      const actual = actualWeeks.get(key) || 0
      if (forecast > 0) {
        pastForecastSum += forecast
        pastActualSum += actual
      }
    }

    // calibrationFactor: how much reality differs from curve prediction
    // > 1 = harvesting more than predicted (curve too conservative or timing shifted)
    // < 1 = harvesting less (curve too aggressive or delayed)
    const calibrationFactor = pastForecastSum > 0
      ? pastActualSum / pastForecastSum
      : 1.0

    // Build week rows
    const weeks: WeekRow[] = []
    for (const key of sortedKeys) {
      const weekMonday = new Date(key)
      const forecast = Math.round((forecastWeeks.get(key) || 0) * 10) / 10
      const actual = Math.round((actualWeeks.get(key) || 0) * 10) / 10
      const isPast = weekMonday < todayMonday
      const isCurrent = weeksBetween(weekMonday, todayMonday) === 0

      // For future weeks: apply calibration but keep remaining total constant
      // (if we harvested more in past, we'll harvest proportionally less in future)
      let calibratedKg: number
      if (isPast || isCurrent) {
        calibratedKg = actual > 0 ? actual : forecast
      } else {
        // Future: redistribute remaining kg proportionally along remaining curve
        const totalPlanned = blockTotalPlanned.get(blockName) || 0
        const harvested = blockTotalHarvested.get(blockName) || 0
        const remainingKg = Math.max(0, totalPlanned - harvested)
        const remainingForecast = sortedKeys
          .filter(k => new Date(k) > todayMonday)
          .reduce((sum, k) => sum + (forecastWeeks.get(k) || 0), 0)

        if (remainingForecast > 0) {
          calibratedKg = Math.round((forecast / remainingForecast) * remainingKg * 10) / 10
        } else {
          calibratedKg = forecast
        }
      }

      const diffKg = isPast ? Math.round((actual - forecast) * 10) / 10 : 0
      const diffPct = isPast && forecast > 0 ? Math.round(((actual - forecast) / forecast) * 1000) / 10 : 0

      weeks.push({
        weekStart: key,
        weekLabel: formatWeekLabel(weekMonday),
        forecastKg: forecast,
        calibratedKg: Math.round(calibratedKg * 10) / 10,
        actualKg: actual,
        diffKg,
        diffPct,
        isPast,
        isCurrent,
      })
    }

    results.push({
      blockName,
      weeks,
      totalPlannedKg: Math.round((blockTotalPlanned.get(blockName) || 0) * 10) / 10,
      totalHarvestedKg: Math.round((blockTotalHarvested.get(blockName) || 0) * 10) / 10,
      calibrationFactor: Math.round(calibrationFactor * 100) / 100,
    })
  }

  return results
}

function addSectionToForecast(
  blockName: string,
  fruitDate: string,
  curve: number[],
  totalKg: number,
  blockMap: Map<string, Map<string, number>>,
) {
  const fruitMonday = getWeekMonday(new Date(fruitDate))

  if (!blockMap.has(blockName)) blockMap.set(blockName, new Map())
  const weekMap = blockMap.get(blockName)!

  for (let i = 0; i < curve.length; i++) {
    const weekMonday = new Date(fruitMonday)
    weekMonday.setDate(weekMonday.getDate() + i * 7)
    const key = mondayKey(weekMonday)
    const kg = (curve[i] / 100) * totalKg
    weekMap.set(key, (weekMap.get(key) || 0) + kg)
  }
}
