import { describe, it, expect } from 'vitest'
import {
  aggregateWorkerRanking,
  topAndBottom,
  type RankingRowInput,
  type WorkerRanking,
} from '@/lib/piece-rate-ranking'

const row = (over: Partial<RankingRowInput>): RankingRowInput => ({
  externalId: null,
  workerName: 'X',
  kg: 10,
  effectiveHours: 5,
  isHarvestWorker: true,
  sessionId: 's1',
  ...over,
})

describe('aggregateWorkerRanking', () => {
  it('scala tego samego pracownika po kodzie kreskowym z wielu dni', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'PR1', workerName: 'Anna', kg: 30, effectiveHours: 10, sessionId: 's1' }),
      row({ externalId: 'PR1', workerName: 'Anna', kg: 20, effectiveHours: 10, sessionId: 's2' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].totalKg).toBe(50)
    expect(r[0].totalHours).toBe(20)
    expect(r[0].days).toBe(2)
  })

  it('liczy wydajność ważoną: suma kg / suma godzin', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'PR1', kg: 10, effectiveHours: 1, sessionId: 's1' }), // 10 kg/h
      row({ externalId: 'PR1', kg: 10, effectiveHours: 9, sessionId: 's2' }), // 1.11 kg/h
    ])
    // ważona = 20 / 10 = 2, nie średnia (5.56)
    expect(r[0].avgKgPerHour).toBe(2)
  })

  it('pomija nie-zbieraczy i godziny <= 0', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'PR1', isHarvestWorker: false }),
      row({ externalId: 'PR2', effectiveHours: 0 }),
      row({ externalId: 'PR3', kg: 40, effectiveHours: 10 }),
    ])
    expect(r.map((w) => w.externalId)).toEqual(['PR3'])
  })

  it('scala po nazwisku gdy brak kodu kreskowego', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: null, workerName: 'Jan Kowalski', kg: 10, effectiveHours: 5, sessionId: 's1' }),
      row({ externalId: null, workerName: 'jan  kowalski', kg: 10, effectiveHours: 5, sessionId: 's2' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].days).toBe(2)
  })

  it('sortuje malejąco po wydajności', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'slaby', kg: 10, effectiveHours: 10 }), // 1
      row({ externalId: 'mocny', kg: 50, effectiveHours: 10 }), // 5
      row({ externalId: 'sredni', kg: 30, effectiveHours: 10 }), // 3
    ])
    expect(r.map((w) => w.externalId)).toEqual(['mocny', 'sredni', 'slaby'])
  })

  it('przy remisie wydajności wyżej jest ten z większą liczbą godzin', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'malo', kg: 20, effectiveHours: 10, sessionId: 's1' }), // 2 kg/h, 10 h
      row({ externalId: 'duzo', kg: 40, effectiveHours: 20, sessionId: 's2' }), // 2 kg/h, 20 h
    ])
    expect(r[0].externalId).toBe('duzo')
  })

  it('wyklucza osoby z zerowym zbiorem przez cały sezon (kontrola, pakowanie)', () => {
    const r = aggregateWorkerRanking([
      row({ externalId: 'kontrola', kg: 0, effectiveHours: 8 }),
      row({ externalId: 'zbieracz', kg: 20, effectiveHours: 8 }),
    ])
    expect(r.map((w) => w.externalId)).toEqual(['zbieracz'])
  })

  it('pusta lista → pusty ranking', () => {
    expect(aggregateWorkerRanking([])).toEqual([])
  })
})

describe('topAndBottom', () => {
  const ranking: WorkerRanking[] = Array.from({ length: 10 }, (_, i) => ({
    key: `w${i}`,
    workerName: `W${i}`,
    externalId: `w${i}`,
    totalKg: 100,
    totalHours: 10,
    avgKgPerHour: 10 - i, // W0 najlepszy (10), W9 najsłabszy (1)
    days: 3,
  }))

  it('zwraca N najlepszych z góry i M najsłabszych z dołu', () => {
    const { top, bottom } = topAndBottom(ranking, 3, 2)
    expect(top.map((w) => w.externalId)).toEqual(['w0', 'w1', 'w2'])
    // najsłabsi, od najgorszego
    expect(bottom.map((w) => w.externalId)).toEqual(['w9', 'w8'])
  })

  it('nie dubluje osób między topem a najsłabszymi przy małej puli', () => {
    const small = ranking.slice(0, 3) // w0, w1, w2
    const { top, bottom } = topAndBottom(small, 2, 2)
    expect(top.map((w) => w.externalId)).toEqual(['w0', 'w1'])
    // z puli zostaje tylko w2
    expect(bottom.map((w) => w.externalId)).toEqual(['w2'])
    const ids = [...top, ...bottom].map((w) => w.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('odfiltrowuje osoby poniżej minimum dni', () => {
    const mixed = ranking.map((w, i) => ({ ...w, days: i < 5 ? 1 : 4 }))
    const { top, eligible } = topAndBottom(mixed, 3, 2, 2)
    expect(eligible).toBe(5) // tylko dni >= 2
    expect(top.every((w) => w.days >= 2)).toBe(true)
  })
})
