import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST - inicjalizuj dane startowe
export async function POST() {
  try {
    // ⛔ GUARD: jeśli sekcje już istnieją → odmów, nie dotykaj danych
    const existingSections = await prisma.section.count()
    if (existingSections > 0) {
      return NextResponse.json(
        { error: 'Inicjalizacja niemożliwa — baza zawiera już dane sekcji. Edytuj dane przez UI.' },
        { status: 403 }
      )
    }

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

      // Odmiany — yieldy są wartościami domyślnymi odmiany, użytkownik ustawia per sekcja przez UI
      const dj = await prisma.variety.create({
        data: {
          name: 'Diamond Jubilee',
          origin: 'Wielka Brytania',
          description: 'Odmiana deserowa o dużych, aromatycznych owocach',
          yieldSummerPerShoot: 1.48,
          yieldAutumnPerShoot: 0.67,
          baseTemp: 6.0,
          harvestCurveSummer: [0.5, 1.8, 2.5, 8.3, 18.2, 19.9, 22.1, 17.0, 7.8, 2.6],
          harvestCurveAutumn: [2.8, 10.1, 10.0, 17.1, 22.9, 15.1, 11.8, 5.9, 3.5, 0.4, 0.2],
          pickingEfficiency: 8,
          wastePercent: 3,
          secondCategoryPercent: 22,
          isCustom: false,
          tenantId: tenant.id,
        }
      })

      const ruby = await prisma.variety.create({
        data: {
          name: 'Ruby',
          origin: 'Polska',
          description: 'Odmiana o intensywnym smaku i dobrej wydajności',
          yieldSummerPerShoot: 1.55,
          yieldAutumnPerShoot: 0,
          baseTemp: 6.0,
          harvestCurveSummer: [0.5, 3.8, 6.3, 14.3, 12.4, 16.3, 17.4, 19.1, 5.9, 3.9],
          harvestCurveAutumn: [],
          pickingEfficiency: 8.5,
          wastePercent: 3,
          secondCategoryPercent: 20,
          isCustom: false,
          tenantId: tenant.id,
        }
      })

      // Bloki
      const blockA = await prisma.block.create({ data: { name: 'Blok A', farmId: farm.id } })
      const blockB = await prisma.block.create({ data: { name: 'Blok B', farmId: farm.id } })
      const blockC = await prisma.block.create({ data: { name: 'Blok C', farmId: farm.id } })
      const blockD = await prisma.block.create({ data: { name: 'Blok D', farmId: farm.id } })

      // Sekcje — BEZ hardkodowanych yieldów per sekcja.
      // yieldSummerPerShoot i yieldAutumnPerShoot = null → użytkownik wpisuje przez UI.
      await prisma.section.createMany({
        data: [
          // === BLOK A: DJ, SMALL_POT, rok prod. 2 ===
          {
            name: 'A1-9',
            metersLength: 2646,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2024,
            productionYear: 2,
            plantMaterialType: 'SMALL_POT',
            blockId: blockA.id,
            varietyId: dj.id
          },
          {
            name: 'A10-19',
            metersLength: 2340,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2024,
            productionYear: 2,
            plantMaterialType: 'SMALL_POT',
            blockId: blockA.id,
            varietyId: dj.id
          },
          // === BLOK B: Ruby, LONGCANE, rok prod. 3 ===
          {
            name: 'B01-07',
            metersLength: 2100,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2023,
            productionYear: 3,
            plantMaterialType: 'LONGCANE',
            blockId: blockB.id,
            varietyId: ruby.id
          },
          {
            name: 'B08-13',
            metersLength: 1800,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2023,
            productionYear: 3,
            plantMaterialType: 'LONGCANE',
            blockId: blockB.id,
            varietyId: ruby.id
          },
          // === BLOK C: DJ, SMALL_POT ===
          {
            name: 'C01-05',
            metersLength: 1500,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2024,
            productionYear: 2,
            plantMaterialType: 'SMALL_POT',
            blockId: blockC.id,
            varietyId: dj.id
          },
          {
            name: 'C06-11',
            metersLength: 1800,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2024,
            productionYear: 2,
            plantMaterialType: 'SMALL_POT',
            blockId: blockC.id,
            varietyId: dj.id
          },
          // === BLOK D: DJ, PLUG rok 1 ===
          {
            name: 'D01-09',
            metersLength: 2700,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2025,
            productionYear: 1,
            plantMaterialType: 'PLUG',
            blockId: blockD.id,
            varietyId: dj.id
          },
          {
            name: 'D10-18',
            metersLength: 2700,
            potsPerMeter: 2,
            shootsPerPot: 2,
            plantingYear: 2025,
            productionYear: 1,
            plantMaterialType: 'PLUG',
            blockId: blockD.id,
            varietyId: dj.id
          },
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
