'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  RefreshCw,
  Layers,
  Sun,
  Snowflake,
  CheckCircle,
  TrendingUp,
  Calendar,
  Users
} from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    sections: 0,
    totalKg: 0,
    summerKg: 0,
    autumnKg: 0,
    firstCatKg: 0,
    secondCatKg: 0,
    wasteKg: 0,
    maxWorkers: 0
  })
  const [currentGDH, setCurrentGDH] = useState(0)
  const [weeklyData, setWeeklyData] = useState<{week: number, kg: number, workers: number}[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Pobierz dane z API lub localStorage
      const blocks = JSON.parse(localStorage.getItem('plantationBlocks') || '[]')
      const varieties = JSON.parse(localStorage.getItem('varieties') || '[]')
      const weather = JSON.parse(localStorage.getItem('weatherData') || '[]')
      const workerConfig = JSON.parse(localStorage.getItem('workerConfig') || '{"availableWorkers":80,"averageEfficiency":8,"hoursPerDay":8}')

      // Oblicz statystyki
      const getVariety = (name: string) => varieties.find((v: any) => v.name === name)
      
      let totalSummerKg = 0
      let totalAutumnKg = 0
      let sectionsCount = 0

      blocks.forEach((block: any) => {
        block.sections?.forEach((section: any) => {
          sectionsCount++
          const variety = getVariety(section.variety)
          const shoots = section.pots * section.shootsPerPot
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
      const maxWorkers = Math.min(Math.ceil(totalKg / 56 * 1.5 / 64), workerConfig.availableWorkers)

      setStats({
        sections: sectionsCount,
        totalKg: Math.round(totalKg),
        summerKg: Math.round(totalSummerKg),
        autumnKg: Math.round(totalAutumnKg),
        firstCatKg,
        secondCatKg,
        wasteKg,
        maxWorkers
      })

      // GDH
      if (weather.length > 0) {
        setCurrentGDH(weather[0].gdhCumulative || 0)
      }

      // Generuj dane wykresu (krzywa owocowania)
      generateWeeklyData(totalKg, maxWorkers)

    } catch (error) {
      console.error('Error loading data:', error)
    }
    setIsLoading(false)
  }

  const generateWeeklyData = (totalKg: number, maxWorkers: number) => {
    // Krzywa owocowania - typowy rozkład dla malin (12 tygodni)
    const distribution = [0.02, 0.06, 0.12, 0.16, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01]
    
    const data = distribution.map((pct, i) => ({
      week: 22 + i, // Rozpoczęcie od tygodnia 22 (koniec maja)
      kg: Math.round(totalKg * pct),
      workers: Math.round(maxWorkers * (pct / 0.16)) // Proporcjonalnie do szczytu
    }))
    
    setWeeklyData(data)
  }

  const maxKg = Math.max(...weeklyData.map(d => d.kg), 1)

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planowanie zbiorów</h1>
          <p className="text-gray-500">Zaplanuj zbiory i zapotrzebowanie na pracowników</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Aktualizuj dane
        </Button>
      </div>

      {/* GDH Status */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <TrendingUp className="w-10 h-10 text-green-600" />
            <div>
              <div className="text-sm text-green-600">Aktualne GDH</div>
              <div className="text-3xl font-bold text-green-700">{currentGDH.toLocaleString()}</div>
            </div>
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="bg-white">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-800">{stats.sections}</div>
            <div className="text-xs text-gray-500">Sekcji</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">{stats.totalKg.toLocaleString()}</div>
            <div className="text-xs text-yellow-600">kg razem</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.summerKg.toLocaleString()}</div>
            <div className="text-xs text-orange-500 flex items-center justify-center gap-1">
              kg lato <Sun className="w-3 h-3" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.autumnKg.toLocaleString()}</div>
            <div className="text-xs text-amber-500 flex items-center justify-center gap-1">
              kg jesień <Snowflake className="w-3 h-3" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.firstCatKg.toLocaleString()}</div>
            <div className="text-xs text-green-500 flex items-center justify-center gap-1">
              I kat. <CheckCircle className="w-3 h-3" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.secondCatKg.toLocaleString()}</div>
            <div className="text-xs text-gray-500">II kat.</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{stats.wasteKg.toLocaleString()}</div>
            <div className="text-xs text-red-400 flex items-center justify-center gap-1">
              Odpad 🗑️
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.maxWorkers}</div>
            <div className="text-xs text-blue-500">Pracowników max</div>
          </CardContent>
        </Card>
      </div>

      {/* Prognoza sezonowa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="text-xl">📡</span>
            Prognoza sezonowa
          </CardTitle>
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

      {/* Wykres - Prognoza zbiorów */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-red-500" />
            Prognoza zbiorów - rozkład tygodniowy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyData.length > 0 ? (
            <>
              <div className="h-64 flex items-end gap-2 px-2">
                {weeklyData.map((week) => (
                  <div key={week.week} className="flex-1 flex flex-col items-center">
                    {/* Słupek */}
                    <div className="w-full relative group">
                      {/* Tooltip */}
                      <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 transition-opacity">
                        <div>{week.kg.toLocaleString()} kg</div>
                        <div>{week.workers} pracowników</div>
                      </div>
                      {/* Słupek żółty */}
                      <div 
                        className="w-full bg-gradient-to-t from-yellow-500 to-yellow-300 rounded-t-sm transition-all hover:from-yellow-600 hover:to-yellow-400"
                        style={{ height: `${(week.kg / maxKg) * 200}px`, minHeight: '4px' }}
                      />
                      {/* Linia pracowników */}
                      <div 
                        className="absolute w-3 h-3 bg-blue-500 rounded-full left-1/2 -translate-x-1/2 border-2 border-white"
                        style={{ bottom: `${(week.workers / stats.maxWorkers) * 200}px` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-2 font-medium">T{week.week}</div>
                  </div>
                ))}
              </div>
              
              {/* Legenda */}
              <div className="flex items-center justify-center gap-6 mt-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gradient-to-t from-yellow-500 to-yellow-300 rounded-sm"></div>
                  <span className="text-gray-600">Zbiory (kg)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-600">Pracownicy</span>
                </div>
              </div>

              {/* Podsumowanie pod wykresem */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{stats.totalKg.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">kg łącznie</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">12</div>
                  <div className="text-sm text-gray-500">tygodni zbiorów</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.maxWorkers}</div>
                  <div className="text-sm text-gray-500">max pracowników</div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Brak danych do wykresu</p>
                <p className="text-sm">Dodaj sekcje w zakładce Plantacja</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
