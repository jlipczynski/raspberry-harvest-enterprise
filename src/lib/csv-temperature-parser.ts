import type { TemperatureRecord } from './pdf-temperature-parser'

export interface ParsedTemperatureCsv {
  blockName: string | null
  readings: TemperatureRecord[]
  fileName: string
}

/**
 * Parses a temperature CSV/TXT file.
 * Supports:
 * - Testo logger export (semicolon-separated datetime;value pairs, values in 1/10 °C)
 * - Standard CSV with header row (date, time, temperature columns)
 */
export function parseTemperatureCsv(
  content: string,
  fileName: string
): ParsedTemperatureCsv {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect Testo format by looking for characteristic sections
  if (isTestoFormat(normalized)) {
    return parseTesto(normalized, fileName)
  }

  return parseStandardCsv(normalized, fileName)
}

// ============================================================
// Testo logger format
// ============================================================

function isTestoFormat(content: string): boolean {
  return content.includes('< Parametry pomiarowe >') ||
    content.includes('< Podstawowe informacje >') ||
    content.includes('Przekrój całkowity') ||
    content.includes('Cykl pomiarowy') ||
    content.includes('Rejestrator danych')
}

function parseTesto(content: string, fileName: string): ParsedTemperatureCsv {
  // The entire file may be on one or multiple lines, all semicolon-delimited
  const flat = content.replace(/\n/g, ';')
  const tokens = flat.split(';').map(t => t.trim())

  // Extract Title from "< Parametry pomiarowe >" section
  let blockName = extractTestoTitle(tokens) || extractBlockNameFromFilename(fileName)

  // Extract datetime;value pairs from the data section (before first "<" section)
  const rawReadings = extractTestoReadings(tokens)

  // Detect if values need division by 10
  const needsDivision = detectTenths(rawReadings.map(r => r.rawValue))

  const readings: TemperatureRecord[] = []
  const seen = new Set<string>()

  for (const { timestamp, rawValue } of rawReadings) {
    const temperature = needsDivision ? rawValue / 10 : rawValue
    if (temperature < -50 || temperature > 70) continue
    const key = timestamp.toISOString()
    if (!seen.has(key)) {
      seen.add(key)
      readings.push({ timestamp, temperature: Math.round(temperature * 10) / 10 })
    }
  }

  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  return { blockName, readings, fileName }
}

function extractTestoTitle(tokens: string[]): string | null {
  // Look for "Title" token followed by a value
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].toLowerCase() === 'title') {
      // The Title value is at a fixed offset in the Parametry pomiarowe section
      // Pattern: ...;Title;Czas rozpoczęcia;...;value_tryb;value_cykl;VALUE_TITLE;...
      // We need to find the values section which comes after the headers
      // Look forward for the section structure - headers first, then values
      // In Testo format: header1;header2;Title;header4;...;value1;value2;TITLE_VALUE;value4;...
      // The values start after all headers, at the same offset

      // Find the section start "< Parametry pomiarowe >"
      let sectionStart = -1
      for (let j = Math.max(0, i - 20); j <= i; j++) {
        if (tokens[j].includes('Parametry pomiarowe')) {
          sectionStart = j + 1
          break
        }
      }

      if (sectionStart === -1) continue

      // Count position of Title in header row
      const titlePos = i - sectionStart

      // Find the start of the values (after all header tokens, typically separated by a row pattern)
      // In Testo export, headers and values alternate in groups
      // Headers: Tryb pomiaru;Cykl pomiarowy;Title;Czas rozpoczęcia;Koniec;Czas trwania
      // Values:  Czasowy;15 min 0 sek.;Tunel 4B;25.02.2026 8:51:00;26.02.2026 10:51:00;1 d...

      // Count headers from sectionStart to find where a non-header value appears
      // Simple approach: find the total header count and the value at same offset
      let headerCount = 0
      for (let j = sectionStart; j < tokens.length; j++) {
        headerCount++
        if (tokens[j].toLowerCase() === 'title') break
      }

      // After all headers, the values start. Find the matching value.
      // Count remaining headers after Title
      let remainingHeaders = 0
      for (let j = i + 1; j < tokens.length; j++) {
        remainingHeaders++
        // Headers end when we hit something that looks like a value (Czasowy, number, etc.)
        // Look for a known Testo value pattern or next section
        if (tokens[j].includes('<') || tokens[j] === '') break
        // Check if all headers are listed (usually the header count matches)
      }

      // The value for Title is at position: i + remainingHeaders + 1 + titlePos
      // Actually, simpler: scan forward from Title for the value
      // In the data: ...Title;Czas rozpoczęcia;Koniec;Czas trwania;Czasowy;15 min 0 sek.;Tunel 4B;...
      // "Title" is at position titlePos in headers, so look titlePos positions after the first value
      break
    }
  }

  // Simpler approach: just find ";Title;" and look for the corresponding value
  // The Testo format puts headers and values in two groups:
  // Header1;Header2;Title;Header4;...;Value1;Value2;TitleValue;Value4;...
  // So find the section, count fields, and map
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].includes('Parametry pomiarowe')) continue

    // Collect all tokens in this section until next section
    const sectionTokens: string[] = []
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].startsWith('<') || tokens[j].startsWith('< ')) break
      sectionTokens.push(tokens[j])
    }

    // Find "Title" position in first half (headers)
    const titleIdx = sectionTokens.findIndex(t => t.toLowerCase() === 'title')
    if (titleIdx === -1) continue

    // In Testo, the section has N header fields followed by N value fields
    // We find where headers end - headers are text descriptions, values follow
    // Heuristic: count total tokens, divide by 2, the second half is values
    const halfLen = Math.ceil(sectionTokens.length / 2)

    // The value at titleIdx offset in the values half
    const valueIdx = halfLen + titleIdx
    if (valueIdx < sectionTokens.length) {
      const val = sectionTokens[valueIdx].trim()
      if (val && !val.includes('<')) return val
    }
  }

  return null
}

interface RawReading {
  timestamp: Date
  rawValue: number
}

function extractTestoReadings(tokens: string[]): RawReading[] {
  const readings: RawReading[] = []
  const dateTimeRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/

  for (let i = 0; i < tokens.length - 1; i++) {
    const match = tokens[i].match(dateTimeRegex)
    if (!match) continue

    const valueStr = tokens[i + 1]
    // Skip empty values or non-numeric metadata
    if (!valueStr || !/^-?\d+$/.test(valueStr)) continue

    const day = parseInt(match[1])
    const month = parseInt(match[2])
    const year = parseInt(match[3])
    const hours = parseInt(match[4])
    const minutes = parseInt(match[5])
    const seconds = parseInt(match[6])

    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    if (hours > 23 || minutes > 59 || seconds > 59) continue

    const timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
    const rawValue = parseInt(valueStr)
    readings.push({ timestamp, rawValue })

    i++ // skip the value token
  }

  return readings
}

function detectTenths(values: number[]): boolean {
  if (values.length === 0) return false

  // If any value exceeds normal °C range but would be fine as tenths, divide
  const hasOutOfRange = values.some(v => v > 70 || v < -50)
  const allFitAsTenths = values.every(v => v / 10 >= -50 && v / 10 <= 70)

  if (hasOutOfRange && allFitAsTenths) return true

  // Also check: if ALL values are integers and max-min spread is typical for tenths
  const allIntegers = values.every(v => Number.isInteger(v))
  if (allIntegers) {
    const max = Math.max(...values)
    const min = Math.min(...values)
    const spread = max - min
    // If spread > 100, it's likely tenths (100 = 10°C spread, normal for a day)
    if (spread > 100) return true
    // If the absolute max/min look like tenths
    if (max > 50 || min < -40) return true
  }

  return false
}

// ============================================================
// Standard CSV format
// ============================================================

function parseStandardCsv(content: string, fileName: string): ParsedTemperatureCsv {
  const blockName = extractBlockNameFromFilename(fileName)
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return { blockName, readings: [], fileName }
  }

  const delimiter = detectDelimiter(lines[0])
  const header = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase())

  // Check if first line looks like a header
  const firstLineIsHeader = header.some(h =>
    ['date', 'data', 'time', 'czas', 'temp', 'temperatura', 'temperature', 'timestamp', 'value', 'wartość'].some(a => h.includes(a))
  )

  const columnMap = mapColumns(header)
  const startLine = firstLineIsHeader ? 1 : 0

  const readings: TemperatureRecord[] = []
  const seen = new Set<string>()

  for (let i = startLine; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter)
    const parsed = parseRow(cols, columnMap)
    if (parsed) {
      const key = parsed.timestamp.toISOString()
      if (!seen.has(key)) {
        seen.add(key)
        readings.push(parsed)
      }
    }
  }

  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  return { blockName, readings, fileName }
}

function extractBlockNameFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  // "Tunel 4B" -> "4B", "9C" -> "9C", "blok_12A_temp" -> "12A"
  const match = base.match(/(\d+[A-Za-z])/i)
  if (match) return match[1].toUpperCase()
  if (base.length <= 20) return base
  return null
}

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  const tabs = (line.match(/\t/g) || []).length

  if (tabs >= semicolons && tabs >= commas && tabs > 0) return '\t'
  if (semicolons >= commas && semicolons > 0) return ';'
  if (commas > 0) return ','
  return ';'
}

interface ColumnMap {
  dateCol: number
  timeCol: number | null
  tempCol: number
}

function mapColumns(header: string[]): ColumnMap {
  const dateAliases = ['date', 'data', 'datum', 'datetime', 'timestamp', 'czas', 'time stamp', 'date/time', 'date time']
  const timeAliases = ['time', 'czas', 'godzina', 'hora', 'zeit']
  const tempAliases = ['temperature', 'temp', 'temperatura', 'value', 'wartość', 'wartosc', 'reading', 'odczyt', '°c', 'celsius']

  let dateCol = -1
  let timeCol: number | null = null
  let tempCol = -1

  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (dateCol === -1 && dateAliases.some(a => h.includes(a))) dateCol = i
    else if (timeCol === null && timeAliases.some(a => h === a || h.startsWith(a))) timeCol = i
    if (tempCol === -1 && tempAliases.some(a => h.includes(a))) tempCol = i
  }

  if (dateCol === -1) dateCol = 0
  if (tempCol === -1) tempCol = header.length - 1

  return { dateCol, timeCol: timeCol !== null && timeCol !== dateCol ? timeCol : null, tempCol }
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inQuotes) { inQuotes = true; continue }
    if (ch === '"' && inQuotes) {
      if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = false
      continue
    }
    if (ch === delimiter && !inQuotes) { cols.push(current.trim()); current = ''; continue }
    current += ch
  }
  cols.push(current.trim())
  return cols
}

function parseRow(cols: string[], columnMap: ColumnMap): TemperatureRecord | null {
  if (cols.length <= Math.max(columnMap.dateCol, columnMap.tempCol)) return null

  const dateStr = cols[columnMap.dateCol]?.replace(/^["']|["']$/g, '') || ''
  const timeStr = columnMap.timeCol !== null ? cols[columnMap.timeCol]?.replace(/^["']|["']$/g, '') || '' : ''
  const tempStr = cols[columnMap.tempCol]?.replace(/^["']|["']$/g, '').replace(',', '.').replace(/[°cC\s]/g, '') || ''

  const temperature = parseFloat(tempStr)
  if (isNaN(temperature) || temperature < -50 || temperature > 70) return null

  const timestamp = parseDateTime(dateStr, timeStr)
  if (!timestamp) return null

  return { timestamp, temperature }
}

function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr
  const normalized = combined.replace(/\s+/g, ' ').trim()

  const patterns: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => Date | null }> = [
    {
      regex: /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
      parse: m => makeDate(+m[3], +m[2], +m[1], +m[4], +m[5], m[6] ? +m[6] : 0),
    },
    {
      regex: /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
      parse: m => makeDate(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0),
    },
    {
      regex: /(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
      parse: m => makeDate(+m[3], +m[2], +m[1], +m[4], +m[5], m[6] ? +m[6] : 0),
    },
    {
      regex: /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
      parse: m => makeDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]),
    },
  ]

  for (const { regex, parse } of patterns) {
    const match = normalized.match(regex)
    if (match) return parse(match)
  }

  return null
}

function makeDate(year: number, month: number, day: number, h: number, m: number, s: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (h > 23 || m > 59 || s > 59) return null
  return new Date(year, month - 1, day, h, m, s)
}
