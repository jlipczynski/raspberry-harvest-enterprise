import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// GDH constants per Fall Creek Nursery methodology
const GDH_BASE_TEMP = 4.5   // °C - below this, no growth
const GDH_UPPER_TEMP = 26.0 // °C - above this, growth stops (heat stress)

// Tunnel inertia model defaults
const TUNNEL_ALPHA = 0.3     // how fast tunnel reacts to outside temp (0=no reaction, 1=instant)
const TUNNEL_OFFSET = 4.0    // greenhouse effect offset °C

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

        const dailyAgg: DailyAgg[] = await prisma.$queryRaw`
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
        // === 1. Fetch 16-day hourly forecast from Open-Meteo ===
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&forecast_days=16&timezone=Europe/Warsaw`
        const forecastRes = await fetch(forecastUrl)

        let meteoHourly: Array<{ time: string; temp: number }> = []
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json()
          if (forecastData.hourly?.time) {
            meteoHourly = forecastData.hourly.time.map((t: string, i: number) => ({
              time: t,
              temp: forecastData.hourly.temperature_2m[i] ?? 0
            }))
          }
        }

        // Apply tunnel inertia to meteo hourly data
        const meteoDailyMap = new Map<string, number[]>()
        let prevTunnelMeteo = meteoHourly.length > 0 ? meteoHourly[0].temp + TUNNEL_OFFSET : 10
        const meteoTunnelHourly: number[] = []

        for (const h of meteoHourly) {
          prevTunnelMeteo = tunnelTemp(h.temp, prevTunnelMeteo, TUNNEL_ALPHA, TUNNEL_OFFSET)
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

          // Apply tunnel inertia to each scenario
          tunnelP10 = tunnelTemp(t10, tunnelP10, TUNNEL_ALPHA, TUNNEL_OFFSET)
          tunnelP50 = tunnelTemp(t50, tunnelP50, TUNNEL_ALPHA, TUNNEL_OFFSET)
          tunnelP90 = tunnelTemp(t90, tunnelP90, TUNNEL_ALPHA, TUNNEL_OFFSET)

          // Daily GDH for 24h at this tunnel temperature
          const gdhP10 = gdhForTemp(tunnelP10, 24)
          const gdhP50 = gdhForTemp(tunnelP50, 24)
          const gdhP90 = gdhForTemp(tunnelP90, 24)

          scenarioP10.push({ date: dateStr, gdhTunnel: Math.round(gdhP10 * 10) / 10 })
          scenarioP50.push({ date: dateStr, gdhTunnel: Math.round(gdhP50 * 10) / 10 })
          scenarioP90.push({ date: dateStr, gdhTunnel: Math.round(gdhP90 * 10) / 10 })
        }

        forecast = {
          meteoDays,
          scenarios: {
            p10: scenarioP10,
            p50: scenarioP50,
            p90: scenarioP90,
          },
          lastForecastDate: lastForecastDate.toISOString().slice(0, 10),
          tunnelModel: { alpha: TUNNEL_ALPHA, offset: TUNNEL_OFFSET },
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
