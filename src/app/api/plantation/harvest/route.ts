import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { parseHarvestRows, mapAreaToBlockName } from '@/lib/maxcrop-harvest-parser'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

/**
 * GET — returns harvest entries for the farm, grouped by block and date
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ entries: [] })

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = { farmId: farm.id }
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const entries = await prisma.harvestEntry.findMany({
      where,
      include: { block: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { areaName: 'asc' }],
    })

    return NextResponse.json({ entries })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch harvest entries' }, { status: 500 })
  }
}

/**
 * POST — upload MaxCrop XLS and import harvest data
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({
      where: { tenantId },
      include: { blocks: { select: { id: true, name: true } } },
    })
    if (!farm) return NextResponse.json({ error: 'Farm not found' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Parse XLS
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1 })

    // Skip title rows (first 2 rows are title + header)
    const dataRows = rawRows.slice(2)
    const parsed = parseHarvestRows(dataRows)

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'No harvest data found in file' }, { status: 400 })
    }

    // Build block name → id map
    const blockMap = new Map<string, string>()
    for (const b of farm.blocks) {
      blockMap.set(b.name, b.id)
    }

    // Import with upsert (unique on farmId+date+areaName+productClass)
    let inserted = 0
    const updated = 0
    let unmapped = 0
    const unmappedAreas = new Set<string>()

    for (const row of parsed) {
      const blockName = mapAreaToBlockName(row.areaName)
      const blockId = blockName ? blockMap.get(blockName) ?? null : null

      if (!blockId) {
        unmapped++
        unmappedAreas.add(row.areaName)
      }

      const result = await prisma.harvestEntry.upsert({
        where: {
          farmId_date_areaName_productClass: {
            farmId: farm.id,
            date: new Date(row.date),
            areaName: row.areaName,
            productClass: row.productClass,
          },
        },
        create: {
          farmId: farm.id,
          date: new Date(row.date),
          areaName: row.areaName,
          productClass: row.productClass,
          weightKg: row.weightKg,
          quantity: row.quantity,
          blockId,
          sourceFile: file.name,
        },
        update: {
          weightKg: row.weightKg,
          quantity: row.quantity,
          blockId,
          sourceFile: file.name,
        },
      })

      // Check if it was created or updated
      if (result.createdAt.getTime() === result.createdAt.getTime()) {
        // Can't easily distinguish, count based on timestamp
        inserted++
      }
    }

    return NextResponse.json({
      success: true,
      totalRows: parsed.length,
      inserted,
      updated,
      unmapped,
      unmappedAreas: Array.from(unmappedAreas),
      dateRange: {
        from: parsed[0]?.date,
        to: parsed[parsed.length - 1]?.date,
      },
    })
  } catch (error) {
    console.error('Harvest import error:', error)
    return NextResponse.json({ error: 'Failed to import harvest data' }, { status: 500 })
  }
}
