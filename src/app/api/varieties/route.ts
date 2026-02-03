import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET - pobierz odmiany
export async function GET() {
  try {
    const varieties = await prisma.variety.findMany({
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ varieties })
  } catch (error) {
    console.error('Error fetching varieties:', error)
    return NextResponse.json({ error: 'Failed to fetch varieties' }, { status: 500 })
  }
}

// POST - zapisz odmianę
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { variety } = body

    const newVariety = await prisma.variety.create({
      data: {
        name: variety.name,
        gdhFirstHarvest: variety.gdhThreshold || 20000,
        avgYieldPerPlant: variety.yield || variety.summerYield || 1.5,
        fruitCurve: variety.fruitCurve || [],
        isCustom: true,
      }
    })

    return NextResponse.json({ variety: newVariety })
  } catch (error) {
    console.error('Error creating variety:', error)
    return NextResponse.json({ error: 'Failed to create variety' }, { status: 500 })
  }
}
