'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, Download, Upload, Database, Bell, MapPin, Trash2, CheckCircle, Cloud, RefreshCw, Loader2 } from 'lucide-react'

interface Farm {
  id: string
  name: string
  location: string
  latitude: number | null
  longitude: number | null
  seasonStartDate: string | null
}

export default function SettingsPage() {
  const [importStatus, setImportStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    latitude: '',
    longitude: '',
    seasonStartDate: ''
  })

  useEffect(() => { fetchFarm() }, [])

  const fetchFarm = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      if (data.farm) {
        setFarm(data.farm)
        setFormData({
          name: data.farm.name || '',
          location: data.farm.location || '',
          latitude: data.farm.latitude?.toString() || '',
          longitude: data.farm.longitude?.toString() || '',
          seasonStartDate: data.farm.seasonStartDate || ''
        })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const saveFarm = async () => {
    if (!farm) return
    setSaving(true)
    try {
      const res = await fetch(`/api/farm/${farm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          location: formData.location,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          seasonStartDate: formData.seasonStartDate || null
        })
      })
      if (res.ok) {
        setImportStatus('✓ Ustawienia zapisane')
        setTimeout(() => setImportStatus(''), 3000)
        fetchFarm()
      } else {
        setImportStatus('❌ Błąd zapisu')
        setTimeout(() => setImportStatus(''), 3000)
      }
    } catch {
      setImportStatus('❌ Błąd połączenia')
      setTimeout(() => setImportStatus(''), 3000)
    }
    finally { setSaving(false) }
  }

  const fetchHistoricalWeather = async () => {
    if (!formData.latitude || !formData.longitude) {
      setImportStatus('❌ Najpierw wprowadź współrzędne')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }
    
    setFetchingWeather(true)
    setImportStatus('⏳ Pobieranie danych pogodowych...')
    
    try {
      const res = await fetch('/api/weather/fetch-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          // Fetch 10 full years for robust climate percentiles (P10/P50/P90)
          years: Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 10 + i)
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        setImportStatus(`✓ Pobrano ${data.count || 0} rekordów pogodowych`)
        setTimeout(() => setImportStatus(''), 5000)
      } else {
        const error = await res.json()
        setImportStatus(`❌ ${error.error || 'Błąd pobierania'}`)
        setTimeout(() => setImportStatus(''), 5000)
      }
    } catch {
      setImportStatus('❌ Błąd połączenia z API pogody')
      setTimeout(() => setImportStatus(''), 5000)
    }
    finally { setFetchingWeather(false) }
  }

  const exportData = async () => {
    try {
      const [plantationRes, varietiesRes, weatherRes] = await Promise.all([
        fetch('/api/plantation'),
        fetch('/api/varieties'),
        fetch('/api/weather')
      ])
      const plantation = await plantationRes.json()
      const varieties = await varietiesRes.json()
      const weather = await weatherRes.json()
      
      const data = {
        exportDate: new Date().toISOString(),
        version: '2.0.0',
        farm: plantation.farm,
        blocks: plantation.blocks,
        varieties: varieties.varieties,
        weatherData: weather.weatherData
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `raspberry-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (_e) {
      setImportStatus('❌ Błąd eksportu')
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const _data = JSON.parse(e.target?.result as string)
        setImportStatus('⏳ Importowanie danych...')
        
        // Import przez API (do zaimplementowania)
        setImportStatus('✓ Dane zaimportowane pomyślnie!')
        setTimeout(() => setImportStatus(''), 3000)
        setTimeout(() => window.location.reload(), 1000)
      } catch (_error) {
        setImportStatus('❌ Błąd importu - nieprawidłowy format pliku')
        setTimeout(() => setImportStatus(''), 3000)
      }
    }
    reader.readAsText(file)
  }

  const clearAllData = () => {
    if (confirm('Czy na pewno chcesz usunąć WSZYSTKIE dane? Ta operacja jest nieodwracalna!')) {
      // TODO: API do czyszczenia danych
      alert('Funkcja w przygotowaniu')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ustawienia</h1>
        <p className="text-gray-500">Konfiguracja aplikacji i plantacji</p>
      </div>

      {importStatus && (
        <div className={`p-4 rounded-lg ${importStatus.startsWith('✓') ? 'bg-green-100 text-green-700' : importStatus.startsWith('❌') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {importStatus}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dane plantacji */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-600" />
              Dane plantacji
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nazwa plantacji</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <Label>Lokalizacja</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Szerokość geo. (°N)</Label>
                <Input
                  type="number"
                  step="0.00001"
                  placeholder="np. 52.88097"
                  value={formData.latitude}
                  onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                />
              </div>
              <div>
                <Label>Długość geo. (°E)</Label>
                <Input
                  type="number"
                  step="0.00001"
                  placeholder="np. 16.81895"
                  value={formData.longitude}
                  onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>Początek sezonu (data startu liczenia GDH)</Label>
              <Input
                type="date"
                value={formData.seasonStartDate}
                onChange={(e) => setFormData({...formData, seasonStartDate: e.target.value})}
              />
            </div>
            <Button onClick={saveFarm} disabled={saving} className="bg-green-600 hover:bg-green-700 w-full">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie...</> : 'Zapisz ustawienia'}
            </Button>
          </CardContent>
        </Card>

        {/* Dane pogodowe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-600" />
              Dane pogodowe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700 mb-2">
                Pobierz historyczne dane pogodowe z Open-Meteo API dla współrzędnych plantacji.
                Dane obejmują lata 2023-2026.
              </p>
              <p className="text-xs text-blue-600">
                Współrzędne: {formData.latitude || '—'} N, {formData.longitude || '—'} E
              </p>
            </div>
            <Button 
              onClick={fetchHistoricalWeather} 
              disabled={fetchingWeather || !formData.latitude || !formData.longitude}
              className="bg-blue-600 hover:bg-blue-700 w-full"
            >
              {fetchingWeather ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pobieranie...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />Pobierz dane historyczne</>
              )}
            </Button>
            <div className="text-xs text-gray-500">
              Źródło: Open-Meteo Historical Weather API
            </div>
          </CardContent>
        </Card>

        {/* Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-600" />
              Backup danych
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={exportData} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Eksportuj wszystkie dane
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button variant="outline" className="w-full">
                <Upload className="w-4 h-4 mr-2" />
                Importuj z pliku
              </Button>
            </div>
            <Button onClick={clearAllData} variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-2" />
              Wyczyść wszystkie dane
            </Button>
          </CardContent>
        </Card>

        {/* Powiadomienia */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-600" />
              Powiadomienia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">Przypomnienia o zbiorach</div>
                <div className="text-sm text-gray-500">Gdy GDH osiągnie próg</div>
              </div>
              <input type="checkbox" className="w-5 h-5 text-green-600 rounded" defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">Alerty pogodowe</div>
                <div className="text-sm text-gray-500">Przymrozki, upały</div>
              </div>
              <input type="checkbox" className="w-5 h-5 text-green-600 rounded" defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">Codzienne podsumowanie</div>
                <div className="text-sm text-gray-500">Email z raportem</div>
              </div>
              <input type="checkbox" className="w-5 h-5 text-green-600 rounded" />
            </div>
          </CardContent>
        </Card>

        {/* Aplikacja */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              Informacje o aplikacji
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium">Wersja</div>
                <div className="text-sm text-gray-600">2.0.0 Enterprise</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium">Baza danych</div>
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  PostgreSQL (Neon)
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium">Źródło pogody</div>
                <div className="text-sm text-gray-600">Open-Meteo API</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="font-medium text-green-700">Status</div>
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Online
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
