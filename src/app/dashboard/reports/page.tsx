'use client'

import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, FileText, Leaf, Cloud } from 'lucide-react'

interface Section {
  name: string
  variety: string
  tunnels: number
  pots: number
  shootsPerPot: number
}

interface Block {
  name: string
  sections?: Section[]
}

interface WeatherDay {
  date: string
  tempMin: number
  tempMax: number
  gdhDaily: number
  gdhCumulative: number
}

interface Variety {
  name: string
  type: string
  summerYield?: number
  autumnYield?: number
  yield?: number
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const saved = localStorage.getItem(key)
  if (saved) return JSON.parse(saved) as T
  return fallback
}

export default function ReportsPage() {
  const [blocks] = useState<Block[]>(() => loadFromStorage('plantationBlocks', []))
  const [varieties] = useState<Variety[]>(() => loadFromStorage('varieties', []))
  const [weatherData] = useState<WeatherDay[]>(() => loadFromStorage('weatherData', []))
  const [workerConfig] = useState(() => loadFromStorage('workerConfig', { availableWorkers: 80, averageEfficiency: 8, hoursPerDay: 8 }))

  // Obliczenia
  const totalSections = blocks.reduce((s: number, b: Block) => s + (b.sections?.length || 0), 0)
  const totalTunnels = blocks.reduce((s: number, b: Block) => s + (b.sections?.reduce((ss: number, sec: Section) => ss + sec.tunnels, 0) || 0), 0)
  const totalPots = blocks.reduce((s: number, b: Block) => s + (b.sections?.reduce((ss: number, sec: Section) => ss + sec.pots, 0) || 0), 0)
  const currentGDH = weatherData.length > 0 ? weatherData[0].gdhCumulative : 0

  const generatePlantationReport = () => {
    let report = `RAPORT PLANTACJI\n`
    report += `Data: ${new Date().toLocaleDateString('pl-PL')}\n\n`
    report += `=== PODSUMOWANIE ===\n`
    report += `Bloków: ${blocks.length}\n`
    report += `Sekcji: ${totalSections}\n`
    report += `Tuneli: ${totalTunnels}\n`
    report += `Doniczek: ${totalPots.toLocaleString()}\n\n`

    report += `=== BLOKI ===\n`
    blocks.forEach(block => {
      report += `\n${block.name}:\n`
      block.sections?.forEach((sec: Section) => {
        report += `  - ${sec.name}: ${sec.variety}, ${sec.tunnels} tuneli, ${sec.pots} doniczek\n`
      })
    })

    downloadReport(report, 'raport-plantacji.txt')
  }

  const generateWeatherReport = () => {
    let report = `RAPORT POGODOWY\n`
    report += `Data: ${new Date().toLocaleDateString('pl-PL')}\n\n`
    report += `Aktualne GDH: ${currentGDH.toLocaleString()}\n`
    report += `Liczba dni: ${weatherData.length}\n\n`

    report += `=== OSTATNIE 14 DNI ===\n`
    report += `Data\t\tMin\tMax\tGDH\tSuma\n`
    weatherData.slice(0, 14).forEach((day: WeatherDay) => {
      const date = new Date(day.date).toLocaleDateString('pl-PL')
      report += `${date}\t${day.tempMin}°\t${day.tempMax}°\t+${day.gdhDaily}\t${day.gdhCumulative}\n`
    })

    downloadReport(report, 'raport-pogodowy.txt')
  }

  const generateFullReport = () => {
    const getVariety = (name: string) => varieties.find(v => v.name === name)

    let totalKg = 0
    blocks.forEach(block => {
      block.sections?.forEach((sec: Section) => {
        const variety = getVariety(sec.variety)
        const shoots = sec.pots * sec.shootsPerPot
        if (variety) {
          if (variety.type === 'double') {
            totalKg += shoots * ((variety.summerYield || 0) + (variety.autumnYield || 0))
          } else {
            totalKg += shoots * (variety.yield || 0)
          }
        }
      })
    })

    let report = `PEŁNY RAPORT SEZONU\n`
    report += `Data: ${new Date().toLocaleDateString('pl-PL')}\n\n`

    report += `=== PLANTACJA ===\n`
    report += `Bloków: ${blocks.length}\n`
    report += `Sekcji: ${totalSections}\n`
    report += `Tuneli: ${totalTunnels}\n`
    report += `Doniczek: ${totalPots.toLocaleString()}\n\n`

    report += `=== PROGNOZA ZBIORÓW ===\n`
    report += `Szacowane zbiory: ${Math.round(totalKg).toLocaleString()} kg\n`
    report += `I kategoria: ${Math.round(totalKg * 0.90).toLocaleString()} kg\n`
    report += `II kategoria: ${Math.round(totalKg * 0.08).toLocaleString()} kg\n`
    report += `Odpad: ${Math.round(totalKg * 0.02).toLocaleString()} kg\n\n`

    report += `=== GDH ===\n`
    report += `Aktualne GDH: ${currentGDH.toLocaleString()}\n`
    report += `Dni z danymi: ${weatherData.length}\n\n`

    report += `=== PRACOWNICY ===\n`
    report += `Dostępnych: ${workerConfig.availableWorkers}\n`
    report += `Średnia wydajność: ${workerConfig.averageEfficiency} kg/h\n`
    report += `Godzin dziennie: ${workerConfig.hoursPerDay}\n`

    downloadReport(report, 'pelny-raport-sezonu.txt')
  }

  const downloadReport = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const reports = [
    {
      id: 1,
      name: 'Raport plantacji',
      description: 'Podsumowanie bloków i sekcji',
      icon: Leaf,
      color: 'green',
      action: generatePlantationReport
    },
    {
      id: 2,
      name: 'Raport pogodowy',
      description: 'Historia GDH i temperatur',
      icon: Cloud,
      color: 'blue',
      action: generateWeatherReport
    },
    {
      id: 3,
      name: 'Pełny raport sezonu',
      description: 'Wszystkie dane w jednym miejscu',
      icon: FileText,
      color: 'purple',
      action: generateFullReport
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raporty</h1>
          <p className="text-gray-500">Generuj i pobieraj raporty</p>
        </div>
      </div>

      {/* Podsumowanie danych */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{totalSections}</div>
            <div className="text-sm text-gray-500">Sekcji</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalTunnels}</div>
            <div className="text-sm text-gray-500">Tuneli</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{weatherData.length}</div>
            <div className="text-sm text-gray-500">Dni pogodowych</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{currentGDH.toLocaleString()}</div>
            <div className="text-sm text-gray-500">GDH</div>
          </CardContent>
        </Card>
      </div>

      {/* Typy raportów */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                report.color === 'green' ? 'bg-green-100' :
                report.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100'
              }`}>
                <report.icon className={`w-6 h-6 ${
                  report.color === 'green' ? 'text-green-600' :
                  report.color === 'blue' ? 'text-blue-600' : 'text-purple-600'
                }`} />
              </div>
              <h3 className="font-semibold mb-1">{report.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{report.description}</p>
              <Button variant="outline" className="w-full" onClick={report.action}>
                <Download className="w-4 h-4 mr-2" />
                Pobierz
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info */}
      <Card className="bg-gray-50">
        <CardContent className="p-4 text-center text-sm text-gray-500">
          Raporty są generowane na podstawie danych zapisanych w aplikacji.
          Upewnij się, że masz aktualne dane przed generowaniem raportu.
        </CardContent>
      </Card>
    </div>
  )
}
