import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    let tenant = await prisma.tenant.findFirst()
    
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'GR Lipczynski' }
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
          origin: 'Wielka Brytania',
          yieldSummerPerShoot: 1.48,
          yieldAutumnPerShoot: 0.44,
          gdhSummer: 20000,
          gdhAutumn: 25000,
          harvestCurveSummer: [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1],
          harvestCurveAutumn: [5, 15, 25, 25, 15, 10, 5],
          pickingEfficiency: 8,
          isCustom: false,
          tenantId: tenant.id,
        }
      })

      const ruby = await prisma.variety.create({
        data: {
          name: 'Ruby',
          origin: 'Polska',
          yieldSummerPerShoot: 1.55,
          yieldAutumnPerShoot: 0.51,
          gdhSummer: 19000,
          gdhAutumn: 24000,
          harvestCurveSummer: [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1],
          harvestCurveAutumn: [5, 15, 25, 25, 15, 10, 5],
          pickingEfficiency: 8.5,
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
          { name: 'A1-9', metersLength: 2646, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2024, productionYear: 2, plantMaterialType: 'SMALL_POT', blockId: blockA.id, varietyId: dj.id },
          { name: 'A10-19', metersLength: 2340, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2024, productionYear: 2, plantMaterialType: 'SMALL_POT', blockId: blockA.id, varietyId: dj.id },
          { name: 'B01-07', metersLength: 2100, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2023, productionYear: 3, plantMaterialType: 'LONGCANE', blockId: blockB.id, varietyId: ruby.id },
          { name: 'B08-13', metersLength: 1800, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2023, productionYear: 3, plantMaterialType: 'LONGCANE', blockId: blockB.id, varietyId: ruby.id },
          { name: 'C01-05', metersLength: 1500, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2024, productionYear: 2, plantMaterialType: 'SMALL_POT', blockId: blockC.id, varietyId: dj.id },
          { name: 'C06-11', metersLength: 1800, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2024, productionYear: 2, plantMaterialType: 'SMALL_POT', blockId: blockC.id, varietyId: dj.id },
          { name: 'D01-09', metersLength: 2700, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2025, productionYear: 1, plantMaterialType: 'PLUG', blockId: blockD.id, varietyId: dj.id },
          { name: 'D10-18', metersLength: 2700, potsPerMeter: 2, shootsPerPot: 2, plantingYear: 2025, productionYear: 1, plantMaterialType: 'PLUG', blockId: blockD.id, varietyId: dj.id },
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
