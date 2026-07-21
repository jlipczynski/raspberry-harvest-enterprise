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

import { mapAreaToBlockName } from './maxcrop-harvest-parser'

/** Literały formatu MaxCrop — nie są to wartości domenowe, tylko etykiety eksportu. */
const SUMMARY_LABEL = 'razem'
const HARVEST_WORK_TYPE = 'zbiory'
/** Klasy produktu idące na przemysł, np. "Przemysl_250" */
const INDUSTRIAL_CLASS_PATTERN = /przemys/i
const BARCODE_HEADER = 'kod kreskowy'
const EXTERNAL_ID_HEADER = 'zewnętrzne id'

export interface PieceRateWorkerRow {
  /** Kod kreskowy z MaxCrop (PR592) — klucz scalania między raportami */
  externalId: string | null
  workerName: string
  /** Cała masa z wiersza "Razem" */
  kg: number
  /**
   * Masa na przemysł — suma pozycji o klasie produktu "Przemysl_*".
   * Pozycje zbiorcze (GRUPA) nie wchodzą do "Razem", więc i tutaj ich nie ma.
   */
  industrialKg: number
  /** kg - industrialKg, czyli deser */
  dessertKg: number
  hours: number
  /** Rodzaje pracy przypisane pracownikowi tego dnia */
  workTypes: string[]
  /** Czy tego dnia zbierał (rodzaj pracy "Zbiory") */
  isHarvestWorker: boolean
  /** Kwota naliczona przez MaxCrop — do porównania z nową stawką */
  currentAmount: number | null
}

/** Zbiór z jednego obszaru (bloku) w danym dniu. */
export interface PieceRateBlock {
  /** Oryginalna nazwa obszaru z MaxCrop, np. "Malina - Blok_A1-9" */
  areaName: string
  /** Nazwa bloku po zmapowaniu, null gdy nie rozpoznano */
  blockName: string | null
  dessertKg: number
  industrialKg: number
  totalKg: number
  /** Kwota naliczona przez MaxCrop dla tego obszaru */
  currentAmount: number
}

export interface PieceRateDay {
  /** YYYY-MM-DD */
  date: string
  rows: PieceRateWorkerRow[]
  /** Rozbicie zbioru na obszary — liczone z pozycji szczegółowych */
  blocks: PieceRateBlock[]
}

export interface PieceRateFileParseResult {
  fileName: string
  /**
   * Data raportu — wypełniona tylko gdy plik dotyczy jednego dnia.
   * Przy eksporcie za zakres dat jest null, a dni siedzą w `days`.
   */
  reportDate: string | null
  /** Dni znalezione w pliku, posortowane rosnąco */
  days: PieceRateDay[]
  /**
   * Wiersze pierwszego dnia — wygoda dla wywołań jednodniowych.
   * Przy wielu dniach zawiera dzień najwcześniejszy.
   */
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
  area: number
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
      area: find('obszar'),
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
      days: [],
      rows: [],
      warnings: ['Nie rozpoznano nagłówków raportu MaxCrop (Pracownik / Czas / Waga).'],
    }
  }

  const { index: headerIndex, columns } = header

  interface Accumulator {
    date: string
    externalId: string | null
    workerName: string
    workTypes: Set<string>
    kg: number | null
    industrialKg: number
    hours: number | null
    amount: number | null
    /** Ile razy trafił nam się wiersz "Razem" — >1 znaczy zły podział na dni */
    summaryCount: number
  }

  const workers = new Map<string, Accumulator>()

  /**
   * Zbiór per obszar, klucz `${data}|${obszar}`.
   *
   * Liczony wyłącznie z pozycji szczegółowych, które MAJĄ wypełniony obszar.
   * Pozycje zbiorcze (GRUPA) mają obszar pusty i MaxCrop nie wlicza ich do
   * "Razem" — ten sam filtr odcina je tu i tam.
   */
  const blocks = new Map<string, PieceRateBlock & { date: string }>()

  // Wiersz "Razem" ma pustą kolumnę Data, więc niesiemy ostatnią widzianą
  // datę z wierszy poprzedzających w bloku pracownika.
  let currentDate: string | null = null
  const datesSeen = new Set<string>()

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i]
    if (!Array.isArray(row) || row.length === 0) continue

    const workerName = String(row[columns.workerName] ?? '').trim()
    if (!workerName) continue

    const barcode =
      columns.barcode >= 0 ? String(row[columns.barcode] ?? '').trim() || null : null
    const external =
      columns.externalId >= 0 ? String(row[columns.externalId] ?? '').trim() || null : null

    // Data z tego wiersza, jeśli jest — inaczej zostajemy przy poprzedniej.
    if (columns.date >= 0) {
      const parsedDate = parseDateCell(row[columns.date])
      if (parsedDate !== null) {
        currentDate = parsedDate
        datesSeen.add(parsedDate)
      }
    }

    // Bez daty nie wiemy, do którego dnia przypisać wiersz — pomijamy,
    // zamiast wrzucać go do przypadkowego dnia.
    if (currentDate === null) continue

    // Kod kreskowy jest wypełniony w każdym wierszu bloku; "Zewnętrzne ID"
    // bywa puste, więc traktujemy je tylko jako alternatywę.
    const workerKey = barcode || external || workerName.toLowerCase()
    const key = `${currentDate}|${workerKey}`

    let entry = workers.get(key)
    if (!entry) {
      entry = {
        date: currentDate,
        externalId: barcode || external,
        workerName,
        workTypes: new Set<string>(),
        kg: null,
        industrialKg: 0,
        hours: null,
        amount: null,
        summaryCount: 0,
      }
      workers.set(key, entry)
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
      entry.summaryCount += 1
    } else if (INDUSTRIAL_CLASS_PATTERN.test(productClass)) {
      // Pozycje szczegółowe przemysłu. Sumujemy tylko je — deser wychodzi
      // jako różnica wobec "Razem", więc pozycje zbiorcze (GRUPA), których
      // MaxCrop nie wlicza do "Razem", nie mają jak zaburzyć podziału.
      const weight = parseNumber(row[columns.weight])
      if (weight !== null && weight > 0) entry.industrialKg += weight
    }

    // ===== Rozbicie na obszary =====
    const areaName = columns.area >= 0 ? String(row[columns.area] ?? '').trim() : ''
    const weight = parseNumber(row[columns.weight])

    // Tylko pozycje szczegółowe z obszarem — wiersz "Razem" i wiersz obecności
    // nie mają obszaru albo powtarzałyby masę.
    if (areaName && weight !== null && weight > 0 && productClass && productClass !== SUMMARY_LABEL) {
      const blockKey = `${currentDate}|${areaName}`
      let block = blocks.get(blockKey)
      if (!block) {
        block = {
          date: currentDate,
          areaName,
          blockName: mapAreaToBlockName(areaName),
          dessertKg: 0,
          industrialKg: 0,
          totalKg: 0,
          currentAmount: 0,
        }
        blocks.set(blockKey, block)
      }

      const isIndustrial = INDUSTRIAL_CLASS_PATTERN.test(productClass)
      block.totalKg += weight
      if (isIndustrial) block.industrialKg += weight
      else block.dessertKg += weight

      const amount = columns.amount >= 0 ? parseNumber(row[columns.amount]) : null
      if (amount !== null) block.currentAmount += amount
    }
  }

  const byDate = new Map<string, PieceRateWorkerRow[]>()

  for (const entry of workers.values()) {
    if (entry.kg === null && entry.hours === null) {
      warnings.push(
        `${entry.workerName} (${entry.date}): brak wiersza "Razem" — pominięty.`
      )
      continue
    }

    // Więcej niż jedno "Razem" na dzień znaczy, że MaxCrop grupuje inaczej
    // niż zakładamy i nadpisaliśmy dane — lepiej powiedzieć to wprost.
    if (entry.summaryCount > 1) {
      warnings.push(
        `${entry.workerName} (${entry.date}): ${entry.summaryCount} wierszy "Razem" w jednym dniu — ` +
          `użyto ostatniego, sprawdź podział na dni.`
      )
    }

    const workTypes = [...entry.workTypes]
    // Brak wartości w wierszu "Razem" oznacza realne zero (np. pakowaczka
    // bez zbioru), a nie brakującą daną — MaxCrop zawsze wypełnia to pole.
    const totalKg = entry.kg === null ? 0 : entry.kg

    // Przemysł nie może przekroczyć masy z "Razem". Gdyby przekroczył,
    // znaczy że raport ma inną strukturę niż zakładamy — mówimy o tym
    // wprost, zamiast po cichu produkować ujemny deser.
    let industrialKg = entry.industrialKg
    if (industrialKg > totalKg) {
      warnings.push(
        `${entry.workerName}: przemysł (${industrialKg.toFixed(2)} kg) przekracza sumę z "Razem" ` +
          `(${totalKg.toFixed(2)} kg) — podział na deser i przemysł może być błędny.`
      )
      industrialKg = totalKg
    }

    const dayRows = byDate.get(entry.date)
    const parsedRow: PieceRateWorkerRow = {
      externalId: entry.externalId,
      workerName: entry.workerName,
      kg: totalKg,
      industrialKg,
      dessertKg: totalKg - industrialKg,
      hours: entry.hours === null ? 0 : entry.hours,
      workTypes,
      isHarvestWorker: workTypes.some(
        (type) => type.toLowerCase().trim() === HARVEST_WORK_TYPE
      ),
      currentAmount: entry.amount,
    }

    if (dayRows) dayRows.push(parsedRow)
    else byDate.set(entry.date, [parsedRow])
  }

  const blocksByDate = new Map<string, PieceRateBlock[]>()
  for (const block of blocks.values()) {
    const { date, ...rest } = block
    const list = blocksByDate.get(date)
    if (list) list.push(rest)
    else blocksByDate.set(date, [rest])
  }

  const days: PieceRateDay[] = [...byDate.entries()]
    .map(([date, dayRows]) => ({
      date,
      rows: dayRows.sort((a, b) => a.workerName.localeCompare(b.workerName, 'pl')),
      blocks: (blocksByDate.get(date) || []).sort((a, b) => b.totalKg - a.totalKg),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    fileName,
    // reportDate ma sens tylko dla pliku jednodniowego
    reportDate: days.length === 1 ? days[0].date : null,
    days,
    rows: days.length > 0 ? days[0].rows : [],
    warnings,
  }
}

export type HoursMergeStrategy = 'max' | 'sum'

/**
 * Scala kilka plików w oś dni. Pliki mogą się nakładać albo obejmować
 * różne zakresy — wiersze z tej samej daty łączymy tak samo jak przy
 * pojedynczym dniu (patrz `mergePieceRateFiles`).
 */
export function mergePieceRateDays(
  files: PieceRateFileParseResult[],
  hoursStrategy: HoursMergeStrategy = 'max'
): { days: PieceRateDay[]; warnings: string[] } {
  const warnings: string[] = files.flatMap((file) =>
    file.warnings.map((warning) => `${file.fileName}: ${warning}`)
  )

  const byDate = new Map<string, PieceRateFileParseResult[]>()

  for (const file of files) {
    for (const day of file.days) {
      const group = byDate.get(day.date)
      // Warnings pliku dołożyliśmy wyżej — tutaj puste, żeby się nie dublowały.
      const slice: PieceRateFileParseResult = {
        fileName: file.fileName,
        reportDate: day.date,
        days: [day],
        rows: day.rows,
        warnings: [],
      }

      if (group) group.push(slice)
      else byDate.set(day.date, [slice])
    }
  }

  const days = [...byDate.entries()]
    .map(([date, group]) => {
      const merged = mergePieceRateFiles(group, hoursStrategy)
      warnings.push(...merged.warnings.map((warning) => `${date}: ${warning}`))

      // Obszary sumujemy po nazwie — ten sam blok w dwóch plikach to
      // dwie partie tego samego zbioru.
      const byArea = new Map<string, PieceRateBlock>()
      for (const slice of group) {
        for (const block of slice.days[0].blocks) {
          const existing = byArea.get(block.areaName)
          if (!existing) {
            byArea.set(block.areaName, { ...block })
            continue
          }
          existing.dessertKg += block.dessertKg
          existing.industrialKg += block.industrialKg
          existing.totalKg += block.totalKg
          existing.currentAmount += block.currentAmount
        }
      }

      return {
        date,
        rows: merged.rows,
        blocks: [...byArea.values()].sort((a, b) => b.totalKg - a.totalKg),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  return { days, warnings }
}

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
      existing.industrialKg += row.industrialKg
      existing.dessertKg += row.dessertKg
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
