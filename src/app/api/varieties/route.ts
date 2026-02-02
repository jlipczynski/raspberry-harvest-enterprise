import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET - pobierz odmiany
export async function GET() {
  try {
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

      // Utwórz domyślne odmiany
      await prisma.variety.createMany({
        data: [
          {
            name: 'Diamond Jubilee',
            origin: 'Wielka Brytania',
            type: 'DOUBLE',
            gdhThreshold: 20000,
            baseTemp: 5,
            summerYield: 1.48,
            autumnYield: 0.44,
            fruitingDays: 56,
            workerEfficiency: 6,
            wastePercentage: 2,
            secondCategoryPercentage: 9,
            farmId: farm.id,
          },
          {
            name: 'Ruby',
            origin: 'Polska',
            type: 'SINGLE',
            gdhThreshold: 20000,
            baseTemp: 6,
            summerYield: 2.06,
            fruitingDays: 56,
            workerEfficiency: 8,
            wastePercentage: 1,
            secondCategoryPercentage: 6,
            farmId: farm.id,
          }
        ]
      })
    }

    const varieties = await prisma.variety.findMany({
      where: { farmId: farm.id },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ varieties })
  } catch (error) {
    console.error('Error fetching varieties:', error)
    return NextResponse.json({ error: 'Failed to fetch varieties' }, { status: 500 })
  }
}

// POST - zapisz odmiany
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { varieties } = body

    let farm = await prisma.farm.findFirst()
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    // Usuń stare odmiany (tylko te bez sekcji)
    await prisma.variety.deleteMany({
      where: { 
        farmId: farm.id,
        sections: { none: {} }
      }
    })

    // Aktualizuj lub utwórz odmiany
    for (const variety of varieties) {
      await prisma.variety.upsert({
        where: { 
          id: variety.id || 'new-' + Date.now()
        },
        update: {
          name: variety.name,
          origin: variety.origin,
          type: variety.type === 'double' ? 'DOUBLE' : 'SINGLE',
          gdhThreshold: variety.gdhThreshold,
          baseTemp: variety.baseTemp,
          summerYield: variety.summerYield || variety.yield,
          autumnYield: variety.autumnYield,
          fruitingDays: variety.fruitingDays,
          workerEfficiency: variety.workerEfficiency,
          wastePercentage: variety.wastePercentage,
          secondCategoryPercentage: variety.secondCategoryPercentage,
        },
        create: {
          name: variety.name,
          origin: variety.origin || '',
          type: variety.type === 'double' ? 'DOUBLE' : 'SINGLE',
          gdhThreshold: variety.gdhThreshold || 20000,
          baseTemp: variety.baseTemp || 5,
          summerYield: variety.summerYield || variety.yield || 1.5,
          autumnYield: variety.autumnYield,
          fruitingDays: variety.fruitingDays || 56,
          workerEfficiency: variety.workerEfficiency || 7,
          wastePercentage: variety.wastePercentage || 2,
          secondCategoryPercentage: variety.secondCategoryPercentage || 8,
          farmId: farm.id,
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving varieties:', error)
    return NextResponse.json({ error: 'Failed to save varieties' }, { status: 500 })
  }
}
