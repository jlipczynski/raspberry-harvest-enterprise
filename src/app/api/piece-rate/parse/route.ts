import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import {
  parseMaxcropPieceRateSheet,
  mergePieceRateDays,
  type PieceRateFileParseResult,
  type HoursMergeStrategy,
} from '@/lib/maxcrop-piece-rate-parser'

export const dynamic = 'force-dynamic'

/**
 * Parsuje jeden lub kilka raportów MaxCrop z tego samego dnia i zwraca
 * scaloną listę pracowników. Nic nie zapisuje do bazy.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePieceRateContext()

    const formData = await request.formData()
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ error: 'Nie przesłano żadnego pliku' }, { status: 400 })
    }

    const strategyRaw = String(formData.get('hoursStrategy') || 'max')
    const hoursStrategy: HoursMergeStrategy = strategyRaw === 'sum' ? 'sum' : 'max'

    const parsed: PieceRateFileParseResult[] = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const workbook = XLSX.read(buffer, { type: 'buffer', raw: true })

      // MaxCrop eksportuje raport w pierwszym (jedynym) arkuszu.
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        parsed.push({
          fileName: file.name,
          reportDate: null,
          days: [],
          rows: [],
          warnings: ['Plik nie zawiera żadnego arkusza'],
        })
        continue
      }

      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: true,
      }) as unknown[][]

      parsed.push(parseMaxcropPieceRateSheet(grid, file.name))
    }

    const { days, warnings } = mergePieceRateDays(parsed, hoursStrategy)

    if (days.length === 0) {
      warnings.push('Nie znaleziono żadnego dnia z danymi.')
    }

    return NextResponse.json({
      days,
      warnings,
      // Zgodność wstecz dla wywołań jednodniowych
      rows: days.length > 0 ? days[0].rows : [],
      reportDate: days.length === 1 ? days[0].date : null,
      files: parsed.map((file) => ({
        fileName: file.fileName,
        dayCount: file.days.length,
        dates: file.days.map((day) => day.date),
      })),
    })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/parse] Error:', error)
    return NextResponse.json({ error: 'Nie udało się odczytać pliku' }, { status: 500 })
  }
}
