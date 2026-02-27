'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Grid3X3 } from 'lucide-react'

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyName: string
  winteredInTunnel: boolean
  plantMaterialType: string | null
  flowerThreshold: number | null
  fruitThreshold: number | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay {
  date: string
  gdhTunnel: number
}

interface ApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[] }
    lastForecastDate: string
    historicalYears: number
  } | null
}

type Scenario = 'p50' | 'p10' | 'p90'

interface WeekCell {
  weekLabel: string
  weekStart: string
  cumulativeGdh: number
  phase: 'growing' | 'flowering' | 'fruiting' | 'future'
  source: 'real' | 'meteo' | 'scenario'
  progress: number // 0-100 toward next threshold
}

export default function GDHMatrix() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [scenario, setScenario] = useState<Scenario>('p50')

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/gdh')
        const json = await res.json()
        setData(json)
      } catch (e) {
        console.error('Error fetching GDH matrix data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const sections = data?.sections?.filter(s => s.totalReadings > 0 || s.flowerThreshold || s.fruitThreshold) || []
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

      // Meteo forecast
      let cumGdh = lastRealGdh
      for (const day of forecast.meteoDays) {
        if (day.date <= lastRealDate) continue
        cumGdh += day.gdhTunnel
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      // Selected scenario
      const scenarioData = forecast.scenarios[scenario]
      for (const day of scenarioData) {
        cumGdh += day.gdhTunnel
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

            const earliest = (dates: string[]) => dates.length ? new Date(dates.sort()[0]).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : '—'
            const latest = (dates: string[]) => dates.length ? new Date(dates.sort().pop()!).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : '—'

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
      </CardContent>
    </Card>
  )
}
