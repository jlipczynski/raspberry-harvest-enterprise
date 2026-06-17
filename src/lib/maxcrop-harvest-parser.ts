/**
 * Parser for MaxCrop harvest XLS exports.
 * Format: "Suma zbiorów" report with columns:
 * Data | Obszar | Klasa produktu | Waga rzeczywista(kg) | Waga(kg) | Ilość rzeczywista | Ilość zeskanowana
 */

export interface HarvestRow {
  date: string         // ISO date string YYYY-MM-DD
  areaName: string     // e.g. "Blok_B ruby9-13", "Malina-Blok_C"
  productClass: string // e.g. "Malina_200_8x200", "MALINA 250 pulpa"
  weightKg: number     // waga rzeczywista
  quantity: number     // ilość rzeczywista
}

// Excel serial date to ISO string.
// The epoch MUST be built in UTC (Date.UTC), not local time — otherwise on a
// non-UTC machine toISOString() shifts the result back by a day (46190 → 16th
// instead of 17th). Excel epoch is Dec 30, 1899 (1900 leap-year bug accounted).
function excelDateToISO(serial: number): string {
  const epochUTC = Date.UTC(1899, 11, 30)
  const d = new Date(epochUTC + serial * 86400000)
  return d.toISOString().slice(0, 10)
}

/**
 * Known mappings from MaxCrop area names to block identifiers.
 * Returns a normalized block name or null if unknown.
 */
export function mapAreaToBlockName(areaName: string): string | null {
  const normalized = areaName.trim().toLowerCase()

  if (normalized.includes('blok_b 1-8') || normalized.includes('blok_b1-8')) return 'Blok B'
  if (normalized.includes('blok_b ruby9-13') || normalized.includes('blok_b ruby 9-13')) return 'Blok B'
  if (normalized.includes('blok_b') || normalized.includes('blok b')) return 'Blok B'

  if (normalized.includes('bloka_a10-19') || normalized.includes('bloka_a 10-19') || normalized.includes('blok_a10-19')) return 'Blok A'
  if (normalized.includes('bloka_a01-09') || normalized.includes('bloka_a 01-09') || normalized.includes('blok_a01-09')) return 'Blok A'
  if (normalized.includes('bloka_a') || normalized.includes('blok_a') || normalized.includes('blok a')) return 'Blok A'

  if (normalized.includes('blok_c') || normalized.includes('blok c') || normalized.includes('blok  c')) return 'Blok C'
  if (normalized.includes('blok_d') || normalized.includes('blok d') || normalized.includes('blok  d')) return 'Blok D'

  return null
}

export function parseHarvestRows(rows: Array<Array<string | number>>): HarvestRow[] {
  const results: HarvestRow[] = []

  for (const row of rows) {
    if (row.length < 6) continue

    const dateVal = row[0]
    const areaName = String(row[1] || '').trim()
    const productClass = String(row[2] || '').trim()
    const weightKg = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3]).replace(',', '.'))
    const quantity = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5]).replace(',', '.'))

    // Skip header/empty/summary rows
    if (!dateVal || !areaName || !productClass) continue
    if (typeof dateVal === 'string' && (dateVal === 'Data' || dateVal.includes('Suma'))) continue

    let dateStr: string
    if (typeof dateVal === 'number') {
      dateStr = excelDateToISO(dateVal)
    } else {
      // Try parsing as YYYY-MM-DD or DD.MM.YYYY
      const parts = String(dateVal).match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (parts) {
        dateStr = String(dateVal)
      } else {
        const dmy = String(dateVal).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
        if (dmy) {
          dateStr = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
        } else {
          continue
        }
      }
    }

    if (isNaN(weightKg) || weightKg <= 0) continue

    results.push({
      date: dateStr,
      areaName,
      productClass,
      weightKg,
      quantity: isNaN(quantity) ? 0 : quantity,
    })
  }

  return results
}
