import { describe, it, expect } from 'vitest'
import {
  computePieceRate,
  roundToStep,
  selectMedianIndices,
  weightedKgPerHour,
  kgPerHour,
  type PieceRateInputRow,
} from '@/lib/piece-rate'
import {
  parseTimeToHours,
  parseNumber,
  parseMaxcropPieceRateSheet,
  mergePieceRateFiles,
} from '@/lib/maxcrop-piece-rate-parser'

const row = (workerName: string, kg: number, hours: number, isReference = false): PieceRateInputRow => ({
  workerName,
  kg,
  hours,
  isReference,
})

describe('kgPerHour', () => {
  it('liczy kg/h', () => {
    expect(kgPerHour(row('A', 30, 10))).toBe(3)
  })

  it('zwraca null dla hours = 0 zamiast Infinity', () => {
    expect(kgPerHour(row('A', 30, 0))).toBeNull()
  })

  it('zwraca null dla ujemnych godzin', () => {
    expect(kgPerHour(row('A', 30, -5))).toBeNull()
  })
})

describe('weightedKgPerHour', () => {
  it('używa średniej ważonej, nie średniej ze średnich', () => {
    // Osoba A: 10 kg / 1 h = 10 kg/h, osoba B: 10 kg / 9 h = 1.11 kg/h
    // średnia ze średnich = 5.56, ważona = 20/10 = 2.0
    const result = weightedKgPerHour([row('A', 10, 1), row('B', 10, 9)])
    expect(result).toBe(2)
  })

  it('pomija wiersze z hours = 0', () => {
    const result = weightedKgPerHour([row('A', 20, 10), row('B', 999, 0)])
    expect(result).toBe(2)
  })

  it('zwraca null gdy nie ma mierzalnych wierszy', () => {
    expect(weightedKgPerHour([row('A', 10, 0)])).toBeNull()
    expect(weightedKgPerHour([])).toBeNull()
  })
})

describe('selectMedianIndices', () => {
  // kg/h: 1, 2, 3, 4, 5
  const odd = [row('a', 1, 1), row('b', 2, 1), row('c', 3, 1), row('d', 4, 1), row('e', 5, 1)]
  // kg/h: 1, 2, 3, 4, 5, 6
  const even = [...odd, row('f', 6, 1)]

  it('n nieparzyste, count nieparzysty — bierze środek', () => {
    // n=5, count=3 → start = floor(5/2) - floor(3/2) = 2 - 1 = 1 → kg/h 2,3,4
    const picked = selectMedianIndices(odd, 3).sort()
    expect(picked).toEqual([1, 2, 3])
  })

  it('n parzyste, count nieparzysty', () => {
    // n=6, count=3 → start = 3 - 1 = 2 → kg/h 3,4,5
    const picked = selectMedianIndices(even, 3).sort()
    expect(picked).toEqual([2, 3, 4])
  })

  it('n parzyste, count parzysty', () => {
    // n=6, count=2 → start = 3 - 1 = 2 → kg/h 3,4
    const picked = selectMedianIndices(even, 2).sort()
    expect(picked).toEqual([2, 3])
  })

  it('n < count — zwraca wszystkie mierzalne wiersze', () => {
    const picked = selectMedianIndices(odd, 10).sort()
    expect(picked).toEqual([0, 1, 2, 3, 4])
  })

  it('n = count — zwraca wszystkie', () => {
    expect(selectMedianIndices(odd, 5).sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('nie wychodzi poza tablicę przy dużym count', () => {
    // start musi być przycięty do [0, n - count]
    const picked = selectMedianIndices(odd, 4)
    expect(picked).toHaveLength(4)
    expect(Math.max(...picked)).toBeLessThanOrEqual(4)
    expect(Math.min(...picked)).toBeGreaterThanOrEqual(0)
  })

  it('pomija wiersze z hours = 0 przy wyznaczaniu środka', () => {
    const withZero = [row('zero', 100, 0), ...odd]
    const picked = selectMedianIndices(withZero, 3)
    expect(picked).not.toContain(0)
    expect(picked).toHaveLength(3)
  })

  it('zwraca pustą tablicę gdy nic nie jest mierzalne', () => {
    expect(selectMedianIndices([row('a', 5, 0)], 3)).toEqual([])
  })
})

describe('roundToStep', () => {
  it('zaokrągla do 0.05', () => {
    expect(roundToStep(9.88, 0.05)).toBe(9.9)
    expect(roundToStep(9.86, 0.05)).toBe(9.85)
    expect(roundToStep(9.83, 0.05)).toBe(9.85)
    expect(roundToStep(9.82, 0.05)).toBe(9.8)
  })

  it('zaokrągla do 0.01', () => {
    expect(roundToStep(9.876, 0.01)).toBe(9.88)
    expect(roundToStep(9.874, 0.01)).toBe(9.87)
  })

  it('nie zostawia artefaktów zmiennoprzecinkowych', () => {
    // 4.85 / 0.05 * 0.05 potrafi dać 4.8500000000000005
    expect(roundToStep(4.85, 0.05)).toBe(4.85)
    expect(String(roundToStep(4.85, 0.05))).toBe('4.85')
  })

  it('zwraca wartość bez zmian dla nieprawidłowego kroku', () => {
    expect(roundToStep(9.88, 0)).toBe(9.88)
    expect(roundToStep(9.88, -1)).toBe(9.88)
  })
})

describe('computePieceRate — tryb MANUAL', () => {
  const rows = [
    row('wolny', 20, 10),
    row('wzorzec A', 30, 10, true),
    row('wzorzec B', 50, 10, true),
    row('szybki', 60, 10),
  ]

  it('liczy stawkę z ważonej wydajności referencji', () => {
    const result = computePieceRate(rows, {
      mode: 'MANUAL',
      targetHourly: 20,
      medianCount: 5,
      roundingStep: 0.01,
    })
    // referencje: (30+50) / (10+10) = 4 kg/h → 20 / 4 = 5 zł/kg
    expect(result.avgKgPerHour).toBe(4)
    expect(result.rate).toBe(5)
  })

  it('ignoruje medianCount w trybie ręcznym', () => {
    const result = computePieceRate(rows, {
      mode: 'MANUAL',
      targetHourly: 20,
      medianCount: 1,
      roundingStep: 0.01,
    })
    expect(result.referenceRows.map((r) => r.workerName)).toEqual(['wzorzec A', 'wzorzec B'])
  })

  it('liczy zarobek i stawkę efektywną dla wszystkich', () => {
    const result = computePieceRate(rows, {
      mode: 'MANUAL',
      targetHourly: 20,
      medianCount: 5,
      roundingStep: 0.01,
    })
    const fast = result.rows.find((r) => r.workerName === 'szybki')!
    expect(fast.earnings).toBe(300) // 60 kg * 5 zł
    expect(fast.effectiveHourly).toBe(30) // 300 / 10 h
  })

  it('zwraca null gdy nie zaznaczono żadnej referencji', () => {
    const result = computePieceRate(rows.map((r) => ({ ...r, isReference: false })), {
      mode: 'MANUAL',
      targetHourly: 20,
      medianCount: 5,
      roundingStep: 0.01,
    })
    expect(result.rate).toBeNull()
    expect(result.avgKgPerHour).toBeNull()
    expect(result.totalCost).toBeNull()
  })

  it('nie bierze jako referencji wiersza z hours = 0 mimo zaznaczenia', () => {
    const result = computePieceRate([row('zepsuty', 50, 0, true), row('ok', 30, 10, true)], {
      mode: 'MANUAL',
      targetHourly: 20,
      medianCount: 5,
      roundingStep: 0.01,
    })
    expect(result.avgKgPerHour).toBe(3)
  })
})

describe('computePieceRate — tryb AUTO_MEDIAN', () => {
  const rows = [row('a', 1, 1), row('b', 2, 1), row('c', 3, 1), row('d', 4, 1), row('e', 5, 1)]

  it('wybiera środek stawki i liczy z niego', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 3,
      roundingStep: 0.01,
    })
    // środek: kg/h 2,3,4 → ważona (2+3+4)/3 = 3 → 30 / 3 = 10 zł/kg
    expect(result.avgKgPerHour).toBe(3)
    expect(result.rate).toBe(10)
    expect(result.referenceRows.map((r) => r.workerName).sort()).toEqual(['b', 'c', 'd'])
  })

  it('ignoruje ręczne zaznaczenia', () => {
    const manual = rows.map((r) => ({ ...r, isReference: r.workerName === 'a' }))
    const result = computePieceRate(manual, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 3,
      roundingStep: 0.01,
    })
    expect(result.referenceRows.map((r) => r.workerName)).not.toContain('a')
  })

  it('zwraca null gdy targetHourly <= 0', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 0,
      medianCount: 3,
      roundingStep: 0.01,
    })
    expect(result.rate).toBeNull()
  })
})

describe('computePieceRate — statystyki', () => {
  const rows = [row('a', 10, 10), row('b', 30, 10), row('c', 50, 10)]

  it('liczy koszt dnia jako suma kg * stawka', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
    })
    // środek: b (3 kg/h) → 30/3 = 10 zł/kg, suma kg = 90 → 900 zł
    expect(result.rate).toBe(10)
    expect(result.totalKg).toBe(90)
    expect(result.totalCost).toBe(900)
  })

  it('liczy ilu jest poniżej progu godzinowego', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
      hourlyThreshold: 30,
    })
    // efektywne zł/h: a=10, b=30, c=50 → poniżej 30: tylko a
    expect(result.belowThresholdCount).toBe(1)
  })

  it('zwraca null dla progu gdy próg nie podany', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
    })
    expect(result.belowThresholdCount).toBeNull()
  })

  it('sumy kg i godzin obejmują też wiersze z hours = 0', () => {
    const result = computePieceRate([...rows, row('brak', 5, 0)], {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
    })
    expect(result.totalKg).toBe(95)
    expect(result.totalHours).toBe(30)
  })
})

describe('computePieceRate — przerwy', () => {
  const rows = [row('a', 20, 10), row('b', 30, 10), row('c', 40, 10)]

  it('odejmuje przerwy od godzin każdego pracownika', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
      breakHours: 2,
    })
    // b: 30 kg / (10-2) h = 3.75 kg/h → 30 / 3.75 = 8 zł/kg
    expect(result.rows[1].effectiveHours).toBe(8)
    expect(result.avgKgPerHour).toBe(3.75)
    expect(result.rate).toBe(8)
  })

  it('przerwy podnoszą wyliczoną wydajność, więc obniżają stawkę zł/kg', () => {
    const opts = { mode: 'AUTO_MEDIAN' as const, targetHourly: 30, medianCount: 1, roundingStep: 0.01 }
    const bez = computePieceRate(rows, opts)
    const zPrzerwa = computePieceRate(rows, { ...opts, breakHours: 2 })
    expect(zPrzerwa.rate!).toBeLessThan(bez.rate!)
  })

  it('stawka efektywna zł/h liczona jest po odjęciu przerw', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
      breakHours: 2,
    })
    // c: 40 kg * 8 zł = 320 zł / 8 h = 40 zł/h
    expect(result.rows[2].effectiveHourly).toBe(40)
  })

  it('suma godzin w statystykach jest po odjęciu przerw', () => {
    const result = computePieceRate(rows, {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
      breakHours: 2,
    })
    expect(result.totalHours).toBe(24) // 3 × (10 - 2)
    expect(result.breakHours).toBe(2)
  })

  it('przerwa dłuższa niż zmiana nie daje ujemnych godzin ani nieskończoności', () => {
    const result = computePieceRate([row('krotki', 10, 1)], {
      mode: 'AUTO_MEDIAN',
      targetHourly: 30,
      medianCount: 1,
      roundingStep: 0.01,
      breakHours: 5,
    })
    expect(result.rows[0].effectiveHours).toBe(0)
    expect(result.rows[0].kgPerHour).toBeNull()
    expect(result.rate).toBeNull()
  })

  it('ujemna lub zerowa przerwa nie zmienia wyniku', () => {
    const opts = { mode: 'AUTO_MEDIAN' as const, targetHourly: 30, medianCount: 1, roundingStep: 0.01 }
    const base = computePieceRate(rows, opts).rate
    expect(computePieceRate(rows, { ...opts, breakHours: 0 }).rate).toBe(base)
    expect(computePieceRate(rows, { ...opts, breakHours: -3 }).rate).toBe(base)
  })
})

describe('parseTimeToHours', () => {
  it('parsuje hh:mm', () => {
    expect(parseTimeToHours('13:39')).toBeCloseTo(13.65, 5)
    expect(parseTimeToHours('08:30')).toBe(8.5)
    expect(parseTimeToHours('00:00')).toBe(0)
  })

  it('parsuje hh:mm:ss', () => {
    expect(parseTimeToHours('08:30:36')).toBeCloseTo(8.51, 2)
  })

  it('traktuje ułamek doby z Excela jako czas', () => {
    expect(parseTimeToHours(0.5)).toBe(12)
    expect(parseTimeToHours(0.25)).toBe(6)
  })

  it('liczby >= 1 traktuje jako godziny wprost', () => {
    expect(parseTimeToHours(8)).toBe(8)
    expect(parseTimeToHours('7,5')).toBe(7.5)
  })

  it('odrzuca śmieci i wartości ujemne', () => {
    expect(parseTimeToHours('')).toBeNull()
    expect(parseTimeToHours(null)).toBeNull()
    expect(parseTimeToHours('abc')).toBeNull()
    expect(parseTimeToHours(-3)).toBeNull()
    expect(parseTimeToHours('12:99')).toBeNull()
  })
})

describe('parseNumber', () => {
  it('parsuje liczby i przecinek dziesiętny', () => {
    expect(parseNumber(31.7)).toBe(31.7)
    expect(parseNumber('31,7')).toBe(31.7)
    expect(parseNumber('1 234,5')).toBe(1234.5)
  })

  it('zwraca null dla pustych', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
  })
})

describe('parseMaxcropPieceRateSheet', () => {
  // Odwzorowanie realnego eksportu MaxCrop (2026-07-20)
  const HEADER = [
    'Nr umowy', 'Zewnętrzne ID', 'Kod\r\nkreskowy', 'Pracownik', 'Data\r\nzatrudnienia',
    'Data\r\nzakończenia\r\npracy', 'Data', 'Obszar', 'Klasa produktu', 'Rodzaj pracy',
    'Rozliczenie', 'Godz od', 'Godz do', 'Stawka', 'Czas', 'Ilość', 'Waga', 'Kwota',
    'Wartość\r\nwynagrodzenia',
  ]

  const grid: unknown[][] = [
    ['Raport pracy pracownika (szczegółowy) \r\n2026-07-20 - 2026-07-20'],
    HEADER,
    // Pracownik 1 — zbieracz
    ['', '', 'PR592', 'Andreikiv Oksana', '2026-06-25', null, '2026-07-20', 'Niezdefiniowany obszar', null, 'Zbiory', 'Akord', '04:52', '18:31', null, '13:39'],
    ['', '', 'PR592', 'Andreikiv Oksana', '2026-06-25', null, '2026-07-20', 'Malina - Blok_A1-9', 'Malina 125', null, 'Akord (ilość)', '', '', '10.50', '00:00', 5, 7.5, 52.5],
    // pozycja zbiorcza GRUPA 1 — MaxCrop nie wlicza jej do Razem
    ['', '', 'PR592', 'Andreikiv Oksana', null, null, '2026-07-20', null, 'GRUPA 1', null, 'Akord (ilość)', '', '', '0.50', '00:00', 17.33, 26.2, 0],
    [null, '', 'PR592', 'Andreikiv Oksana', null, null, null, null, 'Razem', null, null, '', '', null, '13:39', 29.33, 31.7, 179.25, 179.25],
    // Pracownik 2 — pakowaczka, zero kg
    ['', '', 'PR100', 'Bluskun Oksana', '2025-06-01', null, '2026-07-20', null, null, 'Pakowanie na wagach', 'Na godziny', '05:00', '19:28', null, '14:28'],
    [null, '', 'PR100', 'Bluskun Oksana', null, null, null, null, 'Razem', null, null, '', '', null, '14:28', 0, 0, 210, 210],
  ]

  it('czyta datę raportu', () => {
    expect(parseMaxcropPieceRateSheet(grid, 'test.xls').reportDate).toBe('2026-07-20')
  })

  it('grupuje po kodzie kreskowym — jeden wiersz na pracownika', () => {
    const result = parseMaxcropPieceRateSheet(grid, 'test.xls')
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.externalId)).toEqual(['PR592', 'PR100'])
  })

  it('bierze kg i godziny WYŁĄCZNIE z wiersza Razem, pomijając GRUPA 1', () => {
    const result = parseMaxcropPieceRateSheet(grid, 'test.xls')
    const picker = result.rows.find((r) => r.externalId === 'PR592')!
    expect(picker.kg).toBe(31.7) // nie 31.7 + 26.2
    expect(picker.hours).toBeCloseTo(13.65, 5)
    expect(picker.currentAmount).toBe(179.25)
  })

  it('rozpoznaje zbieraczy po rodzaju pracy "Zbiory"', () => {
    const result = parseMaxcropPieceRateSheet(grid, 'test.xls')
    expect(result.rows.find((r) => r.externalId === 'PR592')!.isHarvestWorker).toBe(true)
    expect(result.rows.find((r) => r.externalId === 'PR100')!.isHarvestWorker).toBe(false)
  })

  it('zgłasza brak rozpoznanych nagłówków zamiast zwracać śmieci', () => {
    const result = parseMaxcropPieceRateSheet([['losowy'], ['tekst']], 'zly.xls')
    expect(result.rows).toHaveLength(0)
    expect(result.warnings[0]).toContain('Nie rozpoznano')
  })
})

describe('mergePieceRateFiles', () => {
  const fileA = {
    fileName: 'a.xls',
    reportDate: '2026-07-20',
    warnings: [],
    rows: [
      { externalId: 'PR1', workerName: 'Anna', kg: 20, hours: 8, workTypes: ['Zbiory'], isHarvestWorker: true, currentAmount: 100 },
    ],
  }
  const fileB = {
    fileName: 'b.xls',
    reportDate: '2026-07-20',
    warnings: [],
    rows: [
      { externalId: 'PR1', workerName: 'Anna', kg: 15, hours: 6, workTypes: ['Pakowanie'], isHarvestWorker: false, currentAmount: 50 },
      { externalId: 'PR2', workerName: 'Bogdan', kg: 30, hours: 9, workTypes: ['Zbiory'], isHarvestWorker: true, currentAmount: 150 },
    ],
  }

  it('sumuje kg i bierze max godzin (domyślnie)', () => {
    const { rows } = mergePieceRateFiles([fileA, fileB])
    const anna = rows.find((r) => r.externalId === 'PR1')!
    expect(anna.kg).toBe(35)
    expect(anna.hours).toBe(8) // max(8, 6), nie 14
  })

  it('sumuje godziny przy strategii sum', () => {
    const { rows } = mergePieceRateFiles([fileA, fileB], 'sum')
    expect(rows.find((r) => r.externalId === 'PR1')!.hours).toBe(14)
  })

  it('scala rodzaje pracy i kwoty', () => {
    const { rows } = mergePieceRateFiles([fileA, fileB])
    const anna = rows.find((r) => r.externalId === 'PR1')!
    expect(anna.workTypes.sort()).toEqual(['Pakowanie', 'Zbiory'])
    expect(anna.currentAmount).toBe(150)
    expect(anna.isHarvestWorker).toBe(true)
  })

  it('dokłada pracowników występujących tylko w jednym pliku', () => {
    const { rows } = mergePieceRateFiles([fileA, fileB])
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.externalId === 'PR2')!.kg).toBe(30)
  })

  it('wykrywa ten sam raport wgrany dwa razy i nie dubluje kg', () => {
    const { rows, warnings } = mergePieceRateFiles([fileA, { ...fileA, fileName: 'a-kopia.xls' }])
    expect(rows.find((r) => r.externalId === 'PR1')!.kg).toBe(20)
    expect(warnings.join(' ')).toContain('zdublowane')
  })

  it('scala po nazwisku gdy brak kodu kreskowego', () => {
    const noId = { ...fileA, rows: [{ ...fileA.rows[0], externalId: null }] }
    const noId2 = { ...fileB, fileName: 'c.xls', rows: [{ ...fileB.rows[0], externalId: null, kg: 5 }] }
    const { rows } = mergePieceRateFiles([noId, noId2])
    expect(rows).toHaveLength(1)
    expect(rows[0].kg).toBe(25)
  })
})
