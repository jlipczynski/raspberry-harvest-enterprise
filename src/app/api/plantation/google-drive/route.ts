import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { listCsvFiles, getFileContent } from '@/lib/google-drive'
import { parseCsvMetadata } from '@/lib/csv-metadata-browser'

export const dynamic = 'force-dynamic'

/**
 * GET — returns Google Drive connection status + folder ID
 */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ connected: false })

    return NextResponse.json({
      connected: !!farm.googleDriveRefreshToken,
      folderId: farm.googleDriveFolderId || null,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * POST — scan Google Drive folder for CSV files and return metadata
 * Body: { folderId?: string } — if provided, saves it as the default folder
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    if (!farm.googleDriveRefreshToken) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
    }

    const body = await request.json()
    const folderId = body.folderId || farm.googleDriveFolderId

    if (!folderId) {
      return NextResponse.json({ error: 'No folder ID provided' }, { status: 400 })
    }

    // Save folder ID if new
    if (folderId !== farm.googleDriveFolderId) {
      await prisma.farm.update({
        where: { id: farm.id },
        data: { googleDriveFolderId: folderId },
      })
    }

    // Get sensor devices for serial matching
    const devices = await prisma.sensorDevice.findMany({
      where: { farmId: farm.id },
      include: { section: { include: { block: { select: { id: true, name: true } } } } },
    })

    const serialMap = new Map<string, Array<{ sectionId: string; sectionName: string; blockName: string }>>()
    for (const d of devices) {
      const existing = serialMap.get(d.serialNumber) || []
      existing.push({
        sectionId: d.section.id,
        sectionName: d.section.name || '(bez nazwy)',
        blockName: d.section.block.name,
      })
      serialMap.set(d.serialNumber, existing)
    }

    // Get already imported files
    const importedRows = await prisma.$queryRaw<Array<{ source_file: string }>>`
      SELECT DISTINCT tr."sourceFile" AS source_file
      FROM temperature_readings tr
      JOIN sections s ON tr."sectionId" = s.id
      JOIN blocks   b ON s."blockId"   = b.id
      JOIN farms    f ON b."farmId"    = f.id
      WHERE f."tenantId" = ${tenantId}
        AND tr."sourceFile" IS NOT NULL
    `
    const importedSet = new Set(importedRows.map(r => r.source_file))

    // List CSV files from Google Drive
    console.log('Scanning Drive folder:', folderId)
    const driveFiles = await listCsvFiles(farm.googleDriveRefreshToken, folderId)
    console.log('Found files:', driveFiles.length, driveFiles.map(f => f.name))

    // Parse metadata for each file
    const results = []
    for (const df of driveFiles) {
      try {
        const content = await getFileContent(farm.googleDriveRefreshToken, df.id)
        const metadata = parseCsvMetadata(content)
        const matched = metadata.serialNumber ? (serialMap.get(metadata.serialNumber) || []) : []

        results.push({
          fileId: df.id,
          fileName: df.name,
          modifiedTime: df.modifiedTime,
          metadata,
          matchedSections: matched,
          alreadyImported: importedSet.has(df.name),
        })
      } catch (e) {
        console.error(`Error reading Drive file ${df.name}:`, e)
        results.push({
          fileId: df.id,
          fileName: df.name,
          modifiedTime: df.modifiedTime,
          metadata: { serialNumber: null, tunnelName: null, dateFrom: null, dateTo: null, readingCount: 0 },
          matchedSections: [],
          alreadyImported: false,
          error: 'Błąd odczytu pliku',
        })
      }
    }

    // Sort: new unimported first
    results.sort((a, b) => {
      if (a.alreadyImported !== b.alreadyImported) return a.alreadyImported ? 1 : -1
      return a.fileName.localeCompare(b.fileName)
    })

    return NextResponse.json({ files: results, folderId })
  } catch (error) {
    console.error('Google Drive scan error:', error)
    return NextResponse.json({ error: 'Błąd skanowania Google Drive' }, { status: 500 })
  }
}
