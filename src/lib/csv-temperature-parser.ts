import type { TemperatureRecord } from './temperature-utils'

export interface ParsedTemperatureCsv {
  blockName: string | null
  readings: TemperatureRecord[]
  fileName: string
  debug?: {
    format: 'testo' | 'standard'
    contentPreview: string
    lineCount: number
    tokenCount?: number
    testoReadingsFound?: number
    parsedBlockName?: string | null
  }
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
  // Strip BOM (UTF-8, UTF-16 LE/BE)
  let cleaned = content
  if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1)
  if (cleaned.charCodeAt(0) === 0xFFFE) cleaned = cleaned.slice(1)

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect Testo format by looking for characteristic sections
  if (isTestoFormat(cleaned)) {
    return parseTesto(cleaned, fileName)
  }

  return parseStandardCsv(cleaned, fileName)
}

// ============================================================
// Testo logger format
// ============================================================

function isTestoFormat(content: string): boolean {
  return content.includes('Parametry pomiarowe') ||
    content.includes('Podstawowe informacje') ||
    content.includes('Przekrój całkowity') ||
    content.includes('Cykl pomiarowy') ||
    content.includes('Rejestrator danych') ||
    content.includes('Naruszenia limitów') ||
    content.includes('Konfiguracja alarmu')
}

function parseTesto(content: string, fileName: string): ParsedTemperatureCsv {
  // The entire file may be on one or multiple lines, all semicolon-delimited
  const flat = content.replace(/\n/g, ';')
  const tokens = flat.split(';').map(t => t.trim()).filter(t => t !== '')

  // Extract Title from "< Parametry pomiarowe >" section
  const blockName = extractTestoTitle(tokens) || extractBlockNameFromFilename(fileName)

  // Extract datetime;value pairs
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
  return {
    blockName,
    readings,
    fileName,
    debug: {
      format: 'testo',
      contentPreview: content.slice(0, 500),
      lineCount: content.split('\n').length,
      tokenCount: tokens.length,
      testoReadingsFound: rawReadings.length,
      parsedBlockName: blockName,
    },
  }
}

function extractTestoTitle(tokens: string[]): string | null {
  // Find "Parametry pomiarowe" section and extract Title value
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].includes('Parametry pomiarowe')) continue

    // Collect all tokens in this section until next section marker
    const sectionTokens: string[] = []
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].startsWith('<') || tokens[j].includes('< ')) break
      sectionTokens.push(tokens[j])
    }

    // Find "Title" position in first half (headers)
    const titleIdx = sectionTokens.findIndex(t => t.toLowerCase() === 'title')
    if (titleIdx === -1) continue

    // In Testo, the section has N header fields followed by N value fields
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
  // DD.MM.YYYY H:MM:SS or DD.MM.YYYY HH:MM:SS
  const dateTimeRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/

  for (let i = 0; i < tokens.length - 1; i++) {
    const match = tokens[i].match(dateTimeRegex)
    if (!match) continue

    const valueStr = tokens[i + 1]
    // Accept integers and also decimals (some Testo models export with decimal point)
    if (!valueStr || !/^-?\d+([.,]\d+)?$/.test(valueStr)) continue

    const day = parseInt(match[1])
    const month = parseInt(match[2])
    const year = parseInt(match[3])
    const hours = parseInt(match[4])
    const minutes = parseInt(match[5])
    const seconds = parseInt(match[6])

    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    if (hours > 23 || minutes > 59 || seconds > 59) continue

    const timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
    const rawValue = parseFloat(valueStr.replace(',', '.'))
    if (isNaN(rawValue)) continue
    readings.push({ timestamp, rawValue })

    i++ // skip the value token
  }

  return readings
}

function detectTenths(values: number[]): boolean {
  if (values.length === 0) return false

  // If values already have decimals, they're real temperatures (not tenths)
  const hasDecimals = values.some(v => !Number.isInteger(v))
  if (hasDecimals) return false

  // If any value exceeds normal °C range but would be fine as tenths, divide
  const hasOutOfRange = values.some(v => v > 70 || v < -50)
  const allFitAsTenths = values.every(v => v / 10 >= -50 && v / 10 <= 70)

  if (hasOutOfRange && allFitAsTenths) return true

  // Also check: if ALL values are integers and max-min spread is typical for tenths
  const allIntegers = values.every(v => Number.isInteger(v))
  if (allIntegers && values.length >= 3) {
    const max = Math.max(...values)
    const min = Math.min(...values)
    const spread = max - min
    if (spread > 100) return true
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
    return {
      blockName, readings: [], fileName,
      debug: {
        format: 'standard',
        contentPreview: content.slice(0, 500),
        lineCount: lines.length,
      },
    }
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
  return {
    blockName, readings, fileName,
    debug: {
      format: 'standard',
      contentPreview: content.slice(0, 500),
      lineCount: lines.length,
    },
  }
}

function extractBlockNameFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '').trim()

  // Skip timestamp-only filenames like "2026-02-26-10-35-14"
  if (/^\d{4}-\d{2}-\d{2}[-_T]\d{2}[-_]\d{2}[-_]\d{2}$/.test(base)) return null

  // "Tunel 4B" -> "Tunel 4B" (keep full for matching)
  const tunnelMatch = base.match(/[Tt]unel\s*(\d+[A-Za-z])/i)
  if (tunnelMatch) return `Tunel ${tunnelMatch[1].toUpperCase()}`

  // "9C" -> "9C", "blok_12A_temp" -> "12A"
  const match = base.match(/(\d+[A-Za-z])/i)
  if (match) return match[1].toUpperCase()

  if (base.length <= 20 && !/^\d+$/.test(base)) return base
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
