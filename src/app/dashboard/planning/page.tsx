'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Layers, Sun, Snowflake, CheckCircle, TrendingUp, Calendar, AlertCircle } from 'lucide-react'

export default function PlanningPage() {
  const [blocks, setBlocks] = useState<any[]>([])
  const [varieties, setVarieties] = useState<any[]>([])
  const [workerConfig, setWorkerConfig] = useState({ availableWorkers: 80, averageEfficiency: 8, hoursPerDay: 8 })
  const [currentGDH, setCurrentGDH] = useState(0)
  const [baseTemp, setBaseTemp] = useState(5)

  useEffect(() => {
    const savedBlocks = localStorage.getItem('plantationBlocks')
    const savedVarieties = localStorage.getItem('varieties')
    const savedWorkerConfig = localStorage.getItem('workerConfig')
    const savedWeather = localStorage.getItem('weatherData')
    const savedBaseTemp = localStorage.getItem('gdhBaseTemp')

    if (savedBlocks) setBlocks(JSON.parse(savedBlocks))
    if (savedVarieties) setVarieties(JSON.parse(savedVarieties))
    if (savedWorkerConfig) setWorkerConfig(JSON.parse(savedWorkerConfig))
    if (savedBaseTemp) setBaseTemp(parseFloat(savedBaseTemp))
    if (savedWeather) {
      const weather = JSON.parse(savedWeather)
      if (weather.length > 0) setCurrentGDH(weather[0].gdhCumulative || 0)
    }
  }, [])

  const getVariety = (name: string) => varieties.find(v => v.name === name)

  // Obliczenia
  let totalSummerKg = 0, totalAutumnKg = 0, totalShoots = 0
  blocks.forEach(block => {
    block.sections?.forEach((section: any) => {
      const variety = getVariety(section.variety)
      const shoots = section.pots * section.shootsPerPot
      totalShoots += shoots
      if (variety) {
        if (variety.type === 'double') {
          totalSummerKg += shoots * (variety.summerYield || 0)
          totalAutumnKg += shoots * (variety.autumnYield || 0)
        } else {
          totalSummerKg += shoots * (variety.yield || 0)
        }
      }
    })
  })

  const totalKg = totalSummerKg + totalAutumnKg
  const wasteKg = Math.round(totalKg * 0.02)
  const secondCatKg = Math.round(totalKg * 0.08)
  const firstCatKg = Math.round(totalKg - wasteKg - secondCatKg)
  const sectionsCount = blocks.reduce((s, b) => s + (b.sections?.length || 0), 0)
  const maxWorkers = Math.min(Math.ceil(totalKg / 56 * 1.5 / 64), workerConfig.availableWorkers)

  const seasonForecast = [
    { month: 'Marzec', temp: '+2.4°C', desc: 'Znacznie cieplej.', color: 'text-red-500' },
    { month: 'Kwiecień', temp: '-1.8°C', desc: 'Chłodniej.', color: 'text-blue-500' },
    { month: 'Maj', temp: '+0.7°C', desc: 'Cieplej.', color: 'text-orange-500' },
    { month: 'Czerwiec', temp: '+1.5°C', desc: 'Cieplej.', color: 'text-red-500' },
    { month: 'Lipiec', temp: '-0.7°C', desc: 'Chłodniej.', color: 'text-blue-500' },
    { month: 'Sierpień', temp: '+0.1°C', desc: 'Norma.', color: 'text-orange-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planowanie zbiorów</h1>
          <p className="text-gray-500">Prognoza na podstawie danych plantacji i GDH</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Odśwież dane
        </Button>
      </div>

      {/* Status GDH */}
      <Card className={`${currentGDH > 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className={`w-8 h-8 ${currentGDH > 0 ? 'text-green-600' : 'text-yellow-600'}`} />
              <div>
                <div className="text-sm text-gray-600">Aktualne GDH (temp. bazowa: {baseTemp}°C)</div>
                <div className="text-3xl font-bold">{currentGDH.toLocaleString()}</div>
              </div>
            </div>
            {currentGDH === 0 && (
              <div className="text-sm text-yellow-700">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Pobierz dane w "Pogoda & GDH"
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button className="flex-1 bg-green-600 hover:bg-green-700">
          <Layers className="w-4 h-4 mr-2" />
          Cała plantacja
        </Button>
        <Button variant="outline" className="flex-1">
          <Calendar className="w-4 h-4 mr-2" />
          Pojedyncza sekcja
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{sectionsCount}</div>
          <div className="text-xs text-gray-500">Sekcji</div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{Math.round(totalKg).toLocaleString()}</div>
          <div className="text-xs text-yellow-600">kg razem</div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{Math.round(totalSummerKg).toLocaleString()}</div>
          <div className="text-xs text-orange-500">kg lato <Sun className="w-3 h-3 inline" /></div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{Math.round(totalAutumnKg).toLocaleString()}</div>
          <div className="text-xs text-amber-500">kg jesień <Snowflake className="w-3 h-3 inline" /></div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{firstCatKg.toLocaleString()}</div>
          <div className="text-xs text-green-500">I kat. <CheckCircle className="w-3 h-3 inline" /></div>
        </CardContent></Card>
        
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-gray-600">{secondCatKg.toLocaleString()}</div>
          <div className="text-xs text-gray-500">II kat.</div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{wasteKg.toLocaleString()}</div>
          <div className="text-xs text-red-400">Odpad 🗑️</div>
        </CardContent></Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{maxWorkers}</div>
          <div className="text-xs text-blue-500">Pracowników max</div>
        </CardContent></Card>
      </div>

      {sectionsCount === 0 && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
            <p className="text-yellow-700">Brak danych o sekcjach plantacji.</p>
            <p className="text-sm text-yellow-600">Dodaj bloki i sekcje w zakładce "Plantacja".</p>
          </CardContent>
        </Card>
      )}

      {/* Prognoza sezonowa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">📡 Prognoza sezonowa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {seasonForecast.map((month) => (
              <div key={month.month} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="font-medium text-gray-700">{month.month}</div>
                <div className={`text-lg font-bold ${month.color}`}>{month.temp}</div>
                <div className="text-xs text-gray-500 mt-1">{month.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Postęp GDH */}
      {blocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Postęp GDH do pierwszego zbioru
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {blocks.map((block) => (
              <div key={block.id} className="space-y-2">
                <h3 className="font-semibold text-gray-700 border-b pb-1">{block.name}</h3>
                {block.sections?.map((section: any) => {
                  const variety = getVariety(section.variety)
                  const gdhTarget = variety?.gdhThreshold || 20000
                  const progress = Math.min((currentGDH / gdhTarget) * 100, 100)
                  const remaining = Math.max(gdhTarget - currentGDH, 0)
                  
                  return (
                    <div key={section.id} className="pl-4 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span><strong>{section.name}</strong> ({section.variety})</span>
                        <span className={progress >= 100 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                          {progress >= 100 ? '✓ Gotowe!' : `Brakuje: ${remaining.toLocaleString()} GDH`}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : progress >= 80 ? 'bg-yellow-500' : 'bg-green-400'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
