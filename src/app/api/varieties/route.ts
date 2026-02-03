import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { Pool } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getPrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

export async function GET() {
  const prisma = getPrisma()
  
  try {
    const varieties = await prisma.variety.findMany({ orderBy: { name: 'asc' } })
    await prisma.$disconnect()
    return NextResponse.json({ varieties })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error fetching varieties:', error)
    return NextResponse.json({ error: 'Failed to fetch varieties' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma()
  
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

    await prisma.$disconnect()
    return NextResponse.json({ variety: newVariety })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error creating variety:', error)
    return NextResponse.json({ error: 'Failed to create variety' }, { status: 500 })
  }
}
