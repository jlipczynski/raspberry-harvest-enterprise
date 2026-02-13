import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BASE_TEMP = 5 // Temperatura bazowa dla GDH

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

    const yearsToFetch = years || [2023, 2024, 2025, new Date().getFullYear()]
    
    let totalCount = 0

    for (const year of yearsToFetch) {
      const startDate = `${year}-01-01`
      const endDate = year === new Date().getFullYear() 
        ? new Date().toISOString().split('T')[0]
        : `${year}-12-31`

      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw`
      
      console.log(`Fetching weather for ${year}: ${url}`)
      
      const response = await fetch(url)
      
      if (!response.ok) {
        console.error(`Failed to fetch weather for ${year}:`, await response.text())
        continue
      }

      const data = await response.json()
      
      if (!data.daily?.time) {
        console.error(`No data for ${year}`)
        continue
      }

      let cumulativeGDH = 0
      
      for (let i = 0; i < data.daily.time.length; i++) {
        const date = new Date(data.daily.time[i])
        const tempMin = data.daily.temperature_2m_min[i]
        const tempMax = data.daily.temperature_2m_max[i]
        
        if (tempMin === null || tempMax === null) continue

        const tempAvg = (tempMin + tempMax) / 2
        const gdhDaily = Math.max(0, tempAvg - BASE_TEMP) * 24
        cumulativeGDH += gdhDaily

        await prisma.weatherData.upsert({
          where: {
            farmId_date: {
              farmId: farm.id,
              date: date
            }
          },
          update: {
            tempMin,
            tempMax,
            tempAvg,
            gdhDaily,
            gdhCumulative: cumulativeGDH,
            source: 'API_HISTORICAL'
          },
          create: {
            farmId: farm.id,
            date: date,
            tempMin,
            tempMax,
            tempAvg,
            gdhDaily,
            gdhCumulative: cumulativeGDH,
            source: 'API_HISTORICAL'
          }
        })
        
        totalCount++
      }
      
      console.log(`Year ${year}: saved ${data.daily.time.length} days, cumulative GDH: ${cumulativeGDH.toFixed(0)}`)
    }

    return NextResponse.json({ 
      success: true, 
      count: totalCount,
      message: `Pobrano ${totalCount} dni dla lat ${yearsToFetch.join(', ')}`
    })
  } catch (error) {
    console.error('Weather fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}