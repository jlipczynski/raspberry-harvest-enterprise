/**
 * Lightweight browser-side parser for Testo CSV metadata.
 * Extracts serial number and tunnel name from the metadata sections at the end of the file.
 * Does NOT parse temperature readings — that happens server-side during import.
 */

export interface CsvMetadata {
  serialNumber: string | null   // e.g. "85520793"
  tunnelName: string | null     // e.g. "Tunel 3 C"
  dateFrom: string | null       // e.g. "25.02.2026 9:00:03"
  dateTo: string | null         // e.g. "5.06.2026 7:00:03"
  readingCount: number          // approximate count of data rows
}

export function parseCsvMetadata(content: string): CsvMetadata {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let serialNumber: string | null = null
  let tunnelName: string | null = null
  let dateFrom: string | null = null
  let dateTo: string | null = null

  // Count data rows (lines between header and first metadata section)
  let dataRowCount = 0
  let inData = false
  for (const line of lines) {
    if (line.startsWith('Data/Czas;')) {
      inData = true
      continue
    }
    if (inData) {
      if (line.startsWith('<') || line.trim() === '') {
        inData = false
        continue
      }
      dataRowCount++
    }
  }

  // Parse metadata from end of file
  let inSection = ''
  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('< ') && trimmed.endsWith(' >')) {
      inSection = trimmed.slice(2, -2)
      continue
    }

    // Serial number from "< Urządzenia >" section (2nd column)
    // Format: "0572 1742;85520793;1.0.8;Temperatura;"
    if (inSection === 'Urządzenia' || inSection === 'Urz\u0105dzenia') {
      const cols = trimmed.split(';')
      if (cols.length >= 2 && cols[1] && /^\d{5,}$/.test(cols[1].trim())) {
        serialNumber = cols[1].trim()
      }
    }

    // Tunnel name + dates from "< Parametry pomiarowe >" section
    // Format: "Czasowy;15 min 0 sek.;Tunel 3 C;25.02.2026 9:00:03;5.06.2026 7:00:03;..."
    if (inSection === 'Parametry pomiarowe') {
      const cols = trimmed.split(';')
      if (cols.length >= 5 && cols[0] === 'Czasowy') {
        tunnelName = cols[2]?.trim() || null
        dateFrom = cols[3]?.trim() || null
        dateTo = cols[4]?.trim() || null
      }
    }
  }

  return {
    serialNumber,
    tunnelName,
    dateFrom,
    dateTo,
    readingCount: dataRowCount
  }
}
