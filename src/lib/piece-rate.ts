/**
 * Kalkulator stawki akordowej (zł/kg) dla zbioru maliny.
 *
 * Idea: wybieramy grupę pracowników "wzorcowych" (ręcznie albo automatycznie —
 * środek stawki wg kg/h), liczymy ich ważoną wydajność kg/h i dobieramy stawkę
 * zł/kg tak, aby taka osoba zarobiła zadaną stawkę godzinową (targetHourly).
 *
 * Wszystkie parametry wejściowe (targetHourly, medianCount, krok zaokrąglenia)
 * pochodzą od użytkownika — moduł nie zna żadnych domyślnych wartości domenowych.
 */

export type PieceRateMode = 'MANUAL' | 'AUTO_MEDIAN'

export interface PieceRateInputRow {
  workerName: string
  externalId?: string | null
  /** Cała masa zebrana przez pracownika */
  kg: number
  /** Część masy idąca na przemysł — rozliczana po stałej stawce */
  industrialKg?: number
  hours: number
  isReference?: boolean
  /** Czy tego dnia zbierał — osoby na innych stanowiskach nie wchodzą do stawki */
  isHarvestWorker?: boolean
  /** Kwota naliczona przez MaxCrop — tylko do porównania, nie wpływa na wyliczenie */
  currentAmount?: number | null
}

export interface PieceRateComputedRow extends PieceRateInputRow {
  /** Godziny po odjęciu przerw — to na nich liczymy wydajność */
  effectiveHours: number
  /** Masa rozliczona po stawce przemysłowej (0 gdy przemysł nie jest wydzielany) */
  industrialKg: number
  /** Masa rozliczona po stawce deserowej */
  dessertKg: number
  /** kg / effectiveHours — null gdy nie zostało dodatnich godzin */
  kgPerHour: number | null
  /** Pasmo zarobku względem docelowej stawki godzinowej */
  band: HourlyBand
  isReference: boolean
  /** kg * rate — null gdy stawki nie da się policzyć */
  earnings: number | null
  /** earnings / hours — null gdy hours <= 0 lub brak stawki */
  effectiveHourly: number | null
}

export interface PieceRateResult {
  rows: PieceRateComputedRow[]
  /** Wiersze użyte jako wzorcowe (po zastosowaniu trybu) */
  referenceRows: PieceRateComputedRow[]
  /** Ważona wydajność referencji: suma kg / suma godzin. null gdy brak referencji */
  avgKgPerHour: number | null
  /** Stawka zł/kg użyta do wyliczeń — narzucona ręcznie albo wyliczona */
  rate: number | null
  /** Stawka zł/kg przed zaokrągleniem (z wyliczenia, nie z override) */
  rawRate: number | null
  /** Stawka wynikająca z targetHourly — do porównania w trybie symulacji */
  derivedRate: number | null
  /** Czy stawka została narzucona ręcznie */
  isSimulated: boolean
  /** Ilu pracowników trafiło w każde z pasm względem celu zł/h */
  bands: { above: number; near: number; below: number; unknown: number }
  /** Suma earnings wszystkich pracowników — koszt dnia */
  totalCost: number | null
  totalKg: number
  /** Masa rozliczona po stawce przemysłowej */
  totalIndustrialKg: number
  /** Masa rozliczona po stawce deserowej */
  totalDessertKg: number
  /** Stawka przemysłu użyta w wyliczeniu (null = przemysł nie wydzielany) */
  industrialRate: number | null
  /** Koszt samego przemysłu */
  industrialCost: number | null
  /** Suma godzin PO odjęciu przerw */
  totalHours: number
  /** Przerwy użyte w wyliczeniu (godziny na osobę) */
  breakHours: number
  /** Ilu pracowników ma effectiveHourly poniżej progu (gdy próg podany) */
  belowThresholdCount: number | null
}

export interface PieceRateOptions {
  mode: PieceRateMode
  /** Docelowa stawka godzinowa zł/h dla osoby wzorcowej */
  targetHourly: number
  /** Ile osób bierzemy w trybie AUTO_MEDIAN */
  medianCount: number
  /** Krok zaokrąglenia stawki w zł, np. 0.01 lub 0.05 */
  roundingStep: number
  /** Opcjonalny próg zł/h do statystyki "poniżej progu" */
  hourlyThreshold?: number | null
  /**
   * Sumaryczny czas przerw tego dnia (w godzinach), odejmowany każdemu
   * pracownikowi. MaxCrop raportuje czas od wejścia do wyjścia z tunelu,
   * więc bez tego przerwy zaniżałyby wydajność.
   */
  breakHours?: number
  /**
   * Ręcznie narzucona stawka zł/kg. Gdy podana — wchodzi zamiast stawki
   * wyliczonej z targetHourly (tryb "co by było, gdyby").
   */
  rateOverride?: number | null
  /**
   * Szerokość pasma "w okolicy celu" jako ułamek targetHourly.
   * 0.1 = ±10%.
   */
  bandTolerance?: number
  /**
   * Stała stawka zł/kg za malinę przemysłową.
   *
   * null / brak → przemysł nie jest rozliczany osobno, cała masa idzie po
   * stawce deserowej (zachowanie sprzed rozdzielenia klas).
   */
  industrialRate?: number | null
}

/** Masa przemysłowa wiersza, przycięta do całej masy. */
function industrialOf(row: PieceRateInputRow): number {
  const value = row.industrialKg
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(value, Number.isFinite(row.kg) ? row.kg : 0)
}

/** Pasmo zarobku względem docelowej stawki godzinowej. */
export type HourlyBand = 'above' | 'near' | 'below' | 'unknown'

export const DEFAULT_BAND_TOLERANCE = 0.1

/**
 * Klasyfikuje zarobek względem celu:
 *   'near'  — mieści się w ±tolerance od celu (ma pierwszeństwo)
 *   'above' — powyżej pasma
 *   'below' — poniżej pasma
 */
export function classifyHourly(
  effectiveHourly: number | null,
  targetHourly: number,
  tolerance: number = DEFAULT_BAND_TOLERANCE
): HourlyBand {
  if (effectiveHourly === null || !Number.isFinite(effectiveHourly)) return 'unknown'
  if (!Number.isFinite(targetHourly) || targetHourly <= 0) return 'unknown'

  const margin = targetHourly * Math.abs(tolerance)
  if (Math.abs(effectiveHourly - targetHourly) <= margin) return 'near'
  return effectiveHourly > targetHourly ? 'above' : 'below'
}

/** Godziny pracy po odjęciu przerw — nigdy poniżej zera. */
export function effectiveHours(row: PieceRateInputRow, breakHours: number = 0): number {
  if (!Number.isFinite(row.hours) || row.hours <= 0) return 0
  const subtracted = Number.isFinite(breakHours) && breakHours > 0 ? breakHours : 0
  return Math.max(0, row.hours - subtracted)
}

/** Wiersz nadaje się do liczenia wydajności tylko gdy zostały dodatnie godziny. */
export function isMeasurable(row: PieceRateInputRow, breakHours: number = 0): boolean {
  return effectiveHours(row, breakHours) > 0 && Number.isFinite(row.kg)
}

export function kgPerHour(row: PieceRateInputRow, breakHours: number = 0): number | null {
  const hours = effectiveHours(row, breakHours)
  if (hours <= 0 || !Number.isFinite(row.kg)) return null
  return row.kg / hours
}

/**
 * Wybiera `count` wierszy wyśrodkowanych na medianie kg/h.
 * Zwraca indeksy w oryginalnej tablicy `rows`.
 *
 * start = floor(n/2) - floor(count/2), przycięte do [0, n - count]
 * Gdy n <= count — zwraca wszystkie mierzalne wiersze.
 */
export function selectMedianIndices(
  rows: PieceRateInputRow[],
  count: number,
  breakHours: number = 0
): number[] {
  const measurable = rows
    .map((row, index) => ({ index, kph: kgPerHour(row, breakHours) }))
    .filter((entry): entry is { index: number; kph: number } => entry.kph !== null)

  const n = measurable.length
  if (n === 0) return []

  const wanted = Math.max(1, Math.floor(count))
  if (n <= wanted) return measurable.map((entry) => entry.index)

  // Sortuj rosnąco po kg/h; przy remisie stabilnie po oryginalnym indeksie.
  const sorted = [...measurable].sort((a, b) => a.kph - b.kph || a.index - b.index)

  const start = Math.min(
    Math.max(Math.floor(n / 2) - Math.floor(wanted / 2), 0),
    n - wanted
  )

  return sorted.slice(start, start + wanted).map((entry) => entry.index)
}

/** Zaokrąglenie do zadanego kroku (0.01, 0.05, ...). */
export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return value
  if (!Number.isFinite(step) || step <= 0) return value
  const rounded = Math.round(value / step) * step
  // Krok jest zawsze groszowy, więc 2 miejsca po przecinku wystarczają
  // i usuwają artefakty zmiennoprzecinkowe (np. 4.8500000000000005).
  return Math.round(rounded * 100) / 100
}

/**
 * Ważona wydajność grupy: suma kg / suma godzin.
 * NIE średnia ze średnich — osoba pracująca dłużej ma większy wpływ.
 */
export function weightedKgPerHour(
  rows: PieceRateInputRow[],
  breakHours: number = 0
): number | null {
  const measurable = rows.filter((row) => isMeasurable(row, breakHours))
  if (measurable.length === 0) return null

  const totalKg = measurable.reduce((sum, row) => sum + row.kg, 0)
  const totalHours = measurable.reduce((sum, row) => sum + effectiveHours(row, breakHours), 0)
  if (totalHours <= 0) return null

  return totalKg / totalHours
}

/**
 * Główne wyliczenie. Ta sama funkcja działa na kliencie (podgląd na żywo)
 * i na serwerze (zapis sesji) — jedno źródło prawdy dla stawki.
 */
export function computePieceRate(
  inputRows: PieceRateInputRow[],
  options: PieceRateOptions
): PieceRateResult {
  const { mode, targetHourly, medianCount, roundingStep, hourlyThreshold } = options
  const breakHours = Number.isFinite(options.breakHours) && (options.breakHours as number) > 0
    ? (options.breakHours as number)
    : 0

  const referenceIndices = new Set(
    mode === 'AUTO_MEDIAN'
      ? selectMedianIndices(inputRows, medianCount, breakHours)
      : inputRows
          .map((row, index) => (row.isReference && isMeasurable(row, breakHours) ? index : -1))
          .filter((index) => index >= 0)
  )

  const referenceInputs = inputRows.filter((_, index) => referenceIndices.has(index))
  const avgKgPerHour = weightedKgPerHour(referenceInputs, breakHours)

  // Przemysł rozliczamy osobno tylko gdy podano dla niego stawkę.
  const industrialRate =
    options.industrialRate != null &&
    Number.isFinite(options.industrialRate) &&
    options.industrialRate > 0
      ? options.industrialRate
      : null

  /**
   * Stawka deserowa wynika z równania dla grupy wzorcowej:
   *   cel × Σgodzin = stawka × Σkg_deser + stawka_przemysł × Σkg_przemysł
   * czyli
   *   stawka = (cel × Σgodzin − stawka_przemysł × Σkg_przemysł) / Σkg_deser
   *
   * Bez osobnej stawki przemysłu redukuje się to do cel / wydajność.
   */
  const measurableRefs = referenceInputs.filter((row) => isMeasurable(row, breakHours))
  const refHours = measurableRefs.reduce((sum, row) => sum + effectiveHours(row, breakHours), 0)
  const refIndustrialKg = industrialRate === null
    ? 0
    : measurableRefs.reduce((sum, row) => sum + industrialOf(row), 0)
  const refDessertKg = measurableRefs.reduce(
    (sum, row) => sum + row.kg - (industrialRate === null ? 0 : industrialOf(row)),
    0
  )

  let rawRate: number | null = null
  if (Number.isFinite(targetHourly) && targetHourly > 0 && refHours > 0 && refDessertKg > 0) {
    const industrialEarnings = industrialRate === null ? 0 : industrialRate * refIndustrialKg
    const candidate = (targetHourly * refHours - industrialEarnings) / refDessertKg
    // Ujemna stawka znaczy, że sam przemysł przekracza cel — nie da się
    // tego rozwiązać dopłatą za deser, więc mówimy "nie wiem".
    if (Number.isFinite(candidate) && candidate > 0) rawRate = candidate
  }

  const derivedRate = rawRate !== null ? roundToStep(rawRate, roundingStep) : null

  // Ręcznie narzucona stawka wygrywa z wyliczoną — to tryb symulacji
  // "co by było, gdybym zapłacił X zł/kg".
  const override =
    options.rateOverride != null &&
    Number.isFinite(options.rateOverride) &&
    options.rateOverride > 0
      ? options.rateOverride
      : null

  const rate = override === null ? derivedRate : override
  const tolerance =
    Number.isFinite(options.bandTolerance) && (options.bandTolerance as number) >= 0
      ? (options.bandTolerance as number)
      : DEFAULT_BAND_TOLERANCE

  const rows: PieceRateComputedRow[] = inputRows.map((row, index) => {
    const hours = effectiveHours(row, breakHours)
    const kph = kgPerHour(row, breakHours)

    const industrialKg = industrialRate === null ? 0 : industrialOf(row)
    const dessertKg = Number.isFinite(row.kg) ? row.kg - industrialKg : 0

    const earnings = rate === null || !Number.isFinite(row.kg)
      ? null
      : dessertKg * rate + industrialKg * (industrialRate === null ? 0 : industrialRate)
    // Stawkę godzinową liczymy po odjęciu przerw — pracownik dostaje za kg,
    // a porównujemy do zł/h za faktycznie przepracowany czas.
    const effectiveHourly = earnings !== null && hours > 0 ? earnings / hours : null

    return {
      ...row,
      effectiveHours: hours,
      industrialKg,
      dessertKg,
      kgPerHour: kph,
      band: classifyHourly(effectiveHourly, targetHourly, tolerance),
      isReference: referenceIndices.has(index),
      earnings,
      effectiveHourly,
    }
  })

  const bands = { above: 0, near: 0, below: 0, unknown: 0 }
  for (const row of rows) bands[row.band] += 1

  const totalKg = inputRows.reduce((sum, row) => sum + (Number.isFinite(row.kg) ? row.kg : 0), 0)
  const totalHours = rows.reduce((sum, row) => sum + row.effectiveHours, 0)
  const totalIndustrialKg = rows.reduce((sum, row) => sum + row.industrialKg, 0)
  const totalDessertKg = rows.reduce((sum, row) => sum + row.dessertKg, 0)

  // Koszt liczymy z faktycznych zarobków, nie z totalKg × stawka —
  // przy dwóch stawkach te wartości się rozjeżdżają.
  const totalCost = rate === null
    ? null
    : rows.reduce((sum, row) => sum + (row.earnings === null ? 0 : row.earnings), 0)
  const industrialCost = industrialRate === null ? null : totalIndustrialKg * industrialRate

  const belowThresholdCount =
    hourlyThreshold != null && Number.isFinite(hourlyThreshold) && rate !== null
      ? rows.filter((row) => row.effectiveHourly !== null && row.effectiveHourly < hourlyThreshold)
          .length
      : null

  return {
    rows,
    referenceRows: rows.filter((row) => row.isReference),
    avgKgPerHour,
    rate,
    rawRate,
    derivedRate,
    isSimulated: override !== null,
    bands,
    totalCost,
    totalKg,
    totalIndustrialKg,
    totalDessertKg,
    industrialRate,
    industrialCost,
    totalHours,
    breakHours,
    belowThresholdCount,
  }
}
