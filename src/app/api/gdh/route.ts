import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// GDH constants per Fall Creek Nursery methodology
const GDH_BASE_TEMP = 4.5   // °C - below this, no growth
const GDH_UPPER_TEMP = 26.0 // °C - above this, growth stops (heat stress)

// Tunnel inertia model defaults
const TUNNEL_ALPHA = 0.3     // how fast tunnel reacts to outside temp (0=no reaction, 1=instant)

// Dynamic offset model — replaces old static +4°C
// At night: offset = 0 (no solar gain)
// During day: offset = shortwave_radiation * k, capped at 15°C
const MAX_RADIATION = 800    // W/m² — clear summer noon
const MAX_OFFSET = 15        // °C — max greenhouse effect
const RADIATION_K = MAX_OFFSET / MAX_RADIATION  // ≈ 0.01875

interface DailyAgg {
  date: Date
  cnt: number
  sum_gdh: number
}

/** GDH for a single temperature reading over a time interval */
function gdhForTemp(temp: number, hours: number): number {
  const effective = Math.min(temp, GDH_UPPER_TEMP)
  return Math.max(0, effective - GDH_BASE_TEMP) * hours
}

/** Dynamic offset: radiation-based greenhouse effect */
function calculateDynamicOffset(isDay: number, shortwaveRadiation: number): number {
  if (isDay === 0 || shortwaveRadiation <= 0) return 0
  return Math.min(MAX_OFFSET, shortwaveRadiation * RADIATION_K)
}

/** Tunnel inertia: T_tunnel(t) = α*(T_out + offset) + (1-α)*T_tunnel(t-1) */
function tunnelTemp(tOut: number, prevTunnel: number, alpha: number, offset: number): number {
  return alpha * (tOut + offset) + (1 - alpha) * prevTunnel
}

/** Calculate percentile from sorted-compatible array */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
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
              include: { variety: true }
            }
          },
          orderBy: { name: 'asc' }
        },
        weatherData: {
          orderBy: { date: 'asc' }
        }
      }
    })

    if (!farm) {
      return NextResponse.json({ sections: [], forecast: null })
    }

    const allSections = farm.blocks.flatMap(b =>
      b.sections.map(s => ({ ...s, blockName: b.name }))
    )

    // ── Section GDH from real CSV readings ──
    const sectionResults = await Promise.all(
      allSections.map(async (section) => {
        const v = section.variety

        // If NOT wintered and has plantingDate → only count GDH from that date
        // (logger runs before planting but tunnel is empty, readings don't count)
        const gdhStartDate = (!section.winteredInTunnel && section.plantingDate)
          ? new Date(section.plantingDate)
          : null

        const dailyAgg: DailyAgg[] = gdhStartDate
          ? await prisma.$queryRaw`
              SELECT
                DATE("timestamp") as date,
                COUNT(*)::int as cnt,
                COALESCE(SUM(GREATEST(0, LEAST("temperature", ${GDH_UPPER_TEMP}) - ${GDH_BASE_TEMP})), 0)::float as sum_gdh
              FROM temperature_readings
              WHERE "sectionId" = ${section.id}
                AND "timestamp" >= ${gdhStartDate}
              GROUP BY DATE("timestamp")
              ORDER BY date
            `
          : await prisma.$queryRaw`
              SELECT
                DATE("timestamp") as date,
                COUNT(*)::int as cnt,
                COALESCE(SUM(GREATEST(0, LEAST("temperature", ${GDH_UPPER_TEMP}) - ${GDH_BASE_TEMP})), 0)::float as sum_gdh
              FROM temperature_readings
              WHERE "sectionId" = ${section.id}
              GROUP BY DATE("timestamp")
              ORDER BY date
            `

        let cumulative = 0
        const dailyGdh = dailyAgg.map(d => {
          const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0
          cumulative += daily
          return {
            date: d.date,
            dailyGdh: Math.round(daily * 10) / 10,
            cumulativeGdh: Math.round(cumulative),
            readingCount: d.cnt
          }
        })

        // Determine thresholds based on section type
        let flowerThreshold: number | null = null
        let fruitThreshold: number | null = null
        let thresholdType = 'autumn'

        if (section.winteredInTunnel) {
          flowerThreshold = section.gdhWinteredFlower ?? v?.gdhWinteredFlower ?? null
          fruitThreshold = section.gdhWinteredFruit ?? v?.gdhWinteredFruit ?? null
          thresholdType = 'wintered'
        } else if (section.plantMaterialType === 'LONGCANE') {
          flowerThreshold = section.gdhLcFlower ?? v?.gdhLcFlower ?? null
          fruitThreshold = section.gdhLcFruit ?? v?.gdhLcFruit ?? null
          thresholdType = 'lc'
        } else {
          flowerThreshold = section.gdhAutumnFlower ?? v?.gdhAutumnFlower ?? null
          fruitThreshold = section.gdhAutumnFruit ?? v?.gdhAutumnFruit ?? null
          thresholdType = 'autumn'
        }

        return {
          id: section.id,
          name: section.name || 'Sekcja',
          blockName: section.blockName,
          varietyId: section.varietyId,
          varietyName: v?.name || 'Nieznana',
          winteredInTunnel: section.winteredInTunnel,
          plantingDate: section.plantingDate,
          gdhStartDate: gdhStartDate?.toISOString().slice(0, 10) ?? null,
          plantMaterialType: section.plantMaterialType,
          flowerThreshold,
          fruitThreshold,
          thresholdType,
          dailyGdh,
          currentGdh: Math.round(cumulative),
          totalReadings: dailyAgg.reduce((s, d) => s + d.cnt, 0),
        }
      })
    )

    // ── Forecast: Meteo 16d + 3 climate scenarios ──
    let forecast = null
    const lat = farm.latitude
    const lon = farm.longitude
    const currentYear = new Date().getFullYear()

    if (lat && lon) {
      try {
        // === 1. Fetch 16-day hourly forecast from Open-Meteo (with radiation for dynamic offset) ===
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,is_day,shortwave_radiation&forecast_days=16&timezone=Europe/Warsaw`
        const forecastRes = await fetch(forecastUrl)

        let meteoHourly: Array<{ time: string; temp: number; isDay: number; radiation: number }> = []
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json()
          if (forecastData.hourly?.time) {
            meteoHourly = forecastData.hourly.time.map((t: string, i: number) => ({
              time: t,
              temp: forecastData.hourly.temperature_2m[i] ?? 0,
              isDay: forecastData.hourly.is_day[i] ?? 0,
              radiation: forecastData.hourly.shortwave_radiation[i] ?? 0,
            }))
          }
        }

        // Apply tunnel inertia with DYNAMIC offset (radiation-based)
        const meteoDailyMap = new Map<string, number[]>()
        const firstOffset = meteoHourly.length > 0
          ? calculateDynamicOffset(meteoHourly[0].isDay, meteoHourly[0].radiation)
          : 0
        let prevTunnelMeteo = meteoHourly.length > 0 ? meteoHourly[0].temp + firstOffset : 10
        const meteoTunnelHourly: number[] = []

        for (const h of meteoHourly) {
          const dynamicOffset = calculateDynamicOffset(h.isDay, h.radiation)
          prevTunnelMeteo = tunnelTemp(h.temp, prevTunnelMeteo, TUNNEL_ALPHA, dynamicOffset)
          meteoTunnelHourly.push(prevTunnelMeteo)

          const day = h.time.slice(0, 10)
          if (!meteoDailyMap.has(day)) meteoDailyMap.set(day, [])
          meteoDailyMap.get(day)!.push(prevTunnelMeteo)
        }

        const meteoDays = [...meteoDailyMap.entries()].map(([date, tunnelTemps]) => {
          const hoursPerReading = 24 / tunnelTemps.length
          const gdhTunnel = tunnelTemps.reduce((sum, t) => sum + gdhForTemp(t, hoursPerReading), 0)
          // Also calculate outside GDH for reference
          return { date, gdhTunnel: Math.round(gdhTunnel * 10) / 10 }
        })

        // === 2. Build historical climatology by MM-DD ===
        const weatherByMMDD = new Map<string, number[]>()
        const historicalYearsSet = new Set<number>()

        for (const w of farm.weatherData) {
          const d = new Date(w.date)
          const year = d.getFullYear()
          if (year >= currentYear) continue // only past years
          historicalYearsSet.add(year)
          const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (!weatherByMMDD.has(mmdd)) weatherByMMDD.set(mmdd, [])
          weatherByMMDD.get(mmdd)!.push((w.tempMin + w.tempMax) / 2)
        }

        const historicalYears = historicalYearsSet.size

        // === 3. Generate 3 scenarios (P10, P50, P90) for days 17+ ===
        const lastForecastDate = meteoDays.length > 0
          ? new Date(meteoDays[meteoDays.length - 1].date)
          : new Date()

        // Initialize tunnel temps for each scenario from last meteo tunnel temp
        const lastMeteoTunnel = meteoTunnelHourly.length > 0
          ? meteoTunnelHourly[meteoTunnelHourly.length - 1]
          : 10

        let tunnelP10 = lastMeteoTunnel
        let tunnelP50 = lastMeteoTunnel
        let tunnelP90 = lastMeteoTunnel

        const scenarioP10: Array<{ date: string; gdhTunnel: number }> = []
        const scenarioP50: Array<{ date: string; gdhTunnel: number }> = []
        const scenarioP90: Array<{ date: string; gdhTunnel: number }> = []

        for (let i = 1; i <= 150; i++) {
          const d = new Date(lastForecastDate)
          d.setDate(d.getDate() + i)
          const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const dateStr = d.toISOString().slice(0, 10)

          const temps = weatherByMMDD.get(mmdd)
          if (!temps || temps.length === 0) continue

          const t10 = percentile(temps, 10)
          const t50 = percentile(temps, 50)
          const t90 = percentile(temps, 90)

          // Estimate average daily offset for scenarios (blend of day/night)
          // Day length varies ~8h (winter) to ~16h (summer) in Poland
          const month0 = d.getMonth() // 0-11
          const dayHours = [8, 9, 11, 13, 15, 16, 16, 15, 13, 11, 9, 8][month0]
          // Avg radiation: ~100 W/m² (winter) to ~400 W/m² (summer avg over day hours)
          const avgRadiation = [100, 150, 220, 300, 380, 400, 400, 350, 280, 180, 110, 80][month0]
          const dayOffset = calculateDynamicOffset(1, avgRadiation)
          // Weighted: (dayHours * dayOffset + nightHours * 0) / 24
          const avgDailyOffset = (dayHours * dayOffset) / 24

          // Apply tunnel inertia to each scenario with estimated offset
          tunnelP10 = tunnelTemp(t10, tunnelP10, TUNNEL_ALPHA, avgDailyOffset)
          tunnelP50 = tunnelTemp(t50, tunnelP50, TUNNEL_ALPHA, avgDailyOffset)
          tunnelP90 = tunnelTemp(t90, tunnelP90, TUNNEL_ALPHA, avgDailyOffset)

          // Daily GDH for 24h at this tunnel temperature
          const gdhP10 = gdhForTemp(tunnelP10, 24)
          const gdhP50 = gdhForTemp(tunnelP50, 24)
          const gdhP90 = gdhForTemp(tunnelP90, 24)

          scenarioP10.push({ date: dateStr, gdhTunnel: Math.round(gdhP10 * 10) / 10 })
          scenarioP50.push({ date: dateStr, gdhTunnel: Math.round(gdhP50 * 10) / 10 })
          scenarioP90.push({ date: dateStr, gdhTunnel: Math.round(gdhP90 * 10) / 10 })
        }

        // === 4. ECMWF Seasonal Forecast — anomaly-based best estimate ===
        let seasonalAnomaly: { months: Array<{ month: string; anomaly: number }>; avgAnomaly: number; verdict: string } | null = null
        const scenarioBest: Array<{ date: string; gdhTunnel: number }> = []

        try {
          const seasonalUrl = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat}&longitude=${lon}&monthly=temperature_2m_anomaly`
          const seasonalRes = await fetch(seasonalUrl)
          if (seasonalRes.ok) {
            const seasonalData = await seasonalRes.json()
            if (seasonalData.monthly?.time && seasonalData.monthly?.temperature_2m_anomaly) {
              const months = seasonalData.monthly.time.map((t: string, i: number) => ({
                month: t,
                anomaly: seasonalData.monthly.temperature_2m_anomaly[i] ?? 0
              }))

              const validAnomalies = months.filter((m: { anomaly: number }) => m.anomaly !== null && !isNaN(m.anomaly))
              const avgAnomaly = validAnomalies.length > 0
                ? validAnomalies.reduce((s: number, m: { anomaly: number }) => s + m.anomaly, 0) / validAnomalies.length
                : 0

              // Determine verdict
              let verdict = 'typowy'
              if (avgAnomaly > 1.0) verdict = 'wyraźnie cieplejszy'
              else if (avgAnomaly > 0.5) verdict = 'cieplejszy'
              else if (avgAnomaly > 0.2) verdict = 'nieco cieplejszy'
              else if (avgAnomaly < -1.0) verdict = 'wyraźnie chłodniejszy'
              else if (avgAnomaly < -0.5) verdict = 'chłodniejszy'
              else if (avgAnomaly < -0.2) verdict = 'nieco chłodniejszy'

              seasonalAnomaly = {
                months,
                avgAnomaly: Math.round(avgAnomaly * 10) / 10,
                verdict,
              }

              // Build best-estimate line: interpolate between P10/P50/P90 based on anomaly
              // anomaly > 0 → interpolate P50→P90, anomaly < 0 → interpolate P10→P50
              // Scale: ±2K maps to full P10/P90 range
              let tunnelBest = lastMeteoTunnel

              for (let i = 0; i < scenarioP50.length; i++) {
                const dp10 = scenarioP10[i]
                const dp50 = scenarioP50[i]
                const dp90 = scenarioP90[i]
                if (!dp50) continue

                // Get month-specific anomaly if available, else use average
                const dateMonth = dp50.date.slice(0, 7) // YYYY-MM
                const monthAnomaly = months.find((m: { month: string }) => m.month.startsWith(dateMonth))?.anomaly ?? avgAnomaly

                // Interpolation factor: 0 = P50, +1 = P90, -1 = P10
                const factor = Math.max(-1, Math.min(1, monthAnomaly / 2))

                let gdhBest: number
                if (factor >= 0) {
                  // Interpolate between P50 and P90
                  gdhBest = dp50.gdhTunnel + factor * ((dp90?.gdhTunnel ?? dp50.gdhTunnel) - dp50.gdhTunnel)
                } else {
                  // Interpolate between P10 and P50
                  gdhBest = dp50.gdhTunnel + factor * (dp50.gdhTunnel - (dp10?.gdhTunnel ?? dp50.gdhTunnel))
                }

                scenarioBest.push({ date: dp50.date, gdhTunnel: Math.round(gdhBest * 10) / 10 })
              }
            }
          }
        } catch (e) {
          console.error('Seasonal forecast error:', e)
        }

        forecast = {
          meteoDays,
          scenarios: {
            p10: scenarioP10,
            p50: scenarioP50,
            p90: scenarioP90,
            best: scenarioBest,
          },
          seasonalAnomaly,
          lastForecastDate: lastForecastDate.toISOString().slice(0, 10),
          tunnelModel: { alpha: TUNNEL_ALPHA, offsetModel: 'dynamic', maxOffset: MAX_OFFSET, radiationK: RADIATION_K },
          historicalYears,
        }
      } catch (e) {
        console.error('Forecast fetch error:', e)
      }
    }

    return NextResponse.json({
      sections: sectionResults,
      forecast,
      gdhParams: { baseTemp: GDH_BASE_TEMP, upperTemp: GDH_UPPER_TEMP },
    })
  } catch (error) {
    console.error('Error calculating GDH:', error)
    return NextResponse.json({ error: 'Failed to calculate GDH' }, { status: 500 })
  }
}
