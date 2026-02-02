'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Users, Clock, TrendingUp, X, Pencil, Trash2, Settings } from 'lucide-react'

interface Worker {
  id: string
  name: string
  efficiency: number
  status: 'active' | 'inactive'
}

interface WorkerConfig {
  availableWorkers: number
  averageEfficiency: number
  hoursPerDay: number
}

const defaultWorkers: Worker[] = [
  { id: '1', name: 'Anna Kowalska', efficiency: 9.2, status: 'active' },
  { id: '2', name: 'Jan Nowak', efficiency: 8.5, status: 'active' },
  { id: '3', name: 'Maria Wiśniewska', efficiency: 7.8, status: 'active' },
  { id: '4', name: 'Piotr Kowalczyk', efficiency: 8.1, status: 'active' },
  { id: '5', name: 'Katarzyna Zielińska', efficiency: 9.5, status: 'active' },
]

const defaultConfig: WorkerConfig = {
  availableWorkers: 80,
  averageEfficiency: 8,
  hoursPerDay: 8
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>(defaultWorkers)
  const [config, setConfig] = useState<WorkerConfig>(defaultConfig)
  const [showForm, setShowForm] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [formData, setFormData] = useState({ name: '', efficiency: '8' })

  // Load from localStorage
  useEffect(() => {
    const savedWorkers = localStorage.getItem('workers')
    const savedConfig = localStorage.getItem('workerConfig')
    if (savedWorkers) setWorkers(JSON.parse(savedWorkers))
    if (savedConfig) setConfig(JSON.parse(savedConfig))
  }, [])

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('workers', JSON.stringify(workers))
  }, [workers])

  useEffect(() => {
    localStorage.setItem('workerConfig', JSON.stringify(config))
  }, [config])

  const activeWorkers = workers.filter(w => w.status === 'active').length
  const avgEfficiency = workers.length > 0 
    ? (workers.reduce((s, w) => s + w.efficiency, 0) / workers.length).toFixed(1)
    : '0'

  const resetForm = () => {
    setFormData({ name: '', efficiency: '8' })
    setEditingWorker(null)
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!formData.name.trim()) return

    if (editingWorker) {
      setWorkers(workers.map(w => 
        w.id === editingWorker.id 
          ? { ...w, name: formData.name, efficiency: parseFloat(formData.efficiency) || 8 }
          : w
      ))
    } else {
      const newWorker: Worker = {
        id: `worker-${Date.now()}`,
        name: formData.name,
        efficiency: parseFloat(formData.efficiency) || 8,
        status: 'active'
      }
      setWorkers([...workers, newWorker])
    }
    resetForm()
  }

  const startEdit = (worker: Worker) => {
    setEditingWorker(worker)
    setFormData({ name: worker.name, efficiency: worker.efficiency.toString() })
    setShowForm(true)
  }

  const toggleStatus = (id: string) => {
    setWorkers(workers.map(w => 
      w.id === id 
        ? { ...w, status: w.status === 'active' ? 'inactive' : 'active' }
        : w
    ))
  }

  const deleteWorker = (id: string) => {
    if (confirm('Czy na pewno chcesz usunąć tego pracownika?')) {
      setWorkers(workers.filter(w => w.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pracownicy</h1>
          <p className="text-gray-500">Zarządzaj zespołem i wydajnością</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConfig(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Konfiguracja
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Dodaj pracownika
          </Button>
        </div>
      </div>

      {/* Konfiguracja sezonu */}
      {showConfig && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Konfiguracja sezonu</span>
              <Button variant="ghost" size="icon" onClick={() => setShowConfig(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Maksymalna liczba pracowników</Label>
                <Input
                  type="number"
                  value={config.availableWorkers}
                  onChange={(e) => setConfig({...config, availableWorkers: parseInt(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Średnia wydajność (kg/h)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={config.averageEfficiency}
                  onChange={(e) => setConfig({...config, averageEfficiency: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Godzin pracy dziennie</Label>
                <Input
                  type="number"
                  value={config.hoursPerDay}
                  onChange={(e) => setConfig({...config, hoursPerDay: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
            <Button onClick={() => setShowConfig(false)} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Zapisz
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Formularz dodawania pracownika */}
      {showForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>{editingWorker ? 'Edytuj pracownika' : 'Nowy pracownik'}</span>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Imię i nazwisko</Label>
                <Input
                  placeholder="np. Jan Kowalski"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Wydajność (kg/h)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="8"
                  value={formData.efficiency}
                  onChange={(e) => setFormData({...formData, efficiency: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                {editingWorker ? 'Zapisz zmiany' : 'Dodaj pracownika'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Anuluj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Konfiguracja - widok */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Konfiguracja sezonu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{config.availableWorkers}</div>
              <div className="text-sm text-gray-600">Max pracowników</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{config.averageEfficiency} kg/h</div>
              <div className="text-sm text-gray-600">Średnia wydajność</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">{config.hoursPerDay}h</div>
              <div className="text-sm text-gray-600">Godzin dziennie</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Podsumowanie */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Zapisanych</p>
                <p className="text-3xl font-bold text-green-600">{workers.length}</p>
              </div>
              <Users className="w-10 h-10 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Aktywnych</p>
                <p className="text-3xl font-bold text-blue-600">{activeWorkers}</p>
              </div>
              <Users className="w-10 h-10 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Śr. wydajność</p>
                <p className="text-3xl font-bold text-orange-600">{avgEfficiency} kg/h</p>
              </div>
              <TrendingUp className="w-10 h-10 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista pracowników */}
      <Card>
        <CardHeader>
          <CardTitle>Lista pracowników ({workers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Brak pracowników</p>
              <p className="text-sm">Kliknij "Dodaj pracownika" aby dodać pierwszego</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Imię i nazwisko</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Wydajność (kg/h)</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker) => (
                    <tr key={worker.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{worker.name}</td>
                      <td className="text-center py-3 px-4">
                        <span className={`font-semibold ${
                          worker.efficiency >= 8.5 ? 'text-green-600' : 
                          worker.efficiency >= 7 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {worker.efficiency}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <button
                          onClick={() => toggleStatus(worker.id)}
                          className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer ${
                            worker.status === 'active' 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {worker.status === 'active' ? 'Aktywny' : 'Nieaktywny'}
                        </button>
                      </td>
                      <td className="text-right py-3 px-4">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(worker)}>
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => deleteWorker(worker.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
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
