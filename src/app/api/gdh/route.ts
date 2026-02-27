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

/** Calculate GDH contribution for a single reading */
function gdhForReading(temp: number, intervalHours: number): number {
  const effective = Math.min(temp, GDH_UPPER_TEMP)
  return Math.max(0, effective - GDH_BASE_TEMP) * intervalHours
}

/** Apply tunnel inertia model: converts outside hourly temps to estimated tunnel temps */
function applyTunnelInertia(
  outsideTemps: number[],
  alpha: number = TUNNEL_ALPHA,
  offset: number = TUNNEL_OFFSET,
  initialTunnelTemp?: number
): number[] {
  const tunnelTemps: number[] = []
  let prevTunnel = initialTunnelTemp ?? (outsideTemps[0] + offset)

  for (const tOut of outsideTemps) {
    // Exponential smoothing: tunnel reacts slowly + greenhouse offset
    const tTunnel = alpha * (tOut + offset) + (1 - alpha) * prevTunnel
    tunnelTemps.push(tTunnel)
    prevTunnel = tTunnel
  }
  return tunnelTemps
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
          orderBy: { date: 'asc' },
          take: 730 // 2 years for historical reference
        }
      }
    })

    if (!farm) {
      return NextResponse.json({ sections: [], farmWeather: [], forecast: null })
    }

    const allSections = farm.blocks.flatMap(b =>
      b.sections.map(s => ({ ...s, blockName: b.name }))
    )

    // ── Section GDH from real CSV readings ──
    const sectionResults = await Promise.all(
      allSections.map(async (section) => {
        const v = section.variety

        // Correct GDH formula: capped at upper threshold, base 4.5°C
        // SQL: for each reading, max(0, min(temp, 26) - 4.5)
        // Then multiply by (24 / count) to get hourly equivalent
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
          // sum_gdh contains Σ max(0, min(T, 26) - 4.5) for all readings
          // Each reading represents 24/cnt hours of the day
          // So daily GDH = sum_gdh * (24 / cnt)
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

    // ── Forecast: Open-Meteo 16-day hourly + historical avg ──
    let forecast = null
    const lat = farm.latitude
    const lon = farm.longitude

    if (lat && lon) {
      try {
        // 1. Fetch 16-day hourly forecast from Open-Meteo
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

        // Convert meteo outside temps → tunnel temps via inertia model
        const outsideTempsMeteo = meteoHourly.map(h => h.temp)
        const tunnelTempsMeteo = applyTunnelInertia(outsideTempsMeteo)

        // Group by day and calculate daily GDH for meteo forecast
        const meteoDailyMap = new Map<string, { outsideTemps: number[]; tunnelTemps: number[] }>()
        meteoHourly.forEach((h, i) => {
          const day = h.time.slice(0, 10)
          if (!meteoDailyMap.has(day)) meteoDailyMap.set(day, { outsideTemps: [], tunnelTemps: [] })
          const entry = meteoDailyMap.get(day)!
          entry.outsideTemps.push(h.temp)
          entry.tunnelTemps.push(tunnelTempsMeteo[i])
        })

        const meteoDays = [...meteoDailyMap.entries()].map(([date, data]) => {
          const hoursPerReading = 24 / data.outsideTemps.length
          const gdhOutside = data.outsideTemps.reduce((sum, t) => sum + gdhForReading(t, hoursPerReading), 0)
          const gdhTunnel = data.tunnelTemps.reduce((sum, t) => sum + gdhForReading(t, hoursPerReading), 0)
          return { date, gdhOutside: Math.round(gdhOutside * 10) / 10, gdhTunnel: Math.round(gdhTunnel * 10) / 10 }
        })

        // 2. Historical average for days beyond forecast (same calendar days, previous years)
        const lastForecastDate = meteoDays.length > 0 ? new Date(meteoDays[meteoDays.length - 1].date) : new Date()
        const historicalDays: Array<{ date: string; gdhOutside: number; gdhTunnel: number }> = []

        // Build historical avg from WeatherData (daily min/max from previous years)
        const weatherByDayOfYear = new Map<string, number[]>()
        for (const w of farm.weatherData) {
          const d = new Date(w.date)
          // Only use previous years for historical average
          if (d.getFullYear() >= new Date().getFullYear()) continue
          const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (!weatherByDayOfYear.has(mmdd)) weatherByDayOfYear.set(mmdd, [])
          weatherByDayOfYear.get(mmdd)!.push((w.tempMin + w.tempMax) / 2)
        }

        // Generate 120 days of historical prediction after forecast ends
        const currentYear = new Date().getFullYear()
        let lastTunnelTemp = tunnelTempsMeteo.length > 0 ? tunnelTempsMeteo[tunnelTempsMeteo.length - 1] : 10

        for (let i = 1; i <= 120; i++) {
          const d = new Date(lastForecastDate)
          d.setDate(d.getDate() + i)
          const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const dateStr = `${currentYear}-${mmdd}`

          const historicalTemps = weatherByDayOfYear.get(mmdd)
          if (!historicalTemps || historicalTemps.length === 0) continue

          const avgTemp = historicalTemps.reduce((s, t) => s + t, 0) / historicalTemps.length

          // Apply tunnel inertia to daily avg (simplified - 1 reading per day)
          const tunnelTemp = TUNNEL_ALPHA * (avgTemp + TUNNEL_OFFSET) + (1 - TUNNEL_ALPHA) * lastTunnelTemp
          lastTunnelTemp = tunnelTemp

          const gdhOutside = gdhForReading(avgTemp, 24)
          const gdhTunnel = gdhForReading(tunnelTemp, 24)

          historicalDays.push({
            date: dateStr,
            gdhOutside: Math.round(gdhOutside * 10) / 10,
            gdhTunnel: Math.round(gdhTunnel * 10) / 10
          })
        }

        forecast = {
          meteoDays,
          historicalDays,
          lastForecastDate: lastForecastDate.toISOString().slice(0, 10),
          tunnelModel: { alpha: TUNNEL_ALPHA, offset: TUNNEL_OFFSET },
        }
      } catch (e) {
        console.error('Forecast fetch error:', e)
      }
    }

    return NextResponse.json({
      sections: sectionResults,
      farmWeather: farm.weatherData.map(w => ({
        date: w.date,
        tempMin: w.tempMin,
        tempMax: w.tempMax,
      })),
      forecast,
      gdhParams: { baseTemp: GDH_BASE_TEMP, upperTemp: GDH_UPPER_TEMP },
    })
  } catch (error) {
    console.error('Error calculating GDH:', error)
    return NextResponse.json({ error: 'Failed to calculate GDH' }, { status: 500 })
  }
}
