/**
 * Script to remove duplicate HarvestCurve records.
 * Keeps one record per group of (sectionId + year + season), removing the rest.
 * Usage: npx tsx prisma/dedup-harvest-curves.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const allCurves = await prisma.harvestCurve.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, sectionId: true, year: true, season: true, totalKg: true, createdAt: true },
  })

  console.log(`Total HarvestCurve records: ${allCurves.length}`)

  // Group by sectionId + year + season
  const groups: Record<string, typeof allCurves> = {}
  for (const curve of allCurves) {
    const key = `${curve.sectionId ?? 'null'}|${curve.year}|${curve.season}`
    if (!groups[key]) groups[key] = []
    groups[key].push(curve)
  }

  const toDelete: string[] = []
  for (const [key, curves] of Object.entries(groups)) {
    if (curves.length > 1) {
      console.log(`Duplicate group [${key}]: ${curves.length} records`)
      // Keep the first (oldest), delete the rest
      const [keep, ...duplicates] = curves
      console.log(`  Keeping: ${keep.id} (created: ${keep.createdAt.toISOString()}, totalKg: ${keep.totalKg})`)
      for (const dup of duplicates) {
        console.log(`  Deleting: ${dup.id} (created: ${dup.createdAt.toISOString()}, totalKg: ${dup.totalKg})`)
        toDelete.push(dup.id)
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicates found.')
    return
  }

  console.log(`\nDeleting ${toDelete.length} duplicate records...`)
  const result = await prisma.harvestCurve.deleteMany({
    where: { id: { in: toDelete } },
  })
  console.log(`Deleted ${result.count} records.`)

  const remaining = await prisma.harvestCurve.count()
  console.log(`Remaining HarvestCurve records: ${remaining}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
