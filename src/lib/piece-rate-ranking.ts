/**
 * Ranking pracowników na podstawie wszystkich zapisanych wycen (sesji akordu).
 *
 * Wydajność liczymy ważona: suma kg / suma godzin z całego sezonu — NIE średnia
 * ze średnich, tak samo jak w kalkulatorze stawki. Dzień z jednym fartem nie
 * wywinduje kogoś na szczyt, bo waży go liczba przepracowanych godzin.
 */

export interface RankingRowInput {
  externalId: string | null
  workerName: string
  kg: number
  effectiveHours: number
  isHarvestWorker: boolean
  sessionId: string
}

export interface WorkerRanking {
  key: string
  workerName: string
  externalId: string | null
  totalKg: number
  totalHours: number
  /** suma kg / suma godzin z całego sezonu */
  avgKgPerHour: number
  /** w ilu dniach (sesjach) pracownik wystąpił */
  days: number
}

/**
 * Agreguje wiersze wielu sesji do jednego rankingu, posortowanego malejąco
 * po wydajności. Liczymy tylko zbieraczy z dodatnimi godzinami — pakowaczki
 * i kontrola nie mają czego wnieść do rankingu zbiorów.
 */
export function aggregateWorkerRanking(rows: RankingRowInput[]): WorkerRanking[] {
  const byWorker = new Map<
    string,
    { workerName: string; externalId: string | null; kg: number; hours: number; sessions: Set<string> }
  >()

  for (const row of rows) {
    if (!row.isHarvestWorker) continue
    if (!Number.isFinite(row.effectiveHours) || row.effectiveHours <= 0) continue
    if (!Number.isFinite(row.kg)) continue

    // Kod kreskowy scala tę samą osobę między dniami; brak → nazwisko.
    const key = row.externalId || row.workerName.toLowerCase().replace(/\s+/g, ' ').trim()

    let entry = byWorker.get(key)
    if (!entry) {
      entry = { workerName: row.workerName, externalId: row.externalId, kg: 0, hours: 0, sessions: new Set() }
      byWorker.set(key, entry)
    }
    entry.kg += row.kg
    entry.hours += row.effectiveHours
    entry.sessions.add(row.sessionId)
  }

  const ranking: WorkerRanking[] = []
  for (const [key, entry] of byWorker) {
    if (entry.hours <= 0) continue
    // Zero kg przez cały sezon = nie zbierał (kontrola, pakowanie mylnie
    // zapisane jako zbieracz). Taka osoba nie jest "wolnym zbieraczem",
    // więc nie zaśmieca listy najsłabszych.
    if (entry.kg <= 0) continue
    ranking.push({
      key,
      workerName: entry.workerName,
      externalId: entry.externalId,
      totalKg: Math.round(entry.kg * 10) / 10,
      totalHours: Math.round(entry.hours * 100) / 100,
      avgKgPerHour: Math.round((entry.kg / entry.hours) * 1000) / 1000,
      days: entry.sessions.size,
    })
  }

  // Malejąco po wydajności; przy remisie więcej godzin = wyżej (pewniejszy wynik).
  ranking.sort((a, b) => b.avgKgPerHour - a.avgKgPerHour || b.totalHours - a.totalHours)
  return ranking
}

/**
 * Wybiera najlepszych i najsłabszych z rankingu, po odfiltrowaniu osób
 * z mniej niż `minDays` dniami (żeby jeden dzień nie decydował o pozycji).
 */
export function topAndBottom(
  ranking: WorkerRanking[],
  topCount: number,
  bottomCount: number,
  minDays = 1
): { top: WorkerRanking[]; bottom: WorkerRanking[]; eligible: number } {
  const eligible = ranking.filter((w) => w.days >= minDays)
  const top = eligible.slice(0, Math.max(0, topCount))

  // Najsłabsi to koniec listy; nie dublujemy osób z topu, gdy pula jest mała.
  const bottomPool = eligible.slice(top.length)
  const bottom = bottomPool.slice(-Math.max(0, bottomCount)).reverse()

  return { top, bottom, eligible: eligible.length }
}
