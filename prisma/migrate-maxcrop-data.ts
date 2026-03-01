import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check if already migrated (Ruby autumn should be 0)
  const ruby = await prisma.variety.findFirst({ where: { name: 'Ruby' } })
  if (ruby && ruby.yieldAutumnPerShoot === 0) {
    console.log('MaxCrop migration: already done, skipping')
    return
  }

  console.log('MaxCrop migration: updating yields and curves...')

  // Varieties
  const dj = await prisma.variety.findFirst({ where: { name: 'Diamond Jubilee' } })
  if (dj) {
    await prisma.variety.update({
      where: { id: dj.id },
      data: {
        yieldAutumnPerShoot: 0.67,
        harvestCurveSummer: [0.5, 1.8, 2.5, 8.3, 18.2, 19.9, 22.1, 17.0, 7.8, 2.6],
        harvestCurveAutumn: [2.8, 10.1, 10.0, 17.1, 22.9, 15.1, 11.8, 5.9, 3.5, 0.4, 0.2],
      }
    })
    console.log('  DJ variety: autumn 0.44→0.67, curves updated')
  }

  if (ruby) {
    await prisma.variety.update({
      where: { id: ruby.id },
      data: {
        yieldAutumnPerShoot: 0,
        harvestCurveSummer: [0.5, 3.8, 6.3, 14.3, 12.4, 16.3, 17.4, 19.1, 5.9, 3.9],
        harvestCurveAutumn: [],
      }
    })
    console.log('  Ruby variety: autumn 0.51→0, curves updated')
  }

  // Sections
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

  for (const [name, data] of Object.entries(updates)) {
    const section = await prisma.section.findFirst({ where: { name } })
    if (section) {
      await prisma.section.update({ where: { id: section.id }, data })
      console.log(`  ${name}: S=${data.yieldSummerPerShoot} A=${data.yieldAutumnPerShoot}`)
    }
  }

  console.log('MaxCrop migration: done')
}

main()
  .catch(e => { console.error('MaxCrop migration failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
