import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { matchBlockToSections } from '@/lib/temperature-utils'
import { parseTemperatureCsv } from '@/lib/csv-temperature-parser'

export const dynamic = 'force-dynamic'

interface TemperatureRecord {
  timestamp: Date
  temperature: number
}

interface SheetSectionResult {
  sheetName: string
  blockName: string
  sectionId: string
  sectionName: string | null
  inserted: number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const farmId = formData.get('farmId') as string | null
    const targetSectionId = formData.get('targetSectionId') as string | null
    const filterSheetName = formData.get('sheetName') as string | null

    if (!file || !farmId) {
      return NextResponse.json(
        { error: 'file and farmId are required' },
        { status: 400 }
      )
    }

    const fileName = file.name.toLowerCase()
    const isPdf = fileName.endsWith('.pdf')
    const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt')
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    if (!isPdf && !isCsv && !isXlsx) {
      return NextResponse.json(
        { error: 'Akceptowane formaty: PDF, CSV, TXT, XLSX' },
        { status: 400 }
      )
    }

    // Helper: upsert readings to a specific section
    const upsertReadings = async (sectionId: string, readings: TemperatureRecord[], sourceFileName: string) => {
      let inserted = 0
      for (const reading of readings) {
        await prisma.temperatureReading.upsert({
          where: {
            sectionId_timestamp: {
              sectionId,
              timestamp: reading.timestamp,
            },
          },
          update: {
            temperature: reading.temperature,
            sourceFile: sourceFileName,
          },
          create: {
            sectionId,
            timestamp: reading.timestamp,
            temperature: reading.temperature,
            sourceFile: sourceFileName,
          },
        })
        inserted++
      }
      return inserted
    }

    // Fetch blocks once for matching
    const blocks = await prisma.block.findMany({
      where: { farmId },
      include: { sections: { select: { id: true, name: true } } },
    })

    // ── XLSX multi-sheet handling ──
    if (isXlsx) {
      const { parseTemperatureXlsx } = await import('@/lib/xlsx-temperature-parser')
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const sheetResults = parseTemperatureXlsx(buffer)

      // If targetSectionId + sheetName are provided, import only that sheet to that section
      if (targetSectionId && filterSheetName) {
        const sheet = sheetResults.find(s => s.sheetName === filterSheetName)
        if (!sheet || sheet.readings.length === 0) {
          return NextResponse.json(
            { error: `Arkusz "${filterSheetName}" nie zawiera odczytów temperatury.` },
            { status: 422 }
          )
        }
        const inserted = await upsertReadings(targetSectionId, sheet.readings, file.name)
        const section = await prisma.section.findUnique({ where: { id: targetSectionId }, select: { name: true } })
        return NextResponse.json({
          success: true,
          format: 'xlsx',
          totalSheets: 1,
          totalReadings: sheet.readings.length,
          totalInserted: inserted,
          sections: [{ sheetName: sheet.sheetName, blockName: sheet.blockName, sectionId: targetSectionId, sectionName: section?.name ?? null, inserted }],
        })
      }

      if (sheetResults.length === 0) {
        return NextResponse.json(
          { error: 'Nie znaleziono arkuszy z poprawną nazwą tunelu (np. T3C, T4B). Nazwy arkuszy powinny mieć format T{numer}{litera}.' },
          { status: 422 }
        )
      }

      let totalInserted = 0
      const sections: SheetSectionResult[] = []
      const errors: string[] = []

      for (const sheet of sheetResults) {
        if (sheet.readings.length === 0) {
          errors.push(`${sheet.sheetName}: brak odczytów temperatury`)
          continue
        }

        const matches = matchBlockToSections(sheet.blockName, blocks)
        if (matches.length === 0) {
          errors.push(`${sheet.sheetName} (${sheet.blockName}): nie znaleziono pasującej sekcji. Dostępne bloki: ${blocks.map(b => b.name).join(', ')}`)
          continue
        }

        for (const match of matches) {
          const inserted = await upsertReadings(match.sectionId, sheet.readings, file.name)
          totalInserted += inserted
          sections.push({
            sheetName: sheet.sheetName,
            blockName: sheet.blockName,
            sectionId: match.sectionId,
            sectionName: match.sectionName,
            inserted,
          })
        }
      }

      return NextResponse.json({
        success: true,
        format: 'xlsx',
        totalSheets: sheetResults.length,
        totalReadings: sheetResults.reduce((s, r) => s + r.readings.length, 0),
        totalInserted,
        sections,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    // ── Single-file handling (PDF / CSV / TXT) ──
    let blockName: string | null
    let readings: TemperatureRecord[]
    let debug: Record<string, unknown> | undefined

    if (isPdf) {
      const { parseTemperaturePdf } = await import('@/lib/pdf-temperature-parser')
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const parsed = await parseTemperaturePdf(buffer, file.name)
      blockName = parsed.blockName
      readings = parsed.readings
    } else {
      const text = await file.text()
      const parsed = parseTemperatureCsv(text, file.name)
      blockName = parsed.blockName
      readings = parsed.readings
      debug = parsed.debug as Record<string, unknown> | undefined
    }

    // If targetSectionId provided, skip block detection and import directly
    if (targetSectionId) {
      if (readings.length === 0) {
        return NextResponse.json(
          { error: 'Nie znaleziono pomiarów temperatury w pliku.', debug },
          { status: 422 }
        )
      }
      const inserted = await upsertReadings(targetSectionId, readings, file.name)
      const section = await prisma.section.findUnique({ where: { id: targetSectionId }, select: { name: true } })
      return NextResponse.json({
        success: true,
        blockName: blockName || '(ręcznie)',
        totalReadings: readings.length,
        totalInserted: inserted,
        sections: [{ sectionId: targetSectionId, sectionName: section?.name ?? null, inserted }],
      })
    }

    if (!blockName) {
      return NextResponse.json(
        {
          error: 'Nie znaleziono nazwy bloku. Dla CSV z Testo: plik musi zawierać sekcję "Parametry pomiarowe" z polem Title. Dla zwykłego CSV: nazwa pliku powinna zawierać numer bloku (np. "9C.csv").',
          debug,
        },
        { status: 422 }
      )
    }

    if (readings.length === 0) {
      return NextResponse.json(
        {
          error: `Nie znaleziono pomiarów temperatury w pliku. Wykryto blok "${blockName}" ale brak danych.`,
          debug,
        },
        { status: 422 }
      )
    }

    const matches = matchBlockToSections(blockName, blocks)

    if (matches.length === 0) {
      return NextResponse.json(
        {
          error: `Nie znaleziono sekcji dla bloku "${blockName}". Dostępne bloki: ${blocks.map(b => b.name).join(', ')}`,
          parsedBlockName: blockName,
        },
        { status: 422 }
      )
    }

    // Upsert readings for all matching sections
    let totalInserted = 0
    const results: Array<{ sectionId: string; sectionName: string | null; inserted: number }> = []

    for (const match of matches) {
      const inserted = await upsertReadings(match.sectionId, readings, file.name)
      totalInserted += inserted
      results.push({
        sectionId: match.sectionId,
        sectionName: match.sectionName,
        inserted,
      })
    }

    return NextResponse.json({
      success: true,
      blockName,
      totalReadings: readings.length,
      totalInserted,
      sections: results,
      dateRange: readings.length > 0
        ? {
            from: readings[0].timestamp,
            to: readings[readings.length - 1].timestamp,
          }
        : null,
    })
  } catch (error) {
    console.error('Error processing temperature file:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Błąd przetwarzania pliku: ${message}` },
      { status: 500 }
    )
  }
}
