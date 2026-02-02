'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, Download, Upload, Database, Bell, User, MapPin, Trash2, CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [importStatus, setImportStatus] = useState('')
  const [plantation, setPlantation] = useState({
    name: 'Plantacja Malin - Wyszynki',
    location: 'Wyszynki, gmina Budzyń',
    latitude: '52.8831',
    longitude: '16.8156'
  })

  // Eksport wszystkich danych
  const exportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      version: '2.0.0',
      plantation,
      weatherData: JSON.parse(localStorage.getItem('weatherData') || '[]'),
      plantationBlocks: JSON.parse(localStorage.getItem('plantationBlocks') || '[]'),
      varieties: JSON.parse(localStorage.getItem('varieties') || '[]'),
      workers: JSON.parse(localStorage.getItem('workers') || '[]'),
      workerConfig: JSON.parse(localStorage.getItem('workerConfig') || '{}'),
      gdhBaseTemp: localStorage.getItem('gdhBaseTemp') || '5',
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
  }

  // Import danych
  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        // Zapisz dane do localStorage
        if (data.weatherData) localStorage.setItem('weatherData', JSON.stringify(data.weatherData))
        if (data.plantationBlocks) localStorage.setItem('plantationBlocks', JSON.stringify(data.plantationBlocks))
        if (data.varieties) localStorage.setItem('varieties', JSON.stringify(data.varieties))
        if (data.workers) localStorage.setItem('workers', JSON.stringify(data.workers))
        if (data.workerConfig) localStorage.setItem('workerConfig', JSON.stringify(data.workerConfig))
        if (data.gdhBaseTemp) localStorage.setItem('gdhBaseTemp', data.gdhBaseTemp)
        if (data.plantation) setPlantation(data.plantation)
        
        setImportStatus('✓ Dane zaimportowane pomyślnie!')
        setTimeout(() => setImportStatus(''), 3000)
        
        // Odśwież stronę po 1 sekundzie
        setTimeout(() => window.location.reload(), 1000)
      } catch (error) {
        setImportStatus('❌ Błąd importu - nieprawidłowy format pliku')
        setTimeout(() => setImportStatus(''), 3000)
      }
    }
    reader.readAsText(file)
  }

  // Wyczyść wszystkie dane
  const clearAllData = () => {
    if (confirm('Czy na pewno chcesz usunąć WSZYSTKIE dane? Ta operacja jest nieodwracalna!')) {
      localStorage.removeItem('weatherData')
      localStorage.removeItem('plantationBlocks')
      localStorage.removeItem('varieties')
      localStorage.removeItem('workers')
      localStorage.removeItem('workerConfig')
      localStorage.removeItem('gdhBaseTemp')
      alert('Wszystkie dane zostały usunięte.')
      window.location.reload()
    }
  }

  // Zapisz ustawienia plantacji
  const savePlantation = () => {
    localStorage.setItem('plantationSettings', JSON.stringify(plantation))
    setImportStatus('✓ Ustawienia zapisane')
    setTimeout(() => setImportStatus(''), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ustawienia</h1>
        <p className="text-gray-500">Konfiguracja aplikacji</p>
      </div>

      {importStatus && (
        <div className={`p-3 rounded-lg text-sm ${
          importStatus.includes('✓') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {importStatus}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Dane - eksport/import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-green-600" />
              Dane
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">Eksportuj dane</div>
                <div className="text-sm text-gray-500">Pobierz kopię zapasową wszystkich danych</div>
              </div>
              <Button variant="outline" onClick={exportData}>
                <Download className="w-4 h-4 mr-2" />
                Eksportuj
              </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">Importuj dane</div>
                <div className="text-sm text-gray-500">Wczytaj z kopii zapasowej</div>
              </div>
              <div>
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                  id="import-file"
                />
                <label htmlFor="import-file">
                  <Button variant="outline" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Importuj
                    </span>
                  </Button>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
              <div>
                <div className="font-medium text-red-700">Wyczyść wszystkie dane</div>
                <div className="text-sm text-red-500">Usuwa wszystkie dane - nieodwracalne!</div>
              </div>
              <Button variant="outline" onClick={clearAllData} className="text-red-600 border-red-300 hover:bg-red-100">
                <Trash2 className="w-4 h-4 mr-2" />
                Wyczyść
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Plantacja */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Plantacja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nazwa plantacji</Label>
              <Input
                value={plantation.name}
                onChange={(e) => setPlantation({...plantation, name: e.target.value})}
              />
            </div>
            <div>
              <Label>Lokalizacja</Label>
              <Input
                value={plantation.location}
                onChange={(e) => setPlantation({...plantation, location: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Szerokość (°N)</Label>
                <Input
                  value={plantation.latitude}
                  onChange={(e) => setPlantation({...plantation, latitude: e.target.value})}
                />
              </div>
              <div>
                <Label>Długość (°E)</Label>
                <Input
                  value={plantation.longitude}
                  onChange={(e) => setPlantation({...plantation, longitude: e.target.value})}
                />
              </div>
            </div>
            <Button onClick={savePlantation} className="bg-blue-600 hover:bg-blue-700">
              Zapisz ustawienia
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              Aplikacja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">Wersja</div>
              <div className="text-sm text-gray-600">2.0.0 Enterprise</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">Przechowywanie danych</div>
              <div className="text-sm text-gray-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                localStorage (lokalne)
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
                Aplikacja działa poprawnie
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
