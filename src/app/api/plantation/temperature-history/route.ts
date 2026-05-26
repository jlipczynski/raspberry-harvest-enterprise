import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()

    const rows = await prisma.$queryRaw<Array<{
      source_file: string | null
      batch_time: Date
      imported_at: Date
      reading_count: bigint
      data_from: Date
      data_to: Date
      section_names: string[]
      block_names: string[]
    }>>`
      SELECT
        tr."sourceFile"            AS source_file,
        date_trunc('minute', tr."importedAt") AS batch_time,
        MIN(tr."importedAt")       AS imported_at,
        COUNT(tr.id)               AS reading_count,
        MIN(tr.timestamp)          AS data_from,
        MAX(tr.timestamp)          AS data_to,
        array_agg(DISTINCT s.name) AS section_names,
        array_agg(DISTINCT b.name) AS block_names
      FROM temperature_readings tr
      JOIN sections s ON tr."sectionId" = s.id
      JOIN blocks   b ON s."blockId"   = b.id
      JOIN farms    f ON b."farmId"    = f.id
      WHERE f."tenantId" = ${tenantId}
      GROUP BY tr."sourceFile", date_trunc('minute', tr."importedAt")
      ORDER BY MIN(tr."importedAt") DESC
      LIMIT 100
    `

    const history = rows.map(r => ({
      batchTime: r.batch_time.toISOString(),
      importedAt: r.imported_at.toISOString(),
      sourceFile: r.source_file ?? '(brak nazwy)',
      readingCount: Number(r.reading_count),
      dataFrom: r.data_from.toISOString().slice(0, 10),
      dataTo: r.data_to.toISOString().slice(0, 10),
      sectionNames: r.section_names.filter(Boolean).sort(),
      blockNames: [...new Set(r.block_names.filter(Boolean))].sort(),
    }))

    return NextResponse.json({ history })
  } catch (error) {
    console.error('temperature-history error:', error)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
