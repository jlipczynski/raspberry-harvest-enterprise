import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const farm = await prisma.farm.findFirst({
      include: { weatherData: { orderBy: { date: 'desc' }, take: 365 } }
    })

    if (!farm) {
      return NextResponse.json({ weatherData: [], farm: null })
    }

    return NextResponse.json({ weatherData: farm.weatherData, farm })
  } catch (error) {
    console.error('Error fetching weather data:', error)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { weatherRecords, farmId } = body

    if (!farmId) {
      return NextResponse.json({ error: 'farmId is required' }, { status: 400 })
    }

    await prisma.weatherData.deleteMany({ where: { farmId } })

    interface WeatherRecord {
      date: string
      tempMin: number
      tempMax: number
      gdhDaily: number
      gdhCumulative: number
    }

    const records = weatherRecords.map((r: WeatherRecord) => ({
      date: new Date(r.date),
      tempMin: r.tempMin,
      tempMax: r.tempMax,
      gdhDaily: r.gdhDaily,
      gdhCumulative: r.gdhCumulative,
      farmId,
    }))

    await prisma.weatherData.createMany({ data: records, skipDuplicates: true })

    return NextResponse.json({ success: true, count: records.length })
  } catch (error) {
    console.error('Error saving weather data:', error)
    return NextResponse.json({ error: 'Failed to save weather data' }, { status: 500 })
  }
}
