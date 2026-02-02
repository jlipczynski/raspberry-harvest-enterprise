'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Thermometer,
  Calendar,
  TrendingUp,
  Leaf,
  Users,
  CloudSun,
  MapPin,
  Package
} from 'lucide-react'

// ==================== DANE Z MVP ====================

// Odmiany
const varieties = [
  { 
    id: 'variety-1769602445331',
    name: 'Diamond Jubilee', 
    origin: 'Wielka Brytania',
    harvestType: 'double', // letnia + jesienna
    kgPerShootSummer: 1.48,
    kgPerShootAutumn: 0.44,
    gdhThreshold: 20000,
    gdhThresholdAutumn: 100,
    gdhBaseTemperature: 5,
    fruitingPeriodDays: 56,
    kgPerWorkerPerHour: 6,
    secondCategoryPercentage: 9,
    wastePercentage: 2,
  },
  { 
    id: 'variety-1769622230349',
    name: 'Ruby', 
    origin: '',
    harvestType: 'single', // tylko letnia
    kgPerShoot: 2.06,
    gdhThreshold: 20000,
    gdhThresholdLongCane: 21000,
    gdhBaseTemperature: 6,
    fruitingPeriodDays: 56,
    kgPerWorkerPerHour: 8,
    secondCategoryPercentage: 6,
    wastePercentage: 1,
  },
]

// Bloki i sekcje
const blocks = [
  {
    id: 'block-A',
    name: 'Blok A',
    sections: [
      { id: 'section-A1-9', name: 'Blok A1-9', varietyId: 'variety-1769602445331', tunnelCount: 9, runningMeters: 2642, potCount: 5284, shootsPerPot: 2, autumnStartDate: '2026-08-24' },
      { id: 'section-A10-19', name: 'Blok A10-19', varietyId: 'variety-1769602445331', tunnelCount: 10, runningMeters: 2336, potCount: 4672, shootsPerPot: 2, autumnStartDate: '2026-08-24' },
    ]
  },
  {
    id: 'block-B',
    name: 'Blok B',
    sections: [
      { id: 'section-B01-07', name: 'B 01-07', varietyId: 'variety-1769622230349', tunnelCount: 7, runningMeters: 2100, potCount: 4200, shootsPerPot: 2, productionYear: 1, plantSourceType: 'longCane' },
      { id: 'section-B08-13', name: 'Blok B 08-13', varietyId: 'variety-1769622230349', tunnelCount: 6, runningMeters: 1800, potCount: 3600, shootsPerPot: 2, productionYear: 2, plantSourceType: 'standard' },
    ]
  },
  {
    id: 'block-C',
    name: 'Blok C',
    sections: [
      { id: 'section-C01-05', name: 'Blok C 01-05', varietyId: 'variety-1769602445331', tunnelCount: 5, runningMeters: 1500, potCount: 3000, shootsPerPot: 2, productionYear: 1, autumnStartDate: '2026-08-24' },
      { id: 'section-C06-11', name: 'Blok C 06-11', varietyId: 'variety-1769602445331', tunnelCount: 6, runningMeters: 1800, potCount: 3600, shootsPerPot: 2, productionYear: 1, autumnStartDate: '2026-08-24' },
    ]
  },
  {
    id: 'block-D',
    name: 'Blok D',
    sections: [
      { id: 'section-D01-09', name: 'Blok D 01-09', varietyId: 'variety-1769602445331', tunnelCount: 9, runningMeters: 2700, potCount: 5400, shootsPerPot: 2, productionYear: 2, autumnStartDate: '2026-08-24' },
      { id: 'section-D10-18', name: 'Blok D 10-18', varietyId: 'variety-1769602445331', tunnelCount: 9, runningMeters: 2700, potCount: 5400, shootsPerPot: 2, productionYear: 2, autumnStartDate: '2026-08-24' },
    ]
  },
]

// Konfiguracja pracowników
const workerConfig = {
  averageKgPerHour: 8,
  workingHoursPerDay: 8,
  availableWorkers: 80
}

// Plantacja
const plantation = {
  name: 'Plantacja Malin - Wyszynki',
  location: 'Wyszynki, gmina Budzyń',
  latitude: 52.8831,
  longitude: 16.8156
}

// Obliczenia
const totalTunnels = blocks.reduce((sum, block) => 
  sum + block.sections.reduce((s, sec) => s + sec.tunnelCount, 0), 0)

const totalRunningMeters = blocks.reduce((sum, block) => 
  sum + block.sections.reduce((s, sec) => s + sec.runningMeters, 0), 0)

const totalPots = blocks.reduce((sum, block) => 
  sum + block.sections.reduce((s, sec) => s + sec.potCount, 0), 0)

// Aktualne GDH (przykładowe - docelowo z bazy)
const currentGDH = 4850

export default function DashboardPage() {
  const getVarietyName = (varietyId: string) => {
    const variety = varieties.find(v => v.id === varietyId)
    return variety?.name || 'Nieznana'
  }

  const getVariety = (varietyId: string) => {
    return varieties.find(v => v.id === varietyId)
  }

  return (
    <div className="space-y-6">
      {/* Nagłówek z lokalizacją */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plantation.name}</h1>
          <p className="text-gray-500 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {plantation.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Rozpocznij sezon
          </Button>
        </div>
      </div>

      {/* Karty podsumowania */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Aktualne GDH */}
        <Card className="border-l-4 border-l-red-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Aktualne GDH
            </CardTitle>
            <Thermometer className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">{currentGDH.toLocaleString()}</div>
            <p className="text-sm text-gray-500 mt-1">Growing Degree Hours</p>
          </CardContent>
        </Card>

        {/* Tunele */}
        <Card className="border-l-4 border-l-blue-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Tunele
            </CardTitle>
            <Package className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{totalTunnels}</div>
            <p className="text-sm text-gray-500 mt-1">{blocks.length} bloki</p>
          </CardContent>
        </Card>

        {/* Metry bieżące */}
        <Card className="border-l-4 border-l-green-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Metry bieżące
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{totalRunningMeters.toLocaleString()}</div>
            <p className="text-sm text-gray-500 mt-1">m.b. łącznie</p>
          </CardContent>
        </Card>

        {/* Doniczki */}
        <Card className="border-l-4 border-l-orange-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Doniczki
            </CardTitle>
            <Leaf className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-700">{totalPots.toLocaleString()}</div>
            <p className="text-sm text-gray-500 mt-1">{(totalPots * 2).toLocaleString()} pędów</p>
          </CardContent>
        </Card>

        {/* Pracownicy */}
        <Card className="border-l-4 border-l-purple-600">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Pracownicy
            </CardTitle>
            <Users className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">{workerConfig.availableWorkers}</div>
            <p className="text-sm text-gray-500 mt-1">{workerConfig.averageKgPerHour} kg/h • {workerConfig.workingHoursPerDay}h/dzień</p>
          </CardContent>
        </Card>
      </div>

      {/* Postęp GDH dla sekcji */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-red-600" />
            Postęp GDH do pierwszego zbioru - według sekcji
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {blocks.map((block) => (
            <div key={block.id} className="space-y-4">
              <h3 className="font-bold text-lg text-gray-800 border-b pb-2">{block.name}</h3>
              {block.sections.map((section) => {
                const variety = getVariety(section.varietyId)
                const gdhTarget = variety?.gdhThreshold || 20000
                const progress = Math.min((currentGDH / gdhTarget) * 100, 100)
                const isReady = progress >= 100
                const isAlmost = progress >= 80 && progress < 100
                const remaining = Math.max(gdhTarget - currentGDH, 0)
                
                return (
                  <div key={section.id} className="space-y-2 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">{section.name}</span>
                        <span className="ml-2 text-sm text-gray-500">
                          ({getVarietyName(section.varietyId)})
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {section.tunnelCount} tuneli • {section.potCount.toLocaleString()} doniczek
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm px-2 py-1 rounded-full font-medium ${
                          isReady 
                            ? 'bg-green-100 text-green-700' 
                            : isAlmost 
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isReady ? '✓ Gotowe!' : `Brakuje: ${remaining.toLocaleString()} GDH`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isReady 
                              ? 'bg-green-500' 
                              : isAlmost 
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-32 text-right">
                        {currentGDH.toLocaleString()} / {gdhTarget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Odmiany - szczegóły */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-600" />
            Odmiany
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {varieties.map((variety) => (
              <div key={variety.id} className="p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-lg">{variety.name}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    variety.harvestType === 'double' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {variety.harvestType === 'double' ? 'Letnia + Jesienna' : 'Letnia'}
                  </span>
                </div>
                {variety.origin && (
                  <p className="text-sm text-gray-500 mb-2">Pochodzenie: {variety.origin}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">GDH próg:</span>
                    <span className="ml-1 font-medium">{variety.gdhThreshold.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Temp. bazowa:</span>
                    <span className="ml-1 font-medium">{variety.gdhBaseTemperature}°C</span>
                  </div>
                  {variety.harvestType === 'double' ? (
                    <>
                      <div>
                        <span className="text-gray-500">Plon letni:</span>
                        <span className="ml-1 font-medium">{variety.kgPerShootSummer} kg/pęd</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Plon jesienny:</span>
                        <span className="ml-1 font-medium">{variety.kgPerShootAutumn} kg/pęd</span>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span className="text-gray-500">Plon:</span>
                      <span className="ml-1 font-medium">{variety.kgPerShoot} kg/pęd</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Wydajność:</span>
                    <span className="ml-1 font-medium">{variety.kgPerWorkerPerHour} kg/h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Okres owoc.:</span>
                    <span className="ml-1 font-medium">{variety.fruitingPeriodDays} dni</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pogoda - ostatnie dni */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-blue-600" />
            Ostatnie dni - temperatura i GDH
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-gray-500">Data</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-500">Min °C</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-500">Max °C</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-500">GDH dnia</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-500">GDH suma</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { date: '29.01.2026', min: 4, max: 12, gdh: 84, total: 4850 },
                  { date: '28.01.2026', min: 2, max: 10, gdh: 60, total: 4766 },
                  { date: '27.01.2026', min: 5, max: 14, gdh: 108, total: 4706 },
                  { date: '26.01.2026', min: 3, max: 11, gdh: 72, total: 4598 },
                  { date: '25.01.2026', min: 6, max: 15, gdh: 120, total: 4526 },
                  { date: '24.01.2026', min: 4, max: 13, gdh: 96, total: 4406 },
                  { date: '23.01.2026', min: 1, max: 9, gdh: 48, total: 4310 },
                ].map((day, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium">{day.date}</td>
                    <td className="text-center py-3 px-2 text-blue-600">{day.min}°</td>
                    <td className="text-center py-3 px-2 text-red-600">{day.max}°</td>
                    <td className="text-center py-3 px-2">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                        +{day.gdh}
                      </span>
                    </td>
                    <td className="text-right py-3 px-2 font-semibold">{day.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
