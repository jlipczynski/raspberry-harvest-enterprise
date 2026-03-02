import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('MaxCrop migration: ensuring correct yields and curves...')

  // Varieties — always set correct values
  const dj = await prisma.variety.findFirst({ where: { name: 'Diamond Jubilee' } })
  if (dj) {
    await prisma.variety.update({
      where: { id: dj.id },
      data: {
        yieldAutumnPerShoot: 0.67,
        harvestCurveSummer: [0.5, 1.8, 2.5, 8.3, 18.2, 19.9, 22.1, 17.0, 7.8, 2.6],
        harvestCurveAutumn: [2.8, 10.1, 10.0, 17.1, 22.9, 15.1, 11.8, 5.9, 3.5, 0.4, 0.2],
        secondCategoryPercent: 22,  // real 2025: ~22% II klasa (było 8%)
        wastePercent: 3,            // ~3% odpad na polu
        autumnStartWeek: 33,       // jesień startuje od T33 (połowa sierpnia)
      }
    })
    console.log('  DJ variety: autumn=0.67, secondCat=22%, waste=3%, curves set')
  } else {
    console.log('  DJ variety: NOT FOUND')
  }

  const ruby = await prisma.variety.findFirst({ where: { name: 'Ruby' } })
  if (ruby) {
    await prisma.variety.update({
      where: { id: ruby.id },
      data: {
        yieldAutumnPerShoot: 0,
        harvestCurveSummer: [0.5, 3.8, 6.3, 14.3, 12.4, 16.3, 17.4, 19.1, 5.9, 3.9],
        harvestCurveAutumn: [],
        secondCategoryPercent: 20,  // real 2025: ~20% II klasa (było 7%)
        wastePercent: 3,            // ~3% odpad na polu
        autumnStartWeek: null,      // Ruby nie ma jesieni
      }
    })
    console.log('  Ruby variety: autumn=0, secondCat=20%, waste=3%, curves set')
  } else {
    console.log('  Ruby variety: NOT FOUND')
  }

  // Sections — always set correct yields from MaxCrop 2025
  const updates: Record<string, { yieldSummerPerShoot: number; yieldAutumnPerShoot: number }> = {
    'A1-9':   { yieldSummerPerShoot: 1.47, yieldAutumnPerShoot: 0.63 },
    'A10-19': { yieldSummerPerShoot: 1.48, yieldAutumnPerShoot: 0.70 },
    'B01-07': { yieldSummerPerShoot: 1.55, yieldAutumnPerShoot: 0 },
    'B08-13': { yieldSummerPerShoot: 2.13, yieldAutumnPerShoot: 0 },
    'C01-05': { yieldSummerPerShoot: 0,    yieldAutumnPerShoot: 0.22 },
    'C06-11': { yieldSummerPerShoot: 0,    yieldAutumnPerShoot: 0.22 },
    'D01-09': { yieldSummerPerShoot: 1.74, yieldAutumnPerShoot: 0.13 },
    'D10-18': { yieldSummerPerShoot: 1.74, yieldAutumnPerShoot: 0.13 },
  }

  let updated = 0
  let notFound = 0
  for (const [name, data] of Object.entries(updates)) {
    const section = await prisma.section.findFirst({ where: { name } })
    if (section) {
      await prisma.section.update({ where: { id: section.id }, data })
      console.log(`  ${name}: summer=${data.yieldSummerPerShoot} autumn=${data.yieldAutumnPerShoot}`)
      updated++
    } else {
      console.log(`  ${name}: NOT FOUND`)
      notFound++
    }
  }

  console.log(`MaxCrop migration: done (${updated} sections updated, ${notFound} not found)`)
}

main()
  .catch(e => { console.error('MaxCrop migration failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
