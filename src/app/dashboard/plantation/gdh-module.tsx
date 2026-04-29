'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'
import { TrendingUp, Thermometer, Target, Loader2, CloudSun, Info, ChevronDown, ChevronUp, FileDown } from 'lucide-react'
import { generateGdhReport } from './gdh-report-pdf'

// ── Types ──

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyId: string
  varietyName: string
  winteredInTunnel: boolean
  plantingDate: string | null
  gdhStartDate: string | null
  baseTemp: number
  plantMaterialType: string | null
  flowerThreshold: number | null
  fruitThreshold: number | null
  thresholdType: string
  dailyGdh: Array<{ date: string; dailyGdh: number; cumulativeGdh: number; readingCount: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay {
  date: string
  gdhTunnel: number
  avgTunnelTemp?: number
}

interface SeasonalAnomaly {
  months: Array<{ month: string; anomaly: number }>
  avgAnomaly: number
  verdict: string
}

export interface ApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best: ForecastDay[] }
    seasonalAnomaly: SeasonalAnomaly | null
    lastForecastDate: string
    tunnelModel: { alpha: number; offsetModel: string; staticOffset: number | null; maxOffset: number; radiationK: number }
    historicalYears: number
  } | null
  gdhParams: { baseTemp?: number; upperTemp: number; forecastBaseTemp?: number }
}

interface ChartPoint {
  date: string
  dateLabel: string
  realGdh: number | null
  meteoGdh: number | null
  p10Gdh: number | null
  p50Gdh: number | null
  p90Gdh: number | null
  bestGdh: number | null
}

interface ScenarioPrediction {
  label: string
  color: string
  bgColor: string
  flowerDate: string | null
  flowerZone: string | null
  fruitDate: string | null
  fruitZone: string | null
}

// ── Component ──

interface Props {
  initialData: ApiResponse | null
  initialLoading: boolean
}

export default function GDHModule({ initialData, initialLoading }: Props) {
  const [data, setData] = useState<ApiResponse | null>(initialData)
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(initialLoading)
  const [showMethodology, setShowMethodology] = useState(false)
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    realGdh: true, meteoGdh: true, bestGdh: true, p90Gdh: true, p50Gdh: true, p10Gdh: true,
  })
  const [offsetMode, setOffsetMode] = useState<'dynamic' | 'static'>('dynamic')
  const [staticOffset, setStaticOffset] = useState(4)

  // Sync danych z parenta — bez fetcha
  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
    }
  }, [initialData])

  // Re-fetch tylko gdy użytkownik zmieni offset — nie na mount
  useEffect(() => {
    if (offsetMode === 'dynamic' && staticOffset === 4) return
    async function fetchData() {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (offsetMode === 'static') {
          params.set('offsetMode', 'static')
          params.set('staticOffset', String(staticOffset))
        }
        const res = await fetch(`/api/gdh?${params.toString()}`)
        const json = await res.json()
        setData(json)
      } catch (e) {
        console.error('Error fetching GDH data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [offsetMode, staticOffset])

  const sections = data?.sections || []
  const forecast = data?.forecast
  const selectedSection = sections.find(s => s.id === selectedSectionId)
  const sectionsWithData = sections.filter(s => s.totalReadings > 0)

  // ── Build chart data: real + meteo + 3 scenarios ──
  const chartData = useMemo(() => {
    const points: ChartPoint[] = []
    if (!selectedSection) return points

    const toLabel = (d: string) => new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
    const toKey = (d: string | Date) => typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)

    // If section has a planting date (non-wintered), skip all forecast days before it
    const gdhStartDate = selectedSection.gdhStartDate || ''

    // For sections with future planting date: add empty points from today to gdhStartDate
    // so the X axis starts from today, but curves only begin at planting date
    const todayStr = new Date().toISOString().slice(0, 10)
    if (gdhStartDate && gdhStartDate > todayStr && selectedSection.dailyGdh.length === 0) {
      // Add weekly empty ticks from today until planting date
      const cursor = new Date(todayStr)
      const plantDate = new Date(gdhStartDate)
      while (cursor < plantDate) {
        const key = cursor.toISOString().slice(0, 10)
        points.push({ date: key, dateLabel: toLabel(key), realGdh: null, meteoGdh: null, p10Gdh: null, p50Gdh: null, p90Gdh: null, bestGdh: null })
        cursor.setDate(cursor.getDate() + 7) // weekly ticks
      }
    }

    // Zone 1: Real data from CSV readings
    let lastCumGdh = 0
    for (const d of selectedSection.dailyGdh) {
      const dateStr = toKey(d.date)
      points.push({ date: dateStr, dateLabel: toLabel(dateStr), realGdh: d.cumulativeGdh, meteoGdh: null, p10Gdh: null, p50Gdh: null, p90Gdh: null, bestGdh: null })
      lastCumGdh = d.cumulativeGdh
    }

    if (!forecast) return points

    // Zone 2: Meteo 16-day forecast
    let cumMeteo = lastCumGdh
    const lastRealDate = points.length > 0 ? points[points.length - 1].date : ''

    // Bridge: last real point also starts meteo
    const lastNonEmptyPoint = [...points].reverse().find(p => p.realGdh !== null)
    if (lastNonEmptyPoint) {
      lastNonEmptyPoint.meteoGdh = lastCumGdh
    }

    // Per-section GDH from tunnel temp using section's baseTemp
    const upperTemp = data?.gdhParams?.upperTemp ?? 26.0
    const sectionBaseTemp = selectedSection.baseTemp
    const gdhFromDay = (day: ForecastDay): number => {
      if (day.avgTunnelTemp != null) {
        const eff = Math.min(day.avgTunnelTemp, upperTemp)
        return Math.max(0, eff - sectionBaseTemp) * 24
      }
      return day.gdhTunnel // fallback for old cached data
    }

    for (const day of forecast.meteoDays) {
      if (day.date <= lastRealDate) continue
      if (gdhStartDate && day.date < gdhStartDate) continue // skip before planting
      cumMeteo += gdhFromDay(day)
      points.push({ date: day.date, dateLabel: toLabel(day.date), realGdh: null, meteoGdh: Math.round(cumMeteo), p10Gdh: null, p50Gdh: null, p90Gdh: null, bestGdh: null })
    }

    // Zone 3: Three climate scenarios (P10, P50, P90)
    const lastMeteoGdh = cumMeteo

    // Bridge: last meteo point starts scenarios
    const lastMeteoPoint = [...points].reverse().find(p => p.meteoGdh !== null)
    if (lastMeteoPoint) {
      lastMeteoPoint.p10Gdh = lastMeteoGdh
      lastMeteoPoint.p50Gdh = lastMeteoGdh
      lastMeteoPoint.p90Gdh = lastMeteoGdh
      lastMeteoPoint.bestGdh = lastMeteoGdh
    } else if (gdhStartDate) {
      // No meteo data before planting — add a zero-point at planting date as scenario start
      points.push({ date: gdhStartDate, dateLabel: toLabel(gdhStartDate), realGdh: null, meteoGdh: null, p10Gdh: 0, p50Gdh: 0, p90Gdh: 0, bestGdh: 0 })
    } else if (points.length > 0) {
      points[points.length - 1].p10Gdh = lastCumGdh
      points[points.length - 1].p50Gdh = lastCumGdh
      points[points.length - 1].p90Gdh = lastCumGdh
      points[points.length - 1].bestGdh = lastCumGdh
    }

    let cumP10 = lastMeteoGdh
    let cumP50 = lastMeteoGdh
    let cumP90 = lastMeteoGdh
    let cumBest = lastMeteoGdh

    const bestData = forecast.scenarios.best || []
    const maxLen = Math.max(forecast.scenarios.p10.length, forecast.scenarios.p50.length, forecast.scenarios.p90.length, bestData.length)
    const endOfYearStr = `${new Date().getFullYear()}-12-31`
    for (let i = 0; i < maxLen; i++) {
      const dp10 = forecast.scenarios.p10[i]
      const dp50 = forecast.scenarios.p50[i]
      const dp90 = forecast.scenarios.p90[i]
      const dBest = bestData[i]
      const date = dp50?.date || dp10?.date || dp90?.date || dBest?.date
      if (!date) continue
      if (date > endOfYearStr) break
      if (gdhStartDate && date < gdhStartDate) continue // skip before planting

      cumP10 += dp10 ? gdhFromDay(dp10) : 0
      cumP50 += dp50 ? gdhFromDay(dp50) : 0
      cumP90 += dp90 ? gdhFromDay(dp90) : 0
      cumBest += dBest ? gdhFromDay(dBest) : (dp50 ? gdhFromDay(dp50) : 0)

      points.push({
        date,
        dateLabel: toLabel(date),
        realGdh: null,
        meteoGdh: null,
        p10Gdh: Math.round(cumP10),
        p50Gdh: Math.round(cumP50),
        p90Gdh: Math.round(cumP90),
        bestGdh: bestData.length > 0 ? Math.round(cumBest) : null,
      })
    }

    return points
  }, [selectedSection, forecast])

  // ── Reference lines for thresholds ──
  const refLines = useMemo(() => {
    if (!selectedSection) return []
    const lines: Array<{ y: number; label: string; color: string }> = []
    if (selectedSection.flowerThreshold) lines.push({ y: selectedSection.flowerThreshold, label: 'Kwitnienie', color: '#f59e0b' })
    if (selectedSection.fruitThreshold) lines.push({ y: selectedSection.fruitThreshold, label: 'Owocowanie', color: '#ef4444' })
    return lines
  }, [selectedSection])

  // ── Predict dates for each scenario ──
  const scenarioPredictions = useMemo((): ScenarioPrediction[] | null => {
    if (!selectedSection) return null

    const findCrossing = (threshold: number | null, gdhKey: 'realGdh' | 'meteoGdh' | 'p10Gdh' | 'p50Gdh' | 'p90Gdh' | 'bestGdh') => {
      if (!threshold) return null
      // Walk through all points, tracking cumulative across zones
      for (const pt of chartData) {
        const val = pt[gdhKey]
        if (val !== null && val >= threshold) {
          return new Date(pt.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
        }
      }
      return null
    }

    // Also check if real+meteo already crossed before scenarios
    const findFirstCrossing = (threshold: number | null) => {
      if (!threshold) return { date: null, zone: null }
      for (const pt of chartData) {
        // Check in priority order
        if (pt.realGdh !== null && pt.realGdh >= threshold) return { date: new Date(pt.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }), zone: 'real' }
        if (pt.meteoGdh !== null && pt.meteoGdh >= threshold) return { date: new Date(pt.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }), zone: 'meteo' }
      }
      return { date: null, zone: null }
    }

    const flowerReal = findFirstCrossing(selectedSection.flowerThreshold)
    const fruitReal = findFirstCrossing(selectedSection.fruitThreshold)

    const hasBest = forecast?.scenarios?.best && forecast.scenarios.best.length > 0

    const rows: ScenarioPrediction[] = []

    if (hasBest) {
      const anom = forecast?.seasonalAnomaly
      rows.push({
        label: `Prognoza 2026 (ECMWF${anom ? `: ${anom.avgAnomaly > 0 ? '+' : ''}${anom.avgAnomaly}K` : ''})`,
        color: 'text-rose-700',
        bgColor: 'bg-rose-50 border-rose-300',
        flowerDate: flowerReal.date ?? findCrossing(selectedSection.flowerThreshold, 'bestGdh'),
        flowerZone: flowerReal.zone ?? 'best',
        fruitDate: fruitReal.date ?? findCrossing(selectedSection.fruitThreshold, 'bestGdh'),
        fruitZone: fruitReal.zone ?? 'best',
      })
    }

    rows.push(
      {
        label: 'Ciepły rok (P90)',
        color: 'text-orange-700',
        bgColor: 'bg-orange-50 border-orange-200',
        flowerDate: flowerReal.date ?? findCrossing(selectedSection.flowerThreshold, 'p90Gdh'),
        flowerZone: flowerReal.zone ?? 'p90',
        fruitDate: fruitReal.date ?? findCrossing(selectedSection.fruitThreshold, 'p90Gdh'),
        fruitZone: fruitReal.zone ?? 'p90',
      },
      {
        label: 'Przeciętny rok (P50)',
        color: 'text-purple-700',
        bgColor: 'bg-purple-50 border-purple-200',
        flowerDate: flowerReal.date ?? findCrossing(selectedSection.flowerThreshold, 'p50Gdh'),
        flowerZone: flowerReal.zone ?? 'p50',
        fruitDate: fruitReal.date ?? findCrossing(selectedSection.fruitThreshold, 'p50Gdh'),
        fruitZone: fruitReal.zone ?? 'p50',
      },
      {
        label: 'Zimny rok (P10)',
        color: 'text-sky-700',
        bgColor: 'bg-sky-50 border-sky-200',
        flowerDate: flowerReal.date ?? findCrossing(selectedSection.flowerThreshold, 'p10Gdh'),
        flowerZone: flowerReal.zone ?? 'p10',
        fruitDate: fruitReal.date ?? findCrossing(selectedSection.fruitThreshold, 'p10Gdh'),
        fruitZone: fruitReal.zone ?? 'p10',
      },
    )

    return rows
  }, [selectedSection, chartData, forecast?.scenarios?.best, forecast?.seasonalAnomaly])

  // ── Progress ──
  const currentProgress = useMemo(() => {
    if (!selectedSection) return null
    const c = selectedSection.currentGdh
    return {
      flower: selectedSection.flowerThreshold ? Math.min(100, Math.round((c / selectedSection.flowerThreshold) * 100)) : null,
      fruit: selectedSection.fruitThreshold ? Math.min(100, Math.round((c / selectedSection.fruitThreshold) * 100)) : null,
    }
  }, [selectedSection])

  // Avg daily GDH from last 7 days
  const avgDailyGdh = useMemo(() => {
    if (!selectedSection || selectedSection.dailyGdh.length < 2) return 0
    const d = selectedSection.dailyGdh
    const n = Math.min(7, d.length)
    const last = d.slice(-n)
    return Math.round((last[last.length - 1].cumulativeGdh - last[0].cumulativeGdh) / n)
  }, [selectedSection])

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />Ładowanie modułu GDH...
    </CardContent></Card>
  )

  // Zone boundary labels for background shading
  const meteoZoneStart = chartData.find(p => p.meteoGdh !== null && p.realGdh === null)?.dateLabel
  const scenarioZoneStart = chartData.find(p => p.p50Gdh !== null && p.meteoGdh === null && p.realGdh === null)?.dateLabel
  const chartEnd = chartData.length > 0 ? chartData[chartData.length - 1].dateLabel : null

  // Planting date label for vertical reference line
  const plantingDateLabel = selectedSection?.gdhStartDate
    ? new Date(selectedSection.gdhStartDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
    : null

  const zoneBadge = (zone: string | null) => {
    if (!zone || zone === 'real') return null
    const styles: Record<string, string> = {
      meteo: 'bg-blue-100 text-blue-700',
      best: 'bg-rose-100 text-rose-700',
      p90: 'bg-orange-100 text-orange-700',
      p50: 'bg-purple-100 text-purple-700',
      p10: 'bg-sky-100 text-sky-700',
    }
    const labels: Record<string, string> = {
      meteo: 'prognoza meteo',
      best: 'ECMWF 2026',
      p90: 'scenariusz P90',
      p50: 'scenariusz P50',
      p10: 'scenariusz P10',
    }
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[zone] || ''}`}>{labels[zone] || zone}</span>
  }

  return (
    <Card className="border-green-200">
      <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          GDH — Godziny Wzrostu (Growing Degree Hours)
          {data && sectionsWithData.length > 0 && (
            <button
              onClick={() => generateGdhReport(sections, forecast ?? null, data.gdhParams)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 hover:border-green-400 transition-colors shadow-sm"
              title="Pobierz raport PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              Raport PDF
            </button>
          )}
        </CardTitle>
        <p className="text-sm text-gray-500">
          T_baz = per sekcja (z odmiany), T_opt = {data?.gdhParams?.upperTemp ?? 26}°C
          {forecast && ` \u2022 Klimatologia: ${forecast.historicalYears} lat`}
          {forecast?.seasonalAnomaly && (
            <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              forecast.seasonalAnomaly.avgAnomaly > 0.5 ? 'bg-orange-100 text-orange-800' :
              forecast.seasonalAnomaly.avgAnomaly < -0.5 ? 'bg-sky-100 text-sky-800' :
              'bg-gray-100 text-gray-700'
            }`}>
              ECMWF: 2026 {forecast.seasonalAnomaly.verdict} ({forecast.seasonalAnomaly.avgAnomaly > 0 ? '+' : ''}{forecast.seasonalAnomaly.avgAnomaly}K)
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">

        {/* ── Methodology info box ── */}
        <div className="border border-blue-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
          >
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-sm font-medium text-blue-800">Jak obliczamy GDH? (metodologia)</span>
            {showMethodology ? <ChevronUp className="w-4 h-4 text-blue-500 ml-auto" /> : <ChevronDown className="w-4 h-4 text-blue-500 ml-auto" />}
          </button>
          {showMethodology && (
            <div className="px-4 py-3 bg-white text-xs text-gray-700 space-y-3 border-t border-blue-100">
              <div>
                <p className="font-semibold text-gray-800 mb-1">1. Formuła GDH (wg Fall Creek Nursery)</p>
                <p>Dla każdego odczytu temperatury (co 15 min z loggera Testo):</p>
                <p className="font-mono bg-gray-50 px-2 py-1 rounded mt-1">
                  GDH = max(0, min(T, {data?.gdhParams?.upperTemp ?? 26}°C) - T_baz) &times; &Delta;t
                </p>
                <ul className="mt-1 ml-4 list-disc text-gray-600">
                  <li><strong>T_baz</strong> — z ustawień odmiany (poniżej tej temperatury roślina nie rośnie)</li>
                  <li><strong>T_opt = {data?.gdhParams?.upperTemp ?? 26}°C</strong> — powyżej: stres cieplny, wzrost nie przyspiesza</li>
                  <li>Odczyt co 15 min &times; 0.25h = precyzyjne godziny wzrostu</li>
                  <li>Jeśli sekcja ma ustawioną <strong>datę wysadzenia</strong> (nie jest zimowana) — GDH naliczane dopiero od tej daty</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-1">2. Wykres — strefy prognozy</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-1 bg-emerald-600 rounded mt-1.5 shrink-0" />
                    <p><strong className="text-emerald-700">Zielona ciągła</strong> — realne GDH z odczytów CSV (logger Testo). Prawda absolutna.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-1 mt-1.5 shrink-0" style={{ background: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 4px, transparent 4px, transparent 7px)' }} />
                    <p><strong className="text-blue-600">Niebieska przerywana (16 dni)</strong> — prognoza godzinowa z Open-Meteo z dynamicznym offsetem szklarniowym. Wysoka pewność.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-1 mt-1.5 shrink-0" style={{ background: 'repeating-linear-gradient(90deg, #e11d48 0, #e11d48 5px, transparent 5px, transparent 8px)' }} />
                    <p><strong className="text-rose-600">Różowa przerywana (ECMWF 2026)</strong> — najlepsza estymacja na podstawie prognozy sezonowej ECMWF SEAS5. Interpolacja między P10/P50/P90 wg anomalii temperaturowej.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500 mt-1 shrink-0" />
                    <p><strong className="text-orange-600">P90 (ciepły rok)</strong> — 90. percentyl z {forecast?.historicalYears ?? 10} lat danych historycznych. Najszybszy przyrost GDH.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-1 shrink-0" />
                    <p><strong className="text-purple-600">P50 (przeciętny rok)</strong> — mediana klimatyczna z {forecast?.historicalYears ?? 10} lat. Najbardziej prawdopodobny scenariusz.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-sky-500 mt-1 shrink-0" />
                    <p><strong className="text-sky-600">P10 (zimny rok)</strong> — 10. percentyl z {forecast?.historicalYears ?? 10} lat. Najwolniejszy przyrost GDH.</p>
                  </div>
                </div>
                <p className="mt-1 text-gray-500 italic">Obszar między P10 a P90 tworzy &quot;lejek pewności&quot; — zbiory nastąpią w tym zakresie dat.</p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-1">3. Model inercji tunelu (2 tryby)</p>
                <p className="font-mono bg-gray-50 px-2 py-1 rounded mt-1">
                  T_tunel(t) = &alpha; &times; (T_zewn + offset) + (1-&alpha;) &times; T_tunel(t-1)
                </p>
                <ul className="mt-1 ml-4 list-disc text-gray-600">
                  <li><strong>&alpha; = 0.3</strong> — tunel reaguje powoli (inercja cieplna folii i gleby)</li>
                </ul>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="font-semibold text-green-800 text-[11px] mb-1">Tryb dynamiczny (zalecane)</p>
                    <ul className="list-disc ml-3 text-gray-600 space-y-0.5">
                      <li>offset = 0–15°C na podstawie promieniowania słonecznego (W/m&sup2;)</li>
                      <li>Noc / zachmurzenie: offset &asymp; 0°C</li>
                      <li>Słoneczne południe (~800 W/m&sup2;): offset do +15°C</li>
                      <li>Wzór: <span className="font-mono text-[10px]">min(15, promieniowanie &times; 15/800)</span></li>
                    </ul>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <p className="font-semibold text-amber-800 text-[11px] mb-1">Tryb stały (suwak)</p>
                    <ul className="list-disc ml-3 text-gray-600 space-y-0.5">
                      <li>Stały offset (np. +4°C) przez cały dzień i noc</li>
                      <li>Prostszy model, przydatny do porównań</li>
                      <li>Suwak: 0°C do 15°C w krokach co 0.5°C</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-1.5 text-gray-600">
                  <strong>Przykład (dynamiczny):</strong> Na zewnątrz 10°C, promieniowanie 270 W/m&sup2; (offset +5°C), tunel wcześniej 8°C:<br />
                  <span className="font-mono bg-gray-50 px-1 rounded">0.3 &times; (10 + 5) + 0.7 &times; 8 = <strong>10.1°C</strong></span>
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-1">4. Scenariusze klimatyczne (P10/P50/P90)</p>
                <p>Dla dni 17+ (po wyczerpaniu prognozy meteo) używamy klimatologii z <strong>{forecast?.historicalYears ?? 10} lat</strong> danych historycznych:</p>
                <ul className="mt-1 ml-4 list-disc text-gray-600">
                  <li>Dla każdego dnia kalendarzowego bierzemy temperatury z lat ubiegłych (min. 10 lat)</li>
                  <li><strong>P10</strong> = 10. percentyl (zimny rok), <strong>P50</strong> = mediana, <strong>P90</strong> = 90. percentyl (ciepły rok)</li>
                  <li>Każdy scenariusz przechodzi przez model inercji tunelu z estymowanym promieniowaniem wg miesiąca</li>
                  <li>Krzywe naturalnie przyspieszają (lato = cieplej + więcej słońca = więcej GDH/dzień)</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-1">5. Progi GDH per odmiana</p>
                <ul className="mt-1 ml-4 list-disc text-gray-600">
                  <li>Każda odmiana (Variety) ma własne progi GDH: kwitnienie i owocowanie</li>
                  <li>Rozróżnienie: zimowane w tunelu / long canes / sezon jesienny</li>
                  <li>Sekcja może nadpisać próg odmiany (override) — najpierw sekcja, potem odmiana</li>
                  <li>Dzięki temu różne odmiany dają różne daty kwitnienia/owocowania na tym samym wykresie</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Wybierz sekcję (tunel)</label>
            <select
              className="w-full h-10 border rounded-md px-3 text-sm bg-white"
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
            >
              <option value="">— Wybierz sekcję —</option>
              {sectionsWithData.length > 0 && (
                <optgroup label="Z danymi temperatury">
                  {sectionsWithData.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.blockName} / {s.name} — {s.varietyName} ({s.currentGdh.toLocaleString('pl-PL')} GDH)
                    </option>
                  ))}
                </optgroup>
              )}
              {sections.filter(s => s.totalReadings === 0).length > 0 && (
                <optgroup label="Bez danych temperatury">
                  {sections.filter(s => s.totalReadings === 0).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.blockName} / {s.name} — {s.varietyName} (brak pomiarów)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="w-80">
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-green-600" />
              Efekt szklarniowy (offset tunelu)
            </label>
            <div className="flex items-center gap-1 mb-2">
              <button
                onClick={() => setOffsetMode('dynamic')}
                className={`flex-1 text-xs py-1.5 px-2 rounded-l-lg border transition-colors ${
                  offsetMode === 'dynamic'
                    ? 'bg-green-100 border-green-400 text-green-800 font-semibold'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                Dynamiczny (zalecane)
              </button>
              <button
                onClick={() => setOffsetMode('static')}
                className={`flex-1 text-xs py-1.5 px-2 rounded-r-lg border transition-colors ${
                  offsetMode === 'static'
                    ? 'bg-amber-100 border-amber-400 text-amber-800 font-semibold'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                Stały offset
              </button>
            </div>
            {offsetMode === 'dynamic' ? (
              <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-800">Promieniowanie słoneczne</span>
                <span className="ml-auto text-xs text-green-600">0–15°C</span>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-amber-800">Stały offset</span>
                  <span className="text-sm font-bold text-amber-700">+{staticOffset}°C</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={0.5}
                  value={staticOffset}
                  onChange={e => setStaticOffset(Number(e.target.value))}
                  className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[9px] text-amber-400 mt-0.5">
                  <span>0°C</span>
                  <span>15°C</span>
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              {offsetMode === 'dynamic'
                ? 'Offset obliczany co godzinę na podstawie promieniowania słonecznego (Open-Meteo)'
                : `Tunel jest stale cieplejszy o +${staticOffset}°C od temperatury zewnętrznej`}
            </p>
          </div>
        </div>

        {/* ── Section info ── */}
        {selectedSection && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-green-600">Sekcja</p>
                <p className="font-bold text-green-800">{selectedSection.blockName} / {selectedSection.name}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Odmiana</p>
                <p className="font-medium text-green-800">{selectedSection.varietyName}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Typ</p>
                <p className="font-medium text-green-800">
                  {selectedSection.winteredInTunnel ? 'Zimowana w tunelu' :
                   selectedSection.plantMaterialType === 'LONGCANE' ? 'Long canes' : 'Sezon jesienny'}
                </p>
              </div>
              {selectedSection.gdhStartDate && (
                <div>
                  <p className="text-xs text-green-600">GDH od (wysadzenie)</p>
                  <p className="font-medium text-green-800">{new Date(selectedSection.gdhStartDate).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-green-600">Pomiary</p>
                <p className="font-medium text-green-800">{selectedSection.totalReadings.toLocaleString('pl-PL')}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Śr. GDH/dzień (7d)</p>
                <p className="font-medium text-green-800">{avgDailyGdh}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-green-600">Aktualne GDH</p>
                <p className="text-2xl font-bold text-green-800">{selectedSection.currentGdh.toLocaleString('pl-PL')}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Chart legend (clickable toggle) ── */}
        {selectedSection && chartData.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { key: 'realGdh', label: 'Dane realne', color: 'bg-emerald-600', icon: null as React.ReactNode },
              { key: 'meteoGdh', label: 'Meteo 16d', color: 'bg-blue-500', icon: <CloudSun className="w-3 h-3" /> },
              ...(forecast?.seasonalAnomaly ? [{ key: 'bestGdh', label: '2026 ECMWF', color: 'bg-rose-500', icon: null as React.ReactNode }] : []),
              { key: 'p90Gdh', label: 'P90 ciepły', color: 'bg-orange-400', icon: null as React.ReactNode },
              { key: 'p50Gdh', label: 'P50 typowy', color: 'bg-purple-500', icon: null as React.ReactNode },
              { key: 'p10Gdh', label: 'P10 zimny', color: 'bg-sky-500', icon: null as React.ReactNode },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setVisibleLines(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer select-none ${
                  visibleLines[item.key]
                    ? 'border-gray-300 bg-white hover:bg-gray-50 shadow-sm'
                    : 'border-gray-200 bg-gray-100 opacity-40 hover:opacity-60'
                }`}
                title={visibleLines[item.key] ? `Kliknij aby ukryć: ${item.label}` : `Kliknij aby pokazać: ${item.label}`}
              >
                {item.icon || <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />}
                <span className={visibleLines[item.key] ? 'text-gray-700' : 'text-gray-400 line-through'}>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Chart ── */}
        {selectedSection && chartData.length > 0 ? (
          <div className="bg-white rounded-lg border p-4">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(chartData.length / 16))} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const pt = payload[0]?.payload as ChartPoint
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-md text-xs">
                          <p className="font-medium mb-1.5 text-gray-700">Data: {label}</p>
                          {pt.realGdh != null && <p className="text-emerald-700">Realne: <strong>{pt.realGdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                          {pt.meteoGdh != null && <p className="text-blue-600">Meteo: <strong>{pt.meteoGdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                          {pt.bestGdh != null && <p className="text-rose-600 font-semibold">2026 ECMWF: <strong>{pt.bestGdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                          {pt.p90Gdh != null && <p className="text-orange-600">P90 (ciepły): <strong>{pt.p90Gdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                          {pt.p50Gdh != null && <p className="text-purple-600">P50 (typowy): <strong>{pt.p50Gdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                          {pt.p10Gdh != null && <p className="text-sky-600">P10 (zimny): <strong>{pt.p10Gdh.toLocaleString('pl-PL')}</strong> GDH</p>}
                        </div>
                      )
                    }}
                  />

                  {/* Background zone shading */}
                  {meteoZoneStart && scenarioZoneStart && (
                    <ReferenceArea x1={meteoZoneStart} x2={scenarioZoneStart} fill="#dbeafe" fillOpacity={0.2} label={{ value: 'Meteo', fontSize: 9, fill: '#93c5fd' }} />
                  )}
                  {scenarioZoneStart && chartEnd && (
                    <ReferenceArea x1={scenarioZoneStart} x2={chartEnd} fill="#ede9fe" fillOpacity={0.15} label={{ value: 'Klimatologia', fontSize: 9, fill: '#c4b5fd' }} />
                  )}

                  {/* Lines — visibility controlled by clickable legend */}
                  <Line type="monotone" dataKey="realGdh" name="GDH realne" stroke={visibleLines.realGdh ? '#059669' : 'transparent'} strokeWidth={3} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="meteoGdh" name="Meteo 16d" stroke={visibleLines.meteoGdh ? '#3b82f6' : 'transparent'} strokeWidth={2.5} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="bestGdh" name="2026 ECMWF" stroke={visibleLines.bestGdh ? '#e11d48' : 'transparent'} strokeWidth={2.5} strokeDasharray="10 3" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="p90Gdh" name="P90 ciepły" stroke={visibleLines.p90Gdh ? '#f97316' : 'transparent'} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="p50Gdh" name="P50 typowy" stroke={visibleLines.p50Gdh ? '#8b5cf6' : 'transparent'} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="p10Gdh" name="P10 zimny" stroke={visibleLines.p10Gdh ? '#0ea5e9' : 'transparent'} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls={false} />

                  {/* Planting date vertical reference line */}
                  {plantingDateLabel && (
                    <ReferenceLine x={plantingDateLabel} stroke="#16a34a" strokeWidth={2.5} strokeDasharray="6 3"
                      label={{ value: `Wysadzenie ${new Date(selectedSection!.gdhStartDate!).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`, fill: '#16a34a', fontSize: 12, fontWeight: 600, position: 'insideTopRight' }} />
                  )}

                  {/* Threshold reference lines */}
                  {refLines.map((rl, i) => (
                    <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="6 3" strokeWidth={2}
                      label={{ value: `${rl.label} (${rl.y.toLocaleString('pl-PL')})`, fill: rl.color, fontSize: 11, position: 'right' }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : selectedSection ? (
          <div className="h-40 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed">
            <Thermometer className="w-8 h-8 mr-2 text-gray-300" />
            <p className="text-sm">Brak odczytów temperatury dla tej sekcji. Wgraj CSV z danymi Testo.</p>
          </div>
        ) : null}

        {/* ── Scenario predictions table ── */}
        {selectedSection && scenarioPredictions && (selectedSection.flowerThreshold || selectedSection.fruitThreshold) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-green-600" />
              Prognoza dat — {selectedSection.blockName} / {selectedSection.name} ({selectedSection.varietyName})
            </h3>

            {/* Progress bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {selectedSection.flowerThreshold && currentProgress?.flower != null && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-amber-800">Kwitnienie</span>
                    <span className="text-xs text-amber-600">{selectedSection.currentGdh.toLocaleString('pl-PL')} / {selectedSection.flowerThreshold.toLocaleString('pl-PL')} GDH</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-amber-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all" style={{ width: `${currentProgress.flower}%` }} />
                    </div>
                    <span className="text-sm font-bold text-amber-700 w-12 text-right">{currentProgress.flower}%</span>
                  </div>
                </div>
              )}
              {selectedSection.fruitThreshold && currentProgress?.fruit != null && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-red-800">Owocowanie</span>
                    <span className="text-xs text-red-600">{selectedSection.currentGdh.toLocaleString('pl-PL')} / {selectedSection.fruitThreshold.toLocaleString('pl-PL')} GDH</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-red-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all" style={{ width: `${currentProgress.fruit}%` }} />
                    </div>
                    <span className="text-sm font-bold text-red-700 w-12 text-right">{currentProgress.fruit}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Dates table per scenario */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Scenariusz</th>
                    {selectedSection.flowerThreshold && (
                      <th className="text-center px-4 py-2.5 font-medium text-amber-700">
                        Kwitnienie ({selectedSection.flowerThreshold.toLocaleString('pl-PL')} GDH)
                      </th>
                    )}
                    {selectedSection.fruitThreshold && (
                      <th className="text-center px-4 py-2.5 font-medium text-red-700">
                        Owocowanie ({selectedSection.fruitThreshold.toLocaleString('pl-PL')} GDH)
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scenarioPredictions.map((sc, i) => (
                    <tr key={i} className={sc.bgColor.replace('border-', 'hover:bg-').split(' ')[0]}>
                      <td className={`px-4 py-3 font-semibold ${sc.color}`}>{sc.label}</td>
                      {selectedSection.flowerThreshold && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-medium">{sc.flowerDate ?? 'Poza zasięgiem'}</span>
                            {zoneBadge(sc.flowerZone)}
                          </div>
                        </td>
                      )}
                      {selectedSection.fruitThreshold && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-medium">{sc.fruitDate ?? 'Poza zasięgiem'}</span>
                            {zoneBadge(sc.fruitZone)}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {forecast && (
              <p className="text-[11px] text-gray-400 mt-2">
                Scenariusze P10/P50/P90 obliczone z {forecast.historicalYears} lat danych historycznych.
                {forecast.historicalYears < 5 && ' Dla lepszej dokładności zalecane minimum 10 lat — pobierz więcej danych w Ustawieniach.'}
              </p>
            )}
          </div>
        )}

        {/* ── Overview table ── */}
        {sectionsWithData.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Podsumowanie sekcji z danymi</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Blok / Sekcja</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Odmiana</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">GDH</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Kwitnienie</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Owocowanie</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Pomiary</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sectionsWithData.map(s => {
                    const flProg = s.flowerThreshold ? Math.min(100, (s.currentGdh / s.flowerThreshold) * 100) : null
                    const frProg = s.fruitThreshold ? Math.min(100, (s.currentGdh / s.fruitThreshold) * 100) : null
                    return (
                      <tr key={s.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedSectionId === s.id ? 'bg-green-50' : ''}`}
                        onClick={() => setSelectedSectionId(s.id)}
                      >
                        <td className="px-3 py-2 font-medium">{s.blockName} / {s.name}</td>
                        <td className="px-3 py-2 text-gray-600">{s.varietyName}</td>
                        <td className="px-3 py-2 text-right font-bold">{s.currentGdh.toLocaleString('pl-PL')}</td>
                        <td className="px-3 py-2 text-right">
                          {flProg !== null ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-amber-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${flProg}%` }} />
                              </div>
                              <span className="text-xs text-amber-700 w-10 text-right">{flProg.toFixed(0)}%</span>
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {frProg !== null ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-red-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${frProg}%` }} />
                              </div>
                              <span className="text-xs text-red-700 w-10 text-right">{frProg.toFixed(0)}%</span>
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{s.totalReadings.toLocaleString('pl-PL')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!selectedSection && (
          <div className="text-center py-4 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
            <p className="text-sm">Wybierz sekcję z listy, aby zobaczyć szczegóły GDH i prognozę</p>
          </div>
        )}

        {!forecast && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
            Brak danych do prognozy. Upewnij się, że w Ustawieniach podano współrzędne farmy i pobrano dane historyczne pogody.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
