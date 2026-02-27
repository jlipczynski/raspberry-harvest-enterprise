'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'
import { TrendingUp, Thermometer, Target, Loader2, CloudSun, CalendarDays } from 'lucide-react'

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyId: string
  varietyName: string
  winteredInTunnel: boolean
  plantingDate: string | null
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
  gdhOutside: number
  gdhTunnel: number
}

interface ApiResponse {
  sections: SectionGdh[]
  farmWeather: Array<{ date: string; tempMin: number; tempMax: number }>
  forecast: {
    meteoDays: ForecastDay[]
    historicalDays: ForecastDay[]
    lastForecastDate: string
    tunnelModel: { alpha: number; offset: number }
  } | null
  gdhParams: { baseTemp: number; upperTemp: number }
}

interface ChartPoint {
  date: string
  dateLabel: string
  // Real data from CSV readings
  realGdh: number | null
  // Meteo forecast (16 days)
  meteoGdh: number | null
  // Historical prediction (day 17+)
  histGdh: number | null
  // Zone marker for coloring
  zone: 'real' | 'meteo' | 'historical'
}

export default function GDHModule() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [tunnelOffset, setTunnelOffset] = useState(4)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/gdh')
        const json = await res.json()
        setData(json)
        if (json.forecast?.tunnelModel?.offset) {
          setTunnelOffset(json.forecast.tunnelModel.offset)
        }
      } catch (e) {
        console.error('Error fetching GDH data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const sections = data?.sections || []
  const forecast = data?.forecast
  const selectedSection = sections.find(s => s.id === selectedSectionId)
  const sectionsWithData = sections.filter(s => s.totalReadings > 0)

  // Build chart data: 3 zones
  const { chartData, meteoStartIdx, histStartIdx } = useMemo(() => {
    const points: ChartPoint[] = []
    if (!selectedSection) return { chartData: points, meteoStartIdx: -1, histStartIdx: -1 }

    const toLabel = (d: string) => {
      const date = new Date(d)
      return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
    }

    // Zone 1: Real data from CSV readings
    let lastCumulativeGdh = 0
    for (const d of selectedSection.dailyGdh) {
      const dateStr = typeof d.date === 'string' ? d.date.slice(0, 10) : new Date(d.date).toISOString().slice(0, 10)
      points.push({
        date: dateStr,
        dateLabel: toLabel(dateStr),
        realGdh: d.cumulativeGdh,
        meteoGdh: null,
        histGdh: null,
        zone: 'real',
      })
      lastCumulativeGdh = d.cumulativeGdh
    }

    // Bridge point: last real also starts meteo prediction
    const meteoStart = points.length

    // Zone 2: Meteo forecast (16 days)
    if (forecast?.meteoDays) {
      let cumGdh = lastCumulativeGdh
      const lastRealDate = points.length > 0 ? points[points.length - 1].date : ''

      // Bridge: set meteoGdh on last real point
      if (points.length > 0) {
        points[points.length - 1].meteoGdh = lastCumulativeGdh
      }

      for (const day of forecast.meteoDays) {
        if (day.date <= lastRealDate) continue // skip days we have real data for
        // Use tunnel GDH since sections are in tunnels
        cumGdh += selectedSection.winteredInTunnel ? day.gdhTunnel : day.gdhOutside
        points.push({
          date: day.date,
          dateLabel: toLabel(day.date),
          realGdh: null,
          meteoGdh: Math.round(cumGdh),
          histGdh: null,
          zone: 'meteo',
        })
      }
    }

    // Bridge point: last meteo also starts historical
    const histStart = points.length

    // Zone 3: Historical prediction (day 17+)
    if (forecast?.historicalDays) {
      const lastMeteoPoints = points.filter(p => p.meteoGdh !== null)
      let cumGdh = lastMeteoPoints.length > 0
        ? lastMeteoPoints[lastMeteoPoints.length - 1].meteoGdh!
        : lastCumulativeGdh

      // Bridge: set histGdh on last meteo point
      if (lastMeteoPoints.length > 0) {
        lastMeteoPoints[lastMeteoPoints.length - 1].histGdh = cumGdh
      } else if (points.length > 0) {
        // No meteo data, bridge from last real
        points[points.length - 1].histGdh = lastCumulativeGdh
      }

      for (const day of forecast.historicalDays) {
        cumGdh += selectedSection.winteredInTunnel ? day.gdhTunnel : day.gdhOutside
        points.push({
          date: day.date,
          dateLabel: toLabel(day.date),
          realGdh: null,
          meteoGdh: null,
          histGdh: Math.round(cumGdh),
          zone: 'historical',
        })
      }
    }

    return { chartData: points, meteoStartIdx: meteoStart, histStartIdx: histStart }
  }, [selectedSection, forecast])

  // Reference lines for thresholds
  const refLines = useMemo(() => {
    if (!selectedSection) return []
    const lines: Array<{ y: number; label: string; color: string }> = []
    if (selectedSection.flowerThreshold) {
      lines.push({ y: selectedSection.flowerThreshold, label: 'Kwitnienie', color: '#f59e0b' })
    }
    if (selectedSection.fruitThreshold) {
      lines.push({ y: selectedSection.fruitThreshold, label: 'Owocowanie', color: '#ef4444' })
    }
    return lines
  }, [selectedSection])

  // Predict dates from chart data
  const predictions = useMemo(() => {
    if (!selectedSection) return null

    const findDate = (threshold: number | null) => {
      if (!threshold) return null
      // Look through all chart points to find when cumulative GDH crosses threshold
      for (const pt of chartData) {
        const gdh = pt.realGdh ?? pt.meteoGdh ?? pt.histGdh
        if (gdh !== null && gdh >= threshold) {
          const zone = pt.zone
          return {
            date: new Date(pt.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }),
            zone,
            progress: 100,
          }
        }
      }
      // Not reached in prediction window
      const lastGdh = (() => {
        for (let i = chartData.length - 1; i >= 0; i--) {
          const g = chartData[i].realGdh ?? chartData[i].meteoGdh ?? chartData[i].histGdh
          if (g !== null) return g
        }
        return 0
      })()
      return {
        date: 'Poza zasięgiem prognozy',
        zone: 'unknown' as const,
        progress: Math.min(99, Math.round((lastGdh / threshold) * 100)),
      }
    }

    return {
      flower: findDate(selectedSection.flowerThreshold),
      fruit: findDate(selectedSection.fruitThreshold),
      currentGdh: selectedSection.currentGdh,
    }
  }, [selectedSection, chartData])

  // Avg daily GDH from last 7 days of real readings
  const avgDailyGdh = useMemo(() => {
    if (!selectedSection || selectedSection.dailyGdh.length < 2) return 0
    const data = selectedSection.dailyGdh
    const n = Math.min(7, data.length)
    const last = data.slice(-n)
    return Math.round((last[last.length - 1].cumulativeGdh - last[0].cumulativeGdh) / n)
  }, [selectedSection])

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />Ładowanie modułu GDH...
    </CardContent></Card>
  )

  // Find date labels for zone boundaries (for ReferenceArea)
  const meteoStartLabel = meteoStartIdx >= 0 && meteoStartIdx < chartData.length ? chartData[meteoStartIdx]?.dateLabel : null
  const histStartLabel = histStartIdx >= 0 && histStartIdx < chartData.length ? chartData[histStartIdx]?.dateLabel : null
  const chartEndLabel = chartData.length > 0 ? chartData[chartData.length - 1].dateLabel : null

  return (
    <Card className="border-green-200">
      <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          GDH — Godziny Wzrostu (Growing Degree Hours)
        </CardTitle>
        <p className="text-sm text-gray-500">
          T_baz = {data?.gdhParams?.baseTemp ?? 4.5}°C, T_max = {data?.gdhParams?.upperTemp ?? 26}°C
          {' '}&bull; Formuła: GDH = &Sigma; max(0, min(T, {data?.gdhParams?.upperTemp ?? 26}) - {data?.gdhParams?.baseTemp ?? 4.5}) &times; &Delta;t
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Controls */}
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
          <div className="w-64">
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-green-600" />
              Efekt tunelowy: <span className="text-green-700 font-bold">+{tunnelOffset}°C</span>
            </label>
            <input
              type="range" min="0" max="10" step="0.5"
              value={tunnelOffset}
              onChange={e => setTunnelOffset(+e.target.value)}
              className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0°C</span><span>+5°C</span><span>+10°C</span>
            </div>
          </div>
        </div>

        {/* Section info */}
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
              <div>
                <p className="text-xs text-green-600">Pomiary</p>
                <p className="font-medium text-green-800">{selectedSection.totalReadings.toLocaleString('pl-PL')}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Śr. dzienne GDH (7d)</p>
                <p className="font-medium text-green-800">{avgDailyGdh}/dzień</p>
              </div>
              <div className="ml-auto">
                <p className="text-xs text-green-600">Aktualne GDH</p>
                <p className="text-2xl font-bold text-green-800">{selectedSection.currentGdh.toLocaleString('pl-PL')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Legend for zones */}
        {selectedSection && chartData.length > 0 && (
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 bg-emerald-600 rounded" />
              <span className="text-gray-600">Dane realne (odczyty z tunelu)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CloudSun className="w-3.5 h-3.5 text-blue-500" />
              <div className="w-8 h-1 bg-blue-500 rounded" style={{ background: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 6px, transparent 6px, transparent 10px)' }} />
              <span className="text-gray-600">Prognoza meteo (16 dni)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-purple-500" />
              <div className="w-8 h-1 rounded" style={{ background: 'repeating-linear-gradient(90deg, #8b5cf6 0, #8b5cf6 4px, transparent 4px, transparent 8px)' }} />
              <span className="text-gray-600">Prognoza historyczna (średnia lat ubiegłych)</span>
            </div>
          </div>
        )}

        {/* Chart */}
        {selectedSection && chartData.length > 0 ? (
          <div className="bg-white rounded-lg border p-4">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(1, Math.floor(chartData.length / 16))}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const pt = payload[0]?.payload as ChartPoint
                      const zoneLabel = pt?.zone === 'real' ? 'Odczyt z tunelu' : pt?.zone === 'meteo' ? 'Prognoza meteo' : 'Prognoza historyczna'
                      const gdh = pt?.realGdh ?? pt?.meteoGdh ?? pt?.histGdh
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-md text-xs">
                          <p className="font-medium mb-1 text-gray-700">Data: {label}</p>
                          <p className="text-gray-500 mb-1">{zoneLabel}</p>
                          {gdh != null && (
                            <p className="font-bold text-gray-800">GDH: {gdh.toLocaleString('pl-PL')}</p>
                          )}
                        </div>
                      )
                    }}
                  />

                  {/* Background zones */}
                  {meteoStartLabel && histStartLabel && (
                    <ReferenceArea x1={meteoStartLabel} x2={histStartLabel} fill="#dbeafe" fillOpacity={0.3} />
                  )}
                  {histStartLabel && chartEndLabel && (
                    <ReferenceArea x1={histStartLabel} x2={chartEndLabel} fill="#ede9fe" fillOpacity={0.3} />
                  )}

                  {/* Zone 1: Real data - solid green */}
                  <Line type="monotone" dataKey="realGdh" name="GDH realne"
                    stroke="#059669" strokeWidth={3} dot={false} connectNulls={false} />

                  {/* Zone 2: Meteo forecast - dashed blue */}
                  <Line type="monotone" dataKey="meteoGdh" name="Prognoza meteo (16d)"
                    stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="8 4" dot={false} connectNulls={false} />

                  {/* Zone 3: Historical prediction - dashed purple */}
                  <Line type="monotone" dataKey="histGdh" name="Prognoza historyczna"
                    stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />

                  {/* Threshold reference lines */}
                  {refLines.map((rl, i) => (
                    <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="6 3" strokeWidth={2}
                      label={{ value: `${rl.label} (${rl.y.toLocaleString('pl-PL')} GDH)`, fill: rl.color, fontSize: 11, position: 'right' }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : selectedSection ? (
          <div className="h-40 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed">
            <div className="text-center">
              <Thermometer className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Brak odczytów temperatury dla tej sekcji. Wgraj CSV z danymi Testo.</p>
            </div>
          </div>
        ) : null}

        {/* Progress bars */}
        {selectedSection && predictions && (predictions.flower || predictions.fruit) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-green-600" />
              Prognoza — {selectedSection.blockName} / {selectedSection.name} ({selectedSection.varietyName})
            </h3>

            {predictions.flower && selectedSection.flowerThreshold && (
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-800">Kwitnienie</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                      {selectedSection.flowerThreshold.toLocaleString('pl-PL')} GDH
                    </span>
                    <span className={`text-sm font-bold ${
                      predictions.flower.zone === 'real' ? 'text-emerald-700' :
                      predictions.flower.zone === 'meteo' ? 'text-blue-700' :
                      predictions.flower.zone === 'historical' ? 'text-purple-700' : 'text-gray-500'
                    }`}>
                      {predictions.flower.date}
                    </span>
                    {predictions.flower.zone !== 'unknown' && predictions.flower.zone !== 'real' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        predictions.flower.zone === 'meteo' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                      }`}>
                        {predictions.flower.zone === 'meteo' ? 'z prognozy meteo' : 'z danych historycznych'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${predictions.flower.progress}%` }} />
                  </div>
                  <span className="text-sm font-bold text-amber-700 w-14 text-right">{predictions.flower.progress}%</span>
                </div>
              </div>
            )}

            {predictions.fruit && selectedSection.fruitThreshold && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-red-800">Owocowanie (pierwszy zbiór)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full">
                      {selectedSection.fruitThreshold.toLocaleString('pl-PL')} GDH
                    </span>
                    <span className={`text-sm font-bold ${
                      predictions.fruit.zone === 'real' ? 'text-emerald-700' :
                      predictions.fruit.zone === 'meteo' ? 'text-blue-700' :
                      predictions.fruit.zone === 'historical' ? 'text-purple-700' : 'text-gray-500'
                    }`}>
                      {predictions.fruit.date}
                    </span>
                    {predictions.fruit.zone !== 'unknown' && predictions.fruit.zone !== 'real' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        predictions.fruit.zone === 'meteo' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                      }`}>
                        {predictions.fruit.zone === 'meteo' ? 'z prognozy meteo' : 'z danych historycznych'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-red-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${predictions.fruit.progress}%` }} />
                  </div>
                  <span className="text-sm font-bold text-red-700 w-14 text-right">{predictions.fruit.progress}%</span>
                </div>
              </div>
            )}

            {!selectedSection.flowerThreshold && !selectedSection.fruitThreshold && (
              <p className="text-sm text-gray-400 text-center py-2">
                Brak progów GDH dla tej odmiany. Ustaw progi w zakładce Odmiany.
              </p>
            )}
          </div>
        )}

        {/* Overview table */}
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

        {/* No forecast data warning */}
        {!forecast && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
            Brak danych do prognozy. Upewnij się, że w Ustawieniach podano współrzędne farmy (szerokość/długość geograficzną) i pobrano dane historyczne pogody.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
