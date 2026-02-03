'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Cloud, Thermometer, TrendingUp, X, Loader2, Download, MapPin, Settings } from 'lucide-react'

interface WeatherRecord {
  id: string
  date: string
  tempMin: number
  tempMax: number
  gdhDaily: number
  gdhCumulative: number
  source?: string
}

// Lokalizacja plantacji - Wyszynki
const LOCATION = {
  name: 'Wyszynki, gmina Budzyń',
  latitude: 52.8831,
  longitude: 16.8156
}

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<WeatherRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchStatus, setFetchStatus] = useState('')
  const [baseTemp, setBaseTemp] = useState(5) // Domyślna temperatura bazowa
  const [tempBaseTempInput, setTempBaseTempInput] = useState('5')
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    tempMin: '',
    tempMax: '',
  })

  // Przy pierwszym załadowaniu - sprawdź localStorage
  useEffect(() => {
    const savedWeather = localStorage.getItem('weatherData')
    const savedBaseTemp = localStorage.getItem('gdhBaseTemp')
    
    if (savedWeather) {
      setWeatherData(JSON.parse(savedWeather))
    }
    if (savedBaseTemp) {
      const temp = parseFloat(savedBaseTemp)
      setBaseTemp(temp)
      setTempBaseTempInput(temp.toString())
    }
  }, [])

  // Zapisuj dane do localStorage przy każdej zmianie
  useEffect(() => {
    if (weatherData.length > 0) {
      localStorage.setItem('weatherData', JSON.stringify(weatherData))
    }
  }, [weatherData])

  // Zapisuj temperaturę bazową
  useEffect(() => {
    localStorage.setItem('gdhBaseTemp', baseTemp.toString())
  }, [baseTemp])

  const currentGDH = weatherData[0]?.gdhCumulative || 0

  // Oblicz GDH dla dnia
  const calculateGDH = (tempMin: number, tempMax: number, baseTempValue: number = baseTemp): number => {
    const avgTemp = (tempMin + tempMax) / 2
    return Math.round(Math.max(0, avgTemp - baseTempValue) * 24)
  }

  // Przelicz skumulowane GDH dla wszystkich rekordów
  const recalculateCumulativeGDH = (data: WeatherRecord[], baseTempValue: number = baseTemp): WeatherRecord[] => {
    const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let cumulative = 0
    return sorted.map(record => {
      // Przelicz GDH dnia z nową temperaturą bazową
      const gdhDaily = calculateGDH(record.tempMin, record.tempMax, baseTempValue)
      cumulative += gdhDaily
      return { ...record, gdhDaily, gdhCumulative: cumulative }
    }).reverse() // Najnowsze pierwsze
  }

  // Zmień temperaturę bazową i przelicz wszystkie GDH
  const handleBaseTempChange = () => {
    const newBaseTemp = parseFloat(tempBaseTempInput)
    if (isNaN(newBaseTemp)) return
    
    setBaseTemp(newBaseTemp)
    
    // Przelicz wszystkie dane z nową temperaturą bazową
    if (weatherData.length > 0) {
      const recalculated = recalculateCumulativeGDH(weatherData, newBaseTemp)
      setWeatherData(recalculated)
    }
    
    setShowSettings(false)
  }

  // Pobierz dane z Open-Meteo (darmowe, bez klucza API)
  const fetchFromOpenMeteo = async (startDate: string, endDate: string): Promise<WeatherRecord[]> => {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw`
    
    const response = await fetch(url)
    if (!response.ok) throw new Error('Open-Meteo API error')
    
    const data = await response.json()
    
    return data.daily.time.map((date: string, i: number) => ({
      id: `om-${date}`,
      date,
      tempMin: Math.round(data.daily.temperature_2m_min[i] * 10) / 10,
      tempMax: Math.round(data.daily.temperature_2m_max[i] * 10) / 10,
      gdhDaily: calculateGDH(data.daily.temperature_2m_min[i], data.daily.temperature_2m_max[i]),
      gdhCumulative: 0,
      source: 'Open-Meteo'
    }))
  }

  // Pobierz prognozę z Open-Meteo
  const fetchForecast = async (): Promise<WeatherRecord[]> => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw&forecast_days=7`
    
    const response = await fetch(url)
    if (!response.ok) throw new Error('Open-Meteo Forecast API error')
    
    const data = await response.json()
    
    return data.daily.time.map((date: string, i: number) => ({
      id: `forecast-${date}`,
      date,
      tempMin: Math.round(data.daily.temperature_2m_min[i] * 10) / 10,
      tempMax: Math.round(data.daily.temperature_2m_max[i] * 10) / 10,
      gdhDaily: calculateGDH(data.daily.temperature_2m_min[i], data.daily.temperature_2m_max[i]),
      gdhCumulative: 0,
      source: 'Prognoza'
    }))
  }

  // Główna funkcja pobierania danych od początku roku
  const fetchWeatherData = async () => {
    setIsFetching(true)
    setFetchStatus('Łączenie z Open-Meteo...')

    try {
      const currentYear = new Date().getFullYear()
      const startDate = `${currentYear}-01-01`
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const endDate = yesterday.toISOString().split('T')[0]

      // Pobierz dane historyczne
      setFetchStatus('Pobieranie danych historycznych...')
      const historicalData = await fetchFromOpenMeteo(startDate, endDate)
      
      // Pobierz prognozę
      setFetchStatus('Pobieranie prognozy 7-dniowej...')
      const forecastData = await fetchForecast()

      // Połącz dane (usuń duplikaty)
      const allDates = new Set<string>()
      const combinedData: WeatherRecord[] = []
      
      // Najpierw historyczne (mają priorytet)
      historicalData.forEach(record => {
        if (!allDates.has(record.date)) {
          allDates.add(record.date)
          combinedData.push(record)
        }
      })
      
      // Potem prognoza (tylko przyszłe dni)
      forecastData.forEach(record => {
        if (!allDates.has(record.date)) {
          allDates.add(record.date)
          combinedData.push(record)
        }
      })

      // Przelicz skumulowane GDH
      const finalData = recalculateCumulativeGDH(combinedData)
      
      setWeatherData(finalData)
      setFetchStatus(`✓ Pobrano ${finalData.length} dni danych`)
      
      setTimeout(() => setFetchStatus(''), 3000)
    } catch (error) {
      console.error('Error fetching weather:', error)
      setFetchStatus('❌ Błąd pobierania danych')
    } finally {
      setIsFetching(false)
    }
  }

  // Dodaj ręczny odczyt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const tempMin = parseFloat(formData.tempMin)
    const tempMax = parseFloat(formData.tempMax)
    const gdhDaily = calculateGDH(tempMin, tempMax)

    const newRecord: WeatherRecord = {
      id: `manual-${Date.now()}`,
      date: formData.date,
      tempMin,
      tempMax,
      gdhDaily,
      gdhCumulative: 0,
      source: 'Ręczny'
    }

    // Dodaj i usuń duplikaty (ten sam dzień)
    const existingIndex = weatherData.findIndex(w => w.date === formData.date)
    let updatedData: WeatherRecord[]
    
    if (existingIndex >= 0) {
      updatedData = [...weatherData]
      updatedData[existingIndex] = newRecord
    } else {
      updatedData = [...weatherData, newRecord]
    }

    const finalData = recalculateCumulativeGDH(updatedData)
    setWeatherData(finalData)

    setShowForm(false)
    setFormData({ date: new Date().toISOString().split('T')[0], tempMin: '', tempMax: '' })
    setIsLoading(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'Open-Meteo':
        return <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">API</span>
      case 'Prognoza':
        return <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Prognoza</span>
      case 'Ręczny':
        return <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Ręczny</span>
      default:
        return null
    }
  }

  // Statystyki
  const last7Days = weatherData.filter(w => w.source !== 'Prognoza').slice(0, 7)
  const last7DaysGDH = last7Days.reduce((s, d) => s + d.gdhDaily, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pogoda & GDH</h1>
          <p className="text-gray-500 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {LOCATION.name} ({LOCATION.latitude}°N, {LOCATION.longitude}°E)
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Temp. bazowa: {baseTemp}°C
          </Button>
          <Button 
            variant="outline"
            onClick={fetchWeatherData}
            disabled={isFetching}
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Pobieranie...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Pobierz pogodę
              </>
            )}
          </Button>
          <Button 
            className="bg-green-600 hover:bg-green-700"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Dodaj ręcznie
          </Button>
        </div>
      </div>

      {/* Panel ustawień temperatury bazowej */}
      {showSettings && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Ustawienia GDH</span>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-lg border">
                <h4 className="font-medium mb-2">Temperatura bazowa (próg GDH)</h4>
                <p className="text-sm text-gray-500 mb-4">
                  GDH są liczone tylko gdy średnia dzienna temperatura przekracza temperaturę bazową.
                  Różne odmiany malin mogą mieć różne progi:
                </p>
                <ul className="text-sm text-gray-600 mb-4 space-y-1">
                  <li>• <strong>Diamond Jubilee</strong>: zalecane 5°C</li>
                  <li>• <strong>Ruby</strong>: zalecane 6°C</li>
                </ul>
                
                <div className="flex items-end gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baseTemp">Temperatura bazowa (°C)</Label>
                    <Input
                      id="baseTemp"
                      type="number"
                      step="0.5"
                      value={tempBaseTempInput}
                      onChange={(e) => setTempBaseTempInput(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  <Button onClick={handleBaseTempChange} className="bg-blue-600 hover:bg-blue-700">
                    Zastosuj i przelicz
                  </Button>
                </div>
                
                <p className="text-xs text-gray-400 mt-3">
                  Zmiana temperatury bazowej przeliczy GDH dla wszystkich zapisanych dni.
                </p>
              </div>
              
              {/* Szybkie przyciski */}
              <div className="flex gap-2">
                <span className="text-sm text-gray-500 py-2">Szybki wybór:</span>
                {[4, 4.5, 5, 5.5, 6, 6.5, 7].map(temp => (
                  <Button
                    key={temp}
                    variant={baseTemp === temp ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setTempBaseTempInput(temp.toString())
                      setBaseTemp(temp)
                      if (weatherData.length > 0) {
                        const recalculated = recalculateCumulativeGDH(weatherData, temp)
                        setWeatherData(recalculated)
                      }
                    }}
                    className={baseTemp === temp ? "bg-blue-600" : ""}
                  >
                    {temp}°C
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status pobierania */}
      {fetchStatus && (
        <div className={`p-3 rounded-lg text-sm ${
          fetchStatus.includes('✓') ? 'bg-green-100 text-green-700' :
          fetchStatus.includes('❌') ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {fetchStatus}
        </div>
      )}

      {/* Formularz dodawania */}
      {showForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Nowy odczyt temperatury</span>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempMin">Temperatura min (°C)</Label>
                  <Input
                    id="tempMin"
                    type="number"
                    step="0.1"
                    placeholder="np. 5"
                    value={formData.tempMin}
                    onChange={(e) => setFormData({ ...formData, tempMin: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempMax">Temperatura max (°C)</Label>
                  <Input
                    id="tempMax"
                    type="number"
                    step="0.1"
                    placeholder="np. 15"
                    value={formData.tempMax}
                    onChange={(e) => setFormData({ ...formData, tempMax: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              {formData.tempMin && formData.tempMax && (
                <div className="p-3 bg-white rounded-lg border">
                  <span className="text-sm text-gray-500">Szacowane GDH (przy temp. bazowej {baseTemp}°C): </span>
                  <span className="font-bold text-green-600">
                    +{calculateGDH(parseFloat(formData.tempMin), parseFloat(formData.tempMax))}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Zapisywanie...
                    </>
                  ) : (
                    'Zapisz odczyt'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Anuluj
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Karty podsumowania */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Aktualne GDH (od 1.01)</p>
                <p className="text-4xl font-bold text-green-700">{currentGDH.toLocaleString()}</p>
                <p className="text-xs text-green-500 mt-1">
                  Temp. bazowa: {baseTemp}°C
                </p>
              </div>
              <div className="p-3 bg-green-200 rounded-full">
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Ostatni dzień</p>
                <p className="text-2xl font-bold">+{weatherData[0]?.gdhDaily || 0} GDH</p>
                <p className="text-sm text-gray-500">
                  {weatherData[0] ? `${weatherData[0].tempMin}° - ${weatherData[0].tempMax}°C` : '-'}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Thermometer className="w-8 h-8 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Ostatnie 7 dni</p>
                <p className="text-2xl font-bold">+{last7DaysGDH} GDH</p>
                <p className="text-sm text-gray-500">
                  średnio {last7Days.length > 0 ? Math.round(last7DaysGDH / last7Days.length) : 0}/dzień
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Cloud className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info o źródłach */}
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
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Ręczny</span>
              Twoje wpisy
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tabela danych */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Historia pomiarów ({weatherData.length} dni)</span>
            {weatherData.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  if (confirm('Czy na pewno chcesz wyczyścić wszystkie dane?')) {
                    setWeatherData([])
                    localStorage.removeItem('weatherData')
                  }
                }}
              >
                Wyczyść dane
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weatherData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="mb-2">Brak danych pogodowych</p>
              <p className="text-sm">Kliknij "Pobierz pogodę" aby pobrać dane od początku roku</p>
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
                  {weatherData.map((day) => (
                    <tr key={day.id} className={`border-b hover:bg-gray-50 ${
                      day.source === 'Prognoza' ? 'bg-purple-50/50' : ''
                    }`}>
                      <td className="py-3 px-4 font-medium">{formatDate(day.date)}</td>
                      <td className="text-center py-3 px-4">
                        <span className="text-blue-600">{day.tempMin}°</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="text-red-600">{day.tempMax}°</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`px-2 py-1 rounded font-medium ${
                          day.gdhDaily > 0 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {day.gdhDaily > 0 ? '+' : ''}{day.gdhDaily}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 font-semibold">{day.gdhCumulative.toLocaleString()}</td>
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
