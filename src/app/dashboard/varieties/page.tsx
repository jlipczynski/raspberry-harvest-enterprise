'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Leaf, X, Pencil, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react'

interface Variety {
  id: string
  name: string
  origin?: string
  description?: string
  yieldSummerPerShoot?: number
  yieldAutumnPerShoot?: number
  gdhSummer?: number
  gdhAutumn?: number
  harvestCurveSummer?: number[]
  harvestCurveAutumn?: number[]
  pickingEfficiency?: number
  wastePercent?: number
  secondCategoryPercent?: number
  isCustom: boolean
}

const defaultCurveSummer = [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1]
const defaultCurveAutumn = [5, 15, 25, 25, 15, 10, 5]

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingVariety, setEditingVariety] = useState<Variety | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    origin: '',
    description: '',
    yieldSummerPerShoot: 1.5,
    yieldAutumnPerShoot: 0.5,
    gdhSummer: 20000,
    gdhAutumn: 25000,
    harvestCurveSummer: defaultCurveSummer.join(', '),
    harvestCurveAutumn: defaultCurveAutumn.join(', '),
    pickingEfficiency: 8,
    wastePercent: 2,
    secondCategoryPercent: 8,
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

  const resetForm = () => {
    setFormData({
      name: '',
      origin: '',
      description: '',
      yieldSummerPerShoot: 1.5,
      yieldAutumnPerShoot: 0.5,
      gdhSummer: 20000,
      gdhAutumn: 25000,
      harvestCurveSummer: defaultCurveSummer.join(', '),
      harvestCurveAutumn: defaultCurveAutumn.join(', '),
      pickingEfficiency: 8,
      wastePercent: 2,
      secondCategoryPercent: 8,
    })
    setEditingVariety(null)
    setShowForm(false)
  }

  const startEdit = (variety: Variety) => {
    setEditingVariety(variety)
    setFormData({
      name: variety.name,
      origin: variety.origin || '',
      description: variety.description || '',
      yieldSummerPerShoot: variety.yieldSummerPerShoot || 1.5,
      yieldAutumnPerShoot: variety.yieldAutumnPerShoot || 0.5,
      gdhSummer: variety.gdhSummer || 20000,
      gdhAutumn: variety.gdhAutumn || 25000,
      harvestCurveSummer: (variety.harvestCurveSummer || defaultCurveSummer).join(', '),
      harvestCurveAutumn: (variety.harvestCurveAutumn || defaultCurveAutumn).join(', '),
      pickingEfficiency: variety.pickingEfficiency || 8,
      wastePercent: variety.wastePercent || 2,
      secondCategoryPercent: variety.secondCategoryPercent || 8,
    })
    setShowForm(true)
  }

  const parseCurve = (str: string): number[] => {
    return str.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  }

  const saveVariety = async () => {
    if (!formData.name.trim()) return
    
    const payload = {
      name: formData.name,
      origin: formData.origin,
      description: formData.description,
      yieldSummerPerShoot: formData.yieldSummerPerShoot,
      yieldAutumnPerShoot: formData.yieldAutumnPerShoot,
      gdhSummer: formData.gdhSummer,
      gdhAutumn: formData.gdhAutumn,
      harvestCurveSummer: parseCurve(formData.harvestCurveSummer),
      harvestCurveAutumn: parseCurve(formData.harvestCurveAutumn),
      pickingEfficiency: formData.pickingEfficiency,
      wastePercent: formData.wastePercent,
      secondCategoryPercent: formData.secondCategoryPercent,
    }
    
    try {
      if (editingVariety) {
        await fetch(`/api/varieties/${editingVariety.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } else {
        await fetch('/api/varieties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variety: payload })
        })
      }
      
      resetForm()
      fetchVarieties()
    } catch (error) {
      console.error('Error saving variety:', error)
    }
  }

  const deleteVariety = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę odmianę?')) return
    
    try {
      const res = await fetch(`/api/varieties/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchVarieties()
      } else {
        const data = await res.json()
        alert(data.error || 'Nie można usunąć odmiany')
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
          <p className="text-gray-500">Katalog odmian malin z normami produkcyjnymi</p>
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
              <span>{editingVariety ? 'Edytuj odmianę' : 'Nowa odmiana'}</span>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Podstawowe */}
            <div>
              <h3 className="font-medium mb-3 text-gray-700">Dane podstawowe</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Nazwa odmiany *</Label>
                  <Input
                    placeholder="np. Diamond Jubilee"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Pochodzenie</Label>
                  <Input
                    placeholder="np. Wielka Brytania"
                    value={formData.origin}
                    onChange={(e) => setFormData({...formData, origin: e.target.value})}
                  />
                </div>
                <div className="md:col-span-1">
                  <Label>Opis</Label>
                  <Input
                    placeholder="Krótka charakterystyka"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Normy produkcyjne */}
            <div>
              <h3 className="font-medium mb-3 text-gray-700">Normy produkcyjne (domyślne)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Norma LATO (kg/pęd)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.yieldSummerPerShoot}
                    onChange={(e) => setFormData({...formData, yieldSummerPerShoot: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>Norma JESIEŃ (kg/pęd)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.yieldAutumnPerShoot}
                    onChange={(e) => setFormData({...formData, yieldAutumnPerShoot: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>GDH do zbioru LATO</Label>
                  <Input
                    type="number"
                    value={formData.gdhSummer}
                    onChange={(e) => setFormData({...formData, gdhSummer: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>GDH do zbioru JESIEŃ</Label>
                  <Input
                    type="number"
                    value={formData.gdhAutumn}
                    onChange={(e) => setFormData({...formData, gdhAutumn: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            {/* Krzywe zbioru */}
            <div>
              <h3 className="font-medium mb-3 text-gray-700">Krzywe zbioru (% na tydzień, suma = 100)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Krzywa LATO (oddzielone przecinkami)</Label>
                  <Input
                    placeholder="2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1"
                    value={formData.harvestCurveSummer}
                    onChange={(e) => setFormData({...formData, harvestCurveSummer: e.target.value})}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suma: {parseCurve(formData.harvestCurveSummer).reduce((a, b) => a + b, 0)}%
                  </p>
                </div>
                <div>
                  <Label>Krzywa JESIEŃ (oddzielone przecinkami)</Label>
                  <Input
                    placeholder="5, 15, 25, 25, 15, 10, 5"
                    value={formData.harvestCurveAutumn}
                    onChange={(e) => setFormData({...formData, harvestCurveAutumn: e.target.value})}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suma: {parseCurve(formData.harvestCurveAutumn).reduce((a, b) => a + b, 0)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Statystyki zbierania */}
            <div>
              <h3 className="font-medium mb-3 text-gray-700">Statystyki zbierania</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Wydajność zbierania (kg/h)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.pickingEfficiency}
                    onChange={(e) => setFormData({...formData, pickingEfficiency: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>% odpadu</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.wastePercent}
                    onChange={(e) => setFormData({...formData, wastePercent: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>% II kategorii</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.secondCategoryPercent}
                    onChange={(e) => setFormData({...formData, secondCategoryPercent: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={saveVariety} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                {editingVariety ? 'Zapisz zmiany' : 'Dodaj odmianę'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Anuluj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista odmian */}
      <div className="space-y-4">
        {varieties.map((variety) => (
          <Card key={variety.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <div 
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === variety.id ? null : variety.id)}
                >
                  <Leaf className="w-5 h-5 text-green-600" />
                  <span>{variety.name}</span>
                  {variety.origin && (
                    <span className="text-sm font-normal text-gray-500">({variety.origin})</span>
                  )}
                  {expandedId === variety.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {variety.isCustom && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      Własna
                    </span>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => startEdit(variety)}>
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteVariety(variety.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Podsumowanie - zawsze widoczne */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-orange-50 p-3 rounded">
                  <div className="text-orange-600 text-xs">Norma LATO</div>
                  <div className="font-semibold">{variety.yieldSummerPerShoot || '–'} kg/pęd</div>
                </div>
                <div className="bg-amber-50 p-3 rounded">
                  <div className="text-amber-600 text-xs">Norma JESIEŃ</div>
                  <div className="font-semibold">{variety.yieldAutumnPerShoot || '–'} kg/pęd</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-green-600 text-xs">GDH LATO</div>
                  <div className="font-semibold">{variety.gdhSummer?.toLocaleString('pl-PL') || '–'}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-blue-600 text-xs">GDH JESIEŃ</div>
                  <div className="font-semibold">{variety.gdhAutumn?.toLocaleString('pl-PL') || '–'}</div>
                </div>
              </div>

              {/* Szczegóły - rozwijane */}
              {expandedId === variety.id && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {variety.description && (
                    <p className="text-gray-600">{variety.description}</p>
                  )}
                  
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="text-gray-500 text-xs">Wydajność zbierania</div>
                      <div className="font-semibold">{variety.pickingEfficiency || 8} kg/h</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded">
                      <div className="text-red-600 text-xs">% odpadu</div>
                      <div className="font-semibold">{variety.wastePercent || 0}%</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded">
                      <div className="text-yellow-600 text-xs">% II kategorii</div>
                      <div className="font-semibold">{variety.secondCategoryPercent || 0}%</div>
                    </div>
                  </div>

                  {/* Wizualizacja krzywych */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Krzywa zbioru LATO</h4>
                      <div className="flex items-end gap-1 h-20">
                        {(variety.harvestCurveSummer || defaultCurveSummer).map((val, i) => (
                          <div
                            key={i}
                            className="bg-orange-400 rounded-t flex-1 min-w-[8px]"
                            style={{ height: `${(val / 20) * 100}%` }}
                            title={`Tydzień ${i + 1}: ${val}%`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(variety.harvestCurveSummer || defaultCurveSummer).length} tygodni
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Krzywa zbioru JESIEŃ</h4>
                      <div className="flex items-end gap-1 h-20">
                        {(variety.harvestCurveAutumn || defaultCurveAutumn).map((val, i) => (
                          <div
                            key={i}
                            className="bg-amber-400 rounded-t flex-1 min-w-[8px]"
                            style={{ height: `${(val / 30) * 100}%` }}
                            title={`Tydzień ${i + 1}: ${val}%`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(variety.harvestCurveAutumn || defaultCurveAutumn).length} tygodni
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
