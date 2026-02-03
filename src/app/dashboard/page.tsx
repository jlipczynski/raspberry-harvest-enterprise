'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Layers, Leaf, Users, CloudSun, TrendingUp } from 'lucide-react'

interface Stats {
  blocks: number
  sections: number
  plants: number
  varieties: number
  workers: number
  activeWorkers: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    blocks: 0,
    sections: 0,
    plants: 0,
    varieties: 0,
    workers: 0,
    activeWorkers: 0,
  })
  const [loading, setLoading] = useState(true)
  const [farmName, setFarmName] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      // Fetch plantation data
      const plantationRes = await fetch('/api/plantation')
      const plantationData = await plantationRes.json()
      
      // Fetch workers
      const workersRes = await fetch('/api/workers')
      const workersData = await workersRes.json()
      
      // Fetch varieties
      const varietiesRes = await fetch('/api/varieties')
      const varietiesData = await varietiesRes.json()
      
      const blocks = plantationData.blocks || []
      const workers = workersData.workers || []
      const varieties = varietiesData.varieties || []
      
      const sections = blocks.reduce((sum: number, b: { sections: unknown[] }) => sum + b.sections.length, 0)
      const plants = blocks.reduce((sum: number, b: { sections: { plantsCount: number }[] }) => 
        sum + b.sections.reduce((s: number, sec: { plantsCount: number }) => s + sec.plantsCount, 0), 0)
      
      setStats({
        blocks: blocks.length,
        sections,
        plants,
        varieties: varieties.length,
        workers: workers.length,
        activeWorkers: workers.filter((w: { isActive: boolean }) => w.isActive).length,
      })
      
      if (plantationData.farm) {
        setFarmName(plantationData.farm.name)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Oblicz prognozowany plon (uproszczone)
  const estimatedYield = Math.round(stats.plants * 1.8) // ~1.8 kg na roślinę średnio

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Ładowanie danych...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel główny</h1>
        <p className="text-gray-500">{farmName || 'Witaj w systemie zarządzania plantacją'}</p>
      </div>

      {/* Główne statystyki */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Layers className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Bloki</p>
                <p className="text-2xl font-bold">{stats.blocks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Layers className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Sekcje</p>
                <p className="text-2xl font-bold">{stats.sections}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Leaf className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rośliny</p>
                <p className="text-2xl font-bold">{stats.plants.toLocaleString('pl-PL')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Users className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pracownicy</p>
                <p className="text-2xl font-bold">{stats.activeWorkers}/{stats.workers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prognoza plonu */}
      <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <TrendingUp className="w-5 h-5" />
            Prognoza sezonu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-green-700">Prognozowany plon</p>
              <p className="text-3xl font-bold text-green-800">
                {(estimatedYield / 1000).toFixed(1)} t
              </p>
            </div>
            <div>
              <p className="text-sm text-green-700">Liczba odmian</p>
              <p className="text-3xl font-bold text-green-800">{stats.varieties}</p>
            </div>
            <div>
              <p className="text-sm text-green-700">Wydajność zespołu</p>
              <p className="text-3xl font-bold text-green-800">
                {stats.activeWorkers * 8 * 7} kg/dzień
              </p>
            </div>
            <div>
              <p className="text-sm text-green-700">Szacowany czas zbioru</p>
              <p className="text-3xl font-bold text-green-800">
                {stats.activeWorkers > 0 ? Math.ceil(estimatedYield / (stats.activeWorkers * 8 * 7)) : '–'} dni
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informacje o danych */}
      {stats.blocks === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="text-amber-800">
              <strong>Wskazówka:</strong> Twoja plantacja jest pusta. Przejdź do sekcji "Plantacja" żeby dodać bloki i sekcje.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
