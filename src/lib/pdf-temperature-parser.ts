import { PDFParse } from 'pdf-parse'

export interface TemperatureRecord {
  timestamp: Date
  temperature: number
}

export interface ParsedTemperaturePdf {
  blockName: string | null
  readings: TemperatureRecord[]
  fileName: string
}

/**
 * Parses a temperature logger PDF and extracts:
 * - Block name from the Title field (e.g. "9C")
 * - Temperature readings with timestamps
 */
export async function parseTemperaturePdf(
  buffer: Buffer,
  fileName: string
): Promise<ParsedTemperaturePdf> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })

  // Get metadata (Title field)
  const info = await parser.getInfo()

  // Get text content
  const textResult = await parser.getText()
  const text = textResult.text
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)

  // Clean up
  await parser.destroy()

  // 1. Extract block name from Title
  const blockName = extractBlockName(lines, info.info)

  // 2. Extract temperature readings
  const readings = extractReadings(lines)

  return { blockName, readings, fileName }
}

function extractBlockName(
  lines: string[],
  pdfInfo: Record<string, unknown> | undefined
): string | null {
  // Try PDF metadata Title first
  if (pdfInfo?.Title && typeof pdfInfo.Title === 'string') {
    const match = pdfInfo.Title.match(/\d+[A-Za-z]?/)
    if (match) return match[0].toUpperCase()
  }

  // Try finding "Title" or "Tytuł" line in the text
  for (const line of lines) {
    const titleMatch = line.match(/(?:Title|Tytuł|Nazwa|Location|Lokalizacja)\s*[:\-]?\s*(.+)/i)
    if (titleMatch) {
      const val = titleMatch[1].trim()
      const blockMatch = val.match(/(\d+[A-Za-z]?)/)
      if (blockMatch) return blockMatch[1].toUpperCase()
      if (val.length <= 20) return val
    }
  }

  // Try first few lines for a standalone block identifier
  for (const line of lines.slice(0, 10)) {
    if (/^\d+[A-Za-z]$/.test(line.trim())) {
      return line.trim().toUpperCase()
    }
  }

  return null
}

function extractReadings(lines: string[]): TemperatureRecord[] {
  const readings: TemperatureRecord[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed) {
      const key = parsed.timestamp.toISOString()
      if (!seen.has(key)) {
        seen.add(key)
        readings.push(parsed)
      }
    }
  }

  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  return readings
}

/**
 * Tries to parse a single line as a temperature reading.
 * Supports multiple date/time formats commonly used by loggers:
 * - "01/02/2025 14:30 22.5"
 * - "2025-01-02 14:30:00 22.5"
 * - "01.02.2025 14:30 22.5°C"
 */
function parseLine(line: string): TemperatureRecord | null {
  const normalized = line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()

  const datePatterns = [
    // DD/MM/YYYY or DD.MM.YYYY
    /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(-?\d+[.,]\d+)/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(-?\d+[.,]\d+)/,
    // DD-MM-YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(-?\d+[.,]\d+)/,
  ]

  for (const pattern of datePatterns) {
    const match = normalized.match(pattern)
    if (!match) continue

    let year: number, month: number, day: number
    const timeStr = match[4]
    const tempStr = match[5].replace(',', '.')

    if (match[1].length === 4) {
      year = parseInt(match[1])
      month = parseInt(match[2])
      day = parseInt(match[3])
    } else if (match[3].length === 4) {
      day = parseInt(match[1])
      month = parseInt(match[2])
      year = parseInt(match[3])
    } else {
      continue
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) continue

    const timeParts = timeStr.split(':')
    const hours = parseInt(timeParts[0])
    const minutes = parseInt(timeParts[1])
    const seconds = timeParts[2] ? parseInt(timeParts[2]) : 0
    if (hours > 23 || minutes > 59 || seconds > 59) continue

    const temperature = parseFloat(tempStr)
    if (isNaN(temperature) || temperature < -50 || temperature > 70) continue

    const timestamp = new Date(year, month - 1, day, hours, minutes, seconds)
    return { timestamp, temperature }
  }

  return null
}

/**
 * Matches a block name from PDF to sections.
 * The block name (e.g. "9C") maps to Block.name containing "9C".
 */
export function matchBlockToSections(
  blockName: string,
  blocks: Array<{ id: string; name: string; sections: Array<{ id: string; name: string | null }> }>
): Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> {
  const matches: Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> = []

  for (const block of blocks) {
    const blockNameUpper = block.name.toUpperCase()
    const targetUpper = blockName.toUpperCase()

    if (blockNameUpper === targetUpper || blockNameUpper.includes(targetUpper) || blockNameUpper.endsWith(targetUpper)) {
      for (const section of block.sections) {
        matches.push({
          sectionId: section.id,
          sectionName: section.name,
          blockId: block.id,
          blockName: block.name,
        })
      }
    }
  }

  return matches
}
