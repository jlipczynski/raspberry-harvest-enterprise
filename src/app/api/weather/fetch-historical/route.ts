import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GDH_BASE_TEMP, GDH_UPPER_TEMP } from '@/lib/forecast-calculator'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing startDate/endDate' }, { status: 400 })
    }
    const farm = await prisma.farm.findFirst()
    const lat = farm?.latitude
    const lon = farm?.longitude
    if (!lat || !lon) {
      return NextResponse.json({ error: 'Brak współrzędnych GPS farmy — uzupełnij dane farmy' }, { status: 422 })
    }

    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + startDate + '&end_date=' + endDate + '&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw'
    const response = await fetch(url)
    if (!response.ok) throw new Error('Open-Meteo API error')
    const data = await response.json()
    if (!data.daily?.time) return NextResponse.json({ temperatures: [] })

    const temperatures = data.daily.time.map((date: string, i: number) => {
      const min = data.daily.temperature_2m_min[i] ?? 0
      const max = data.daily.temperature_2m_max[i] ?? 0
      return { date, min, max, avg: Math.round(((min + max) / 2) * 10) / 10 }
    })

    return NextResponse.json({ temperatures })
  } catch (error) {
    console.error('Weather fetch GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { latitude, longitude, years } = body
    if (!latitude || !longitude) {
      return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 })
    }
    const farm = await prisma.farm.findFirst()
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }
    // Default: fetch 10 full years + current year for robust P10/P50/P90 percentiles
    const currentYr = new Date().getFullYear()
    const defaultYears = Array.from({ length: 11 }, (_, i) => currentYr - 10 + i)
    const yearsToFetch = years || defaultYears
    let totalCount = 0

    for (const year of yearsToFetch) {
      const startDate = year + '-01-01'
      const endDate = year === new Date().getFullYear()
        ? new Date().toISOString().split('T')[0]
        : year + '-12-31'
      // Godzinowe temperatury — dokładne GDH zamiast przybliżenia (min+max)/2
      const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + latitude + '&longitude=' + longitude + '&start_date=' + startDate + '&end_date=' + endDate + '&hourly=temperature_2m&timezone=Europe/Warsaw'

      const response = await fetch(url)
      if (!response.ok) continue
      const data = await response.json()
      if (!data.hourly?.time) continue

      // Grupuj godzinowe temperatury per dzień
      const dailyMap = new Map<string, number[]>()
      for (let i = 0; i < data.hourly.time.length; i++) {
        const temp = data.hourly.temperature_2m[i]
        if (temp === null) continue
        const dateStr = (data.hourly.time[i] as string).slice(0, 10)
        const arr = dailyMap.get(dateStr)
        if (arr) { arr.push(temp) } else { dailyMap.set(dateStr, [temp]) }
      }

      let cumulativeGDH = 0
      for (const [dateStr, temps] of [...dailyMap.entries()].sort()) {
        const date = new Date(dateStr)
        const tempMin = Math.min(...temps)
        const tempMax = Math.max(...temps)
        const tempAvg = temps.reduce((a, b) => a + b, 0) / temps.length
        const gdhDaily = temps.reduce((sum, t) => sum + Math.max(0, Math.min(t, GDH_UPPER_TEMP) - GDH_BASE_TEMP), 0)
        cumulativeGDH += gdhDaily

        await prisma.weatherData.upsert({
          where: { farmId_date: { farmId: farm.id, date } },
          update: { tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HOURLY' },
          create: { farmId: farm.id, date, tempMin, tempMax, tempAvg, gdhDaily, gdhCumulative: cumulativeGDH, source: 'API_HOURLY' }
        })
        totalCount++
      }
    }

    return NextResponse.json({
      success: true,
      count: totalCount,
      message: 'Pobrano ' + totalCount + ' dni'
    })
  } catch (error) {
    console.error('Weather fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}
