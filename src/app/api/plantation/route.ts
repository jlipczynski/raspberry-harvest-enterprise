import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET - pobierz bloki i sekcje
export async function GET() {
  try {
    // Pobierz pierwszą farmę z blokami i sekcjami
    const farm = await prisma.farm.findFirst({
      include: {
        blocks: {
          include: {
            sections: {
              include: {
                variety: true
              }
            }
          },
          orderBy: { name: 'asc' }
        }
      }
    })

    if (!farm) {
      return NextResponse.json({ blocks: [], farm: null })
    }

    // Pobierz odmiany
    const varieties = await prisma.variety.findMany()

    return NextResponse.json({ 
      blocks: farm.blocks,
      varieties,
      farm 
    })
  } catch (error) {
    console.error('Error fetching plantation data:', error)
    return NextResponse.json({ error: 'Failed to fetch plantation data' }, { status: 500 })
  }
}

// POST - utwórz blok
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { block, farmId } = body

    if (!farmId) {
      return NextResponse.json({ error: 'farmId is required' }, { status: 400 })
    }

    const newBlock = await prisma.block.create({
      data: {
        name: block.name,
        areaHa: block.areaHa || null,
        farmId,
      }
    })

    return NextResponse.json({ block: newBlock })
  } catch (error) {
    console.error('Error creating block:', error)
    return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })
  }
}
