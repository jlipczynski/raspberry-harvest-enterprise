import * as XLSX from 'xlsx'
import type { TemperatureRecord } from './temperature-utils'

export interface XlsxSheetResult {
  sheetName: string
  blockName: string
  readings: TemperatureRecord[]
}

/**
 * Parses an XLSX file with multiple sheets.
 * Each sheet = one tunnel, sheet name = tunnel code (e.g. "T3C", "T4B").
 * Row 1: descriptive header (skipped)
 * Row 2: column headers ("Data/Czas", "Temperatura [°C]")
 * Rows 3+: data ("25.02.2026 9:00:03", 4.8)
 *
 * Returns parsed readings per sheet with blockName derived from sheet name.
 */
export function parseTemperatureXlsx(buffer: Buffer): XlsxSheetResult[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const results: XlsxSheetResult[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    // Extract block name from sheet name: "T3C" → "3C", "T15A" → "15A"
    let blockName = extractBlockFromSheetName(sheetName)

    // Fallback: try first row (descriptive header) of the sheet
    if (!blockName) {
      const firstCell = sheet[XLSX.utils.encode_cell({ r: 0, c: 0 })]
      if (firstCell) {
        blockName = extractBlockFromText(String(firstCell.w || firstCell.v || ''))
      }
    }

    if (!blockName) continue

    const readings = parseSheet(sheet)
    results.push({ sheetName, blockName, readings })
  }

  return results
}

/**
 * "T3C" → "3C", "T15A" → "15A", "T10B" → "10B"
 * Also handles "Tunel 3C", "Tunel 3 C", plain "3C" etc.
 */
function extractBlockFromSheetName(name: string): string | null {
  const trimmed = name.trim()

  // "Tunel 3C" or "Tunel 3 C" — check first (more specific)
  const tunnelMatch = trimmed.match(/tunel\s*(\d+)\s*([A-Za-z])/i)
  if (tunnelMatch) return `${tunnelMatch[1]}${tunnelMatch[2].toUpperCase()}`

  // T{digits}{letter} anywhere in name: "T3C", "T3C_20-03-2026", "T3C dane"
  const tMatch = trimmed.match(/T(\d+)\s*([A-Za-z])/i)
  if (tMatch) return `${tMatch[1]}${tMatch[2].toUpperCase()}`

  // Plain {digits}{letter} anywhere: "3C", "15A_data"
  const plainMatch = trimmed.match(/\b(\d+[A-Za-z])\b/)
  if (plainMatch) return plainMatch[1].toUpperCase()

  return null
}

/**
 * Extract tunnel code from arbitrary text (e.g. first row header).
 * "Tunel 3 C  |  odczyt: 23 d..." → "3C"
 * "T12D_dane" → "12D"
 */
function extractBlockFromText(text: string): string | null {
  const tunnelMatch = text.match(/tunel\s*(\d+)\s*([A-Za-z])/i)
  if (tunnelMatch) return `${tunnelMatch[1]}${tunnelMatch[2].toUpperCase()}`

  const tMatch = text.match(/T(\d+)\s*([A-Za-z])/i)
  if (tMatch) return `${tMatch[1]}${tMatch[2].toUpperCase()}`

  return null
}

function parseSheet(sheet: XLSX.WorkSheet): TemperatureRecord[] {
  const readings: TemperatureRecord[] = []
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')

  // Data starts at row 3 (index 2) — row 0 = descriptive, row 1 = headers
  const startRow = 2

  for (let r = startRow; r <= range.e.r; r++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]
    const tempCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })]

    if (!dateCell || !tempCell) continue

    const timestamp = parseDateValue(dateCell)
    if (!timestamp) continue

    const temperature = parseTempValue(tempCell)
    if (temperature === null) continue

    if (temperature < -50 || temperature > 70) continue

    readings.push({ timestamp, temperature: Math.round(temperature * 10) / 10 })
  }

  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  return readings
}

function parseDateValue(cell: XLSX.CellObject): Date | null {
  // If xlsx parsed it as a date number (serial date)
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const date = excelSerialToDate(cell.v)
    if (date && !isNaN(date.getTime())) return date
  }

  // If it's a string like "25.02.2026 9:00:03"
  const str = String(cell.w || cell.v || '').trim()
  if (!str) return null

  // DD.MM.YYYY H:MM:SS or DD.MM.YYYY HH:MM:SS
  const match = str.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/)
  if (match) {
    const [, day, month, year, hours, minutes, seconds] = match
    const d = new Date(+year, +month - 1, +day, +hours, +minutes, +(seconds || 0))
    if (!isNaN(d.getTime())) return d
  }

  // ISO format fallback
  const iso = new Date(str)
  if (!isNaN(iso.getTime()) && iso.getFullYear() > 2000) return iso

  return null
}

function parseTempValue(cell: XLSX.CellObject): number | null {
  if (cell.t === 'n' && typeof cell.v === 'number') {
    return cell.v
  }

  const str = String(cell.w || cell.v || '').trim().replace(',', '.')
  const val = parseFloat(str)
  return isNaN(val) ? null : val
}

/**
 * Convert Excel serial date number to JS Date.
 * Excel epoch: 1900-01-01 = serial 1 (with the 1900 leap year bug)
 */
function excelSerialToDate(serial: number): Date | null {
  if (serial < 1) return null
  // Excel date epoch offset: 25569 days between 1900-01-01 and 1970-01-01
  // But Excel thinks 1900 was a leap year (bug), so adjust
  const dayMs = 86400000
  const epoch = new Date(1899, 11, 30) // Dec 30, 1899
  const date = new Date(epoch.getTime() + serial * dayMs)
  return date
}
