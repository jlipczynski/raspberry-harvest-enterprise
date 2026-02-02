import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET - pobierz dane pogodowe
export async function GET() {
  try {
    // Pobierz lub utwórz domyślną farmę
    let farm = await prisma.farm.findFirst()
    if (!farm) {
      farm = await prisma.farm.create({
        data: {
          name: 'Plantacja Malin - Wyszynki',
          location: 'Wyszynki, gmina Budzyń',
          latitude: 52.8831,
          longitude: 16.8156,
        }
      })
    }

    const weatherData = await prisma.weatherData.findMany({
      where: { farmId: farm.id },
      orderBy: { date: 'desc' },
      take: 365,
    })
    
    // Pobierz ustawienia GDH
    const settings = await prisma.settings.findFirst({
      where: { farmId: farm.id }
    })

    return NextResponse.json({ 
      weatherData,
      baseTemp: settings?.gdhBaseTemp || 5,
      farm
    })
  } catch (error) {
    console.error('Error fetching weather data:', error)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}

// POST - zapisz dane pogodowe (bulk)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { weatherRecords, baseTemp } = body

    // Pobierz lub utwórz farmę
    let farm = await prisma.farm.findFirst()
    if (!farm) {
      farm = await prisma.farm.create({
        data: {
          name: 'Plantacja Malin - Wyszynki',
          location: 'Wyszynki, gmina Budzyń',
          latitude: 52.8831,
          longitude: 16.8156,
        }
      })
    }

    // Zapisz lub zaktualizuj ustawienia
    await prisma.settings.upsert({
      where: { farmId: farm.id },
      update: { gdhBaseTemp: baseTemp },
      create: { farmId: farm.id, gdhBaseTemp: baseTemp }
    })

    // Usuń stare dane i zapisz nowe (prostsze niż upsert dla wielu rekordów)
    await prisma.weatherData.deleteMany({
      where: { farmId: farm.id }
    })

    // Zapisz nowe dane
    const records = weatherRecords.map((r: any) => ({
      date: new Date(r.date),
      tempMin: r.tempMin,
      tempMax: r.tempMax,
      gdhDaily: r.gdhDaily,
      gdhCumulative: r.gdhCumulative,
      source: r.source || 'API',
      farmId: farm.id,
    }))

    await prisma.weatherData.createMany({
      data: records
    })

    return NextResponse.json({ success: true, count: records.length })
  } catch (error) {
    console.error('Error saving weather data:', error)
    return NextResponse.json({ error: 'Failed to save weather data' }, { status: 500 })
  }
}
