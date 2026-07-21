/**
 * Parser raportu MaxCrop "Raport pracy pracownika (szczegółowy)" na potrzeby
 * wyceny akordu.
 *
 * Struktura arkusza (zweryfikowana na eksporcie z 2026-07-20):
 *   wiersz 0        — tytuł raportu + zakres dat
 *   wiersz 1        — nagłówki kolumn
 *   dalej, blokami per pracownik (klucz: "Kod kreskowy", np. PR592):
 *     - wiersz z "Rodzaj pracy" (Zbiory / Pakowanie na wagach / ...) i
 *       "Rozliczenie" = Akord | Na godziny — tu są "Godz od"/"Godz do"
 *     - wiersze "Akord (ilość)" — po jednym na obszar × klasę produktu
 *     - wiersz "Różnica" — korekta kwotowa
 *     - wiersz z "Klasa produktu" = "Razem" — PODSUMOWANIE pracownika:
 *       Czas (hh:mm), Ilość, Waga (kg), Kwota (zł)
 *
 * Do wyceny bierzemy wyłącznie wiersz "Razem" — to własna suma MaxCropa,
 * więc nie dublujemy pozycji zbiorczych typu "GRUPA 1" (nie wchodzą do Razem).
 */

/** Literały formatu MaxCrop — nie są to wartości domenowe, tylko etykiety eksportu. */
const SUMMARY_LABEL = 'razem'
const HARVEST_WORK_TYPE = 'zbiory'
const BARCODE_HEADER = 'kod kreskowy'
const EXTERNAL_ID_HEADER = 'zewnętrzne id'

export interface PieceRateWorkerRow {
  /** Kod kreskowy z MaxCrop (PR592) — klucz scalania między raportami */
  externalId: string | null
  workerName: string
  kg: number
  hours: number
  /** Rodzaje pracy przypisane pracownikowi tego dnia */
  workTypes: string[]
  /** Czy tego dnia zbierał (rodzaj pracy "Zbiory") */
  isHarvestWorker: boolean
  /** Kwota naliczona przez MaxCrop — do porównania z nową stawką */
  currentAmount: number | null
}

export interface PieceRateFileParseResult {
  fileName: string
  /** Data raportu odczytana z kolumny "Data" (YYYY-MM-DD), null gdy brak */
  reportDate: string | null
  rows: PieceRateWorkerRow[]
  warnings: string[]
}

interface ColumnIndex {
  externalId: number
  barcode: number
  workerName: number
  date: number
  workType: number
  settlement: number
  productClass: number
  time: number
  quantity: number
  weight: number
  amount: number
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

/** "13:39" → 13.65. Zwraca null dla pustych/niepoprawnych wartości. */
export function parseTimeToHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    // Excel trzyma komórki czasu jako ułamek doby (0.5688 → 13:39).
    // Zmiana krótsza niż 1 h nie występuje, więc ułamek to zawsze czas.
    return value > 0 && value < 1 ? value * 24 : value
  }

  const raw = String(value).trim()
  if (!raw) return null

  const hhmm = raw.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (hhmm) {
    const hours = parseInt(hhmm[1], 10)
    const minutes = parseInt(hhmm[2], 10)
    const seconds = hhmm[3] ? parseInt(hhmm[3], 10) : 0
    if (minutes >= 60 || seconds >= 60) return null
    return hours + minutes / 60 + seconds / 3600
  }

  const numeric = parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return numeric > 0 && numeric < 1 ? numeric * 24 : numeric
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const numeric = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : null
}

function findHeaderRow(grid: unknown[][]): { index: number; columns: ColumnIndex } | null {
  const limit = Math.min(grid.length, 15)

  for (let i = 0; i < limit; i++) {
    const row = grid[i]
    if (!Array.isArray(row)) continue

    const headers = row.map(normalizeHeader)
    const find = (...names: string[]) =>
      headers.findIndex((header) => names.some((name) => header === name))

    const columns: ColumnIndex = {
      externalId: find(EXTERNAL_ID_HEADER),
      barcode: find(BARCODE_HEADER),
      workerName: find('pracownik'),
      date: find('data'),
      workType: find('rodzaj pracy'),
      settlement: find('rozliczenie'),
      productClass: find('klasa produktu'),
      time: find('czas'),
      quantity: find('ilość', 'ilosc'),
      weight: find('waga'),
      amount: find('kwota'),
    }

    // Minimum, żeby raport dało się zinterpretować
    if (columns.workerName >= 0 && columns.weight >= 0 && columns.time >= 0) {
      return { index: i, columns }
    }
  }

  return null
}

/** Data z komórki: obsługuje string "2026-07-20" i serial Excela. */
function parseDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const epochUTC = Date.UTC(1899, 11, 30)
    return new Date(epochUTC + value * 86400000).toISOString().slice(0, 10)
  }

  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]

  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  return null
}

/**
 * Parsuje jeden arkusz raportu MaxCrop do listy pracowników.
 * Grupuje po kodzie kreskowym (fallback: nazwisko) i czyta wiersz "Razem".
 */
export function parseMaxcropPieceRateSheet(
  grid: unknown[][],
  fileName: string
): PieceRateFileParseResult {
  const warnings: string[] = []
  const header = findHeaderRow(grid)

  if (!header) {
    return {
      fileName,
      reportDate: null,
      rows: [],
      warnings: ['Nie rozpoznano nagłówków raportu MaxCrop (Pracownik / Czas / Waga).'],
    }
  }

  const { index: headerIndex, columns } = header

  interface Accumulator {
    externalId: string | null
    workerName: string
    workTypes: Set<string>
    kg: number | null
    hours: number | null
    amount: number | null
  }

  const workers = new Map<string, Accumulator>()
  let reportDate: string | null = null

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i]
    if (!Array.isArray(row) || row.length === 0) continue

    const workerName = String(row[columns.workerName] ?? '').trim()
    if (!workerName) continue

    const barcode =
      columns.barcode >= 0 ? String(row[columns.barcode] ?? '').trim() || null : null
    const external =
      columns.externalId >= 0 ? String(row[columns.externalId] ?? '').trim() || null : null

    // Kod kreskowy jest wypełniony w każdym wierszu bloku; "Zewnętrzne ID"
    // bywa puste, więc traktujemy je tylko jako alternatywę.
    const key = barcode || external || workerName.toLowerCase()

    let entry = workers.get(key)
    if (!entry) {
      entry = {
        externalId: barcode || external,
        workerName,
        workTypes: new Set<string>(),
        kg: null,
        hours: null,
        amount: null,
      }
      workers.set(key, entry)
    }

    if (reportDate === null && columns.date >= 0) {
      reportDate = parseDateCell(row[columns.date])
    }

    if (columns.workType >= 0) {
      const workType = String(row[columns.workType] ?? '').trim()
      if (workType) entry.workTypes.add(workType)
    }

    // Wiersz podsumowania pracownika — jedyne źródło kg i godzin.
    const productClass =
      columns.productClass >= 0 ? String(row[columns.productClass] ?? '').trim().toLowerCase() : ''

    if (productClass === SUMMARY_LABEL) {
      entry.kg = parseNumber(row[columns.weight])
      entry.hours = parseTimeToHours(row[columns.time])
      entry.amount = columns.amount >= 0 ? parseNumber(row[columns.amount]) : null
    }
  }

  const rows: PieceRateWorkerRow[] = []

  for (const entry of workers.values()) {
    if (entry.kg === null && entry.hours === null) {
      warnings.push(`${entry.workerName}: brak wiersza "Razem" — pominięty.`)
      continue
    }

    const workTypes = [...entry.workTypes]
    // Brak wartości w wierszu "Razem" oznacza realne zero (np. pakowaczka
    // bez zbioru), a nie brakującą daną — MaxCrop zawsze wypełnia to pole.
    rows.push({
      externalId: entry.externalId,
      workerName: entry.workerName,
      kg: entry.kg === null ? 0 : entry.kg,
      hours: entry.hours === null ? 0 : entry.hours,
      workTypes,
      isHarvestWorker: workTypes.some(
        (type) => type.toLowerCase().trim() === HARVEST_WORK_TYPE
      ),
      currentAmount: entry.amount,
    })
  }

  rows.sort((a, b) => a.workerName.localeCompare(b.workerName, 'pl'))

  return { fileName, reportDate, rows, warnings }
}

export type HoursMergeStrategy = 'max' | 'sum'

/**
 * Scala kilka raportów z tego samego dnia w jedną listę.
 *
 * Klucz scalania: kod kreskowy (externalId), fallback na znormalizowane nazwisko.
 *
 * kg    — zawsze sumowane (różne raporty = różne partie zbioru)
 * godziny — strategia:
 *   'max' (domyślnie) — ten sam dzień pracy powtórzony w kilku raportach nie
 *                       może dać więcej godzin niż najdłuższa obecność
 *   'sum'             — gdy raporty opisują rozłączne zmiany
 */
export function mergePieceRateFiles(
  files: PieceRateFileParseResult[],
  hoursStrategy: HoursMergeStrategy = 'max'
): { rows: PieceRateWorkerRow[]; warnings: string[] } {
  const merged = new Map<string, PieceRateWorkerRow>()
  const duplicates = new Set<string>()
  const warnings: string[] = files.flatMap((file) =>
    file.warnings.map((warning) => `${file.fileName}: ${warning}`)
  )

  for (const file of files) {
    for (const row of file.rows) {
      const key = row.externalId || row.workerName.toLowerCase().replace(/\s+/g, ' ').trim()
      const existing = merged.get(key)

      if (!existing) {
        merged.set(key, { ...row, workTypes: [...row.workTypes] })
        continue
      }

      // Identyczne kg i godziny w dwóch plikach to prawie na pewno ten sam
      // raport wgrany dwa razy — sumowanie zawyżyłoby zbiór.
      if (row.kg > 0 && existing.kg === row.kg && existing.hours === row.hours) {
        duplicates.add(row.workerName)
        continue
      }

      existing.kg += row.kg
      existing.hours =
        hoursStrategy === 'sum' ? existing.hours + row.hours : Math.max(existing.hours, row.hours)

      for (const type of row.workTypes) {
        if (!existing.workTypes.includes(type)) existing.workTypes.push(type)
      }

      existing.isHarvestWorker = existing.isHarvestWorker || row.isHarvestWorker

      if (row.currentAmount !== null) {
        const previous = existing.currentAmount === null ? 0 : existing.currentAmount
        existing.currentAmount = previous + row.currentAmount
      }
    }
  }

  if (duplicates.size > 0) {
    warnings.push(
      `Pominięto zdublowane pozycje dla ${duplicates.size} pracowników ` +
        `(identyczne kg i godziny w więcej niż jednym pliku) — sprawdź, czy nie wgrałeś tego samego raportu dwa razy.`
    )
  }

  const rows = [...merged.values()].sort((a, b) => a.workerName.localeCompare(b.workerName, 'pl'))
  return { rows, warnings }
}
