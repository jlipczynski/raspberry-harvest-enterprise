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

async function invalidateForecastCache(farmId: string): Promise<void> {
  // Ustaw cachedAt na stary timestamp → wymusi ponowne pobranie przy GET /api/gdh
  await prisma.forecastCache.updateMany({
    where: { farmId },
    data: { cachedAt: new Date('2000-01-01') }
  })
}
