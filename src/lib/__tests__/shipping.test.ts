import { describe, it, expect } from 'vitest'
import {
  cartonWeightKg,
  totalNetKg,
  packagingLabel,
  packagingLabelWithWeight,
  formatBatchNumber,
  formatKg,
  formatLabelDate,
} from '@/lib/shipping'

describe('cartonWeightKg', () => {
  it('10 × 250 g = 2,5 kg', () => {
    expect(cartonWeightKg({ unitsPerCarton: 10, gramsPerUnit: 250 })).toBe(2.5)
  })

  it('12 × 1250 g = 15 kg', () => {
    expect(cartonWeightKg({ unitsPerCarton: 12, gramsPerUnit: 1250 })).toBe(15)
  })

  it('10 × 200 g = 2 kg', () => {
    expect(cartonWeightKg({ unitsPerCarton: 10, gramsPerUnit: 200 })).toBe(2)
  })

  it('zwraca 0 dla niepoprawnych wartości', () => {
    expect(cartonWeightKg({ unitsPerCarton: 0, gramsPerUnit: 250 })).toBe(0)
    expect(cartonWeightKg({ unitsPerCarton: 10, gramsPerUnit: -5 })).toBe(0)
    expect(cartonWeightKg({ unitsPerCarton: NaN, gramsPerUnit: 250 })).toBe(0)
  })
})

describe('totalNetKg', () => {
  it('100 kartonów × (10 × 250 g) = 250 kg', () => {
    expect(totalNetKg(100, { unitsPerCarton: 10, gramsPerUnit: 250 })).toBe(250)
  })

  it('40 kartonów × (12 × 1250 g) = 600 kg', () => {
    expect(totalNetKg(40, { unitsPerCarton: 12, gramsPerUnit: 1250 })).toBe(600)
  })

  it('zwraca null gdy brak konfekcji', () => {
    expect(totalNetKg(100, null)).toBeNull()
  })

  it('zwraca null gdy liczba kartonów <= 0', () => {
    expect(totalNetKg(0, { unitsPerCarton: 10, gramsPerUnit: 250 })).toBeNull()
    expect(totalNetKg(-5, { unitsPerCarton: 10, gramsPerUnit: 250 })).toBeNull()
  })

  it('zwraca null gdy waga kartonu wychodzi 0', () => {
    expect(totalNetKg(100, { unitsPerCarton: 0, gramsPerUnit: 250 })).toBeNull()
  })

  it('radzi sobie z ułamkową gramaturą', () => {
    // 33 kartony × 2,5 kg = 82,5 kg
    expect(totalNetKg(33, { unitsPerCarton: 10, gramsPerUnit: 250 })).toBe(82.5)
  })
})

describe('packagingLabel', () => {
  it('formatuje jako "opakowań × gramów g"', () => {
    expect(packagingLabel({ unitsPerCarton: 10, gramsPerUnit: 250 })).toBe('10 × 250 g')
    expect(packagingLabel({ unitsPerCarton: 12, gramsPerUnit: 1250 })).toBe('12 × 1250 g')
  })

  it('dokłada wagę kartonu', () => {
    expect(packagingLabelWithWeight({ unitsPerCarton: 10, gramsPerUnit: 250 })).toBe(
      '10 × 250 g (2,5 kg/karton)'
    )
    expect(packagingLabelWithWeight({ unitsPerCarton: 12, gramsPerUnit: 1250 })).toBe(
      '12 × 1250 g (15 kg/karton)'
    )
  })
})

describe('formatBatchNumber', () => {
  it('DD.MM/JL z daty ISO', () => {
    expect(formatBatchNumber('2026-07-01')).toBe('01.07/JL')
    expect(formatBatchNumber('2026-12-24')).toBe('24.12/JL')
  })

  it('zeruje z przodu dzień i miesiąc', () => {
    expect(formatBatchNumber('2026-01-05')).toBe('05.01/JL')
  })

  it('przyjmuje własny suffix', () => {
    expect(formatBatchNumber('2026-07-01', 'GR')).toBe('01.07/GR')
  })

  it('działa na obiekcie Date', () => {
    // miesiące w Date są 0-indeksowane — sprawdzamy, że +1 działa
    expect(formatBatchNumber(new Date(2026, 6, 1))).toBe('01.07/JL')
  })

  it('zwraca pusty string dla śmieci', () => {
    expect(formatBatchNumber('nie-data')).toBe('')
    expect(formatBatchNumber(new Date('nieprawidłowa'))).toBe('')
  })
})

describe('formatKg', () => {
  it('używa przecinka i ucina zbędne zera', () => {
    expect(formatKg(2.5)).toBe('2,5')
    expect(formatKg(15)).toBe('15')
    expect(formatKg(250)).toBe('250')
  })

  it('zwraca "—" dla wartości niepoprawnych', () => {
    expect(formatKg(NaN)).toBe('—')
    expect(formatKg(Infinity)).toBe('—')
  })
})

describe('formatLabelDate', () => {
  it('ISO → DD.MM.YYYY', () => {
    expect(formatLabelDate('2026-07-24')).toBe('24.07.2026')
  })

  it('zwraca wejście bez zmian dla nie-ISO', () => {
    expect(formatLabelDate('cokolwiek')).toBe('cokolwiek')
  })
})
