import { describe, it, expect } from 'vitest'
import { parseHarvestRows, parseReportRange } from '../maxcrop-harvest-parser'

describe('parseReportRange', () => {
  it('reads the range from the MaxCrop title cell', () => {
    expect(parseReportRange('Suma zbiorów \n1 maja 2026 - 9 listopada 2026')).toEqual({
      from: '2026-05-01',
      to: '2026-11-09',
    })
  })

  it('handles Polish diacritics in month names', () => {
    expect(parseReportRange('Suma zbiorów 3 września 2026 - 12 października 2026')).toEqual({
      from: '2026-09-03',
      to: '2026-10-12',
    })
  })

  it('returns null when no range is present', () => {
    expect(parseReportRange('Suma zbiorów')).toBeNull()
    expect(parseReportRange('')).toBeNull()
  })
})

describe('parseHarvestRows', () => {
  it('keeps 0 kg rows so MaxCrop corrections overwrite earlier imports', () => {
    const rows = parseHarvestRows([
      [46244, 'Malina-Blok  D', 'Malina 125', 0, 25.5, 0, 17],
      [46244, 'Malina-Blok  D', 'Malina_200_8x200', 30.4, 30.4, 19, 19],
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2026-08-10', weightKg: 0, quantity: 0 })
  })

  it('skips negative and non-numeric weights and the summary row', () => {
    const rows = parseHarvestRows([
      [46244, 'Malina-Blok  D', 'Malina 125', -1, 0, 0, 0],
      [46244, 'Malina-Blok  D', 'Malina 125', 'abc', 0, 0, 0],
      ['', '', '', 130432.14, 130488.04, 110537.38, 110573.38],
    ])
    expect(rows).toHaveLength(0)
  })
})
