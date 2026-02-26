'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingUp, Thermometer, Target, Loader2 } from 'lucide-react'

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyId: string
  varietyName: string
  baseTemp: number
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

interface FarmWeather {
  date: string
  tempMin: number
  tempMax: number
  gdhDaily: number
  gdhCumulative: number
}

interface ChartPoint {
  dateLabel: string
  sectionGdh: number | null
  sectionPredGdh: number | null
  outsideGdh: number | null
  tunnelGdh: number | null
  outsidePredGdh: number | null
  tunnelPredGdh: number | null
}

export default function GDHModule() {
  const [sections, setSections] = useState<SectionGdh[]>([])
  const [farmWeather, setFarmWeather] = useState<FarmWeather[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [tunnelOffset, setTunnelOffset] = useState(4)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/gdh')
        const data = await res.json()
        setSections(data.sections || [])
        setFarmWeather(data.farmWeather || [])
      } catch (e) {
        console.error('Error fetching GDH data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const selectedSection = sections.find(s => s.id === selectedSectionId)
  const baseTemp = selectedSection?.baseTemp ?? 6.0

  // Sections with actual temperature data
  const sectionsWithData = sections.filter(s => s.totalReadings > 0)

  // Farm weather GDH calculation (outside + tunnel offset)
  const weatherGdh = useMemo(() => {
    if (!farmWeather.length) return { days: [] as Array<{ date: string; dateLabel: string; outsideGdh: number; tunnelGdh: number }>, currentOutside: 0, currentTunnel: 0, avgDailyOutside: 0, avgDailyTunnel: 0 }

    const currentYear = new Date().getFullYear()
    const sorted = [...farmWeather]
      .filter(w => new Date(w.date).getFullYear() === currentYear)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let cumOutside = 0
    let cumTunnel = 0

    const days = sorted.map(w => {
      const avg = (w.tempMax + w.tempMin) / 2
      cumOutside += Math.max(0, avg - baseTemp) * 24
      cumTunnel += Math.max(0, avg + tunnelOffset - baseTemp) * 24
      return {
        date: w.date,
        dateLabel: new Date(w.date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
        outsideGdh: Math.round(cumOutside),
        tunnelGdh: Math.round(cumTunnel),
      }
    })

    const n = Math.min(14, days.length)
    const last = days.slice(-n)
    const avgDailyOutside = n >= 2 ? (last[last.length - 1].outsideGdh - last[0].outsideGdh) / n : 0
    const avgDailyTunnel = n >= 2 ? (last[last.length - 1].tunnelGdh - last[0].tunnelGdh) / n : 0

    return {
      days,
      currentOutside: days.length > 0 ? days[days.length - 1].outsideGdh : 0,
      currentTunnel: days.length > 0 ? days[days.length - 1].tunnelGdh : 0,
      avgDailyOutside,
      avgDailyTunnel,
    }
  }, [farmWeather, baseTemp, tunnelOffset])

  // Section GDH prediction (avg daily from last 14 days of readings)
  const sectionPrediction = useMemo(() => {
    if (!selectedSection || selectedSection.dailyGdh.length === 0) return { avgDaily: 0 }
    const data = selectedSection.dailyGdh
    const n = Math.min(14, data.length)
    const last = data.slice(-n)
    const avgDaily = n >= 2 ? (last[last.length - 1].cumulativeGdh - last[0].cumulativeGdh) / n : 0
    return { avgDaily }
  }, [selectedSection])

  // Build chart data: merge section readings + farm weather + predictions
  const chartData = useMemo(() => {
    const dateMap = new Map<string, ChartPoint>()

    const toKey = (d: string) => new Date(d).toISOString().slice(0, 10)
    const toLabel = (d: string) => new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })

    // Add farm weather data
    for (const w of weatherGdh.days) {
      const key = toKey(w.date)
      dateMap.set(key, {
        dateLabel: w.dateLabel,
        sectionGdh: null,
        sectionPredGdh: null,
        outsideGdh: w.outsideGdh,
        tunnelGdh: w.tunnelGdh,
        outsidePredGdh: null,
        tunnelPredGdh: null,
      })
    }

    // Overlay section data if selected
    if (selectedSection && selectedSection.dailyGdh.length > 0) {
      for (const d of selectedSection.dailyGdh) {
        const key = toKey(d.date)
        const existing = dateMap.get(key)
        if (existing) {
          existing.sectionGdh = d.cumulativeGdh
        } else {
          dateMap.set(key, {
            dateLabel: toLabel(d.date),
            sectionGdh: d.cumulativeGdh,
            sectionPredGdh: null,
            outsideGdh: null,
            tunnelGdh: null,
            outsidePredGdh: null,
            tunnelPredGdh: null,
          })
        }
      }
    }

    // Sort by date
    const sorted = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)

    if (sorted.length === 0) return sorted

    // Add predictions (120 days)
    const lastPoint = sorted[sorted.length - 1]
    const lastDate = [...dateMap.keys()].sort().pop()!

    // Bridge point for predictions
    lastPoint.outsidePredGdh = lastPoint.outsideGdh
    lastPoint.tunnelPredGdh = lastPoint.tunnelGdh
    if (selectedSection && selectedSection.dailyGdh.length > 0) {
      lastPoint.sectionPredGdh = lastPoint.sectionGdh ?? selectedSection.currentGdh
    }

    const avgOut = weatherGdh.avgDailyOutside
    const avgTun = weatherGdh.avgDailyTunnel
    const avgSec = sectionPrediction.avgDaily

    if (avgOut > 0 || avgTun > 0 || avgSec > 0) {
      let predOut = lastPoint.outsideGdh ?? weatherGdh.currentOutside
      let predTun = lastPoint.tunnelGdh ?? weatherGdh.currentTunnel
      let predSec = selectedSection?.currentGdh ?? 0
      const base = new Date(lastDate)

      for (let i = 1; i <= 120; i++) {
        const d = new Date(base)
        d.setDate(d.getDate() + i)
        predOut += avgOut
        predTun += avgTun
        predSec += avgSec
        sorted.push({
          dateLabel: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
          sectionGdh: null,
          sectionPredGdh: selectedSection && avgSec > 0 ? Math.round(predSec) : null,
          outsideGdh: null,
          tunnelGdh: null,
          outsidePredGdh: avgOut > 0 ? Math.round(predOut) : null,
          tunnelPredGdh: avgTun > 0 ? Math.round(predTun) : null,
        })
      }
    }

    return sorted
  }, [weatherGdh, selectedSection, sectionPrediction])

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

  // Progress and date predictions for selected section
  const sectionProgress = useMemo(() => {
    if (!selectedSection) return null
    const current = selectedSection.currentGdh
    const avgDaily = sectionPrediction.avgDaily
    const avgDailyWeatherTunnel = weatherGdh.avgDailyTunnel
    const avgDailyWeatherOutside = weatherGdh.avgDailyOutside

    // Use section's own avg if available, else fall back to weather
    const bestAvg = avgDaily > 0 ? avgDaily : (selectedSection.winteredInTunnel ? avgDailyWeatherTunnel : avgDailyWeatherOutside)

    const calcDate = (threshold: number | null) => {
      if (!threshold) return null
      const remaining = Math.max(0, threshold - current)
      if (remaining <= 0) return { progress: 100, date: 'Osiagnięto!', days: 0 }
      const days = bestAvg > 0 ? Math.ceil(remaining / bestAvg) : 999
      const d = new Date(); d.setDate(d.getDate() + days)
      return {
        progress: Math.min(100, (current / threshold) * 100),
        date: days > 365 ? 'Brak danych' : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }),
        days,
      }
    }

    return {
      flower: calcDate(selectedSection.flowerThreshold),
      fruit: calcDate(selectedSection.fruitThreshold),
    }
  }, [selectedSection, sectionPrediction, weatherGdh])

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />Ładowanie modułu GDH...
    </CardContent></Card>
  )

  return (
    <Card className="border-green-200">
      <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Moduł GDH — Godziny Wzrostu
        </CardTitle>
        <p className="text-sm text-gray-500">
          Postęp akumulacji ciepła per sekcja i prognoza dat kwitnienia/owocowania
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
                      {s.blockName} / {s.name} — {s.varietyName} ({s.totalReadings} pomiarów, {s.currentGdh.toLocaleString('pl-PL')} GDH)
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
              Korekta tunelowa: <span className="text-green-700 font-bold">+{tunnelOffset}°C</span>
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

        {/* Section info card */}
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
                <p className="text-xs text-green-600">T_baz</p>
                <p className="font-medium text-green-800">{selectedSection.baseTemp}°C</p>
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
              <div className="ml-auto">
                <p className="text-xs text-green-600">Aktualne GDH</p>
                <p className="text-2xl font-bold text-green-800">{selectedSection.currentGdh.toLocaleString('pl-PL')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {selectedSection && selectedSection.totalReadings > 0 && (
            <>
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <p className="text-xs text-emerald-600 font-medium">GDH sekcji (odczyty)</p>
                <p className="text-2xl font-bold text-emerald-800">{selectedSection.currentGdh.toLocaleString('pl-PL')}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <p className="text-xs text-emerald-600">Śr. dzienna (sekcja)</p>
                <p className="text-xl font-bold text-emerald-700">{Math.round(sectionPrediction.avgDaily)}/dzień</p>
              </div>
            </>
          )}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">GDH pogoda (zewn.)</p>
            <p className="text-2xl font-bold text-blue-800">{weatherGdh.currentOutside.toLocaleString('pl-PL')}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
            <p className="text-xs text-green-600 font-medium">GDH pogoda (tunel +{tunnelOffset}°C)</p>
            <p className="text-2xl font-bold text-green-800">{weatherGdh.currentTunnel.toLocaleString('pl-PL')}</p>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 mb-3">
              Linia ciągła = dane realne &bull; Przerywana = predykcja (14-dniowa średnia)
              {selectedSection && ' \u2022 Poziome linie = progi sekcji'}
            </p>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(1, Math.floor(chartData.length / 14))}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-md text-xs">
                          <p className="font-medium mb-1 text-gray-700">Data: {label}</p>
                          {payload.map((p, i) => (
                            p.value != null ? (
                              <p key={i} style={{ color: p.color as string }}>
                                {p.name}: {Number(p.value).toLocaleString('pl-PL')} GDH
                              </p>
                            ) : null
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Section actual GDH from readings */}
                  {selectedSection && selectedSection.totalReadings > 0 && (
                    <Line type="monotone" dataKey="sectionGdh"
                      name={`${selectedSection.blockName}/${selectedSection.name}`}
                      stroke="#059669" strokeWidth={3} dot={false} connectNulls={false} />
                  )}
                  {/* Section prediction */}
                  {selectedSection && selectedSection.totalReadings > 0 && (
                    <Line type="monotone" dataKey="sectionPredGdh"
                      name="Predykcja sekcji"
                      stroke="#6ee7b7" strokeWidth={2} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  )}
                  {/* Farm weather: outside */}
                  <Line type="monotone" dataKey="outsideGdh" name="Pogoda zewn."
                    stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls={false} />
                  {/* Farm weather: tunnel estimate */}
                  <Line type="monotone" dataKey="tunnelGdh" name={`Pogoda tunel (+${tunnelOffset}°C)`}
                    stroke="#22c55e" strokeWidth={1.5} dot={false} connectNulls={false} />
                  {/* Weather predictions */}
                  <Line type="monotone" dataKey="outsidePredGdh" name="Pred. zewn."
                    stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="tunnelPredGdh" name="Pred. tunel"
                    stroke="#86efac" strokeWidth={1.5} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  {/* Threshold reference lines */}
                  {refLines.map((rl, i) => (
                    <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="6 3"
                      label={{ value: rl.label, fill: rl.color, fontSize: 11, position: 'right' }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed">
            <div className="text-center">
              <Thermometer className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Brak danych. Wgraj CSV z temperaturami lub pobierz dane pogodowe w Ustawieniach.</p>
            </div>
          </div>
        )}

        {/* Progress bars for selected section */}
        {selectedSection && sectionProgress && (sectionProgress.flower || sectionProgress.fruit) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-green-600" />
              Prognoza — {selectedSection.blockName} / {selectedSection.name} ({selectedSection.varietyName})
            </h3>

            {sectionProgress.flower && (
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-800">Kwitnienie</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                      {selectedSection.flowerThreshold?.toLocaleString('pl-PL')} GDH
                    </span>
                    <span className="text-sm font-bold text-amber-700">{sectionProgress.flower.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${sectionProgress.flower.progress}%` }} />
                  </div>
                  <span className="text-sm font-bold text-amber-700 w-14 text-right">{sectionProgress.flower.progress.toFixed(0)}%</span>
                </div>
              </div>
            )}

            {sectionProgress.fruit && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-red-800">Owocowanie (pierwszy zbiór)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-red-200 text-red-700 px-2 py-0.5 rounded-full">
                      {selectedSection.fruitThreshold?.toLocaleString('pl-PL')} GDH
                    </span>
                    <span className="text-sm font-bold text-red-700">{sectionProgress.fruit.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-5 bg-red-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${sectionProgress.fruit.progress}%` }} />
                  </div>
                  <span className="text-sm font-bold text-red-700 w-14 text-right">{sectionProgress.fruit.progress.toFixed(0)}%</span>
                </div>
              </div>
            )}

            {!sectionProgress.flower && !sectionProgress.fruit && (
              <p className="text-sm text-gray-400 text-center py-2">
                Brak progów GDH dla tej odmiany. Ustaw progi w zakładce Odmiany.
              </p>
            )}
          </div>
        )}

        {/* Overview table of all sections with data */}
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
      </CardContent>
    </Card>
  )
}
