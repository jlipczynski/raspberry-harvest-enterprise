import { PrismaClient, Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"

function jsonOrNull(val: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return val != null ? (val as Prisma.InputJsonValue) : Prisma.JsonNull
}

const prisma = new PrismaClient()

async function main() {
  // KROK 1 — znajdź tenant źródłowy
  const sourceUser = await prisma.user.findUnique({
    where: { email: 'jan@lipczynski.pl' },
    include: { tenant: true }
  })
  if (!sourceUser) throw new Error('Nie znaleziono użytkownika jan@lipczynski.pl')

  // KROK 2 — stwórz lub znajdź tenant docelowy
  let targetTenant = await prisma.tenant.findFirst({
    where: { users: { some: { email: 'testowanie@ai.com' } } }
  })
  if (!targetTenant) {
    targetTenant = await prisma.tenant.create({
      data: { name: 'Konto Testowe' }
    })
  }

  // KROK 3 — stwórz lub zaktualizuj użytkownika testowego
  const passwordHash = await bcrypt.hash('test1234', 10)
  await prisma.user.upsert({
    where: { email: 'testowanie@ai.com' },
    create: {
      email: 'testowanie@ai.com',
      passwordHash,
      name: 'Konto Testowe',
      role: 'MANAGER',
      tenantId: targetTenant.id,
    },
    update: {
      passwordHash,
      tenantId: targetTenant.id,
    }
  })

  // KROK 4 — skopiuj Farm z blokami, sekcjami, odmianami
  const sourceFarm = await prisma.farm.findFirst({
    where: { tenantId: sourceUser.tenantId },
    include: {
      blocks: {
        include: {
          sections: {
            include: {
              variety: true,
              templateAssignments: {
                include: { template: true }
              }
            }
          }
        }
      }
    }
  })
  if (!sourceFarm) throw new Error('Nie znaleziono farmy źródłowej')

  // Usuń istniejącą farmę testową jeśli istnieje (cascade usunie bloki/sekcje)
  await prisma.farm.deleteMany({ where: { tenantId: targetTenant.id } })

  // Stwórz nową farmę dla konta testowego z tymi samymi danymi
  const targetFarm = await prisma.farm.create({
    data: {
      name: sourceFarm.name,
      location: sourceFarm.location,
      latitude: sourceFarm.latitude,
      longitude: sourceFarm.longitude,
      seasonStartDate: sourceFarm.seasonStartDate,
      tenantId: targetTenant.id,
    }
  })

  // KROK 5 — skopiuj bloki i sekcje zachowując mapowanie ID
  const sectionIdMap = new Map<string, string>()

  for (const block of sourceFarm.blocks) {
    const targetBlock = await prisma.block.create({
      data: {
        name: block.name,
        areaHa: block.areaHa,
        farmId: targetFarm.id,
      }
    })

    for (const section of block.sections) {
      const targetSection = await prisma.section.create({
        data: {
          name: section.name,
          metersLength: section.metersLength,
          potsPerMeter: section.potsPerMeter,
          shootsPerPot: section.shootsPerPot,
          potsOverride: section.potsOverride,
          plantingYear: section.plantingYear,
          productionYear: section.productionYear,
          plantMaterialType: section.plantMaterialType,
          plantSource: section.plantSource,
          yieldSummerPerShoot: section.yieldSummerPerShoot,
          yieldAutumnPerShoot: section.yieldAutumnPerShoot,
          winteredInTunnel: section.winteredInTunnel,
          plantingDate: section.plantingDate,
          autumnShootDate: section.autumnShootDate,
          varietyId: section.varietyId,
          blockId: targetBlock.id,
        }
      })
      sectionIdMap.set(section.id, targetSection.id)
    }
  }

  // KROK 6 — skopiuj WeatherData
  const weatherData = await prisma.weatherData.findMany({
    where: { farmId: sourceFarm.id }
  })
  await prisma.weatherData.deleteMany({ where: { farmId: targetFarm.id } })
  if (weatherData.length > 0) {
    await prisma.weatherData.createMany({
      data: weatherData.map(w => ({
        date: w.date,
        tempMin: w.tempMin,
        tempMax: w.tempMax,
        tempAvg: w.tempAvg,
        gdhDaily: w.gdhDaily,
        gdhCumulative: w.gdhCumulative,
        source: w.source,
        farmId: targetFarm.id,
      }))
    })
  }

  // KROK 7 — skopiuj HarvestCurve dla każdej sekcji
  for (const [sourceId, targetId] of sectionIdMap.entries()) {
    const curves = await prisma.harvestCurve.findMany({
      where: { sectionId: sourceId }
    })
    for (const curve of curves) {
      await prisma.harvestCurve.create({
        data: {
          year: curve.year,
          season: curve.season,
          curve: curve.curve,
          dailyCurve: curve.dailyCurve,
          startDate: curve.startDate,
          totalKg: curve.totalKg,
          startWeek: curve.startWeek,
          sectionId: targetId,
          varietyId: curve.varietyId,
          sourceFile: curve.sourceFile,
          name: curve.name,
          isArchived: curve.isArchived,
          mergedFromIds: curve.mergedFromIds,
          commercialStartDate: curve.commercialStartDate,
          commercialStartDateAutumn: curve.commercialStartDateAutumn,
          winteredInTunnel: curve.winteredInTunnel,
          plantingDate: curve.plantingDate,
          plantSource: curve.plantSource,
          plantingYear: curve.plantingYear,
          autumnShootDate: curve.autumnShootDate,
        }
      })
    }
  }

  // KROK 7b — skopiuj TemperatureReadings dla każdej sekcji
  let totalReadings = 0
  for (const [sourceId, targetId] of sectionIdMap.entries()) {
    const readings = await prisma.temperatureReading.findMany({
      where: { sectionId: sourceId },
      orderBy: { timestamp: 'asc' }
    })
    if (readings.length === 0) continue
    await prisma.temperatureReading.createMany({
      data: readings.map(r => ({
        timestamp: r.timestamp,
        temperature: r.temperature,
        sourceFile: r.sourceFile,
        sectionId: targetId,
      }))
    })
    totalReadings += readings.length
    console.log(`  Skopiowano ${readings.length} pomiarów dla sekcji ${targetId}`)
  }

  // KROK 8 — skopiuj ProductionCurveTemplate
  const templates = await prisma.productionCurveTemplate.findMany({
    where: { tenantId: sourceUser.tenantId }
  })
  await prisma.productionCurveTemplate.deleteMany({
    where: { tenantId: targetTenant.id }
  })
  for (const t of templates) {
    await prisma.productionCurveTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        tenantId: targetTenant.id,
        varietyId: t.varietyId,
        productionYear: t.productionYear,
        productionCycle: t.productionCycle,
        plantingDate: t.plantingDate,
        winteredInTunnel: t.winteredInTunnel,
        plantSource: t.plantSource,
        dailyCurveSummer: t.dailyCurveSummer,
        weeklyCurveSummer: t.weeklyCurveSummer,
        startDateSummer: t.startDateSummer,
        endDateSummer: t.endDateSummer,
        startWeekSummer: t.startWeekSummer,
        totalKgSummer: t.totalKgSummer,
        dailyCurveAutumn: t.dailyCurveAutumn,
        weeklyCurveAutumn: t.weeklyCurveAutumn,
        startDateAutumn: t.startDateAutumn,
        endDateAutumn: t.endDateAutumn,
        startWeekAutumn: t.startWeekAutumn,
        totalKgAutumn: t.totalKgAutumn,
        outsideTemps: jsonOrNull(t.outsideTemps),
        insideTunnelTemps: jsonOrNull(t.insideTunnelTemps),
        tempAdjustmentFactor: t.tempAdjustmentFactor,
        gdhData: jsonOrNull(t.gdhData),
        gdhToFlowering: t.gdhToFlowering,
        gdhToFirstFruit: t.gdhToFirstFruit,
        tempSources: t.tempSources,
        sourceSectionId: t.sourceSectionId,
        summerEndWeek: t.summerEndWeek,
        sourceFile: t.sourceFile,
        notes: t.notes,
        sourceHarvestCurveIds: t.sourceHarvestCurveIds,
        sourceAreaNames: t.sourceAreaNames,
      }
    })
  }

  // KROK 9 — podsumowanie
  console.log('✅ Konto testowe gotowe:')
  console.log('   Email: testowanie@ai.com')
  console.log('   Hasło: test1234')
  console.log(`   Farma: ${targetFarm.name}`)
  console.log(`   Bloków: ${sourceFarm.blocks.length}`)
  console.log(`   Sekcji: ${sectionIdMap.size}`)
  console.log(`   Danych pogodowych: ${weatherData.length}`)
  console.log(`   Szablonów: ${templates.length}`)
  console.log(`   Pomiarów temperatury: ${totalReadings}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
