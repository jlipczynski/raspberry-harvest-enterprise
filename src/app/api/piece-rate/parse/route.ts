import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import {
  parseMaxcropPieceRateSheet,
  mergePieceRateFiles,
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

    const { rows, warnings } = mergePieceRateFiles(parsed, hoursStrategy)

    // Data zbioru: bierzemy z raportu. Rozjazd dat między plikami to sygnał,
    // że użytkownik wgrał raporty z różnych dni — ostrzegamy, nie zgadujemy.
    const dates = [...new Set(parsed.map((file) => file.reportDate).filter(Boolean))]
    if (dates.length > 1) {
      warnings.push(`Pliki dotyczą różnych dni: ${dates.join(', ')} — sprawdź, czy o to chodziło.`)
    }

    return NextResponse.json({
      rows,
      warnings,
      reportDate: dates.length === 1 ? dates[0] : null,
      files: parsed.map((file) => ({
        fileName: file.fileName,
        reportDate: file.reportDate,
        rowCount: file.rows.length,
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
