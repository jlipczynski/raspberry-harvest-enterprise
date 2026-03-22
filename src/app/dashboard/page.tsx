'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Layers, Flower2, Cherry } from 'lucide-react'

// ==================== TYPES ====================
interface Section {
  id: string
  name: string
  metersLength: number
  potsPerMeter: number
  shootsPerPot: number
  potsOverride?: number | null
  yieldSummerPerShoot?: number
  yieldAutumnPerShoot?: number
  varietyId: string
  variety?: {
    id: string
    name: string
    yieldSummerPerShoot?: number
    yieldAutumnPerShoot?: number
  }
}
interface Block { id: string; name: string; sections: Section[] }
interface PlantationData { blocks: Block[]; farm?: { name: string } }

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyName: string
  flowerThreshold: number | null
  fruitThreshold: number | null
  gdhStartDate: string | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
}
interface ForecastDay { date: string; gdhTunnel: number }
interface GdhApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best?: ForecastDay[] }
  } | null
}

// ==================== HELPERS ====================
function countdown(targetDate: string) {
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return { days, hours, minutes }
}

function computeDates(gdhData: GdhApiResponse): Map<string, { flowerDate: string | null; fruitDate: string | null }> {
  const result = new Map<string, { flowerDate: string | null; fruitDate: string | null }>()
  if (!gdhData?.sections?.length || !gdhData.forecast) return result

  const forecast = gdhData.forecast
  const toKey = (d: string) => d.slice(0, 10)

  for (const section of gdhData.sections) {
    if (!section.flowerThreshold && !section.fruitThreshold) {
      result.set(section.id, { flowerDate: null, fruitDate: null })
      continue
    }

    const dailyGdh = new Map<string, number>()
    const gdhStartDate = section.gdhStartDate || ''

    let lastRealGdh = 0
    let lastRealDate = ''
    for (const d of section.dailyGdh) {
      const key = toKey(d.date)
      dailyGdh.set(key, d.cumulativeGdh)
      lastRealGdh = d.cumulativeGdh
      lastRealDate = key
    }

    let cumGdh = lastRealGdh
    for (const day of forecast.meteoDays) {
      if (day.date <= lastRealDate) continue
      if (gdhStartDate && day.date < gdhStartDate) continue
      cumGdh += day.gdhTunnel
      dailyGdh.set(day.date, Math.round(cumGdh))
    }

    const scenarioData = forecast.scenarios.best || forecast.scenarios.p50
    for (const day of scenarioData) {
      if (gdhStartDate && day.date < gdhStartDate) continue
      cumGdh += day.gdhTunnel
      dailyGdh.set(day.date, Math.round(cumGdh))
    }

    const entries = [...dailyGdh.entries()].sort(([a], [b]) => a.localeCompare(b))
    let flowerDate: string | null = null
    let fruitDate: string | null = null
    for (const [date, gdh] of entries) {
      if (!flowerDate && section.flowerThreshold && gdh >= section.flowerThreshold) flowerDate = date
      if (!fruitDate && section.fruitThreshold && gdh >= section.fruitThreshold) fruitDate = date
      if (flowerDate && fruitDate) break
    }

    result.set(section.id, { flowerDate, fruitDate })
  }

  return result
}

// ==================== COMPONENT ====================
export default function DashboardPage() {
  const [plantationData, setPlantationData] = useState<PlantationData | null>(null)
  const [gdhData, setGdhData] = useState<GdhApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    Promise.all([
      fetch('/api/plantation').then(r => r.json()),
      fetch('/api/gdh').then(r => r.json()),
    ]).then(([p, g]) => {
      setPlantationData(p)
      setGdhData(g)
    }).catch(e => console.error('Error fetching data:', e))
      .finally(() => setLoading(false))
  }, [])

  // Live countdown tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Force re-render on tick
  void now

  const blocks = plantationData?.blocks || []

  // ==================== STATS ====================
  const stats = useMemo(() => {
    let totalSections = 0
    let totalPots = 0
    let summerKg = 0
    let autumnKg = 0

    for (const block of blocks) {
      for (const sec of block.sections) {
        totalSections++
        const pots = (sec.potsOverride && sec.potsOverride > 0) ? sec.potsOverride : sec.metersLength * sec.potsPerMeter
        totalPots += pots
        const shoots = pots * sec.shootsPerPot
        const ySummer = sec.yieldSummerPerShoot ?? sec.variety?.yieldSummerPerShoot ?? 0
        const yAutumn = sec.yieldAutumnPerShoot ?? sec.variety?.yieldAutumnPerShoot ?? 0
        summerKg += shoots * ySummer
        autumnKg += shoots * yAutumn
      }
    }

    return {
      blocks: blocks.length,
      sections: totalSections,
      pots: totalPots,
      summerT: summerKg / 1000,
      autumnT: autumnKg / 1000,
      totalT: (summerKg + autumnKg) / 1000,
    }
  }, [blocks])

  // ==================== GDH DATES ====================
  const sectionDates = useMemo(() => {
    if (!gdhData) return new Map<string, { flowerDate: string | null; fruitDate: string | null }>()
    return computeDates(gdhData)
  }, [gdhData])

  // ==================== FLOWER SECTIONS ====================
  const flowerSections = useMemo(() => {
    if (!gdhData?.sections) return []
    return gdhData.sections
      .map(s => {
        const dates = sectionDates.get(s.id)
        return { id: s.id, name: s.name, blockName: s.blockName, varietyName: s.varietyName, flowerDate: dates?.flowerDate ?? null }
      })
      .sort((a, b) => {
        if (!a.flowerDate && !b.flowerDate) return 0
        if (!a.flowerDate) return 1
        if (!b.flowerDate) return -1
        return a.flowerDate.localeCompare(b.flowerDate)
      })
  }, [gdhData, sectionDates])

  // ==================== FRUIT SECTIONS ====================
  const fruitSections = useMemo(() => {
    if (!gdhData?.sections) return []

    // Build a lookup for summerKg per section from blocks
    const summerKgMap = new Map<string, number>()
    for (const block of blocks) {
      for (const sec of block.sections) {
        const pots = (sec.potsOverride && sec.potsOverride > 0) ? sec.potsOverride : sec.metersLength * sec.potsPerMeter
        const shoots = pots * sec.shootsPerPot
        const ySummer = sec.yieldSummerPerShoot ?? sec.variety?.yieldSummerPerShoot ?? 0
        summerKgMap.set(sec.id, shoots * ySummer)
      }
    }

    return gdhData.sections
      .map(s => {
        const dates = sectionDates.get(s.id)
        return { id: s.id, name: s.name, blockName: s.blockName, varietyName: s.varietyName, fruitDate: dates?.fruitDate ?? null, summerKg: summerKgMap.get(s.id) ?? 0 }
      })
      .sort((a, b) => {
        if (!a.fruitDate && !b.fruitDate) return 0
        if (!a.fruitDate) return 1
        if (!b.fruitDate) return -1
        return a.fruitDate.localeCompare(b.fruitDate)
      })
  }, [gdhData, sectionDates, blocks])

  // ==================== FIRST DATES ====================
  const firstFlower = useMemo(() => {
    const future = flowerSections.filter(s => s.flowerDate && new Date(s.flowerDate).getTime() > Date.now()).map(s => s.flowerDate!)
    return future.length ? future.sort()[0] : null
  }, [flowerSections])

  const firstFruit = useMemo(() => {
    const future = fruitSections.filter(s => s.fruitDate && new Date(s.fruitDate).getTime() > Date.now()).map(s => s.fruitDate!)
    return future.length ? future.sort()[0] : null
  }, [fruitSections])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Ładowanie danych...</div>
      </div>
    )
  }

  const farmName = plantationData?.farm?.name || ''
  const flowerCountdown = firstFlower ? countdown(firstFlower) : null
  const fruitCountdown = firstFruit ? countdown(firstFruit) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel główny</h1>
        <p className="text-gray-500">{farmName || 'Witaj w systemie zarządzania plantacją'}</p>
      </div>

      {/* SEKCJA 1 — Podsumowanie plantacji */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Layers className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Bloków</p>
                <p className="text-2xl font-bold">{stats.blocks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Layers className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Sekcji</p>
                <p className="text-2xl font-bold">{stats.sections}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Doniczek</p>
            <p className="text-2xl font-bold">{stats.pots.toLocaleString('pl-PL')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Lato</p>
            <p className="text-2xl font-bold text-red-600">{stats.summerT.toFixed(1)} t</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Jesień</p>
            <p className="text-2xl font-bold text-orange-600">{stats.autumnT.toFixed(1)} t</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Razem</p>
            <p className="text-2xl font-bold text-green-700">{stats.totalT.toFixed(1)} t</p>
          </CardContent>
        </Card>
      </div>

      {/* SEKCJA 2 — Do pierwszego kwitnienia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flower2 className="w-5 h-5 text-pink-500" />
            Do pierwszego kwitnienia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flowerCountdown ? (
            <div className="mb-4 text-center">
              <p className="text-4xl font-bold text-pink-600">
                {flowerCountdown.days} dni, {flowerCountdown.hours} godz, {flowerCountdown.minutes} min
              </p>
            </div>
          ) : firstFlower ? (
            <p className="mb-4 text-center text-green-600 font-semibold">Kwitnienie już się rozpoczęło</p>
          ) : (
            <p className="mb-4 text-center text-gray-400">Brak danych GDH</p>
          )}

          {flowerSections.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 px-3">Sekcja</th>
                    <th className="py-2 px-3">Odmiana</th>
                    <th className="py-2 px-3">Data kwitnienia</th>
                    <th className="py-2 px-3">Za X dni</th>
                  </tr>
                </thead>
                <tbody>
                  {flowerSections.map(s => {
                    const cd = s.flowerDate ? countdown(s.flowerDate) : null
                    const past = s.flowerDate && new Date(s.flowerDate).getTime() <= Date.now()
                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-medium">{s.blockName} / {s.name}</td>
                        <td className="py-2 px-3">{s.varietyName}</td>
                        <td className="py-2 px-3">{s.flowerDate ? new Date(s.flowerDate).toLocaleDateString('pl-PL') : '—'}</td>
                        <td className="py-2 px-3">
                          {past ? <span className="text-green-600">✓ Przekwitła</span> : cd ? `${cd.days} dni` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEKCJA 3 — Do pierwszych zbiorów */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cherry className="w-5 h-5 text-red-500" />
            Do pierwszych zbiorów
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fruitCountdown ? (
            <div className="mb-4 text-center">
              <p className="text-4xl font-bold text-red-600">
                {fruitCountdown.days} dni, {fruitCountdown.hours} godz, {fruitCountdown.minutes} min
              </p>
            </div>
          ) : firstFruit ? (
            <p className="mb-4 text-center text-green-600 font-semibold">Zbiory już się rozpoczęły</p>
          ) : (
            <p className="mb-4 text-center text-gray-400">Brak danych GDH</p>
          )}

          {fruitSections.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 px-3">Sekcja</th>
                    <th className="py-2 px-3">Odmiana</th>
                    <th className="py-2 px-3">Data zbiorów</th>
                    <th className="py-2 px-3">Za X dni</th>
                    <th className="py-2 px-3 text-right">Prognoza kg (lato)</th>
                  </tr>
                </thead>
                <tbody>
                  {fruitSections.map(s => {
                    const cd = s.fruitDate ? countdown(s.fruitDate) : null
                    const past = s.fruitDate && new Date(s.fruitDate).getTime() <= Date.now()
                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-medium">{s.blockName} / {s.name}</td>
                        <td className="py-2 px-3">{s.varietyName}</td>
                        <td className="py-2 px-3">{s.fruitDate ? new Date(s.fruitDate).toLocaleDateString('pl-PL') : '—'}</td>
                        <td className="py-2 px-3">
                          {past ? <span className="text-green-600">✓ W trakcie zbiorów</span> : cd ? `${cd.days} dni` : <span className="text-gray-400">— Uzupełnij dane</span>}
                        </td>
                        <td className="py-2 px-3 text-right">{s.summerKg > 0 ? `${Math.round(s.summerKg).toLocaleString('pl-PL')} kg` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {stats.blocks === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="text-amber-800">
              <strong>Wskazówka:</strong> Twoja plantacja jest pusta. Przejdź do sekcji &quot;Plantacja&quot; żeby dodać bloki i sekcje.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
