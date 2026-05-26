import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { GDH_BASE_TEMP, GDH_UPPER_TEMP } from '@/lib/forecast-calculator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — potrzebne na fetch wielu lat

const TUNNEL_ALPHA = 0.3
const STATIC_OFFSET = 4.5

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Vercel Cron Job — codziennie o 6:00 UTC
 * 1. Pobiera brakujące WeatherData (od ostatniego wpisu do wczoraj) dla każdej farmy
 * 2. Invaliduje ForecastCache (wymusza świeży fetch przy następnym GET /api/gdh)
 */
export async function GET(request: NextRequest) {
  // Weryfikacja tokenu — Vercel wysyła go automatycznie
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const farms = await prisma.farm.findMany({
      select: { id: true, name: true, latitude: true, longitude: true }
    })

    const results = []

    for (const farm of farms) {
      if (!farm.latitude || !farm.longitude) {
        results.push({ farm: farm.name, skipped: 'brak współrzędnych' })
        continue
      }

      // --- 1. WeatherData: znajdź ostatni wpis i dopełnij do wczoraj ---
      const lastWeather = await prisma.weatherData.findFirst({
        where: { farmId: farm.id },
        orderBy: { date: 'desc' },
        select: { date: true }
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      // Jeśli brak danych → pobierz bieżący rok + 10 lat wstecz
      // Jeśli są dane → pobierz od ostatniego wpisu+1 do wczoraj
      let startDate: string
      let endDate: string

      if (!lastWeather) {
        // Pełny fetch: 10 lat + bieżący
        const currentYr = today.getFullYear()
        startDate = `${currentYr - 10}-01-01`
        endDate = yesterday.toISOString().slice(0, 10)
      } else {
        const lastDate = new Date(lastWeather.date)
        const nextDay = new Date(lastDate)
        nextDay.setDate(nextDay.getDate() + 1)

        if (nextDay > yesterday) {
          results.push({ farm: farm.name, skipped: 'dane aktualne' })
          await buildAndSaveForecast(farm.id, farm.latitude, farm.longitude)
          continue
        }

        startDate = nextDay.toISOString().slice(0, 10)
        endDate = yesterday.toISOString().slice(0, 10)
      }

      const count = await fetchAndStoreWeather(farm.id, farm.latitude, farm.longitude, startDate, endDate)
      results.push({ farm: farm.name, fetched: count, range: `${startDate} → ${endDate}` })

      // --- 2. Zbuduj i zapisz ForecastCache (prognoza 16 dni + scenariusze) ---
      await buildAndSaveForecast(farm.id, farm.latitude, farm.longitude)
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Cron weather error:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

async function fetchAndStoreWeather(
  farmId: string,
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<number> {
  // Godzinowe temperatury — dokładne GDH zamiast przybliżenia (min+max)/2
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&hourly=temperature_2m&timezone=Europe/Warsaw`

  const response = await fetch(url)
  if (!response.ok) {
    console.error(`Open-Meteo error for ${startDate}→${endDate}:`, response.status)
    return 0
  }

  const data = await response.json()
  if (!data.hourly?.time) return 0

  // Grupuj godzinowe temperatury per dzień
  const dailyMap = new Map<string, number[]>()
  for (let i = 0; i < data.hourly.time.length; i++) {
    const temp = data.hourly.temperature_2m[i]
    if (temp === null) continue
    const dateStr = (data.hourly.time[i] as string).slice(0, 10)
    const arr = dailyMap.get(dateStr)
    if (arr) { arr.push(temp) } else { dailyMap.set(dateStr, [temp]) }
  }

  // Pobierz ostatni cumulativeGDH z bazy żeby kontynuować sumowanie
  const lastRecord = await prisma.weatherData.findFirst({
    where: { farmId },
    orderBy: { date: 'desc' },
    select: { gdhCumulative: true }
  })
  let cumulativeGDH = lastRecord?.gdhCumulative ?? 0

  let count = 0
  for (const [dateStr, temps] of [...dailyMap.entries()].sort()) {
    const date = new Date(dateStr)
    const tempMin = Math.min(...temps)
    const tempMax = Math.max(...temps)
    const tempAvg = temps.reduce((a, b) => a + b, 0) / temps.length
    // GDH = suma godzinowych przyrostów ponad temp. bazową
    const gdhDaily = temps.reduce((sum, t) => sum + Math.max(0, Math.min(t, GDH_UPPER_TEMP) - GDH_BASE_TEMP), 0)
    cumulativeGDH += gdhDaily

    await prisma.weatherData.upsert({
      where: { farmId_date: { farmId, date } },
      update: { tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HOURLY' },
      create: { farmId, date, tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HOURLY' }
    })
    count++
  }

  return count
}

async function buildAndSaveForecast(farmId: string, latitude: number, longitude: number): Promise<void> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&forecast_days=16&past_days=90&timezone=Europe/Warsaw`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`Open-Meteo forecast error for farm ${farmId}:`, res.status)
      return
    }
    const data = await res.json()
    if (!data.hourly?.time) return

    // Buduj meteoDays: static offset +4.5°C z tunnel inertia
    const meteoDailyMap = new Map<string, number[]>()
    let prevTunnel = (data.hourly.temperature_2m[0] ?? 10) + STATIC_OFFSET
    for (let i = 0; i < data.hourly.time.length; i++) {
      const temp = data.hourly.temperature_2m[i] ?? prevTunnel - STATIC_OFFSET
      prevTunnel = TUNNEL_ALPHA * (temp + STATIC_OFFSET) + (1 - TUNNEL_ALPHA) * prevTunnel
      const day = (data.hourly.time[i] as string).slice(0, 10)
      if (!meteoDailyMap.has(day)) meteoDailyMap.set(day, [])
      meteoDailyMap.get(day)!.push(prevTunnel)
    }
    const meteoDays = [...meteoDailyMap.entries()].map(([date, temps]) => ({
      date,
      avgTunnelTemp: Math.round((temps.reduce((s, t) => s + t, 0) / temps.length) * 100) / 100,
      gdhTunnel: Math.round(temps.reduce((s, t) => s + Math.max(0, Math.min(t, GDH_UPPER_TEMP) - GDH_BASE_TEMP) * (24 / temps.length), 0) * 10) / 10,
    }))

    const lastForecastDate = meteoDays.at(-1)?.date ?? new Date().toISOString().slice(0, 10)

    // Buduj scenariusze P10/P50/P90 z historycznych WeatherData
    const currentYear = new Date().getFullYear()
    const weatherRows = await prisma.weatherData.findMany({
      where: { farmId, date: { lt: new Date(`${currentYear}-01-01`) } },
      select: { date: true, tempMin: true, tempMax: true },
    })
    const byMMDD = new Map<string, number[]>()
    const yearsSet = new Set<number>()
    for (const w of weatherRows) {
      const d = new Date(w.date)
      yearsSet.add(d.getFullYear())
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const avg = (w.tempMin + w.tempMax) / 2
      const tunnelAvg = Math.min(avg + STATIC_OFFSET, GDH_UPPER_TEMP)
      if (!byMMDD.has(mmdd)) byMMDD.set(mmdd, [])
      byMMDD.get(mmdd)!.push(tunnelAvg)
    }

    function pct(arr: number[], p: number): number {
      const s = [...arr].sort((a, b) => a - b)
      const idx = (p / 100) * (s.length - 1)
      const lo = Math.floor(idx), hi = Math.ceil(idx)
      return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo)
    }

    const scenarioP10: { date: string; gdhTunnel: number; avgTunnelTemp: number }[] = []
    const scenarioP50: { date: string; gdhTunnel: number; avgTunnelTemp: number }[] = []
    const scenarioP90: { date: string; gdhTunnel: number; avgTunnelTemp: number }[] = []
    const lastDate = new Date(lastForecastDate)
    for (let i = 1; i <= 365; i++) {
      const d = new Date(lastDate)
      d.setDate(d.getDate() + i)
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const temps = byMMDD.get(mmdd)
      if (!temps || temps.length === 0) continue
      const dateStr = d.toISOString().slice(0, 10)
      for (const [arr, p] of [[scenarioP10, 10], [scenarioP50, 50], [scenarioP90, 90]] as const) {
        const t = pct(temps, p)
        arr.push({
          date: dateStr,
          avgTunnelTemp: Math.round(t * 100) / 100,
          gdhTunnel: Math.round(Math.max(0, t - GDH_BASE_TEMP) * 24 * 10) / 10,
        })
      }
    }

    await prisma.forecastCache.upsert({
      where: { farmId },
      create: {
        farmId,
        meteoDays,
        scenarios: { p10: scenarioP10, p50: scenarioP50, p90: scenarioP90 },
        seasonalAnomaly: Prisma.JsonNull,
        lastForecastDate,
        historicalYears: yearsSet.size,
        cachedAt: new Date(),
      },
      update: {
        meteoDays,
        scenarios: { p10: scenarioP10, p50: scenarioP50, p90: scenarioP90 },
        seasonalAnomaly: Prisma.JsonNull,
        lastForecastDate,
        historicalYears: yearsSet.size,
        cachedAt: new Date(),
      },
    })
  } catch (e) {
    console.error(`buildAndSaveForecast error for farm ${farmId}:`, e)
  }
}
