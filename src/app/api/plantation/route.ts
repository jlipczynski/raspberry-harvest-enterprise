import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getPrisma() {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  })
}

export async function GET() {
  const prisma = getPrisma()
  
  try {
    const farm = await prisma.farm.findFirst({
      include: {
        blocks: {
          include: {
            sections: {
              include: { variety: true }
            }
          },
          orderBy: { name: 'asc' }
        }
      }
    })

    if (!farm) {
      await prisma.$disconnect()
      return NextResponse.json({ blocks: [], farm: null })
    }

    const varieties = await prisma.variety.findMany()
    await prisma.$disconnect()

    return NextResponse.json({ blocks: farm.blocks, varieties, farm })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error fetching plantation data:', error)
    return NextResponse.json({ error: 'Failed to fetch plantation data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma()
  
  try {
    const body = await request.json()
    const { block, farmId } = body

    if (!farmId) {
      await prisma.$disconnect()
      return NextResponse.json({ error: 'farmId is required' }, { status: 400 })
    }

    const newBlock = await prisma.block.create({
      data: {
        name: block.name,
        areaHa: block.areaHa || null,
        farmId,
      }
    })

    await prisma.$disconnect()
    return NextResponse.json({ block: newBlock })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error creating block:', error)
    return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })
  }
}
