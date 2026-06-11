import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * Returns a set of sourceFile names that have already been imported
 * for this tenant's farm. Used by the folder scanner to skip duplicates.
 */
export async function GET() {
  try {
    const tenantId = await requireTenantId()

    const rows = await prisma.$queryRaw<Array<{ source_file: string }>>`
      SELECT DISTINCT tr."sourceFile" AS source_file
      FROM temperature_readings tr
      JOIN sections s ON tr."sectionId" = s.id
      JOIN blocks   b ON s."blockId"   = b.id
      JOIN farms    f ON b."farmId"    = f.id
      WHERE f."tenantId" = ${tenantId}
        AND tr."sourceFile" IS NOT NULL
    `

    const files = rows.map(r => r.source_file)
    return NextResponse.json({ files })
  } catch (error) {
    console.error('imported-files error:', error)
    return NextResponse.json({ error: 'Failed to load imported files' }, { status: 500 })
  }
}
