'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Cloud, Thermometer, TrendingUp, Target, RefreshCw } from 'lucide-react'
import { GDH_BASE_TEMP } from '@/lib/forecast-calculator'

interface WeatherRecord {
  id: string
  date: string
  tempMin: number
  tempMax: number
  gdhDaily: number
  gdhCumulative: number
  source: string
}

interface GdhSection {
  id: string
  name: string
  blockName: string
  winteredInTunnel: boolean
  gdhStartDate: string | null
  baseTemp: number
  currentGdh: number
  fruitThreshold: number | null
  flowerThreshold: number | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
}

interface ForecastDay { date: string; gdhTunnel: number; avgTunnelTemp?: number }
interface GdhApiResponse {
  sections: GdhSection[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p50: ForecastDay[] }
  } | null
}

const GDH_UPPER = 26.0

function computeFruitDate(section: GdhSection, forecast: GdhApiResponse['forecast']): string | null {
  const threshold = section.fruitThreshold
  if (!threshold) return null
  const baseTemp = section.baseTemp
  const gdhStartDate = section.gdhStartDate || ''

  const dayGdh = (day: ForecastDay): number => {
    if (day.avgTunnelTemp != null) return Math.max(0, Math.min(day.avgTunnelTemp, GDH_UPPER) - baseTemp) * 24
    return day.gdhTunnel ?? 0
  }

  const gdhMap = new Map<string, number>()
  let lastRealGdh = 0, lastRealDate = ''
  for (const d of section.dailyGdh) {
    gdhMap.set(d.date, d.cumulativeGdh)
    lastRealGdh = d.cumulativeGdh
    lastRealDate = d.date
  }
  let cum = lastRealGdh
  for (const day of (forecast?.meteoDays ?? [])) {
    if (day.date <= lastRealDate) continue
    if (gdhStartDate && day.date < gdhStartDate) continue
    cum += dayGdh(day)
    gdhMap.set(day.date, Math.round(cum))
  }
  for (const day of (forecast?.scenarios?.p50 ?? [])) {
    if (gdhStartDate && day.date < gdhStartDate) continue
    cum += dayGdh(day)
    gdhMap.set(day.date, Math.round(cum))
  }
  const entries = [...gdhMap.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [date, gdh] of entries) {
    if (gdh >= threshold) return date
  }
  return null
}

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<WeatherRecord[]>([])
  const [gdhData, setGdhData] = useState<GdhApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSections, setLoadingSections] = useState(true)
  const [currentYear] = useState(new Date().getFullYear())

  useEffect(() => {
    // Pogoda ładuje się natychmiast
    fetch('/api/weather')
      .then(r => r.json())
      .then(json => {
        if (json.weatherData) {
          setWeatherData(json.weatherData.sort((a: WeatherRecord, b: WeatherRecord) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          ))
        }
      })
      .catch(e => console.error('Weather fetch error:', e))
      .finally(() => setLoading(false))

    // GDH z loggerów + prognoza — poprawna data owocowania per sekcja
    fetch('/api/gdh')
      .then(r => r.json())
      .then(json => setGdhData(json))
      .catch(e => console.error('GDH fetch error:', e))
      .finally(() => setLoadingSections(false))
  }, [])

  const fetchData = () => {
    setLoading(true)
    setLoadingSections(true)
    fetch('/api/weather')
      .then(r => r.json())
      .then(json => {
        if (json.weatherData) {
          setWeatherData(json.weatherData.sort((a: WeatherRecord, b: WeatherRecord) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          ))
        }
      })
      .catch(e => console.error('Weather fetch error:', e))
      .finally(() => setLoading(false))
    fetch('/api/gdh')
      .then(r => r.json())
      .then(json => setGdhData(json))
      .catch(e => console.error('GDH fetch error:', e))
      .finally(() => setLoadingSections(false))
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const currentYearData = weatherData.filter(w => new Date(w.date).getFullYear() === currentYear)
  const currentGDH = currentYearData.length > 0 ? Math.max(...currentYearData.map(w => w.gdhCumulative || 0)) : 0
  const todayData = currentYearData[0]
  const last7Days = currentYearData.slice(0, 7)
  const last7GDH = last7Days.reduce((sum, d) => sum + (d.gdhDaily || 0), 0)

  // Sekcje z GDH API — logger + prognoza zewnętrzna po ostatnim odczycie (P50)
  // Deduplikacja: jedna sekcja per unikalna nazwa (ta z większym currentGdh)
  const gdhSections: GdhSection[] = (() => {
    const raw = gdhData?.sections ?? []
    const map = new Map<string, GdhSection>()
    for (const s of raw) {
      const key = `${s.blockName}/${s.name}`
      const existing = map.get(key)
      if (!existing || s.currentGdh > existing.currentGdh) map.set(key, s)
    }
    return [...map.values()].sort((a, b) => `${a.blockName}${a.name}`.localeCompare(`${b.blockName}${b.name}`))
  })()

  const getSourceBadge = (source: string) => {
    if (source === 'API_HOURLY') return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Godzinowe</span>
    if (source === 'API_HISTORICAL' || source === 'API') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">API</span>
    if (source === 'FORECAST' || source === 'Prognoza') return <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Prognoza</span>
    return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Ręczny</span>
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pogoda & GDH</h1>
          <p className="text-gray-500">Godziny wzrostu i prognoza owocowania</p>
        </div>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />Odśwież
        </Button>
      </div>

      {/* Karty podsumowania */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Aktualne GDH ({currentYear})</p>
                <p className="text-4xl font-bold text-green-800">{currentGDH.toLocaleString()}</p>
                <p className="text-sm text-green-600">Temp. bazowa: {GDH_BASE_TEMP}°C</p>
              </div>
              <TrendingUp className="w-12 h-12 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700">Dziś</p>
                <p className="text-4xl font-bold text-orange-800">+{Math.round(todayData?.gdhDaily || 0)} GDH</p>
                <p className="text-sm text-orange-600">{todayData ? `${todayData.tempMin}° - ${todayData.tempMax}°` : '—'}</p>
              </div>
              <Thermometer className="w-12 h-12 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Ostatnie 7 dni</p>
                <p className="text-4xl font-bold text-blue-800">+{last7GDH.toLocaleString()} GDH</p>
                <p className="text-sm text-blue-600">średnio {Math.round(last7GDH / 7)}/dzień</p>
              </div>
              <Cloud className="w-12 h-12 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Postęp GDH dla sekcji */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-green-600" />
            Postęp GDH do owocowania
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-700">🌡️ GDH skumulowane (od 1.01, baza {GDH_BASE_TEMP}°C)</span>
              <span className="font-bold text-green-700">{currentGDH.toLocaleString()}</span>
            </div>
            <div className="w-full h-4 bg-green-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full" style={{ width: `${Math.min(100, currentGDH > 0 ? 50 : 0)}%` }} />
            </div>
          </div>

          {loadingSections ? (
            <div className="text-center text-gray-400 py-4 text-sm">Ładowanie sekcji...</div>
          ) : gdhSections.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 px-2">
                <span>Sekcja</span>
                <span>Typ</span>
                <span>Start GDH</span>
                <span>GDH (logger)</span>
                <span>Owocowanie (P50)</span>
              </div>
              {gdhSections.map(section => {
                const threshold = section.fruitThreshold
                const sectionGDH = section.currentGdh
                const progress = threshold ? (sectionGDH / threshold) * 100 : 0
                const fruitDate = computeFruitDate(section, gdhData?.forecast ?? null)
                const fruitingDisplay = fruitDate
                  ? new Date(fruitDate).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
                  : threshold ? '—' : 'brak progu'
                return (
                  <div key={section.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-5 gap-2 items-center text-sm mb-2">
                      <span className="font-medium truncate">{section.blockName}/{section.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${section.winteredInTunnel ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {section.winteredInTunnel ? '🏠 Zimowana' : '📦 Wysadzona'}
                      </span>
                      <span className="text-gray-600 text-xs">
                        {section.gdhStartDate ? new Date(section.gdhStartDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) : '01.01'}
                      </span>
                      <span className="font-medium">{sectionGDH.toLocaleString()}</span>
                      <span className="text-green-600 font-medium text-xs">{fruitingDisplay}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Źródła danych */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">Źródła danych:</span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">API</span>
              Open-Meteo (historyczne)
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Prognoza</span>
              Open-Meteo (7 dni)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tabela danych */}
      <Card>
        <CardHeader>
          <CardTitle>Historia pomiarów ({weatherData.length} dni)</CardTitle>
        </CardHeader>
        <CardContent>
          {weatherData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="mb-2">Brak danych pogodowych</p>
              <p className="text-sm">Idź do Ustawień i kliknij &quot;Pobierz dane historyczne&quot;</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Data</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Min °C</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Max °C</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">GDH dnia</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">GDH suma</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Źródło</th>
                  </tr>
                </thead>
                <tbody>
                  {weatherData.slice(0, 50).map((day) => (
                    <tr key={day.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{formatDate(day.date)}</td>
                      <td className="text-center py-3 px-4"><span className="text-blue-600">{day.tempMin?.toFixed(1)}°</span></td>
                      <td className="text-center py-3 px-4"><span className="text-red-600">{day.tempMax?.toFixed(1)}°</span></td>
                      <td className="text-center py-3 px-4">
                        <span className={`px-2 py-1 rounded font-medium ${day.gdhDaily > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {day.gdhDaily > 0 ? '+' : ''}{Math.round(day.gdhDaily)}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 font-semibold">{Math.round(day.gdhCumulative).toLocaleString()}</td>
                      <td className="text-center py-3 px-4">{getSourceBadge(day.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
