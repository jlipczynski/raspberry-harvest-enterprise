'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Cloud, Thermometer, TrendingUp, Target, RefreshCw } from 'lucide-react'

interface WeatherRecord {
  id: string
  date: string
  tempMin: number
  tempMax: number
  gdhDaily: number
  gdhCumulative: number
  source: string
}

interface Section {
  id: string
  name: string
  winteredInTunnel: boolean
  plantingDate: string | null
  autumnShootDate: string | null
  variety?: { name: string; gdhSummer?: number; gdhAutumn?: number }
  gdhSummer?: number
  gdhAutumn?: number
}

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<WeatherRecord[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [currentYear] = useState(new Date().getFullYear())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [weatherRes, plantationRes] = await Promise.all([
        fetch('/api/weather'),
        fetch('/api/plantation')
      ])
      const weatherJson = await weatherRes.json()
      const plantationJson = await plantationRes.json()
      
      if (weatherJson.weatherData) {
        const sorted = weatherJson.weatherData.sort((a: WeatherRecord, b: WeatherRecord) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        setWeatherData(sorted)
      }
      
      if (plantationJson.blocks) {
        const allSections = plantationJson.blocks.flatMap((b: { name: string; sections: Section[] }) =>
          b.sections.map((s: Section) => ({ ...s, blockName: b.name }))
        )
        setSections(allSections)
      }
    } catch (e) {
      console.error('Fetch error:', e)
    } finally {
      setLoading(false)
    }
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

  const getGDHForSection = (section: Section) => {
    if (section.winteredInTunnel) return currentGDH
    if (section.plantingDate) {
      const plantDate = new Date(section.plantingDate)
      const afterPlanting = currentYearData.filter(w => new Date(w.date) >= plantDate)
      return afterPlanting.reduce((sum, w) => sum + (w.gdhDaily || 0), 0)
    }
    return 0
  }

  const getGDHThreshold = (section: Section) => section.gdhSummer || section.variety?.gdhSummer || 20000

  const estimateFruitingDate = (sectionGDH: number, threshold: number) => {
    const remaining = threshold - sectionGDH
    if (remaining <= 0) return 'Teraz!'
    const avgDailyGDH = 150
    const daysRemaining = Math.ceil(remaining / avgDailyGDH)
    const date = new Date()
    date.setDate(date.getDate() + daysRemaining)
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  }

  const getSourceBadge = (source: string) => {
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
                <p className="text-sm text-green-600">Temp. bazowa: 5°C</p>
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
                <p className="text-4xl font-bold text-orange-800">+{todayData?.gdhDaily || 0} GDH</p>
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
              <span className="text-sm text-green-700">🌡️ GDH w tunelu (od 1.01)</span>
              <span className="font-bold text-green-700">{currentGDH.toLocaleString()} / 20,000</span>
            </div>
            <div className="w-full h-4 bg-green-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full" style={{ width: `${Math.min(100, (currentGDH / 20000) * 100)}%` }} />
            </div>
          </div>

          {sections.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 px-2">
                <span>Sekcja</span>
                <span>Typ</span>
                <span>Start</span>
                <span>GDH</span>
                <span>Owocowanie</span>
              </div>
              
              {sections.slice(0, 10).map(section => {
                const sectionGDH = getGDHForSection(section)
                const threshold = getGDHThreshold(section)
                const progress = (sectionGDH / threshold) * 100
                const fruitingDate = estimateFruitingDate(sectionGDH, threshold)
                
                return (
                  <div key={section.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-5 gap-2 items-center text-sm mb-2">
                      <span className="font-medium truncate">{section.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${section.winteredInTunnel ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {section.winteredInTunnel ? '🏠 Zimowana' : '📦 Wysadzona'}
                      </span>
                      <span className="text-gray-600">
                        {section.winteredInTunnel ? '01.01' : section.plantingDate ? formatDate(section.plantingDate).slice(0, 5) : '—'}
                      </span>
                      <span className="font-medium">{sectionGDH.toLocaleString()}</span>
                      <span className="text-green-600 font-medium text-xs">{fruitingDate}</span>
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
