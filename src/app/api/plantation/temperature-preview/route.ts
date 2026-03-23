import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { matchBlockToSections } from '@/lib/temperature-utils'
import { parseTemperatureCsv } from '@/lib/csv-temperature-parser'

export const dynamic = 'force-dynamic'

interface PreviewRow {
  fileName: string
  detectedTunnel: string
  sectionName: string
  sectionId: string | null
  count: number
  status: 'ok' | 'unknown_tunnel' | 'section_not_found'
  sheetName?: string
}

interface SectionOption {
  id: string
  name: string | null
  blockName: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const farmId = formData.get('farmId') as string | null

    if (!farmId || files.length === 0) {
      return NextResponse.json(
        { error: 'farmId and files are required' },
        { status: 400 }
      )
    }

    const blocks = await prisma.block.findMany({
      where: { farmId },
      include: { sections: { select: { id: true, name: true } } },
    })

    // Build flat list of all sections for the dropdown
    const allSections: SectionOption[] = blocks.flatMap(b =>
      b.sections.map(s => ({ id: s.id, name: s.name, blockName: b.name }))
    )

    const results: PreviewRow[] = []

    for (const file of files) {
      const fileName = file.name.toLowerCase()
      const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
      const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt')
      const isPdf = fileName.endsWith('.pdf')

      if (!isXlsx && !isCsv && !isPdf) {
        results.push({
          fileName: file.name,
          detectedTunnel: '?',
          sectionName: 'nieobsługiwany format',
          sectionId: null,
          count: 0,
          status: 'unknown_tunnel',
        })
        continue
      }

      if (isXlsx) {
        const { parseTemperatureXlsx } = await import('@/lib/xlsx-temperature-parser')
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const sheetResults = parseTemperatureXlsx(buffer)

        if (sheetResults.length === 0) {
          results.push({
            fileName: file.name,
            detectedTunnel: '?',
            sectionName: 'nie rozpoznano',
            sectionId: null,
            count: 0,
            status: 'unknown_tunnel',
          })
        } else {
          for (const sheet of sheetResults) {
            const matches = matchBlockToSections(sheet.blockName, blocks)
            if (matches.length > 0) {
              results.push({
                fileName: file.name,
                detectedTunnel: `T${sheet.blockName}`,
                sectionName: `${matches[0].blockName} (${matches.map(m => m.sectionName).join(', ')})`,
                sectionId: matches[0].sectionId,
                count: sheet.readings.length,
                status: 'ok',
                sheetName: sheet.sheetName,
              })
            } else {
              results.push({
                fileName: file.name,
                detectedTunnel: `T${sheet.blockName}`,
                sectionName: 'nie znaleziono sekcji',
                sectionId: null,
                count: sheet.readings.length,
                status: 'section_not_found',
                sheetName: sheet.sheetName,
              })
            }
          }
        }
        continue
      }

      // CSV / TXT / PDF
      let blockName: string | null = null
      let count = 0

      if (isPdf) {
        try {
          const { parseTemperaturePdf } = await import('@/lib/pdf-temperature-parser')
          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const parsed = await parseTemperaturePdf(buffer, file.name)
          blockName = parsed.blockName
          count = parsed.readings.length
        } catch {
          results.push({
            fileName: file.name,
            detectedTunnel: '?',
            sectionName: 'błąd parsowania PDF',
            sectionId: null,
            count: 0,
            status: 'unknown_tunnel',
          })
          continue
        }
      } else {
        const text = await file.text()
        const parsed = parseTemperatureCsv(text, file.name)
        blockName = parsed.blockName
        count = parsed.readings.length
      }

      if (!blockName) {
        results.push({
          fileName: file.name,
          detectedTunnel: '?',
          sectionName: 'nie rozpoznano',
          sectionId: null,
          count: 0,
          status: 'unknown_tunnel',
        })
        continue
      }

      const matches = matchBlockToSections(blockName, blocks)
      if (matches.length > 0) {
        results.push({
          fileName: file.name,
          detectedTunnel: `T${blockName}`,
          sectionName: `${matches[0].blockName} (${matches.map(m => m.sectionName).join(', ')})`,
          sectionId: matches[0].sectionId,
          count,
          status: 'ok',
        })
      } else {
        results.push({
          fileName: file.name,
          detectedTunnel: `T${blockName}`,
          sectionName: 'nie znaleziono sekcji',
          sectionId: null,
          count,
          status: 'section_not_found',
        })
      }
    }

    return NextResponse.json({ rows: results, allSections })
  } catch (error) {
    console.error('Error previewing temperature files:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Błąd podglądu plików: ${message}` },
      { status: 500 }
    )
  }
}
