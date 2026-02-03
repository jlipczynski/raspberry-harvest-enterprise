'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Users, X, Trash2 } from 'lucide-react'

interface Worker {
  id: string
  name: string
  phone?: string
  efficiencyKgH: number
  isActive: boolean
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    efficiencyKgH: 8,
  })

  useEffect(() => {
    fetchWorkers()
  }, [])

  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/workers')
      const data = await res.json()
      setWorkers(data.workers || [])
    } catch (error) {
      console.error('Error fetching workers:', error)
    } finally {
      setLoading(false)
    }
  }

  const addWorker = async () => {
    if (!formData.name.trim()) return
    
    // Get farm ID first
    const farmRes = await fetch('/api/plantation')
    const farmData = await farmRes.json()
    
    if (!farmData.farm) {
      alert('Najpierw zainicjalizuj dane plantacji')
      return
    }
    
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker: {
            name: formData.name,
            phone: formData.phone,
            efficiency: formData.efficiencyKgH,
            status: 'active'
          },
          farmId: farmData.farm.id
        })
      })
      
      if (res.ok) {
        setFormData({ name: '', phone: '', efficiencyKgH: 8 })
        setShowForm(false)
        fetchWorkers()
      }
    } catch (error) {
      console.error('Error adding worker:', error)
    }
  }

  const deleteWorker = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego pracownika?')) return
    
    try {
      const res = await fetch(`/api/workers/${id}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        fetchWorkers()
      }
    } catch (error) {
      console.error('Error deleting worker:', error)
    }
  }

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/workers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      })
      
      if (res.ok) {
        fetchWorkers()
      }
    } catch (error) {
      console.error('Error updating worker:', error)
    }
  }

  const activeWorkers = workers.filter(w => w.isActive)
  const avgEfficiency = workers.length > 0 
    ? (workers.reduce((sum, w) => sum + w.efficiencyKgH, 0) / workers.length).toFixed(1)
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Ładowanie pracowników...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pracownicy</h1>
          <p className="text-gray-500">Zarządzaj zespołem zbierającym</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj pracownika
        </Button>
      </div>

      {/* Statystyki */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Wszyscy</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Aktywni</p>
                <p className="text-2xl font-bold">{activeWorkers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Śr. wydajność</p>
                <p className="text-2xl font-bold">{avgEfficiency} kg/h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formularz */}
      {showForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Nowy pracownik</span>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Imię i nazwisko</Label>
                <Input
                  placeholder="np. Jan Kowalski"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  placeholder="np. 123 456 789"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div>
                <Label>Wydajność (kg/h)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.efficiencyKgH}
                  onChange={(e) => setFormData({...formData, efficiencyKgH: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={addWorker} className="bg-green-600 hover:bg-green-700">
                Dodaj pracownika
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Anuluj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista pracowników */}
      <Card>
        <CardHeader>
          <CardTitle>Lista pracowników</CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length > 0 ? (
            <div className="space-y-2">
              {workers.map((worker) => (
                <div key={worker.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${worker.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="font-medium">{worker.name}</span>
                    {worker.phone && <span className="text-sm text-gray-500">{worker.phone}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{worker.efficiencyKgH} kg/h</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatus(worker.id, worker.isActive)}
                    >
                      {worker.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => deleteWorker(worker.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">
              Brak pracowników. Kliknij "Dodaj pracownika" żeby dodać pierwszego.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
