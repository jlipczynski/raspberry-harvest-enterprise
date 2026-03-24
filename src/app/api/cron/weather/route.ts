import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GDH_BASE_TEMP, GDH_UPPER_TEMP } from '@/lib/forecast-calculator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — potrzebne na fetch wielu lat

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
          // Nadal invaliduj cache
          await invalidateForecastCache(farm.id)
          continue
        }

        startDate = nextDay.toISOString().slice(0, 10)
        endDate = yesterday.toISOString().slice(0, 10)
      }

      const count = await fetchAndStoreWeather(farm.id, farm.latitude, farm.longitude, startDate, endDate)
      results.push({ farm: farm.name, fetched: count, range: `${startDate} → ${endDate}` })

      // --- 2. Invaliduj ForecastCache → wymusi świeży fetch z Open-Meteo ---
      await invalidateForecastCache(farm.id)
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
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw`

  const response = await fetch(url)
  if (!response.ok) {
    console.error(`Open-Meteo error for ${startDate}→${endDate}:`, response.status)
    return 0
  }

  const data = await response.json()
  if (!data.daily?.time) return 0

  // Pobierz ostatni cumulativeGDH z bazy żeby kontynuować sumowanie
  const lastRecord = await prisma.weatherData.findFirst({
    where: { farmId },
    orderBy: { date: 'desc' },
    select: { gdhCumulative: true }
  })
  let cumulativeGDH = lastRecord?.gdhCumulative ?? 0

  let count = 0
  for (let i = 0; i < data.daily.time.length; i++) {
    const date = new Date(data.daily.time[i])
    const tempMin = data.daily.temperature_2m_min[i]
    const tempMax = data.daily.temperature_2m_max[i]
    if (tempMin === null || tempMax === null) continue

    const tempAvg = (tempMin + tempMax) / 2
    const effectiveTemp = Math.min(tempAvg, GDH_UPPER_TEMP)
    const gdhDaily = Math.max(0, effectiveTemp - GDH_BASE_TEMP) * 24
    cumulativeGDH += gdhDaily

    await prisma.weatherData.upsert({
      where: { farmId_date: { farmId, date } },
      update: { tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HISTORICAL' },
      create: { farmId, date, tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HISTORICAL' }
    })
    count++
  }

  return count
}

async function invalidateForecastCache(farmId: string): Promise<void> {
  // Ustaw cachedAt na stary timestamp → wymusi ponowne pobranie przy GET /api/gdh
  await prisma.forecastCache.updateMany({
    where: { farmId },
    data: { cachedAt: new Date('2000-01-01') }
  })
}
