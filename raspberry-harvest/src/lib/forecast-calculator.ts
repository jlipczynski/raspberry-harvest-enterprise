// Forecast Calculator
// Compares historical template data with current conditions to predict production curve

export interface TemperatureDay { date: string; min: number; max: number; avg: number }
export interface GDHDay { date: string; gdh: number; cumulativeGdh: number }

// GDH constants per Fall Creek Nursery methodology
export const GDH_BASE_TEMP = 4.5   // °C - below this, no growth
export const GDH_UPPER_TEMP = 26.0 // °C - above this, growth stops (heat stress)

// Calculate GDH from daily temperatures (base 4.5°C, cap 26°C for berries)
export function calculateDailyGDH(avgTemp: number, baseTemp: number = GDH_BASE_TEMP): number {
  const effective = Math.min(avgTemp, GDH_UPPER_TEMP)
  if (effective <= baseTemp) return 0
  return (effective - baseTemp) * 24 // Growing Degree Hours
}

// Calculate cumulative GDH from temperature data
export function calculateCumulativeGDH(temps: TemperatureDay[], baseTemp: number = 4.5): GDHDay[] {
  let cumulative = 0
  return temps.map(t => {
    const gdh = calculateDailyGDH(t.avg, baseTemp)
    cumulative += gdh
    return { date: t.date, gdh, cumulativeGdh: cumulative }
  })
}

// Calculate temperature adjustment factor (inside tunnel / outside)
export function calculateTempAdjustmentFactor(
  outsideTemps: TemperatureDay[],
  insideTemps: TemperatureDay[]
): number {
  if (outsideTemps.length === 0 || insideTemps.length === 0) return 1.0
  const outsideAvg = outsideTemps.reduce((s, t) => s + t.avg, 0) / outsideTemps.length
  const insideAvg = insideTemps.reduce((s, t) => s + t.avg, 0) / insideTemps.length
  return outsideAvg > 0 ? insideAvg / outsideAvg : 1.0
}

// Find best matching template based on conditions
export function findBestTemplate(
  templates: any[],
  criteria: {
    varietyId?: string
    plantingDate?: string        // target planting date
    winteredInTunnel?: boolean
    productionCycle?: number
    forecastTemps?: TemperatureDay[]  // 2026 weather forecast
  }
): { template: any; matchScore: number; adjustmentPercent: number }[] {
  return templates
    .map(t => {
      let score = 0

      // Variety match (highest weight)
      if (criteria.varietyId && t.varietyId === criteria.varietyId) score += 40

      // Tunnel match
      if (criteria.winteredInTunnel !== undefined && t.winteredInTunnel === criteria.winteredInTunnel) score += 20

      // Production cycle match
      if (criteria.productionCycle && t.productionCycle === criteria.productionCycle) score += 15

      // Planting date proximity (within 30 days = full score)
      if (criteria.plantingDate && t.plantingDate) {
        const target = new Date(criteria.plantingDate)
        const hist = new Date(t.plantingDate)
        // Compare month+day only
        const targetDay = target.getMonth() * 30 + target.getDate()
        const histDay = hist.getMonth() * 30 + hist.getDate()
        const diffDays = Math.abs(targetDay - histDay)
        if (diffDays <= 7) score += 25
        else if (diffDays <= 14) score += 20
        else if (diffDays <= 30) score += 10
      }

      // Temperature comparison → adjustment
      let adjustmentPercent = 0
      if (criteria.forecastTemps && t.outsideTemps) {
        const histOutside = t.outsideTemps as TemperatureDay[]
        const forecastAvg = criteria.forecastTemps.reduce((s: number, d: TemperatureDay) => s + d.avg, 0) / criteria.forecastTemps.length
        const histAvg = histOutside.reduce((s: number, d: TemperatureDay) => s + d.avg, 0) / histOutside.length
        if (histAvg > 0) {
          const tempDiffPercent = ((forecastAvg - histAvg) / histAvg) * 100
          // Warmer forecast = faster GDH = earlier/more production
          // Colder forecast = slower GDH = later/less production
          adjustmentPercent = Math.round(tempDiffPercent * 10) / 10
        }
      }

      return { template: t, matchScore: score, adjustmentPercent }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
}

// Adjust production curve based on temperature difference
export function adjustCurve(
  dailyCurve: number[],
  adjustmentPercent: number
): number[] {
  if (adjustmentPercent === 0) return [...dailyCurve]

  // Positive adjustment = warmer = compress timeline (earlier production)
  // Negative adjustment = colder = stretch timeline (later production)
  const factor = 1 + (adjustmentPercent / 100)

  if (factor >= 1) {
    // Compress: fewer days, higher daily production
    const newLength = Math.max(Math.round(dailyCurve.length / factor), 1)
    const adjusted: number[] = []
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.min(Math.round(i * factor), dailyCurve.length - 1)
      adjusted.push(dailyCurve[srcIdx] * factor)
    }
    return adjusted
  } else {
    // Stretch: more days, lower daily production
    const newLength = Math.round(dailyCurve.length / factor)
    const adjusted: number[] = []
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.min(Math.round(i * factor), dailyCurve.length - 1)
      adjusted.push(dailyCurve[srcIdx] * factor)
    }
    return adjusted
  }
}
