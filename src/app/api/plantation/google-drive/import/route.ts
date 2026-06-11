import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { getFileContent } from '@/lib/google-drive'
import { parseCsvMetadata } from '@/lib/csv-metadata-browser'

export const dynamic = 'force-dynamic'

/**
 * POST — import a CSV file from Google Drive into temperature_readings
 * Body: { fileId, fileName, sectionId }
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
    const { fileId, fileName, sectionId } = body

    if (!fileId || !fileName || !sectionId) {
      return NextResponse.json({ error: 'fileId, fileName and sectionId are required' }, { status: 400 })
    }

    // Verify section belongs to this farm
    const section = await prisma.section.findFirst({
      where: { id: sectionId, block: { farmId: farm.id } },
    })
    if (!section) {
      return NextResponse.json({ error: 'Section not found in this farm' }, { status: 404 })
    }

    // Download file content from Drive
    const content = await getFileContent(farm.googleDriveRefreshToken, fileId)
    const metadata = parseCsvMetadata(content)

    // Parse temperature readings from CSV
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const readings: Array<{ timestamp: Date; temperature: number }> = []

    let inData = false
    for (const line of lines) {
      if (line.startsWith('Data/Czas;')) {
        inData = true
        continue
      }
      if (inData) {
        if (line.startsWith('<') || line.trim() === '') {
          inData = false
          continue
        }
        const cols = line.split(';')
        if (cols.length >= 2) {
          const dateStr = cols[0]?.trim()
          const tempStr = cols[1]?.trim().replace(',', '.')
          if (dateStr && tempStr) {
            const temp = parseFloat(tempStr)
            if (!isNaN(temp)) {
              // Parse "25.02.2026 9:00:03" format
              const match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
              if (match) {
                const [, day, month, year, hour, minute, second] = match
                const ts = new Date(
                  parseInt(year),
                  parseInt(month) - 1,
                  parseInt(day),
                  parseInt(hour),
                  parseInt(minute),
                  parseInt(second)
                )
                if (!isNaN(ts.getTime())) {
                  readings.push({ timestamp: ts, temperature: temp })
                }
              }
            }
          }
        }
      }
    }

    if (readings.length === 0) {
      return NextResponse.json({ error: 'No readings found in file' }, { status: 400 })
    }

    // Insert readings (skip duplicates by checking existing timestamps)
    const existing = await prisma.temperatureReading.findMany({
      where: {
        sectionId,
        timestamp: { in: readings.map(r => r.timestamp) },
      },
      select: { timestamp: true },
    })
    const existingSet = new Set(existing.map(e => e.timestamp.getTime()))
    const newReadings = readings.filter(r => !existingSet.has(r.timestamp.getTime()))

    if (newReadings.length > 0) {
      await prisma.temperatureReading.createMany({
        data: newReadings.map(r => ({
          sectionId,
          timestamp: r.timestamp,
          temperature: r.temperature,
          sourceFile: fileName,
        })),
      })
    }

    return NextResponse.json({
      success: true,
      fileName,
      sectionId,
      totalReadings: readings.length,
      totalInserted: newReadings.length,
      skippedDuplicates: readings.length - newReadings.length,
      serialNumber: metadata.serialNumber,
      tunnelName: metadata.tunnelName,
    })
  } catch (error) {
    console.error('Google Drive import error:', error)
    return NextResponse.json({ error: 'Błąd importu z Google Drive' }, { status: 500 })
  }
}
