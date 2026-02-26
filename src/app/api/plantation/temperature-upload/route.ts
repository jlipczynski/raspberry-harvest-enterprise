import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { matchBlockToSections } from '@/lib/temperature-utils'
import { parseTemperatureCsv } from '@/lib/csv-temperature-parser'

export const dynamic = 'force-dynamic'

interface TemperatureRecord {
  timestamp: Date
  temperature: number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const farmId = formData.get('farmId') as string | null

    if (!file || !farmId) {
      return NextResponse.json(
        { error: 'file and farmId are required' },
        { status: 400 }
      )
    }

    const fileName = file.name.toLowerCase()
    const isPdf = fileName.endsWith('.pdf')
    const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt')

    if (!isPdf && !isCsv) {
      return NextResponse.json(
        { error: 'Akceptowane formaty: PDF, CSV, TXT' },
        { status: 400 }
      )
    }

    // Parse the file
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

    // Find matching sections
    const blocks = await prisma.block.findMany({
      where: { farmId },
      include: { sections: { select: { id: true, name: true } } },
    })

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
      let inserted = 0
      for (const reading of readings) {
        await prisma.temperatureReading.upsert({
          where: {
            sectionId_timestamp: {
              sectionId: match.sectionId,
              timestamp: reading.timestamp,
            },
          },
          update: {
            temperature: reading.temperature,
            sourceFile: file.name,
          },
          create: {
            sectionId: match.sectionId,
            timestamp: reading.timestamp,
            temperature: reading.temperature,
            sourceFile: file.name,
          },
        })
        inserted++
      }
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
