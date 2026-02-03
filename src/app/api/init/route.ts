import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST - inicjalizuj dane startowe
export async function POST() {
  try {
    let tenant = await prisma.tenant.findFirst()
    
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'GR Lipczynski',
        }
      })

      const farm = await prisma.farm.create({
        data: {
          name: 'Plantacja Malin - Wyszynki',
          location: 'Wyszynki, gmina Budzyń',
          tenantId: tenant.id,
        }
      })

      const dj = await prisma.variety.create({
        data: {
          name: 'Diamond Jubilee',
          gdhFirstHarvest: 20000,
          avgYieldPerPlant: 1.92,
          fruitCurve: [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1],
          isCustom: false,
          tenantId: tenant.id,
        }
      })

      const ruby = await prisma.variety.create({
        data: {
          name: 'Ruby',
          gdhFirstHarvest: 20000,
          avgYieldPerPlant: 2.06,
          fruitCurve: [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1],
          isCustom: false,
          tenantId: tenant.id,
        }
      })

      const blockA = await prisma.block.create({ data: { name: 'Blok A', farmId: farm.id } })
      const blockB = await prisma.block.create({ data: { name: 'Blok B', farmId: farm.id } })
      const blockC = await prisma.block.create({ data: { name: 'Blok C', farmId: farm.id } })
      const blockD = await prisma.block.create({ data: { name: 'Blok D', farmId: farm.id } })

      await prisma.section.createMany({
        data: [
          { name: 'A1-9', rowsCount: 18, rowLengthM: 147, plantSpacing: 0.5, plantsCount: 5284, blockId: blockA.id, varietyId: dj.id },
          { name: 'A10-19', rowsCount: 20, rowLengthM: 117, plantSpacing: 0.5, plantsCount: 4672, blockId: blockA.id, varietyId: dj.id },
          { name: 'B01-07', rowsCount: 14, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 4200, blockId: blockB.id, varietyId: ruby.id },
          { name: 'B08-13', rowsCount: 12, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 3600, blockId: blockB.id, varietyId: ruby.id },
          { name: 'C01-05', rowsCount: 10, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 3000, blockId: blockC.id, varietyId: dj.id },
          { name: 'C06-11', rowsCount: 12, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 3600, blockId: blockC.id, varietyId: dj.id },
          { name: 'D01-09', rowsCount: 18, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 5400, blockId: blockD.id, varietyId: dj.id },
          { name: 'D10-18', rowsCount: 18, rowLengthM: 150, plantSpacing: 0.5, plantsCount: 5400, blockId: blockD.id, varietyId: dj.id },
        ]
      })

      return NextResponse.json({ success: true, message: 'Dane zainicjalizowane', tenant, farm })
    }

    const farm = await prisma.farm.findFirst({ where: { tenantId: tenant.id } })
    return NextResponse.json({ success: true, message: 'Dane już istnieją', tenant, farm })
  } catch (error) {
    console.error('Error initializing data:', error)
    return NextResponse.json({ error: 'Failed to initialize data', details: String(error) }, { status: 500 })
  }
}

// GET - sprawdź status
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst()
    const farm = await prisma.farm.findFirst()
    const varietiesCount = await prisma.variety.count()
    const blocksCount = await prisma.block.count()
    const sectionsCount = await prisma.section.count()

    return NextResponse.json({
      initialized: !!tenant,
      tenant,
      farm,
      counts: { varieties: varietiesCount, blocks: blocksCount, sections: sectionsCount }
    })
  } catch (error) {
    console.error('Error checking status:', error)
    return NextResponse.json({ error: 'Failed to check status', details: String(error) }, { status: 500 })
  }
}
