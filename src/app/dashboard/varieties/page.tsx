'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Leaf, X, Pencil, Trash2 } from 'lucide-react'

interface Variety {
  id: string
  name: string
  gdhFirstHarvest: number
  avgYieldPerPlant: number
  fruitCurve: number[]
  isCustom: boolean
}

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    gdhFirstHarvest: 20000,
    avgYieldPerPlant: 1.5,
  })

  useEffect(() => {
    fetchVarieties()
  }, [])

  const fetchVarieties = async () => {
    try {
      const res = await fetch('/api/varieties')
      const data = await res.json()
      setVarieties(data.varieties || [])
    } catch (error) {
      console.error('Error fetching varieties:', error)
    } finally {
      setLoading(false)
    }
  }

  const addVariety = async () => {
    if (!formData.name.trim()) return
    
    try {
      const res = await fetch('/api/varieties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variety: {
            name: formData.name,
            gdhThreshold: formData.gdhFirstHarvest,
            yield: formData.avgYieldPerPlant,
          }
        })
      })
      
      if (res.ok) {
        setFormData({ name: '', gdhFirstHarvest: 20000, avgYieldPerPlant: 1.5 })
        setShowForm(false)
        fetchVarieties()
      }
    } catch (error) {
      console.error('Error adding variety:', error)
    }
  }

  const deleteVariety = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę odmianę?')) return
    
    try {
      const res = await fetch(`/api/varieties/${id}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        fetchVarieties()
      }
    } catch (error) {
      console.error('Error deleting variety:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Ładowanie odmian...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Odmiany</h1>
          <p className="text-gray-500">Zarządzaj odmianami malin</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj odmianę
        </Button>
      </div>

      {/* Formularz */}
      {showForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Nowa odmiana</span>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Nazwa odmiany</Label>
                <Input
                  placeholder="np. Glen Ample"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Próg GDH</Label>
                <Input
                  type="number"
                  value={formData.gdhFirstHarvest}
                  onChange={(e) => setFormData({...formData, gdhFirstHarvest: parseInt(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Plon (kg/roślina)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.avgYieldPerPlant}
                  onChange={(e) => setFormData({...formData, avgYieldPerPlant: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={addVariety} className="bg-green-600 hover:bg-green-700">
                Dodaj odmianę
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Anuluj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista odmian */}
      <div className="grid gap-4 md:grid-cols-2">
        {varieties.map((variety) => (
          <Card key={variety.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Leaf className="w-5 h-5 text-green-600" />
                  {variety.name}
                </div>
                <div className="flex items-center gap-2">
                  {variety.isCustom && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      Własna
                    </span>
                  )}
                  {variety.isCustom && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => deleteVariety(variety.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <div className="text-gray-500">GDH próg</div>
                  <div className="font-semibold">{variety.gdhFirstHarvest.toLocaleString('pl-PL')}</div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="text-green-600">Plon</div>
                  <div className="font-semibold">{variety.avgYieldPerPlant} kg/roślina</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {varieties.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-gray-500">
              Brak odmian. Kliknij "Dodaj odmianę" żeby dodać pierwszą.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
