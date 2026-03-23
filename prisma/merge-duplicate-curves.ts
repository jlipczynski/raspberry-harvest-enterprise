import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Merge duplicate HarvestCurves: finding (name, year) duplicates...')

  const allCurves = await prisma.harvestCurve.findMany({
    orderBy: [{ year: 'asc' }, { name: 'asc' }, { season: 'asc' }],
  })

  // Group by (name, year) — only where name is set (imported curves)
  const groups: Record<string, typeof allCurves> = {}
  for (const c of allCurves) {
    if (!c.name) continue
    const key = `${c.name}::${c.year}`
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }

  // Also group by (sectionId, year) for curves with sectionId but no name
  for (const c of allCurves) {
    if (c.name) continue // already handled above
    if (!c.sectionId) continue
    const key = `section::${c.sectionId}::${c.year}`
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }

  let mergedCount = 0
  let skippedCount = 0

  for (const [key, curves] of Object.entries(groups)) {
    if (curves.length < 2) continue

    const summer = curves.find(c => c.season === 'summer') || curves[0]
    const autumn = curves.find(c => c.season === 'autumn')

    if (!autumn) {
      // Multiple curves but no clear summer/autumn split — skip
      console.log(`  SKIP ${key}: ${curves.length} curves but no summer/autumn pair`)
      skippedCount++
      continue
    }

    // Build combined dailyCurve
    let combinedDailyCurve: number[]
    if (summer.startDate && autumn.startDate) {
      // Both have startDate — build date→kg map and merge
      const dateMap: Record<string, number> = {}
      const summerDays = summer.dailyCurve || []
      const summerStart = new Date(summer.startDate)
      for (let i = 0; i < summerDays.length; i++) {
        const d = new Date(summerStart)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        dateMap[dateStr] = (dateMap[dateStr] || 0) + summerDays[i]
      }
      const autumnDays = autumn.dailyCurve || []
      const autumnStart = new Date(autumn.startDate)
      for (let i = 0; i < autumnDays.length; i++) {
        const d = new Date(autumnStart)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        dateMap[dateStr] = (dateMap[dateStr] || 0) + autumnDays[i]
      }
      const sortedDates = Object.keys(dateMap).sort()
      combinedDailyCurve = sortedDates.map(d => dateMap[d])
    } else {
      // No startDate — concatenate summer + autumn
      combinedDailyCurve = [...(summer.dailyCurve || []), ...(autumn.dailyCurve || [])]
    }

    const combinedTotalKg = (summer.totalKg || 0) + (autumn.totalKg || 0)

    // Combined weekly curve (percentages)
    const combinedCurve = combinedTotalKg > 0
      ? [...(summer.curve || []).map(pct => (pct / 100) * (summer.totalKg || 0) / combinedTotalKg * 100),
         ...(autumn.curve || []).map(pct => (pct / 100) * (autumn.totalKg || 0) / combinedTotalKg * 100)]
      : []

    const combinedStartWeek = Math.min(summer.startWeek, autumn.startWeek)

    // Update summer record with combined data
    await prisma.harvestCurve.update({
      where: { id: summer.id },
      data: {
        dailyCurve: combinedDailyCurve,
        totalKg: combinedTotalKg,
        curve: combinedCurve,
        startWeek: combinedStartWeek,
        startDate: summer.startDate || autumn.startDate,
        season: null,
        commercialStartDate: summer.commercialStartDate,
        commercialStartDateAutumn: autumn.commercialStartDate || autumn.commercialStartDateAutumn,
      },
    })

    // Delete autumn record
    await prisma.harvestCurve.delete({ where: { id: autumn.id } })

    // If there were more than 2 curves in the group (e.g. preharvest), delete extras
    for (const extra of curves) {
      if (extra.id === summer.id || extra.id === autumn.id) continue
      await prisma.harvestCurve.delete({ where: { id: extra.id } })
      console.log(`  DELETED extra curve ${extra.id} from group ${key}`)
    }

    console.log(`  MERGED ${key}: summer(${summer.id}) + autumn(${autumn.id}) → combined ${combinedTotalKg.toFixed(0)} kg, ${combinedDailyCurve.length} days`)
    mergedCount++
  }

  console.log(`\nDone: ${mergedCount} pairs merged, ${skippedCount} skipped`)
}

main()
  .catch(e => { console.error('Merge failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
