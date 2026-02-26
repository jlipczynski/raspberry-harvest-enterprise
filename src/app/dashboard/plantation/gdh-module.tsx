'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingUp, Thermometer, Target } from 'lucide-react'

interface Variety {
  id: string
  name: string
  baseTemp?: number | null
  gdhWinteredFlower?: number | null
  gdhWinteredFruit?: number | null
  gdhLcFlower?: number | null
  gdhLcFruit?: number | null
  gdhAutumnFlower?: number | null
  gdhAutumnFruit?: number | null
}

interface WeatherRecord {
  date: string
  tempMin: number
  tempMax: number
}

interface ChartPoint {
  date: string
  dateLabel: string
  outsideGdh: number | null
  tunnelGdh: number | null
  outsidePredGdh: number | null
  tunnelPredGdh: number | null
}

export default function GDHModule() {
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [weatherData, setWeatherData] = useState<WeatherRecord[]>([])
  const [selectedVarietyId, setSelectedVarietyId] = useState('')
  const [tunnelOffset, setTunnelOffset] = useState(4)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [vRes, wRes] = await Promise.all([
          fetch('/api/varieties'),
          fetch('/api/weather')
        ])
        const vData = await vRes.json()
        const wData = await wRes.json()
        setVarieties(vData.varieties || [])
        setWeatherData(
          (wData.weatherData || []).map((w: Record<string, unknown>) => ({
            date: w.date as string,
            tempMin: w.tempMin as number,
            tempMax: w.tempMax as number,
          }))
        )
      } catch (e) {
        console.error('Error fetching GDH data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const selectedVariety = varieties.find(v => v.id === selectedVarietyId)
  const baseTemp = selectedVariety?.baseTemp ?? 6.0

  const gdhCalc = useMemo(() => {
    const empty = { chart: [] as ChartPoint[], currentOutside: 0, currentTunnel: 0, avgDailyOutside: 0, avgDailyTunnel: 0 }
    if (!weatherData.length) return empty

    const currentYear = new Date().getFullYear()
    const sorted = [...weatherData]
      .filter(w => new Date(w.date).getFullYear() === currentYear)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (sorted.length === 0) return empty

    let cumOutside = 0
    let cumTunnel = 0

    const chart: ChartPoint[] = sorted.map(w => {
      const avg = (w.tempMax + w.tempMin) / 2
      // GDD = max(0, (Tmax+Tmin)/2 - T_base), GDH = GDD * 24
      const gddOut = Math.max(0, avg - baseTemp)
      const gddTun = Math.max(0, avg + tunnelOffset - baseTemp)
      cumOutside += gddOut * 24
      cumTunnel += gddTun * 24

      return {
        date: w.date,
        dateLabel: new Date(w.date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
        outsideGdh: Math.round(cumOutside),
        tunnelGdh: Math.round(cumTunnel),
        outsidePredGdh: null,
        tunnelPredGdh: null,
      }
    })

    // Average daily GDH from last 14 days for prediction
    const n = Math.min(14, chart.length)
    const last = chart.slice(-n)
    const avgDailyOutside = n >= 2 ? (last[last.length - 1].outsideGdh! - last[0].outsideGdh!) / n : 0
    const avgDailyTunnel = n >= 2 ? (last[last.length - 1].tunnelGdh! - last[0].tunnelGdh!) / n : 0

    // Bridge point: last real data also starts prediction line
    const lastReal = chart[chart.length - 1]
    if (lastReal) {
      lastReal.outsidePredGdh = lastReal.outsideGdh
      lastReal.tunnelPredGdh = lastReal.tunnelGdh
    }

    // Project 120 days into the future
    if (lastReal && (avgDailyOutside > 0 || avgDailyTunnel > 0)) {
      let predOut = lastReal.outsideGdh!
      let predTun = lastReal.tunnelGdh!
      const lastDate = new Date(lastReal.date)

      for (let i = 1; i <= 120; i++) {
        const d = new Date(lastDate)
        d.setDate(d.getDate() + i)
        predOut += avgDailyOutside
        predTun += avgDailyTunnel
        chart.push({
          date: d.toISOString(),
          dateLabel: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
          outsideGdh: null,
          tunnelGdh: null,
          outsidePredGdh: Math.round(predOut),
          tunnelPredGdh: Math.round(predTun),
        })
      }
    }

    return {
      chart,
      currentOutside: lastReal?.outsideGdh || 0,
      currentTunnel: lastReal?.tunnelGdh || 0,
      avgDailyOutside,
      avgDailyTunnel,
    }
  }, [weatherData, baseTemp, tunnelOffset])

  // Predictions per threshold
  const predictions = useMemo(() => {
    if (!selectedVariety) return []

    const items: Array<{
      label: string
      value: number
      type: string
      progressOutside: number
      progressTunnel: number
      dateOutside: string
      dateTunnel: string
    }> = []

    const add = (label: string, value: number | null | undefined, type: string) => {
      if (!value) return
      const progOut = Math.min(100, (gdhCalc.currentOutside / value) * 100)
      const progTun = Math.min(100, (gdhCalc.currentTunnel / value) * 100)

      const remOut = Math.max(0, value - gdhCalc.currentOutside)
      const remTun = Math.max(0, value - gdhCalc.currentTunnel)

      const daysOut = gdhCalc.avgDailyOutside > 0 ? Math.ceil(remOut / gdhCalc.avgDailyOutside) : 999
      const daysTun = gdhCalc.avgDailyTunnel > 0 ? Math.ceil(remTun / gdhCalc.avgDailyTunnel) : 999

      const dOut = new Date(); dOut.setDate(dOut.getDate() + daysOut)
      const dTun = new Date(); dTun.setDate(dTun.getDate() + daysTun)

      items.push({
        label,
        value,
        type,
        progressOutside: progOut,
        progressTunnel: progTun,
        dateOutside: remOut <= 0 ? 'Osiagnięto!' : dOut.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }),
        dateTunnel: remTun <= 0 ? 'Osiagnięto!' : dTun.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }),
      })
    }

    add('Kwitnienie (zimowane w tunelu)', selectedVariety.gdhWinteredFlower, 'wintered')
    add('Zbiór (zimowane w tunelu)', selectedVariety.gdhWinteredFruit, 'wintered')
    add('Kwitnienie (long canes)', selectedVariety.gdhLcFlower, 'lc')
    add('Zbiór (long canes)', selectedVariety.gdhLcFruit, 'lc')
    add('Kwitnienie (sezon jesienny)', selectedVariety.gdhAutumnFlower, 'autumn')
    add('Zbiór (sezon jesienny)', selectedVariety.gdhAutumnFruit, 'autumn')

    return items
  }, [selectedVariety, gdhCalc])

  // Reference lines for thresholds on chart
  const refLines = useMemo(() => {
    if (!selectedVariety) return []
    const lines: Array<{ y: number; label: string; color: string }> = []
    const add = (val: number | null | undefined, label: string, color: string) => {
      if (val) lines.push({ y: val, label, color })
    }
    add(selectedVariety.gdhWinteredFlower, 'Kwit. zim.', '#f59e0b')
    add(selectedVariety.gdhWinteredFruit, 'Zbiór zim.', '#ef4444')
    add(selectedVariety.gdhLcFlower, 'Kwit. LC', '#f97316')
    add(selectedVariety.gdhLcFruit, 'Zbiór LC', '#dc2626')
    add(selectedVariety.gdhAutumnFlower, 'Kwit. jes.', '#d97706')
    add(selectedVariety.gdhAutumnFruit, 'Zbiór jes.', '#b91c1c')
    return lines
  }, [selectedVariety])

  if (loading) return (
    <Card><CardContent className="p-6 text-center text-gray-400">Ładowanie modułu GDH...</CardContent></Card>
  )

  return (
    <Card className="border-green-200">
      <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Moduł GDH — Godziny Wzrostu
        </CardTitle>
        <p className="text-sm text-gray-500">
          Postęp akumulacji ciepła i prognoza dat kwitnienia/owocowania
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Wybierz odmianę</label>
            <select
              className="w-full h-10 border rounded-md px-3 text-sm bg-white"
              value={selectedVarietyId}
              onChange={e => setSelectedVarietyId(e.target.value)}
            >
              <option value="">— Wybierz odmianę —</option>
              {varieties.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} (T_baz: {v.baseTemp ?? 6}°C)
                </option>
              ))}
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

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">GDH na zewnątrz</p>
            <p className="text-2xl font-bold text-blue-800">{gdhCalc.currentOutside.toLocaleString('pl-PL')}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
            <p className="text-xs text-green-600 font-medium">GDH w tunelu</p>
            <p className="text-2xl font-bold text-green-800">{gdhCalc.currentTunnel.toLocaleString('pl-PL')}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-xs text-blue-600">Śr. dzienna (zewn.)</p>
            <p className="text-xl font-bold text-blue-700">{Math.round(gdhCalc.avgDailyOutside)}/dzień</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 border border-green-100">
            <p className="text-xs text-green-600">Śr. dzienna (tunel)</p>
            <p className="text-xl font-bold text-green-700">{Math.round(gdhCalc.avgDailyTunnel)}/dzień</p>
          </div>
        </div>

        {/* Chart */}
        {gdhCalc.chart.length > 0 ? (
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 mb-3">
              Linia ciągła = dane realne &bull; Przerywana = predykcja (14-dniowa średnia)
              {selectedVariety && ' \u2022 Poziome linie = progi odmianowe'}
            </p>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gdhCalc.chart} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(1, Math.floor(gdhCalc.chart.length / 14))}
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
                  {/* Solid = real data */}
                  <Line type="monotone" dataKey="outsideGdh" name="Zewnątrz"
                    stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="tunnelGdh" name="Tunel"
                    stroke="#22c55e" strokeWidth={2.5} dot={false} connectNulls={false} />
                  {/* Dashed = prediction */}
                  <Line type="monotone" dataKey="outsidePredGdh" name="Predykcja zewn."
                    stroke="#93c5fd" strokeWidth={2} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="tunnelPredGdh" name="Predykcja tunel"
                    stroke="#86efac" strokeWidth={2} strokeDasharray="8 4" dot={false} connectNulls={false} />
                  {/* Threshold reference lines */}
                  {refLines.map((rl, i) => (
                    <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="6 3"
                      label={{ value: rl.label, fill: rl.color, fontSize: 10, position: 'right' }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed">
            <div className="text-center">
              <Thermometer className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Brak danych pogodowych. Pobierz dane historyczne w Ustawieniach.</p>
            </div>
          </div>
        )}

        {/* Progress bars */}
        {selectedVariety && predictions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-green-600" />
              Postęp i prognoza — {selectedVariety.name}
            </h3>
            {predictions.map((p, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-800">{p.label}</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    {p.value.toLocaleString('pl-PL')} GDH
                  </span>
                </div>
                {/* Tunnel progress */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-green-700 font-medium w-16 shrink-0">Tunel</span>
                  <div className="flex-1 h-4 bg-green-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                      style={{ width: `${p.progressTunnel}%` }} />
                  </div>
                  <span className="text-xs font-bold text-green-700 w-12 text-right">{p.progressTunnel.toFixed(0)}%</span>
                  <span className="text-xs text-green-600 w-28 text-right font-medium">{p.dateTunnel}</span>
                </div>
                {/* Outside progress */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700 font-medium w-16 shrink-0">Zewnątrz</span>
                  <div className="flex-1 h-4 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${p.progressOutside}%` }} />
                  </div>
                  <span className="text-xs font-bold text-blue-700 w-12 text-right">{p.progressOutside.toFixed(0)}%</span>
                  <span className="text-xs text-blue-600 w-28 text-right font-medium">{p.dateOutside}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!selectedVariety && (
          <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
            <p className="text-sm">Wybierz odmianę z listy, aby zobaczyć progi GDH i prognozę dat</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
