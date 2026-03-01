import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// One-shot migration: update yields & curves from MaxCrop 2025 data
// Call POST /api/migrate-maxcrop once, then delete this file
export async function POST() {
  try {
    const results: string[] = []

    // --- Update variety defaults ---
    const djVariety = await prisma.variety.findFirst({ where: { name: 'Diamond Jubilee' } })
    const rubyVariety = await prisma.variety.findFirst({ where: { name: 'Ruby' } })

    if (djVariety) {
      await prisma.variety.update({
        where: { id: djVariety.id },
        data: {
          yieldSummerPerShoot: 1.48,
          yieldAutumnPerShoot: 0.67,
          harvestCurveSummer: [0.5, 1.8, 2.5, 8.3, 18.2, 19.9, 22.1, 17.0, 7.8, 2.6],
          harvestCurveAutumn: [2.8, 10.1, 10.0, 17.1, 22.9, 15.1, 11.8, 5.9, 3.5, 0.4, 0.2],
        }
      })
      results.push(`DJ variety: autumn 0.44→0.67, curves updated`)
    }

    if (rubyVariety) {
      await prisma.variety.update({
        where: { id: rubyVariety.id },
        data: {
          yieldAutumnPerShoot: 0,
          harvestCurveSummer: [0.5, 3.8, 6.3, 14.3, 12.4, 16.3, 17.4, 19.1, 5.9, 3.9],
          harvestCurveAutumn: [],
        }
      })
      results.push(`Ruby variety: autumn 0.51→0, curves updated`)
    }

    // --- Update per-section yields ---
    const sectionUpdates: Record<string, { yieldSummerPerShoot: number; yieldAutumnPerShoot: number }> = {
      'A1-9':   { yieldSummerPerShoot: 1.47, yieldAutumnPerShoot: 0.63 },
      'A10-19': { yieldSummerPerShoot: 1.48, yieldAutumnPerShoot: 0.70 },
      'B01-07': { yieldSummerPerShoot: 1.55, yieldAutumnPerShoot: 0 },
      'B08-13': { yieldSummerPerShoot: 2.13, yieldAutumnPerShoot: 0 },
      'C01-05': { yieldSummerPerShoot: 0,    yieldAutumnPerShoot: 0.22 },
      'C06-11': { yieldSummerPerShoot: 0,    yieldAutumnPerShoot: 0.22 },
      'D01-09': { yieldSummerPerShoot: 1.74, yieldAutumnPerShoot: 0.13 },
      'D10-18': { yieldSummerPerShoot: 1.74, yieldAutumnPerShoot: 0.13 },
    }

    for (const [name, data] of Object.entries(sectionUpdates)) {
      const section = await prisma.section.findFirst({ where: { name } })
      if (section) {
        const old = { s: section.yieldSummerPerShoot, a: section.yieldAutumnPerShoot }
        await prisma.section.update({
          where: { id: section.id },
          data,
        })
        results.push(`${name}: S ${old.s}→${data.yieldSummerPerShoot}, A ${old.a}→${data.yieldAutumnPerShoot}`)
      } else {
        results.push(`${name}: NOT FOUND`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'MaxCrop 2025 yields migrated',
      updates: results,
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: 'Migration failed', details: String(error) }, { status: 500 })
  }
}

// GET — show what would change (dry run)
export async function GET() {
  try {
    const sections = await prisma.section.findMany({
      select: { name: true, yieldSummerPerShoot: true, yieldAutumnPerShoot: true },
      orderBy: { name: 'asc' },
    })
    const varieties = await prisma.variety.findMany({
      select: { name: true, yieldSummerPerShoot: true, yieldAutumnPerShoot: true, harvestCurveSummer: true, harvestCurveAutumn: true },
    })
    return NextResponse.json({ currentValues: { sections, varieties } })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
