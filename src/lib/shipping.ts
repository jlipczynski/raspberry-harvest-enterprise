/**
 * Logika etykiet paletowych (sekcja Wysyłki).
 *
 * Konfekcja = format opakowania zbiorczego, zapisany jako "ile opakowań ×
 * ile gramów". Waga jednego kartonu wynika wprost z konfekcji, a masa łączna
 * z liczby kartonów — nic tu nie jest zgadywane ani hardkodowane poza
 * presetami, które użytkownik i tak może nadpisać własnymi.
 */

export interface Packaging {
  id: string
  unitsPerCarton: number
  gramsPerUnit: number
}

/**
 * Presety konfekcji podane przez użytkownika. To wartości domyślne UI —
 * własne formaty dokłada się z bazy (PackagingFormat) i scala z tą listą.
 */
export const DEFAULT_PACKAGING: Packaging[] = [
  { id: 'preset-12x1250', unitsPerCarton: 12, gramsPerUnit: 1250 },
  { id: 'preset-10x200', unitsPerCarton: 10, gramsPerUnit: 200 },
  { id: 'preset-10x250', unitsPerCarton: 10, gramsPerUnit: 250 },
]

/** Waga jednego kartonu zbiorczego w kg: opakowań × gramów / 1000. */
export function cartonWeightKg(packaging: Pick<Packaging, 'unitsPerCarton' | 'gramsPerUnit'>): number {
  const { unitsPerCarton, gramsPerUnit } = packaging
  if (!Number.isFinite(unitsPerCarton) || !Number.isFinite(gramsPerUnit)) return 0
  if (unitsPerCarton <= 0 || gramsPerUnit <= 0) return 0
  return (unitsPerCarton * gramsPerUnit) / 1000
}

/**
 * Masa łączna netto: liczba kartonów × waga kartonu.
 * Zwraca null, gdy brakuje którejś składowej — pole na etykiecie zostaje puste,
 * zamiast pokazywać zmyślone 0.
 */
export function totalNetKg(
  cartons: number,
  packaging: Pick<Packaging, 'unitsPerCarton' | 'gramsPerUnit'> | null
): number | null {
  if (packaging === null) return null
  if (!Number.isFinite(cartons) || cartons <= 0) return null
  const weight = cartonWeightKg(packaging)
  if (weight <= 0) return null
  // Zaokrąglenie do 3 miejsc — gramatura bywa ułamkowa (np. 2,5 kg × 100).
  return Math.round(cartons * weight * 1000) / 1000
}

/** Czytelna etykieta konfekcji: "10 × 250 g". */
export function packagingLabel(packaging: Pick<Packaging, 'unitsPerCarton' | 'gramsPerUnit'>): string {
  return `${packaging.unitsPerCarton} × ${packaging.gramsPerUnit} g`
}

/** Etykieta z wagą kartonu: "10 × 250 g (2,5 kg/karton)". */
export function packagingLabelWithWeight(
  packaging: Pick<Packaging, 'unitsPerCarton' | 'gramsPerUnit'>
): string {
  const weight = cartonWeightKg(packaging)
  const weightStr = formatKg(weight)
  return `${packagingLabel(packaging)} (${weightStr} kg/karton)`
}

/**
 * Numer partii w formacie DD.MM/SUFFIX (np. "01.07/JL").
 * Dzień i miesiąc z podanej daty zbioru; suffix to skrót producenta.
 *
 * @param date data w formacie "YYYY-MM-DD" lub obiekt Date
 */
export function formatBatchNumber(date: string | Date, suffix = 'JL'): string {
  let day: number
  let month: number

  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return ''
    month = parseInt(match[2], 10)
    day = parseInt(match[3], 10)
  } else {
    if (Number.isNaN(date.getTime())) return ''
    day = date.getDate()
    month = date.getMonth() + 1
  }

  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  return `${dd}.${mm}/${suffix}`
}

/** Liczba kg z przecinkiem dziesiętnym, bez zbędnych zer: 2,5 / 15 / 250. */
export function formatKg(kg: number): string {
  if (!Number.isFinite(kg)) return '—'
  const rounded = Math.round(kg * 1000) / 1000
  return rounded.toLocaleString('pl-PL', { maximumFractionDigits: 3 })
}

/** Data "YYYY-MM-DD" → "DD.MM.YYYY" do druku na etykiecie. */
export function formatLabelDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return date
  return `${match[3]}.${match[2]}.${match[1]}`
}

/** Jedna paleta na liście paletowej. */
export interface Pallet {
  palletNumber: string
  cartons: number | null
  packaging: Packaging | null
}

export interface PalletSummary {
  /** Ile palet ma policzalną masę (kartony + konfekcja) */
  countedPallets: number
  /** Wszystkie wiersze palet */
  totalPallets: number
  totalCartons: number
  totalNetKg: number
}

/**
 * Podsumowanie listy paletowej. Palety bez kompletu danych (brak kartonów lub
 * konfekcji) nie wnoszą masy — nie zgadujemy, tylko liczymy to, co pewne.
 */
export function summarizePallets(pallets: Pallet[]): PalletSummary {
  let countedPallets = 0
  let totalCartons = 0
  let totalNet = 0

  for (const pallet of pallets) {
    const mass = totalNetKg(pallet.cartons ?? 0, pallet.packaging)
    if (mass !== null) {
      countedPallets += 1
      totalCartons += pallet.cartons ?? 0
      totalNet += mass
    }
  }

  return {
    countedPallets,
    totalPallets: pallets.length,
    totalCartons,
    totalNetKg: Math.round(totalNet * 1000) / 1000,
  }
}
