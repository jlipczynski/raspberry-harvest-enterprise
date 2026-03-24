'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Grid3X3, CalendarDays, FileDown, Printer } from 'lucide-react'

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyName: string
  winteredInTunnel: boolean
  plantMaterialType: string | null
  gdhStartDate: string | null
  baseTemp: number
  flowerThreshold: number | null
  fruitThreshold: number | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay {
  date: string
  gdhTunnel: number
  avgTunnelTemp?: number
}

interface ApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best?: ForecastDay[] }
    seasonalAnomaly?: { months: Array<{ month: string; anomaly: number }>; avgAnomaly: number; verdict: string } | null
    lastForecastDate: string
    historicalYears: number
  } | null
  gdhParams?: { upperTemp: number; forecastBaseTemp?: number }
}

type Scenario = 'p50' | 'p10' | 'p90'

const ALL_SCENARIOS = ['p90', 'p50', 'p10', 'best'] as const
type AllScenario = typeof ALL_SCENARIOS[number]
const SCENARIO_LABELS: Record<AllScenario, string> = {
  p90: 'P90',
  p50: 'P50',
  p10: 'P10',
  best: 'ECMWF',
}
const SCENARIO_DESCRIPTIONS: Record<AllScenario, string> = {
  p90: 'Ciepły rok — 90% lat historycznie było chłodniejszych. Najwcześniejszy start.',
  p50: 'Typowy rok — mediana historyczna. Najbardziej prawdopodobny scenariusz.',
  p10: 'Zimny rok — tylko 10% lat było chłodniejszych. Najpóźniejszy start.',
  best: 'Prognoza sezonowa ECMWF — interpolacja P10-P90 wg anomalii temperatury na nadchodzące miesiące.',
}

interface ThresholdDates {
  flowerDate: string | null
  fruitDate: string | null
}

interface WeekCell {
  weekLabel: string
  weekStart: string
  cumulativeGdh: number
  phase: 'growing' | 'flowering' | 'fruiting' | 'future'
  source: 'real' | 'meteo' | 'scenario'
  progress: number // 0-100 toward next threshold
}

interface Props {
  initialData: ApiResponse | null
  initialLoading: boolean
}

export default function GDHMatrix({ initialData, initialLoading }: Props) {
  const [data, setData] = useState<ApiResponse | null>(initialData)
  const [loading, setLoading] = useState(initialLoading)
  const [scenario, setScenario] = useState<Scenario>('p50')
  const [activeScenarios, setActiveScenarios] = useState<Set<AllScenario>>(new Set(ALL_SCENARIOS))
  const dateTableRef = useRef<HTMLDivElement>(null)

  const toggleScenario = useCallback((sc: AllScenario) => {
    setActiveScenarios(prev => {
      const next = new Set(prev)
      if (next.has(sc)) {
        if (next.size > 1) next.delete(sc) // keep at least one active
      } else {
        next.add(sc)
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
    }
  }, [initialData])

  const sections = useMemo(() => data?.sections?.filter(s => s.totalReadings > 0 || s.flowerThreshold || s.fruitThreshold) || [], [data?.sections])
  const forecast = data?.forecast

  // Build week-by-week data for each section
  const matrixData = useMemo(() => {
    if (!sections.length) return { sections: [], weeks: [] as string[], rows: [] as Array<{ section: SectionGdh; cells: WeekCell[] }> }

    const toKey = (d: string | Date) => typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)

    // Determine date range: from earliest reading to end of prediction
    const currentYear = new Date().getFullYear()
    const yearStart = `${currentYear}-01-01`

    // Build cumulative GDH timeline for each section (daily resolution)
    const sectionTimelines = sections.map(section => {
      const dailyGdh = new Map<string, number>()
      const gdhStartDate = section.gdhStartDate || ''

      // Real data
      let lastRealGdh = 0
      let lastRealDate = ''
      for (const d of section.dailyGdh) {
        const key = toKey(d.date)
        dailyGdh.set(key, d.cumulativeGdh)
        lastRealGdh = d.cumulativeGdh
        lastRealDate = key
      }

      if (!forecast) return { section, dailyGdh, lastDate: lastRealDate }

      // Per-section GDH from tunnel temp
      const upperTemp = data?.gdhParams?.upperTemp ?? 26.0
      const gdhFromDay = (day: ForecastDay): number => {
        if (day.avgTunnelTemp != null) {
          const eff = Math.min(day.avgTunnelTemp, upperTemp)
          return Math.max(0, eff - section.baseTemp) * 24
        }
        return day.gdhTunnel // fallback for old cached data
      }

      // Meteo forecast
      let cumGdh = lastRealGdh
      for (const day of forecast.meteoDays) {
        if (day.date <= lastRealDate) continue
        if (gdhStartDate && day.date < gdhStartDate) continue // skip before planting
        cumGdh += gdhFromDay(day)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      // Selected scenario
      const scenarioData = forecast.scenarios[scenario]
      for (const day of scenarioData) {
        if (gdhStartDate && day.date < gdhStartDate) continue // skip before planting
        cumGdh += gdhFromDay(day)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      const dates = [...dailyGdh.keys()].sort()
      return { section, dailyGdh, lastDate: dates[dates.length - 1] || lastRealDate }
    })

    // Determine week boundaries
    const allDates = sectionTimelines.flatMap(st => [...st.dailyGdh.keys()])
    if (allDates.length === 0) return { sections, weeks: [], rows: [] }

    const minDate = allDates.sort()[0]
    const maxDate = allDates.sort().pop()!

    // Generate weeks from start of year to max prediction date
    const weeks: Array<{ label: string; start: string; end: string }> = []
    const start = new Date(minDate < yearStart ? yearStart : minDate)
    // Align to Monday
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const end = new Date(maxDate)

    const cursor = new Date(start)
    while (cursor <= end) {
      const weekStart = cursor.toISOString().slice(0, 10)
      const weekEnd = new Date(cursor)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const label = cursor.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
      weeks.push({ label, start: weekStart, end: weekEnd.toISOString().slice(0, 10) })
      cursor.setDate(cursor.getDate() + 7)
    }

    // Build matrix rows
    const rows = sectionTimelines.map(({ section, dailyGdh }) => {
      const realDates = new Set(section.dailyGdh.map(d => toKey(d.date)))
      const lastRealDate = section.dailyGdh.length > 0 ? toKey(section.dailyGdh[section.dailyGdh.length - 1].date) : ''
      const lastMeteoDate = forecast?.meteoDays?.length ? forecast.meteoDays[forecast.meteoDays.length - 1].date : ''

      const cells: WeekCell[] = weeks.map(week => {
        // Find GDH for this week (use last day of week that has data)
        let bestGdh = 0
        let bestSource: 'real' | 'meteo' | 'scenario' = 'scenario'
        const d = new Date(week.end)
        while (d >= new Date(week.start)) {
          const key = d.toISOString().slice(0, 10)
          if (dailyGdh.has(key)) {
            bestGdh = dailyGdh.get(key)!
            if (realDates.has(key) || key <= lastRealDate) bestSource = 'real'
            else if (key <= lastMeteoDate) bestSource = 'meteo'
            else bestSource = 'scenario'
            break
          }
          d.setDate(d.getDate() - 1)
        }

        // Determine phase
        let phase: 'growing' | 'flowering' | 'fruiting' | 'future' = 'future'
        let progress = 0

        if (bestGdh > 0) {
          if (section.fruitThreshold && bestGdh >= section.fruitThreshold) {
            phase = 'fruiting'
            progress = 100
          } else if (section.flowerThreshold && bestGdh >= section.flowerThreshold) {
            phase = 'flowering'
            progress = section.fruitThreshold
              ? Math.round(((bestGdh - section.flowerThreshold) / (section.fruitThreshold - section.flowerThreshold)) * 100)
              : 100
          } else {
            phase = 'growing'
            progress = section.flowerThreshold
              ? Math.round((bestGdh / section.flowerThreshold) * 100)
              : 0
          }
        }

        return {
          weekLabel: week.label,
          weekStart: week.start,
          cumulativeGdh: bestGdh,
          phase,
          source: bestSource,
          progress: Math.min(100, Math.max(0, progress)),
        }
      })

      return { section, cells }
    })

    return { sections, weeks: weeks.map(w => w.label), rows }
  }, [sections, forecast, scenario])

  // ==================== DATE TABLE: threshold dates per section per scenario ====================
  const dateTable = useMemo(() => {
    if (!sections.length || !forecast) return []

    const toKey = (d: string | Date) => typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)

    // Helper: build cumulative GDH timeline for a section with a given scenario
    const upperTemp = data?.gdhParams?.upperTemp ?? 26.0
    const buildTimeline = (section: SectionGdh, scenarioKey: AllScenario) => {
      const dailyGdh = new Map<string, number>()
      const gdhStartDate = section.gdhStartDate || ''

      // Per-section GDH from tunnel temp
      const gdhFromDay = (day: ForecastDay): number => {
        if (day.avgTunnelTemp != null) {
          const eff = Math.min(day.avgTunnelTemp, upperTemp)
          return Math.max(0, eff - section.baseTemp) * 24
        }
        return day.gdhTunnel // fallback for old cached data
      }

      // Real data
      let lastRealGdh = 0
      let lastRealDate = ''
      for (const d of section.dailyGdh) {
        const key = toKey(d.date)
        dailyGdh.set(key, d.cumulativeGdh)
        lastRealGdh = d.cumulativeGdh
        lastRealDate = key
      }

      // Meteo 16d forecast
      let cumGdh = lastRealGdh
      for (const day of forecast.meteoDays) {
        if (day.date <= lastRealDate) continue
        if (gdhStartDate && day.date < gdhStartDate) continue
        cumGdh += gdhFromDay(day)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      // Scenario data
      const scenarioData = scenarioKey === 'best'
        ? (forecast.scenarios.best || forecast.scenarios.p50)
        : forecast.scenarios[scenarioKey]

      for (const day of scenarioData) {
        if (gdhStartDate && day.date < gdhStartDate) continue
        cumGdh += gdhFromDay(day)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      return dailyGdh
    }

    // Helper: find date when cumulative GDH crosses threshold
    const findThresholdDate = (timeline: Map<string, number>, threshold: number | null): string | null => {
      if (!threshold) return null
      const entries = [...timeline.entries()].sort(([a], [b]) => a.localeCompare(b))
      for (const [date, gdh] of entries) {
        if (gdh >= threshold) return date
      }
      return null
    }

    return sections.map(section => {
      const scenarioResults: Record<AllScenario, ThresholdDates> = {} as Record<AllScenario, ThresholdDates>

      for (const sc of ALL_SCENARIOS) {
        const timeline = buildTimeline(section, sc)
        scenarioResults[sc] = {
          flowerDate: findThresholdDate(timeline, section.flowerThreshold),
          fruitDate: findThresholdDate(timeline, section.fruitThreshold),
        }
      }

      return {
        section,
        scenarios: scenarioResults,
      }
    })
  }, [sections, forecast])

  const visibleScenarios = useMemo(() => ALL_SCENARIOS.filter(sc => activeScenarios.has(sc)), [activeScenarios])

  const handleExportPdf = useCallback(async () => {
    if (!dateTable.length) return
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Daty kwitnienia i owocowania', 14, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Scenariusze: ${visibleScenarios.map(s => SCENARIO_LABELS[s]).join(', ')}  |  Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, 14, 22)

    const fmtDate = (d: string | null) => {
      if (!d) return '—'
      return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
    }

    const head = [
      ['Sekcja', ...visibleScenarios.map(sc => `Kwit. ${SCENARIO_LABELS[sc]}`), ...visibleScenarios.map(sc => `Owoc. ${SCENARIO_LABELS[sc]}`)]
    ]

    const body = dateTable.map(({ section, scenarios }) => [
      `${section.blockName}/${section.name} (${section.varietyName})`,
      ...visibleScenarios.map(sc => fmtDate(scenarios[sc].flowerDate)),
      ...visibleScenarios.map(sc => fmtDate(scenarios[sc].fruitDate)),
    ])

    autoTable(doc, {
      startY: 26,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    })

    doc.save(`daty-kwitnienia-owocowania-${new Date().toISOString().slice(0, 10)}.pdf`)
  }, [dateTable, visibleScenarios])

  const handlePrint = useCallback(() => {
    if (!dateTableRef.current) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const tableHtml = dateTableRef.current.innerHTML

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Daty kwitnienia i owocowania</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #1f2937; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        .meta { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; }
        th { background: #f3f4f6; font-weight: 600; }
        td:first-child { text-align: left; font-weight: 500; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>Daty kwitnienia i owocowania</h1>
      <p class="meta">Scenariusze: ${visibleScenarios.map(s => SCENARIO_LABELS[s]).join(', ')} | Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}</p>
      ${tableHtml}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`)
    printWindow.document.close()
  }, [visibleScenarios])

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />Ładowanie macierzy...
    </CardContent></Card>
  )

  if (sections.length === 0) return null

  // Color helpers
  const cellBg = (cell: WeekCell) => {
    if (cell.cumulativeGdh === 0) return 'bg-gray-50'
    if (cell.phase === 'fruiting') return 'bg-red-400'
    if (cell.phase === 'flowering') return 'bg-amber-400'
    // Growing: green gradient by progress
    const intensity = Math.round((cell.progress / 100) * 5) // 0-5 steps
    const greens = ['bg-emerald-50', 'bg-emerald-100', 'bg-emerald-200', 'bg-emerald-300', 'bg-emerald-400', 'bg-emerald-500']
    return greens[Math.min(intensity, 5)]
  }

  const cellTextColor = (cell: WeekCell) => {
    if (cell.phase === 'fruiting') return 'text-white'
    if (cell.phase === 'flowering') return 'text-amber-900'
    if (cell.progress > 60) return 'text-emerald-900'
    return 'text-gray-600'
  }

  const sourceIndicator = (cell: WeekCell) => {
    if (cell.cumulativeGdh === 0) return ''
    if (cell.source === 'real') return ''
    if (cell.source === 'meteo') return ' border-b-2 border-blue-400'
    return ' border-b-2 border-purple-300 border-dashed'
  }

  // Find "today" column
  const todayStr = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })

  return (
    <Card className="border-purple-200">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-purple-600" />
              Macierz plantacji — widok całości
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Oś X = tygodnie, Oś Y = sekcje. Kolor = faza wzrostu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Scenariusz:</span>
            <select
              className="h-8 border rounded-md px-2 text-xs bg-white"
              value={scenario}
              onChange={e => setScenario(e.target.value as Scenario)}
            >
              <option value="p90">P90 — ciepły rok</option>
              <option value="p50">P50 — typowy rok</option>
              <option value="p10">P10 — zimny rok</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-100 border" />
            <div className="w-4 h-4 rounded bg-emerald-300 border" />
            <div className="w-4 h-4 rounded bg-emerald-500 border" />
            <span className="text-gray-600">Wzrost (gradient GDH)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-amber-400 border" />
            <span className="text-gray-600">Kwitnienie</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-400 border" />
            <span className="text-gray-600">Owocowanie</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-blue-400" />
            <span className="text-gray-600">Meteo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 border-b-2 border-dashed border-purple-400" />
            <span className="text-gray-600">Klimatologia</span>
          </div>
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-medium text-gray-600 min-w-[140px] border-b">
                  Sekcja
                </th>
                {matrixData.weeks.map((w, i) => (
                  <th key={i} className={`px-0.5 py-1.5 text-center font-medium border-b min-w-[38px] ${w === todayStr ? 'bg-blue-100 text-blue-800' : 'text-gray-500'}`}>
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixData.rows.map(({ section, cells }) => (
                <tr key={section.id} className="hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 border-b border-r font-medium text-gray-800">
                    <div className="truncate max-w-[140px]" title={`${section.blockName} / ${section.name}`}>
                      <span className="text-gray-400">{section.blockName}/</span>{section.name}
                    </div>
                    <div className="text-[9px] text-gray-400 truncate">{section.varietyName}</div>
                  </td>
                  {cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`px-0 py-0 border-b text-center ${cellBg(cell)} ${cellTextColor(cell)}${sourceIndicator(cell)} ${matrixData.weeks[i] === todayStr ? 'ring-1 ring-blue-400 ring-inset' : ''}`}
                      title={`${section.blockName}/${section.name}\n${cell.weekLabel}: ${cell.cumulativeGdh.toLocaleString('pl-PL')} GDH\n${cell.phase === 'fruiting' ? 'OWOCOWANIE' : cell.phase === 'flowering' ? 'KWITNIENIE' : `Wzrost ${cell.progress}%`}\nŹródło: ${cell.source === 'real' ? 'odczyty' : cell.source === 'meteo' ? 'meteo' : 'klimatologia'}`}
                    >
                      <div className="h-7 flex items-center justify-center">
                        {cell.phase === 'fruiting' && <span className="font-bold">Z</span>}
                        {cell.phase === 'flowering' && <span className="font-bold">K</span>}
                        {cell.phase === 'growing' && cell.cumulativeGdh > 0 && (
                          <span className="opacity-70">{cell.progress > 0 ? cell.progress : ''}</span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary below matrix */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const flowerDates = matrixData.rows.map(r => {
              const flowerCell = r.cells.find(c => c.phase === 'flowering' || c.phase === 'fruiting')
              return flowerCell ? flowerCell.weekStart : null
            }).filter(Boolean) as string[]
            const fruitDates = matrixData.rows.map(r => {
              const fruitCell = r.cells.find(c => c.phase === 'fruiting')
              return fruitCell ? fruitCell.weekStart : null
            }).filter(Boolean) as string[]

            const earliest = (dates: string[]) => dates.length ? new Date(dates.sort()[0]).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }) : '—'
            const latest = (dates: string[]) => dates.length ? new Date(dates.sort().pop()!).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }) : '—'

            return (
              <>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
                  <p className="text-xs text-amber-600">Pierwsze kwitnienie</p>
                  <p className="text-lg font-bold text-amber-800">{earliest(flowerDates)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
                  <p className="text-xs text-amber-600">Ostatnie kwitnienie</p>
                  <p className="text-lg font-bold text-amber-800">{latest(flowerDates)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                  <p className="text-xs text-red-600">Pierwszy zbiór</p>
                  <p className="text-lg font-bold text-red-800">{earliest(fruitDates)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                  <p className="text-xs text-red-600">Ostatni zbiór</p>
                  <p className="text-lg font-bold text-red-800">{latest(fruitDates)}</p>
                </div>
              </>
            )
          })()}
        </div>
        {/* ==================== DATE TABLE: all sections × filtered scenarios ==================== */}
        {dateTable.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">Daty kwitnienia i owocowania</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Drukuj
                </button>
              </div>
            </div>

            {/* Scenario toggle boxes */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
              {ALL_SCENARIOS.map(sc => {
                const isActive = activeScenarios.has(sc)
                return (
                  <button
                    key={sc}
                    onClick={() => toggleScenario(sc)}
                    className={`rounded-lg p-2 border text-left transition-all ${
                      isActive
                        ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-400/50'
                        : 'bg-gray-50 border-gray-200 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        isActive ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 bg-white'
                      }`}>
                        {isActive && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="font-semibold text-gray-700">{SCENARIO_LABELS[sc]}</span>
                    </div>
                    <p className="text-gray-500 mt-1">{SCENARIO_DESCRIPTIONS[sc]}</p>
                    {sc === 'best' && forecast?.seasonalAnomaly && (
                      <p className="mt-1 text-indigo-600 font-medium">
                        Anomalia: {forecast.seasonalAnomaly.avgAnomaly > 0 ? '+' : ''}{forecast.seasonalAnomaly.avgAnomaly}°C ({forecast.seasonalAnomaly.verdict})
                      </p>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="overflow-x-auto" ref={dateTableRef}>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th rowSpan={2} className="sticky left-0 z-10 bg-white text-left px-3 py-2 font-medium text-gray-600 min-w-[160px] border-r">
                      Sekcja
                    </th>
                    {visibleScenarios.length > 0 && (
                      <th colSpan={visibleScenarios.length} className="px-2 py-1.5 text-center font-semibold text-amber-700 bg-amber-50 border-b border-amber-200">
                        Kwitnienie
                      </th>
                    )}
                    {visibleScenarios.length > 0 && (
                      <th colSpan={visibleScenarios.length} className="px-2 py-1.5 text-center font-semibold text-red-700 bg-red-50 border-b border-red-200">
                        Owocowanie (start zbiorów)
                      </th>
                    )}
                  </tr>
                  <tr className="border-b">
                    {visibleScenarios.map(sc => (
                      <th key={`f-${sc}`} className="px-2 py-1.5 text-center font-medium text-amber-600 bg-amber-50/50 min-w-[80px]">
                        {SCENARIO_LABELS[sc]}
                      </th>
                    ))}
                    {visibleScenarios.map(sc => (
                      <th key={`r-${sc}`} className="px-2 py-1.5 text-center font-medium text-red-600 bg-red-50/50 min-w-[80px]">
                        {SCENARIO_LABELS[sc]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateTable.map(({ section, scenarios }) => {
                    const fmtDate = (d: string | null) => {
                      if (!d) return '—'
                      return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
                    }

                    // Highlight earliest fruit date among visible scenarios
                    const fruitDates = visibleScenarios.map(sc => scenarios[sc].fruitDate).filter(Boolean) as string[]
                    const earliestFruit = fruitDates.length > 0 ? fruitDates.sort()[0] : null

                    return (
                      <tr key={section.id} className="border-b hover:bg-gray-50/50">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r">
                          <div className="font-medium text-gray-800">
                            <span className="text-gray-400">{section.blockName}/</span>{section.name}
                          </div>
                          <div className="text-[10px] text-gray-400">{section.varietyName}</div>
                        </td>
                        {visibleScenarios.map(sc => (
                          <td key={`f-${sc}`} className="px-2 py-2 text-center">
                            <span className={scenarios[sc].flowerDate ? 'text-amber-700 font-medium' : 'text-gray-300'}>
                              {fmtDate(scenarios[sc].flowerDate)}
                            </span>
                          </td>
                        ))}
                        {visibleScenarios.map(sc => (
                          <td key={`r-${sc}`} className="px-2 py-2 text-center">
                            <span className={`${scenarios[sc].fruitDate ? 'text-red-700 font-medium' : 'text-gray-300'} ${scenarios[sc].fruitDate === earliestFruit ? 'underline decoration-2' : ''}`}>
                              {fmtDate(scenarios[sc].fruitDate)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
