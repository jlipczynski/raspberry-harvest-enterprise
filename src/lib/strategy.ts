/**
 * STRATEGIA — silnik scenariuszy nasadzeń.
 *
 * Zasada nadrzędna (CLAUDE.md): żadna wartość domenowa nie jest zapisana w kodzie.
 * Wszystkie ceny pochodzą z cennika (CostItem / VarietyPlantingCost), a plony
 * z sekcji/odmiany. Brak wartości = pozycja trafia do `missing` i sekcja NIE jest
 * wliczana do podsumowania — nigdy nie zgadujemy wartości domyślnej.
 */

export type PlantingMethod =
  | 'NOT_PLANTED'
  | 'BUY_LC'
  | 'OWN_PLUGS'
  | 'MOULDOWN'
  | 'CUT_TO_ROOT'

/** Etykiety i domyślne założenia produkcyjne — stałe UI, nie wartości domenowe. */
export const PLANTING_METHODS: {
  value: PlantingMethod
  label: string
  hint: string
  defaultSummer: boolean
  defaultAutumn: boolean
}[] = [
  { value: 'NOT_PLANTED', label: 'Nie obsadzam', hint: 'sekcja pusta — brak kosztu i brak plonu', defaultSummer: false, defaultAutumn: false },
  { value: 'BUY_LC', label: 'Zakup LC', hint: 'kupione long cane + kokos', defaultSummer: true, defaultAutumn: false },
  { value: 'OWN_PLUGS', label: 'Własne plagi', hint: 'long cane z własnej szkółki + kokos', defaultSummer: true, defaultAutumn: false },
  { value: 'MOULDOWN', label: 'Mouldown', hint: 'przygięcie własnych pędów — bez zakupu materiału', defaultSummer: true, defaultAutumn: false },
  { value: 'CUT_TO_ROOT', label: 'Ścięte do korzenia', hint: 'zbiór z nowych pędów', defaultSummer: false, defaultAutumn: true },
]

export const METHOD_LABELS: Record<PlantingMethod, string> = PLANTING_METHODS.reduce(
  (acc, m) => ({ ...acc, [m.value]: m.label }),
  {} as Record<PlantingMethod, string>
)

/** Klucze pozycji cennika. Etykiety i jednostki trzymane są w bazie. */
export const COST_KEYS = {
  eurPln: 'eur_pln',
  cocoPerPot: 'coco_per_pot',
  targetPot: 'target_pot',
  nurseryPot: 'nursery_pot',
  lcTransport: 'lc_transport',
  tipsPrice: 'tips_price',
  tipsTransport: 'tips_transport',
  lcGrowFromPlug: 'lc_grow_from_plug',
  plantingLabourPerPot: 'planting_labour_per_pot',
  // warunki płatności za rośliny — udział % i rok wydatku względem roku kosztu
  payOrderPct: 'pay_order_pct',
  payOrderYearOffset: 'pay_order_year_offset',
  payDeliveryPct: 'pay_delivery_pct',
  payDeliveryYearOffset: 'pay_delivery_year_offset',
  payRestPct: 'pay_rest_pct',
  payRestYearOffset: 'pay_rest_year_offset',
} as const

export interface CostItemValue {
  key: string
  valuePln: number | null
  valueEur: number | null
}

export interface VarietyCost {
  varietyId: string
  lcPriceEur: number | null
  lcPricePln: number | null
  lcGrowEur: number | null
  lcGrowPln: number | null
}

export interface CostBook {
  items: CostItemValue[]
  varieties: VarietyCost[]
}

export interface StrategySection {
  id: string
  name: string | null
  blockName: string | null
  metersLength: number
  potsPerMeter: number
  shootsPerPot: number
  potsOverride: number | null
  varietyId: string
  varietyName: string | null
  /** kg na pęd — z sekcji, a jeśli brak, z odmiany */
  yieldSummerPerShoot: number | null
  yieldAutumnPerShoot: number | null
  wastePercent: number | null
}

export interface ScenarioItemInput {
  sectionId: string
  year: number
  method: PlantingMethod
  producesSummer: boolean
  producesAutumn: boolean
}

/** pots = potsOverride > 0 ? potsOverride : metersLength × potsPerMeter */
export function sectionPots(s: Pick<StrategySection, 'potsOverride' | 'metersLength' | 'potsPerMeter'>): number {
  if (s.potsOverride != null && s.potsOverride > 0) return s.potsOverride
  return s.metersLength * s.potsPerMeter
}

export function sectionShoots(s: Pick<StrategySection, 'potsOverride' | 'metersLength' | 'potsPerMeter' | 'shootsPerPot'>): number {
  return sectionPots(s) * s.shootsPerPot
}

/** Zwraca wartość pozycji cennika w PLN. PLN ma pierwszeństwo; EUR przeliczane kursem. */
export function costPln(book: CostBook, key: string): number | null {
  const item = book.items.find(i => i.key === key)
  if (!item) return null
  if (item.valuePln != null) return item.valuePln
  if (item.valueEur != null) {
    const fx = book.items.find(i => i.key === COST_KEYS.eurPln)?.valuePln
    if (fx == null) return null
    return item.valueEur * fx
  }
  return null
}

/** Cena zakupu long cane dla odmiany — z VarietyPlantingCost, PLN przed EUR. */
export function lcPricePln(book: CostBook, varietyId: string): number | null {
  const v = book.varieties.find(x => x.varietyId === varietyId)
  if (!v) return null
  if (v.lcPricePln != null) return v.lcPricePln
  if (v.lcPriceEur != null) {
    const fx = book.items.find(i => i.key === COST_KEYS.eurPln)?.valuePln
    if (fx == null) return null
    return v.lcPriceEur * fx
  }
  return null
}

/**
 * Koszt wyhodowania long cane z własnej plagi.
 * Kolejność: override per odmiana (PLN → EUR) → pozycja globalna z cennika.
 */
export function lcGrowPricePln(book: CostBook, varietyId: string): number | null {
  const v = book.varieties.find(x => x.varietyId === varietyId)
  const fx = book.items.find(i => i.key === COST_KEYS.eurPln)?.valuePln ?? null
  if (v?.lcGrowPln != null) return v.lcGrowPln
  if (v?.lcGrowEur != null) return fx == null ? null : v.lcGrowEur * fx
  return costPln(book, COST_KEYS.lcGrowFromPlug)
}

export interface CostLine {
  label: string
  quantity: number
  unitPln: number
  totalPln: number
}

export interface SectionCostResult {
  sectionId: string
  method: PlantingMethod
  pots: number
  canes: number
  lines: CostLine[]
  totalPln: number
  /** klucze cennika, których zabrakło — sekcja nie jest wliczana do sumy */
  missing: string[]
}

/**
 * Koszt obsadzenia jednej sekcji w danym roku.
 *
 * Formuły odtworzone z arkusza "Plan 2027-2029":
 *   Zakup LC     = canów × (cena LC odmiany + transport LC) + doniczek × (kokos + doniczka docelowa)
 *   Własne plagi = canów × koszt wyhodowania LC z plagi     + doniczek × (kokos + doniczka docelowa)
 *   pozostałe    = 0 (poza opcjonalną robocizną sadzenia)
 */
export function computeSectionCost(
  section: StrategySection,
  item: ScenarioItemInput,
  book: CostBook
): SectionCostResult {
  const pots = sectionPots(section)
  const canes = sectionShoots(section)
  const lines: CostLine[] = []
  const missing: string[] = []

  const push = (label: string, quantity: number, unit: number | null, key: string) => {
    if (unit == null) { missing.push(key); return }
    if (quantity === 0 || unit === 0) return
    lines.push({ label, quantity, unitPln: unit, totalPln: quantity * unit })
  }

  if (item.method === 'BUY_LC' || item.method === 'OWN_PLUGS') {
    if (item.method === 'BUY_LC') {
      push('Long cane (zakup)', canes, lcPricePln(book, section.varietyId), `lc_price:${section.varietyId}`)
      push('Transport long cane', canes, costPln(book, COST_KEYS.lcTransport), COST_KEYS.lcTransport)
    } else {
      push('Wyhodowanie LC z plagi', canes, lcGrowPricePln(book, section.varietyId), COST_KEYS.lcGrowFromPlug)
    }
    push('Kokos', pots, costPln(book, COST_KEYS.cocoPerPot), COST_KEYS.cocoPerPot)
    push('Doniczka docelowa', pots, costPln(book, COST_KEYS.targetPot), COST_KEYS.targetPot)
    push('Robocizna sadzenia', pots, costPln(book, COST_KEYS.plantingLabourPerPot), COST_KEYS.plantingLabourPerPot)
  }

  return {
    sectionId: section.id,
    method: item.method,
    pots,
    canes,
    lines,
    totalPln: lines.reduce((s, l) => s + l.totalPln, 0),
    missing,
  }
}

/** Koszt jednej plagi = tips + transport tips + doniczka szkółkowa. */
export function plugUnitCost(book: CostBook): { unitPln: number | null; missing: string[] } {
  const parts = [COST_KEYS.tipsPrice, COST_KEYS.tipsTransport, COST_KEYS.nurseryPot]
  const missing: string[] = []
  let sum = 0
  for (const key of parts) {
    const v = costPln(book, key)
    if (v == null) { missing.push(key); continue }
    sum += v
  }
  return { unitPln: missing.length > 0 ? null : sum, missing }
}

export interface SectionVolumeResult {
  sectionId: string
  shoots: number
  kgSummer: number
  kgAutumn: number
  kgGross: number
  kgNet: number
  missing: string[]
}

/**
 * Wolumen sekcji w danym roku.
 * kg = pędy × kg/pęd (sezon liczony tylko gdy scenariusz przewiduje zbiór).
 * kgNet = kgGross pomniejszone o waste% odmiany.
 */
export function computeSectionVolume(
  section: StrategySection,
  item: ScenarioItemInput
): SectionVolumeResult {
  const shoots = sectionShoots(section)
  const missing: string[] = []

  let kgSummer = 0
  if (item.producesSummer) {
    if (section.yieldSummerPerShoot == null) missing.push('yieldSummerPerShoot')
    else kgSummer = shoots * section.yieldSummerPerShoot
  }

  let kgAutumn = 0
  if (item.producesAutumn) {
    if (section.yieldAutumnPerShoot == null) missing.push('yieldAutumnPerShoot')
    else kgAutumn = shoots * section.yieldAutumnPerShoot
  }

  const kgGross = kgSummer + kgAutumn
  // waste% też musi pochodzić z bazy — brak zgłaszamy, nie zakładamy zera
  if (kgGross > 0 && section.wastePercent == null) missing.push('wastePercent')
  const waste = section.wastePercent ?? 0 // dozwolone: wartość i tak zgłoszona jako brak powyżej
  return {
    sectionId: section.id,
    shoots,
    kgSummer,
    kgAutumn,
    kgGross,
    kgNet: kgGross * (1 - waste / 100),
    missing,
  }
}

export interface YearSummary {
  year: number
  plantingCostPln: number
  plugCostPln: number
  totalCostPln: number
  kgGross: number
  kgNet: number
  /** koszt sadzenia + plag przypadający na kilogram netto tego roku */
  costPerKgNet: number | null
  plantedSections: number
  warnings: string[]
}

export interface PlugPlanInput {
  year: number
  varietyId: string
  quantity: number
}

export interface ScenarioSummary {
  years: YearSummary[]
  totalCostPln: number
  totalKgNet: number
  costPerKgNet: number | null
  warnings: string[]
}

/**
 * Cennik może różnić się rok do roku — stąd funkcja rok → cennik.
 * Zwykły CostBook przekazany wprost oznacza „ten sam cennik w każdym roku".
 */
export type CostBookSource = CostBook | ((year: number) => CostBook)

export function bookFor(source: CostBookSource, year: number): CostBook {
  return typeof source === 'function' ? source(year) : source
}

export function computeScenario(
  sections: StrategySection[],
  items: ScenarioItemInput[],
  plugPlans: PlugPlanInput[],
  bookSource: CostBookSource,
  years: number[]
): ScenarioSummary {
  const sectionById = new Map(sections.map(s => [s.id, s]))
  const yearRows: YearSummary[] = []
  const allWarnings = new Set<string>()

  for (const year of years) {
    const book = bookFor(bookSource, year)
    const plug = plugUnitCost(book)
    const warnings: string[] = []
    let plantingCostPln = 0
    let kgGross = 0
    let kgNet = 0
    let plantedSections = 0

    for (const item of items.filter(i => i.year === year)) {
      const section = sectionById.get(item.sectionId)
      if (!section) continue

      const cost = computeSectionCost(section, item, book)
      if (cost.missing.length > 0) {
        warnings.push(`${section.name ?? section.id}: brak w cenniku — ${cost.missing.join(', ')}`)
      } else {
        plantingCostPln += cost.totalPln
      }
      if (item.method !== 'NOT_PLANTED') plantedSections++

      const vol = computeSectionVolume(section, item)
      if (vol.missing.length > 0) {
        warnings.push(`${section.name ?? section.id}: brak plonu — ${vol.missing.join(', ')}`)
      } else {
        kgGross += vol.kgGross
        kgNet += vol.kgNet
      }
    }

    let plugCostPln = 0
    const plugsThisYear = plugPlans.filter(p => p.year === year && p.quantity > 0)
    if (plugsThisYear.length > 0) {
      if (plug.unitPln == null) {
        warnings.push(`Plagi ${year}: brak w cenniku — ${plug.missing.join(', ')}`)
      } else {
        plugCostPln = plugsThisYear.reduce((s, p) => s + p.quantity * plug.unitPln!, 0)
      }
    }

    const totalCostPln = plantingCostPln + plugCostPln
    warnings.forEach(w => allWarnings.add(w))
    yearRows.push({
      year,
      plantingCostPln,
      plugCostPln,
      totalCostPln,
      kgGross,
      kgNet,
      costPerKgNet: kgNet > 0 ? totalCostPln / kgNet : null,
      plantedSections,
      warnings,
    })
  }

  const totalCostPln = yearRows.reduce((s, y) => s + y.totalCostPln, 0)
  const totalKgNet = yearRows.reduce((s, y) => s + y.kgNet, 0)
  return {
    years: yearRows,
    totalCostPln,
    totalKgNet,
    costPerKgNet: totalKgNet > 0 ? totalCostPln / totalKgNet : null,
    warnings: [...allWarnings],
  }
}

export interface PlugCoverageRow {
  year: number
  varietyId: string
  varietyName: string | null
  /** ile własnych canów zużywa sadzenie w tym roku */
  needed: number
  /** ile plag wyprodukowano rok wcześniej */
  available: number
  balance: number
  ok: boolean
}

/**
 * Kontrola pokrycia plag — odpowiednik tabeli "KONTROLA POKRYCIA PLAG" z arkusza.
 * Plagi wyprodukowane w roku N-1 pokrywają sadzenie "Własne plagi" w roku N.
 */
export function computePlugCoverage(
  sections: StrategySection[],
  items: ScenarioItemInput[],
  plugPlans: PlugPlanInput[],
  years: number[]
): PlugCoverageRow[] {
  const sectionById = new Map(sections.map(s => [s.id, s]))
  const rows: PlugCoverageRow[] = []

  for (const year of years) {
    const needByVariety = new Map<string, number>()
    for (const item of items.filter(i => i.year === year && i.method === 'OWN_PLUGS')) {
      const section = sectionById.get(item.sectionId)
      if (!section) continue
      // dozwolone: inicjalizacja akumulatora, nie wartość domenowa
      const soFar = needByVariety.get(section.varietyId) ?? 0
      needByVariety.set(section.varietyId, soFar + sectionShoots(section))
    }

    const varietyIds = new Set<string>([
      ...needByVariety.keys(),
      ...plugPlans.filter(p => p.year === year - 1).map(p => p.varietyId),
    ])

    for (const varietyId of varietyIds) {
      const needed = needByVariety.get(varietyId) ?? 0 // dozwolone: brak wpisu = zero zapotrzebowania
      const available = plugPlans
        .filter(p => p.year === year - 1 && p.varietyId === varietyId)
        .reduce((s, p) => s + p.quantity, 0)
      if (needed === 0 && available === 0) continue
      rows.push({
        year,
        varietyId,
        varietyName: sections.find(s => s.varietyId === varietyId)?.varietyName ?? null,
        needed,
        available,
        balance: available - needed,
        ok: available >= needed,
      })
    }
  }

  return rows
}

// ==================== CASHFLOW — WARUNKI PŁATNOŚCI ZA ROŚLINY ====================

export interface PaymentShare {
  key: string
  label: string
  /** udział w koszcie roku, w procentach */
  percent: number
  /** rok wydatku względem roku kosztu: -1 = rok wcześniej, 0 = ten sam, +1 = rok później */
  yearOffset: number
}

export interface CashflowPart {
  costYear: number
  label: string
  amountPln: number
}

export interface CashflowRow {
  paymentYear: number
  amountPln: number
  parts: CashflowPart[]
}

export interface CashflowResult {
  rows: CashflowRow[]
  /** suma udziałów; != 100 oznacza, że warunki płatności nie pokrywają całości kosztu */
  totalPercent: number
  /** kwota kosztu nieprzypisana do żadnego roku wypłaty */
  unallocatedPln: number
  warnings: string[]
}

/** Odczytuje warunki płatności z cennika. Brak którejkolwiek wartości = brak warunków. */
export function readPaymentShares(book: CostBook): { shares: PaymentShare[]; missing: string[] } {
  const spec = [
    { key: COST_KEYS.payOrderPct, offsetKey: COST_KEYS.payOrderYearOffset, label: 'Przy zamówieniu' },
    { key: COST_KEYS.payDeliveryPct, offsetKey: COST_KEYS.payDeliveryYearOffset, label: 'Przy dostawie' },
    { key: COST_KEYS.payRestPct, offsetKey: COST_KEYS.payRestYearOffset, label: 'Reszta' },
  ]
  const shares: PaymentShare[] = []
  const missing: string[] = []
  for (const s of spec) {
    const percent = costPln(book, s.key)
    const offset = costPln(book, s.offsetKey)
    if (percent == null) { missing.push(s.key); continue }
    if (offset == null) { missing.push(s.offsetKey); continue }
    shares.push({ key: s.key, label: s.label, percent, yearOffset: Math.round(offset) })
  }
  return { shares, missing }
}

/**
 * Rozkłada koszt każdego roku na lata wydatku zgodnie z warunkami płatności.
 * Odpowiednik tabeli "CASHFLOW" z arkusza, ale z konfigurowalnym rokiem wydatku.
 */
export function computeCashflow(years: YearSummary[], shares: PaymentShare[]): CashflowResult {
  const warnings: string[] = []
  const totalPercent = shares.reduce((s, x) => s + x.percent, 0)
  if (shares.length > 0 && Math.abs(totalPercent - 100) > 0.001) {
    warnings.push(`Udziały płatności sumują się do ${totalPercent}%, a nie 100%`)
  }

  const byYear = new Map<number, CashflowRow>()
  let allocated = 0
  for (const y of years) {
    for (const share of shares) {
      const amountPln = y.totalCostPln * (share.percent / 100)
      if (amountPln === 0) continue
      const paymentYear = y.year + share.yearOffset
      const row = byYear.get(paymentYear) ?? { paymentYear, amountPln: 0, parts: [] }
      row.amountPln += amountPln
      row.parts.push({ costYear: y.year, label: share.label, amountPln })
      byYear.set(paymentYear, row)
      allocated += amountPln
    }
  }

  const totalCost = years.reduce((s, y) => s + y.totalCostPln, 0)
  return {
    rows: [...byYear.values()].sort((a, b) => a.paymentYear - b.paymentYear),
    totalPercent,
    unallocatedPln: totalCost - allocated,
    warnings,
  }
}
