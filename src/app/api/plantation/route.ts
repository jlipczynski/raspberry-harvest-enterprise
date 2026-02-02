import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET - pobierz bloki i sekcje
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
    }

    const blocks = await prisma.block.findMany({
      where: { farmId: farm.id },
      include: {
        sections: {
          include: {
            variety: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    const varieties = await prisma.variety.findMany({
      where: { farmId: farm.id }
    })

    return NextResponse.json({ blocks, varieties, farm })
  } catch (error) {
    console.error('Error fetching plantation data:', error)
    return NextResponse.json({ error: 'Failed to fetch plantation data' }, { status: 500 })
  }
}

// POST - zapisz bloki i sekcje
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { blocks } = body

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

    // Pobierz odmiany
    const varieties = await prisma.variety.findMany({
      where: { farmId: farm.id }
    })
    const varietyMap = new Map(varieties.map(v => [v.name, v.id]))

    // Usuń stare bloki i sekcje
    await prisma.section.deleteMany({
      where: { block: { farmId: farm.id } }
    })
    await prisma.block.deleteMany({
      where: { farmId: farm.id }
    })

    // Utwórz nowe bloki i sekcje
    for (const block of blocks) {
      const newBlock = await prisma.block.create({
        data: {
          name: block.name,
          farmId: farm.id,
        }
      })

      for (const section of block.sections || []) {
        const varietyId = varietyMap.get(section.variety)
        if (varietyId) {
          await prisma.section.create({
            data: {
              name: section.name,
              tunnels: section.tunnels || 0,
              rowsPerTunnel: 2,
              metersPerRow: Math.round((section.meters || 0) / 2),
              potsPerMeter: section.pots ? Math.round(section.pots / (section.meters || 1)) : 2,
              shootsPerPot: section.shootsPerPot || 2,
              blockId: newBlock.id,
              varietyId: varietyId,
            }
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving plantation data:', error)
    return NextResponse.json({ error: 'Failed to save plantation data' }, { status: 500 })
  }
}
