import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LabelSheet, { type LabelData } from './label-sheet'

const data: LabelData = {
  recipient: 'Biedronka Sp. z o.o.',
  cartons: 100,
  packaging: { id: 'preset-10x250', unitsPerCarton: 10, gramsPerUnit: 250 },
  batchNumber: '24.07/JL',
  harvestDate: '2026-07-24',
  prepDate: '2026-07-24',
  palletNumber: '',
}

afterEach(cleanup)

describe('LabelSheet', () => {
  it('renderuje bez błędu i pokazuje dwie etykiety', () => {
    const { container, getAllByText } = render(<LabelSheet data={data} />)
    // dwie kopie nagłówka = dwie etykiety
    expect(getAllByText('ETYKIETA PALETOWA')).toHaveLength(2)
    expect(getAllByText('MALINY')).toHaveLength(2)
    expect(container.querySelector('.lbl-cut')).not.toBeNull()
  })

  it('drukuje polskie znaki poprawnie (Lipczyński)', () => {
    const { getAllByText } = render(<LabelSheet data={data} />)
    // ń, ł, ó muszą się pojawić dosłownie
    expect(getAllByText(/Gospodarstwo Rolne Jan Lipczyński/).length).toBeGreaterThan(0)
  })

  it('liczy masę łączną z kartonów i konfekcji', () => {
    const { getAllByText } = render(<LabelSheet data={data} />)
    // 100 × 2,5 kg = 250 kg
    expect(getAllByText('250').length).toBeGreaterThan(0)
  })

  it('pokazuje dane z formularza: odbiorca, partia, konfekcja', () => {
    const { getAllByText } = render(<LabelSheet data={data} />)
    expect(getAllByText('Biedronka Sp. z o.o.').length).toBe(2)
    expect(getAllByText('24.07/JL').length).toBe(2)
    expect(getAllByText('10 × 250 g').length).toBe(2)
  })
})
