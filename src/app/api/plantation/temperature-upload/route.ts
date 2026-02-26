import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { parseTemperaturePdf, matchBlockToSections } from '@/lib/pdf-temperature-parser'

export const dynamic = 'force-dynamic'

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

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are accepted' },
        { status: 400 }
      )
    }

    // Parse the PDF
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const parsed = await parseTemperaturePdf(buffer, file.name)

    if (!parsed.blockName) {
      return NextResponse.json(
        { error: 'Could not find block name (Title) in the PDF. Make sure the PDF has a Title field with the block number.' },
        { status: 422 }
      )
    }

    if (parsed.readings.length === 0) {
      return NextResponse.json(
        { error: 'No temperature readings found in the PDF. Check the file format.' },
        { status: 422 }
      )
    }

    // Find matching sections
    const blocks = await prisma.block.findMany({
      where: { farmId },
      include: { sections: { select: { id: true, name: true } } },
    })

    const matches = matchBlockToSections(parsed.blockName, blocks)

    if (matches.length === 0) {
      return NextResponse.json(
        {
          error: `No sections found for block "${parsed.blockName}". Available blocks: ${blocks.map(b => b.name).join(', ')}`,
          parsedBlockName: parsed.blockName,
        },
        { status: 422 }
      )
    }

    // Upsert readings for all matching sections
    let totalInserted = 0
    const results: Array<{ sectionId: string; sectionName: string | null; inserted: number }> = []

    for (const match of matches) {
      // Use upsert to avoid duplicates (same section + timestamp)
      let inserted = 0
      for (const reading of parsed.readings) {
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
      blockName: parsed.blockName,
      totalReadings: parsed.readings.length,
      totalInserted,
      sections: results,
      dateRange: parsed.readings.length > 0
        ? {
            from: parsed.readings[0].timestamp,
            to: parsed.readings[parsed.readings.length - 1].timestamp,
          }
        : null,
    })
  } catch (error) {
    console.error('Error processing temperature PDF:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Błąd przetwarzania PDF: ${message}` },
      { status: 500 }
    )
  }
}
