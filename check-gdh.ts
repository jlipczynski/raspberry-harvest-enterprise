import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const GDH_UPPER = 26.0

async function main() {
  const dj = await prisma.variety.findFirst({ where: { name: { contains: 'Diamond' } } })
  if (!dj) return
  const baseTemp = dj.baseTemp ?? 6.0
  
  console.log('=== PROGI Z BAZY ===')
  console.log(`  baseTemp: ${baseTemp}°C`)
  console.log(`  gdhWinteredFlowerSummer: ${dj.gdhWinteredFlowerSummer ?? 'NULL'}`)
  console.log(`  gdhWinteredFruitSummer: ${dj.gdhWinteredFruitSummer ?? 'NULL'}`)
  console.log(`  gdhFruitAutumn: ${dj.gdhFruitAutumn ?? 'NULL'}`)
  
  const effectiveFruit = dj.gdhWinteredFruitSummer

  // WeatherData (zewnętrzne)
  const farm = await prisma.farm.findFirst()
  if (!farm) return
  const weather = await prisma.weatherData.findMany({
    where: { farmId: farm.id, date: { gte: new Date('2026-01-01') } },
    orderBy: { date: 'asc' }
  })
  
  console.log(`\n=== DANE POGODOWE ZEWNĘTRZNE (${weather.length} dni) ===`)
  let cumGdhExt = 0
  console.log(`  ${'Data'.padEnd(12)} | ${'Min'.padStart(6)} | ${'Max'.padStart(6)} | ${'Śr.'.padStart(6)} | ${'GDH'.padStart(6)} | ${'Kum.'.padStart(7)}`)
  console.log(`  ${'-'.repeat(58)}`)
  for (const w of weather) {
    const min = w.temperatureMin ?? 0
    const max = w.temperatureMax ?? 0
    const avg = w.temperatureAvg != null ? w.temperatureAvg : (min + max) / 2
    const effective = Math.min(avg, GDH_UPPER)
    const dailyGdh = effective > baseTemp ? (effective - baseTemp) * 24 : 0
    cumGdhExt += dailyGdh
    console.log(`  ${w.date.toISOString().slice(0,10)} | ${min.toFixed(1).padStart(5)}° | ${max.toFixed(1).padStart(5)}° | ${avg.toFixed(1).padStart(5)}° | ${dailyGdh.toFixed(0).padStart(6)} | ${cumGdhExt.toFixed(0).padStart(7)}`)
  }
  console.log(`\n  GDH zewnętrzne na dziś: ${Math.round(cumGdhExt)}`)
  if (effectiveFruit) {
    console.log(`  Próg owocowania: ${effectiveFruit}`)
    console.log(`  Brakuje: ${Math.round(effectiveFruit - cumGdhExt)}`)
  }

  // Logger (tunel) — już wyświetlony wyżej, podsumowanie
  console.log(`\n=== LOGGER TUNEL (24.02–20.03): 893 GDH ===`)
  console.log(`  Uwaga: brak loggera od 01.01 — API łączy zewn. dane + model tunelu + logger`)
  
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
