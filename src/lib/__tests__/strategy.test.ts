import { describe, it, expect } from 'vitest'
import {
  sectionPots,
  sectionShoots,
  costPln,
  lcPricePln,
  lcGrowPricePln,
  computeSectionCost,
  computeSectionVolume,
  computeScenario,
  computePlugCoverage,
  computeCashflow,
  readPaymentShares,
  bookFor,
  methodByCode,
  DEFAULT_PLANTING_METHODS,
  plugUnitCost,
  COST_KEYS,
  type CostBook,
  type StrategySection,
  type ScenarioItemInput,
  type YearSummary,
} from '../strategy'

/**
 * Wartości cennika i sekcji pochodzą z arkusza użytkownika
 * "Plantacja_planowanie_nasadzen" (zakładki "Cennik" i "Plan 2027-2029").
 * Testy sprawdzają, że silnik odtwarza jego wyliczenia.
 */
const EUR_PLN = 4.31
// kokos: (1300 PLN / 3 m³ materiał) + (4000 PLN / 48 m³ transport) = 516,667 PLN/m³
// doniczka 7 l ⇒ 516,667 × 7/1000 = 3,6167 PLN/doniczkę
const COCO_PER_POT = (1300 / 3 + 4000 / 48) * 7 / 1000

const book: CostBook = {
  items: [
    { key: COST_KEYS.eurPln, valuePln: EUR_PLN, valueEur: null },
    { key: COST_KEYS.cocoPerPot, valuePln: COCO_PER_POT, valueEur: null },
    { key: COST_KEYS.targetPot, valuePln: 0, valueEur: null },
    { key: COST_KEYS.nurseryPot, valuePln: 0.5, valueEur: null },
    { key: COST_KEYS.lcTransport, valuePln: 1200 * EUR_PLN / 13800, valueEur: null },
    { key: COST_KEYS.tipsPrice, valuePln: null, valueEur: 0.65 },
    { key: COST_KEYS.tipsTransport, valuePln: 4000 / 70000, valueEur: null },
    { key: COST_KEYS.lcGrowFromPlug, valuePln: null, valueEur: 0.55 },
    { key: COST_KEYS.plantingLabourPerPot, valuePln: 0, valueEur: null }, // brak w arkuszu — pozycja istnieje, wartość 0
    // ceny sadzonek per odmiana
    { key: COST_KEYS.lcPrice, varietyId: 'ruby', valuePln: null, valueEur: 2.2 },
    { key: COST_KEYS.lcPrice, varietyId: 'dj', valuePln: null, valueEur: 2.15 },
  ],
}

/** B09-13 z arkusza: 1800 m × 2 doniczki/m = 3600 doniczek, 7200 canów, Ruby */
const b0913: StrategySection = {
  id: 'b0913', name: 'B09-13', blockName: 'Blok B',
  metersLength: 1800, potsPerMeter: 2, shootsPerPot: 2, potsOverride: null,
  varietyId: 'ruby', varietyName: 'Ruby',
  yieldSummerPerShoot: 2.1, yieldAutumnPerShoot: 0, wastePercent: 3,
}

/** C01-05 z arkusza: 1500 m × 2 = 3000 doniczek, 6000 canów */
const c0105: StrategySection = {
  ...b0913, id: 'c0105', name: 'C01-05', blockName: 'Blok C', metersLength: 1500,
}

const item = (o: Partial<ScenarioItemInput> & Pick<ScenarioItemInput, 'sectionId' | 'method'>): ScenarioItemInput => ({
  year: 2027, producesSummer: false, producesAutumn: false, ...o,
})

const METHODS = DEFAULT_PLANTING_METHODS
/** definicja sposobu o danym kodzie — z listy domyślnej */
const m = (code: string) => methodByCode(METHODS, code)

describe('sectionPots / sectionShoots', () => {
  it('liczy doniczki z metrów gdy brak override', () => {
    expect(sectionPots(b0913)).toBe(3600)
    expect(sectionShoots(b0913)).toBe(7200)
  })

  it('potsOverride > 0 nadpisuje metry × doniczki/m', () => {
    expect(sectionPots({ ...b0913, potsOverride: 4000 })).toBe(4000)
  })

  it('potsOverride = 0 nie nadpisuje', () => {
    expect(sectionPots({ ...b0913, potsOverride: 0 })).toBe(3600)
  })
})

describe('cennik', () => {
  it('przelicza pozycję z EUR kursem z cennika', () => {
    expect(costPln(book, COST_KEYS.tipsPrice)).toBeCloseTo(2.8015, 4)
  })

  it('zwraca null gdy pozycji nie ma w cenniku — nigdy nie zgaduje', () => {
    expect(costPln(book, 'nie_istnieje')).toBeNull()
    expect(costPln({ items: [] }, COST_KEYS.cocoPerPot)).toBeNull()
  })

  it('zwraca null gdy pozycja jest w EUR, a brakuje kursu', () => {
    const noFx: CostBook = { items: [{ key: COST_KEYS.tipsPrice, valuePln: null, valueEur: 0.65 }] }
    expect(costPln(noFx, COST_KEYS.tipsPrice)).toBeNull()
  })

  it('cena LC per odmiana — Ruby 2,20 EUR i DJ 2,15 EUR', () => {
    expect(lcPricePln(book, 'ruby')).toBeCloseTo(9.482, 3)
    expect(lcPricePln(book, 'dj')).toBeCloseTo(9.2665, 3)
  })

  it('koszt wyhodowania LC z plagi bierze pozycję globalną 0,55 EUR', () => {
    expect(lcGrowPricePln(book, 'ruby')).toBeCloseTo(0.55 * EUR_PLN, 6)
  })

  it('override per odmiana ma pierwszeństwo przed pozycją globalną', () => {
    const withOverride: CostBook = {
      items: [...book.items, { key: COST_KEYS.lcGrowFromPlug, varietyId: 'ruby', valuePln: null, valueEur: 0.7 }],
    }
    expect(lcGrowPricePln(withOverride, 'ruby')).toBeCloseTo(0.7 * EUR_PLN, 6)
  })

  it('koszt plagi = tips + transport tips + doniczka szkółkowa (arkusz: 3,359)', () => {
    expect(plugUnitCost(book).unitPln).toBeCloseTo(3.359, 3)
  })
})

describe('computeSectionCost — odtworzenie arkusza "Plan 2027-2029"', () => {
  it('Zakup LC dla B09-13 daje 83 988,8 PLN jak w arkuszu', () => {
    const r = computeSectionCost(b0913, item({ sectionId: 'b0913', method: 'BUY_LC', producesSummer: true }), book, m('BUY_LC'))
    expect(r.canes).toBe(7200)
    expect(r.pots).toBe(3600)
    expect(r.totalPln).toBeCloseTo(83988.8, 0)
    expect(r.missing).toEqual([])
  })

  it('rozbija koszt na pozycje: long cane, transport, kokos', () => {
    const r = computeSectionCost(b0913, item({ sectionId: 'b0913', method: 'BUY_LC' }), book, m('BUY_LC'))
    expect(r.lines.map(l => l.label)).toEqual(['Long cane (zakup)', 'Transport long cane', 'Kokos'])
  })

  it('Własne plagi bez kosztu hodowli to sam kokos — C01-05 = 10 850 PLN jak w arkuszu', () => {
    const bookNoGrow: CostBook = { ...book, items: book.items.filter(i => i.key !== COST_KEYS.lcGrowFromPlug) }
    const r = computeSectionCost(c0105, item({ sectionId: 'c0105', method: 'OWN_PLUGS' }), bookNoGrow, m('OWN_PLUGS'))
    expect(r.missing).toEqual([COST_KEYS.lcGrowFromPlug])
    expect(r.totalPln).toBeCloseTo(10850, 0)
  })

  it('Własne plagi z kosztem hodowli 0,55 EUR dokłada canów × 2,3705 PLN', () => {
    const r = computeSectionCost(c0105, item({ sectionId: 'c0105', method: 'OWN_PLUGS' }), book, m('OWN_PLUGS'))
    expect(r.totalPln).toBeCloseTo(10850 + 6000 * 0.55 * EUR_PLN, 0)
    expect(r.missing).toEqual([])
  })

  it('mouldown, ścięte do korzenia i nie obsadzam nie generują kosztu', () => {
    for (const method of ['MOULDOWN', 'CUT_TO_ROOT', 'NOT_PLANTED'] as const) {
      expect(computeSectionCost(b0913, item({ sectionId: 'b0913', method }), book, m(method)).totalPln).toBe(0)
    }
  })

  it('brak ceny LC dla odmiany zgłasza braki zamiast liczyć z zerem', () => {
    const r = computeSectionCost(
      { ...b0913, varietyId: 'nieznana' },
      item({ sectionId: 'b0913', method: 'BUY_LC' }),
      book,
      m('BUY_LC')
    )
    expect(r.missing).toContain('lc_price:nieznana')
  })
})

describe('computeSectionVolume', () => {
  it('liczy tylko sezony przewidziane w scenariuszu', () => {
    const r = computeSectionVolume(b0913, item({ sectionId: 'b0913', method: 'BUY_LC', producesSummer: true }))
    expect(r.kgSummer).toBeCloseTo(7200 * 2.1, 6)
    expect(r.kgAutumn).toBe(0)
    expect(r.kgNet).toBeCloseTo(7200 * 2.1 * 0.97, 6)
  })

  it('brak zbioru = zero kilogramów', () => {
    expect(computeSectionVolume(b0913, item({ sectionId: 'b0913', method: 'NOT_PLANTED' })).kgGross).toBe(0)
  })

  it('brak waste% zgłasza brak — netto nie jest zgadywane jako brutto', () => {
    const r = computeSectionVolume(
      { ...b0913, wastePercent: null },
      item({ sectionId: 'b0913', method: 'BUY_LC', producesSummer: true })
    )
    expect(r.missing).toEqual(['wastePercent'])
  })

  it('brak normy kg/pęd zgłasza brak zamiast liczyć zero', () => {
    const r = computeSectionVolume(
      { ...b0913, yieldSummerPerShoot: null },
      item({ sectionId: 'b0913', method: 'BUY_LC', producesSummer: true })
    )
    expect(r.missing).toEqual(['yieldSummerPerShoot'])
    expect(r.kgGross).toBe(0)
  })
})

describe('computeScenario', () => {
  const sections = [b0913, c0105]
  const items: ScenarioItemInput[] = [
    { sectionId: 'b0913', year: 2027, method: 'BUY_LC', producesSummer: true, producesAutumn: false },
    { sectionId: 'c0105', year: 2027, method: 'NOT_PLANTED', producesSummer: false, producesAutumn: false },
  ]

  it('sumuje koszt sadzenia, koszt plag i wolumen roku', () => {
    const r = computeScenario(sections, items, [{ year: 2027, varietyId: 'ruby', quantity: 35000 }], book, [2027], METHODS)
    const y = r.years[0]
    expect(y.plantingCostPln).toBeCloseTo(83988.8, 0)
    expect(y.plugCostPln).toBeCloseTo(117552.5, 0) // arkusz: "RAZEM plagi" 2027
    expect(y.kgGross).toBeCloseTo(7200 * 2.1, 6)
    expect(y.plantedSections).toBe(1)
    expect(y.costPerKgNet).toBeCloseTo(y.totalCostPln / y.kgNet, 6)
  })

  it('sekcja z brakiem w cenniku nie wchodzi do sumy i daje ostrzeżenie', () => {
    const bookNoCoco: CostBook = { ...book, items: book.items.filter(i => i.key !== COST_KEYS.cocoPerPot) }
    const r = computeScenario(sections, items, [], bookNoCoco, [2027], METHODS)
    expect(r.years[0].plantingCostPln).toBe(0)
    expect(r.warnings.some(w => w.includes('B09-13'))).toBe(true)
  })

  it('liczy każdy rok osobno i sumuje całość', () => {
    const multi: ScenarioItemInput[] = [
      ...items,
      { sectionId: 'c0105', year: 2028, method: 'OWN_PLUGS', producesSummer: true, producesAutumn: false },
    ]
    const r = computeScenario(sections, multi, [], book, [2027, 2028], METHODS)
    expect(r.years.map(y => y.year)).toEqual([2027, 2028])
    expect(r.totalCostPln).toBeCloseTo(r.years[0].totalCostPln + r.years[1].totalCostPln, 6)
  })
})

describe('computePlugCoverage', () => {
  const sections = [b0913, c0105]

  it('plagi z roku poprzedniego pokrywają sadzenie własnymi plagami', () => {
    const items: ScenarioItemInput[] = [
      { sectionId: 'c0105', year: 2028, method: 'OWN_PLUGS', producesSummer: true, producesAutumn: false },
    ]
    const rows = computePlugCoverage(sections, items, [{ year: 2027, varietyId: 'ruby', quantity: 35000 }], [2028], METHODS)
    expect(rows).toHaveLength(1)
    expect(rows[0].needed).toBe(6000)
    expect(rows[0].available).toBe(35000)
    expect(rows[0].ok).toBe(true)
  })

  it('wykrywa niedobór plag', () => {
    const items: ScenarioItemInput[] = [
      { sectionId: 'b0913', year: 2028, method: 'OWN_PLUGS', producesSummer: true, producesAutumn: false },
    ]
    const rows = computePlugCoverage(sections, items, [{ year: 2027, varietyId: 'ruby', quantity: 5000 }], [2028], METHODS)
    expect(rows[0].balance).toBe(-2200)
    expect(rows[0].ok).toBe(false)
  })
})

describe('cashflow — warunki płatności za rośliny', () => {
  /** Warunki z arkusza: 25% zamówienie, 25% dostawa, 50% do sierpnia roku następnego. */
  const termsBook: CostBook = {
    ...book,
    items: [
      ...book.items,
      { key: COST_KEYS.payOrderPct, valuePln: 25, valueEur: null },
      { key: COST_KEYS.payOrderYearOffset, valuePln: -1, valueEur: null },
      { key: COST_KEYS.payDeliveryPct, valuePln: 25, valueEur: null },
      { key: COST_KEYS.payDeliveryYearOffset, valuePln: 0, valueEur: null },
      { key: COST_KEYS.payRestPct, valuePln: 50, valueEur: null },
      { key: COST_KEYS.payRestYearOffset, valuePln: 1, valueEur: null },
    ],
  }

  const years: YearSummary[] = [
    { year: 2027, plantingCostPln: 0, plugCostPln: 0, totalCostPln: 300000, kgGross: 0, kgNet: 0, costPerKgNet: null, plantedSections: 0, warnings: [] },
    { year: 2028, plantingCostPln: 0, plugCostPln: 0, totalCostPln: 480000, kgGross: 0, kgNet: 0, costPerKgNet: null, plantedSections: 0, warnings: [] },
  ]

  it('odczytuje warunki z cennika', () => {
    const { shares, missing } = readPaymentShares(termsBook)
    expect(missing).toEqual([])
    expect(shares.map(s => [s.percent, s.yearOffset])).toEqual([[25, -1], [25, 0], [50, 1]])
  })

  it('brak warunków w cenniku zgłasza braki zamiast zakładać rozkład', () => {
    const { shares, missing } = readPaymentShares(book)
    expect(shares).toEqual([])
    expect(missing).toContain(COST_KEYS.payOrderPct)
  })

  it('rozkłada koszt roku na lata wydatku', () => {
    const { shares } = readPaymentShares(termsBook)
    const cf = computeCashflow(years, shares)
    const byYear = Object.fromEntries(cf.rows.map(r => [r.paymentYear, Math.round(r.amountPln)]))
    // 2027: 25% z 2027 (dostawa) + 25% z 2028 (zamówienie rok wcześniej)
    expect(byYear[2026]).toBe(75000)                 // zamówienie pod rok 2027
    expect(byYear[2027]).toBe(75000 + 120000)        // dostawa 2027 + zamówienie 2028
    expect(byYear[2028]).toBe(150000 + 120000)       // reszta z 2027 + dostawa 2028
    expect(byYear[2029]).toBe(240000)                // reszta z 2028
  })

  it('suma wydatków równa się sumie kosztów', () => {
    const { shares } = readPaymentShares(termsBook)
    const cf = computeCashflow(years, shares)
    const total = cf.rows.reduce((s, r) => s + r.amountPln, 0)
    expect(total).toBeCloseTo(780000, 6)
    expect(cf.unallocatedPln).toBeCloseTo(0, 6)
  })

  it('ostrzega, gdy udziały nie sumują się do 100%', () => {
    const cf = computeCashflow(years, [{ key: 'a', label: 'Zaliczka', percent: 30, yearOffset: 0 }])
    expect(cf.warnings[0]).toContain('30%')
    expect(cf.unallocatedPln).toBeCloseTo(780000 * 0.7, 6)
  })

  it('pokazuje z którego roku kosztu pochodzi każda rata', () => {
    const { shares } = readPaymentShares(termsBook)
    const cf = computeCashflow(years, shares)
    const y2027 = cf.rows.find(r => r.paymentYear === 2027)!
    expect(y2027.parts.map(p => [p.costYear, p.label])).toEqual([
      [2027, 'Przy dostawie'],
      [2028, 'Przy zamówieniu'],
    ])
  })
})

describe('cennik zależny od roku', () => {
  const sections = [b0913]
  const items: ScenarioItemInput[] = [
    { sectionId: 'b0913', year: 2027, method: 'BUY_LC', producesSummer: true, producesAutumn: false },
    { sectionId: 'b0913', year: 2028, method: 'BUY_LC', producesSummer: true, producesAutumn: false },
  ]

  /** 2028: long cane drożeje z 2,20 do 2,60 EUR */
  const bookOf = (year: number): CostBook => ({
    items: [
      ...book.items.filter(i => i.key !== COST_KEYS.lcPrice),
      { key: COST_KEYS.lcPrice, varietyId: 'ruby', valuePln: null, valueEur: year >= 2028 ? 2.6 : 2.2 },
    ],
  })

  it('każdy rok liczy się własnym cennikiem', () => {
    const r = computeScenario(sections, items, [], bookOf, [2027, 2028], METHODS)
    const [y27, y28] = r.years
    expect(y28.plantingCostPln).toBeGreaterThan(y27.plantingCostPln)
    expect(y28.plantingCostPln - y27.plantingCostPln).toBeCloseTo(7200 * 0.4 * EUR_PLN, 2)
  })

  it('zwykły cennik przekazany wprost obowiązuje w każdym roku', () => {
    const r = computeScenario(sections, items, [], book, [2027, 2028], METHODS)
    expect(r.years[0].plantingCostPln).toBeCloseTo(r.years[1].plantingCostPln, 6)
  })

  it('bookFor rozwiązuje obie formy źródła cennika', () => {
    expect(bookFor(book, 2027)).toBe(book)
    expect(lcPricePln(bookFor(bookOf, 2028), 'ruby')).toBeCloseTo(2.6 * EUR_PLN, 4)
  })
})

describe('sposoby obsadzania definiowane przez użytkownika', () => {
  it('własny sposób składa koszt z zaznaczonych składników', () => {
    const custom = {
      code: 'LC_BEZ_KOKOSU', label: 'Zakup LC bez kokosu', hint: null,
      buysLongCane: true, growsFromOwnPlug: false, usesCoco: false,
      hasPlantingLabour: false, defaultSummer: true, defaultAutumn: false,
    }
    const r = computeSectionCost(b0913, item({ sectionId: 'b0913', method: 'LC_BEZ_KOKOSU' }), book, custom)
    expect(r.lines.map(l => l.label)).toEqual(['Long cane (zakup)', 'Transport long cane'])
    expect(r.totalPln).toBeCloseTo(7200 * (9.482 + 1200 * EUR_PLN / 13800), 0)
  })

  it('sposób łączący zakup LC i własne plagi liczy oba składniki', () => {
    const hybrid = {
      code: 'MIX', label: 'Mieszany', hint: null,
      buysLongCane: true, growsFromOwnPlug: true, usesCoco: true,
      hasPlantingLabour: true, defaultSummer: true, defaultAutumn: false,
    }
    const r = computeSectionCost(c0105, item({ sectionId: 'c0105', method: 'MIX' }), book, hybrid)
    expect(r.lines.map(l => l.label)).toContain('Long cane (zakup)')
    expect(r.lines.map(l => l.label)).toContain('Wyhodowanie LC z plagi')
  })

  it('nieznany sposób zgłasza brak zamiast liczyć zero', () => {
    const r = computeSectionCost(b0913, item({ sectionId: 'b0913', method: 'NIE_ISTNIEJE' }), book, undefined)
    expect(r.missing).toEqual(['method:NIE_ISTNIEJE'])
    expect(r.totalPln).toBe(0)
  })

  it('pokrycie plag liczy każdy sposób korzystający z własnych plag', () => {
    const custom = [
      ...DEFAULT_PLANTING_METHODS,
      { code: 'PLAGI_PREMIUM', label: 'Własne plagi premium', hint: null,
        buysLongCane: false, growsFromOwnPlug: true, usesCoco: true,
        hasPlantingLabour: false, defaultSummer: true, defaultAutumn: false },
    ]
    const rows = computePlugCoverage(
      [b0913, c0105],
      [{ sectionId: 'c0105', year: 2028, method: 'PLAGI_PREMIUM', producesSummer: true, producesAutumn: false }],
      [{ year: 2027, varietyId: 'ruby', quantity: 1000 }],
      [2028],
      custom
    )
    expect(rows[0].needed).toBe(6000)
    expect(rows[0].ok).toBe(false)
  })
})

describe('cennik z cenami per odmiana', () => {
  it('cena odmiany ma pierwszeństwo przed wspólną', () => {
    const b: CostBook = {
      items: [
        { key: COST_KEYS.eurPln, valuePln: EUR_PLN, valueEur: null },
        { key: COST_KEYS.lcGrowFromPlug, valuePln: 2, valueEur: null },
        { key: COST_KEYS.lcGrowFromPlug, varietyId: 'ruby', valuePln: 3, valueEur: null },
      ],
    }
    expect(lcGrowPricePln(b, 'ruby')).toBe(3)
    expect(lcGrowPricePln(b, 'dj')).toBe(2)
  })

  it('brak ceny dla odmiany i brak wspólnej daje null', () => {
    expect(lcPricePln({ items: [] }, 'ruby')).toBeNull()
  })

  it('gotowa cena zakupu plagi zastępuje składanie z tips + transport + doniczka', () => {
    const b: CostBook = {
      items: [
        { key: COST_KEYS.eurPln, valuePln: EUR_PLN, valueEur: null },
        { key: COST_KEYS.plugPrice, varietyId: 'ruby', valuePln: 4.2, valueEur: null },
      ],
    }
    expect(plugUnitCost(b, 'ruby').unitPln).toBe(4.2)
    // dla innej odmiany brak gotowej ceny → składanie, a więc zgłoszone braki
    expect(plugUnitCost(b, 'dj').missing.length).toBeGreaterThan(0)
  })

  it('bez gotowej ceny plaga liczy się jak w arkuszu', () => {
    expect(plugUnitCost(book).unitPln).toBeCloseTo(3.359, 3)
  })

  it('koszt plag liczony jest ceną właściwą dla odmiany', () => {
    const b: CostBook = {
      items: [
        { key: COST_KEYS.eurPln, valuePln: EUR_PLN, valueEur: null },
        { key: COST_KEYS.plugPrice, varietyId: 'ruby', valuePln: 4, valueEur: null },
        { key: COST_KEYS.plugPrice, varietyId: 'dj', valuePln: 10, valueEur: null },
      ],
    }
    const r = computeScenario(
      [b0913], [],
      [{ year: 2027, varietyId: 'ruby', quantity: 1000 }, { year: 2027, varietyId: 'dj', quantity: 1000 }],
      b, [2027], METHODS
    )
    expect(r.years[0].plugCostPln).toBe(14000)
  })
})
