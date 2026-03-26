'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Leaf, X, Pencil, Trash2, Save, ChevronDown, ChevronUp, BarChart3, Database } from 'lucide-react'

interface HarvestCurveData {
  id: string; year: number; season: string; curve: number[]; dailyCurve: number[]
  startDate?: string; totalKg: number; startWeek: number
  section?: { id: string; name: string } | null
  variety?: { id: string; name: string } | null
  sourceFile?: string
}

interface Variety {
  id: string; name: string; origin?: string; description?: string
  yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number
  baseTemp?: number
  // GDH progi — LATO
  gdhWinteredFlowerSummer?: number; gdhWinteredFruitSummer?: number
  gdhPlantedFlowerSummer?: number; gdhPlantedFruitSummer?: number
  gdhLcFlowerSummer?: number; gdhLcFruitSummer?: number
  // GDH próg — JESIEŃ (od pędów jesiennych do owocowania)
  gdhFruitAutumn?: number
  harvestCurveSummer?: number[] | string; harvestCurveAutumn?: number[] | string
  pickingEfficiency?: number; wastePercent?: number; secondCategoryPercent?: number
  isCustom?: boolean
}

// No hardcoded default curves — user enters their own data

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingVariety, setEditingVariety] = useState<Variety | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, 'info' | 'curves'>>({})
  const [varietyCurves, setVarietyCurves] = useState<Record<string, HarvestCurveData[]>>({})
  const [loadingCurves, setLoadingCurves] = useState<Record<string, boolean>>({})
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<{
    name: string; origin: string; description: string
    yieldSummerPerShoot: number; yieldAutumnPerShoot: number
    baseTemp: number
    gdhWinteredFlowerSummer: number; gdhWinteredFruitSummer: number
    gdhPlantedFlowerSummer: number; gdhPlantedFruitSummer: number
    gdhLcFlowerSummer: number; gdhLcFruitSummer: number
    gdhFruitAutumn: number
    harvestCurveSummer: string | number[]; harvestCurveAutumn: string | number[]
    pickingEfficiency: number; wastePercent: number; secondCategoryPercent: number
  }>({
    name: '', origin: '', description: '',
    yieldSummerPerShoot: 1.5, yieldAutumnPerShoot: 0.5,
    baseTemp: 6.0,
    gdhWinteredFlowerSummer: 0, gdhWinteredFruitSummer: 0,
    gdhPlantedFlowerSummer: 0, gdhPlantedFruitSummer: 0,
    gdhLcFlowerSummer: 0, gdhLcFruitSummer: 0,
    gdhFruitAutumn: 0,
    harvestCurveSummer: '', harvestCurveAutumn: '',
    pickingEfficiency: 8, wastePercent: 0, secondCategoryPercent: 0,
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
      name: '', origin: '', description: '',
      yieldSummerPerShoot: 1.5, yieldAutumnPerShoot: 0.5,
      baseTemp: 6.0,
      gdhWinteredFlowerSummer: 0, gdhWinteredFruitSummer: 0,
      gdhPlantedFlowerSummer: 0, gdhPlantedFruitSummer: 0,
      gdhLcFlowerSummer: 0, gdhLcFruitSummer: 0,
      gdhWinteredFlowerAutumn: 0, gdhWinteredFruitAutumn: 0,
      gdhPlantedFlowerAutumn: 0, gdhPlantedFruitAutumn: 0,
      gdhLcFlowerAutumn: 0, gdhLcFruitAutumn: 0,
      harvestCurveSummer: '', harvestCurveAutumn: '',
      pickingEfficiency: 8, wastePercent: 0, secondCategoryPercent: 0,
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
      baseTemp: variety.baseTemp || 6.0,
      gdhWinteredFlowerSummer: variety.gdhWinteredFlowerSummer || 0,
      gdhWinteredFruitSummer: variety.gdhWinteredFruitSummer || 0,
      gdhPlantedFlowerSummer: variety.gdhPlantedFlowerSummer || 0,
      gdhPlantedFruitSummer: variety.gdhPlantedFruitSummer || 0,
      gdhLcFlowerSummer: variety.gdhLcFlowerSummer || 0,
      gdhLcFruitSummer: variety.gdhLcFruitSummer || 0,
      gdhFruitAutumn: variety.gdhFruitAutumn || 0,
      harvestCurveSummer: Array.isArray(variety.harvestCurveSummer) ? variety.harvestCurveSummer.join(', ') : String(variety.harvestCurveSummer || ''),
      harvestCurveAutumn: Array.isArray(variety.harvestCurveAutumn) ? variety.harvestCurveAutumn.join(', ') : String(variety.harvestCurveAutumn || ''),
      pickingEfficiency: variety.pickingEfficiency ?? 8,
      wastePercent: variety.wastePercent ?? 0,
      secondCategoryPercent: variety.secondCategoryPercent ?? 0,
    })
    setShowForm(true)
  }

  const parseCurve = (input: string | number[]): number[] => {
    if (Array.isArray(input)) return input
    return input.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  }

  const saveVariety = async () => {
    if (!formData.name.trim()) return
    
    const payload = {
      name: formData.name,
      origin: formData.origin,
      description: formData.description,
      yieldSummerPerShoot: formData.yieldSummerPerShoot,
      yieldAutumnPerShoot: formData.yieldAutumnPerShoot,
      baseTemp: formData.baseTemp || null,
      gdhWinteredFlowerSummer: formData.gdhWinteredFlowerSummer || null,
      gdhWinteredFruitSummer: formData.gdhWinteredFruitSummer || null,
      gdhPlantedFlowerSummer: formData.gdhPlantedFlowerSummer || null,
      gdhPlantedFruitSummer: formData.gdhPlantedFruitSummer || null,
      gdhLcFlowerSummer: formData.gdhLcFlowerSummer || null,
      gdhLcFruitSummer: formData.gdhLcFruitSummer || null,
      gdhFruitAutumn: formData.gdhFruitAutumn || null,
      harvestCurveSummer: parseCurve(formData.harvestCurveSummer),
      harvestCurveAutumn: parseCurve(formData.harvestCurveAutumn),
      pickingEfficiency: formData.pickingEfficiency,
      wastePercent: formData.wastePercent,
      secondCategoryPercent: formData.secondCategoryPercent,
    }
    
    try {
      if (editingVariety) {
        await fetch('/api/varieties/' + editingVariety.id, {
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

  const fetchCurvesForVariety = async (varietyId: string) => {
    if (varietyCurves[varietyId]) return
    setLoadingCurves(p => ({ ...p, [varietyId]: true }))
    try {
      const res = await fetch(`/api/harvest-curves?varietyId=${varietyId}`)
      const data = await res.json()
      setVarietyCurves(p => ({ ...p, [varietyId]: data.curves || [] }))
    } catch (e) { console.error('Error fetching curves:', e) }
    finally { setLoadingCurves(p => ({ ...p, [varietyId]: false })) }
  }

  const saveAsTemplate = async (curve: HarvestCurveData, variety: Variety) => {
    setSavingTemplate(curve.id)
    try {
      const weeklyCurve = curve.curve.length > 0 ? curve.curve : []
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${variety.name} — ${curve.season === 'summer' ? 'Lato' : 'Jesień'} ${curve.year}${curve.section ? ' (' + curve.section.name + ')' : ''}`,
          productionYear: curve.year,
          season: curve.season,
          varietyId: variety.id,
          dailyCurve: curve.dailyCurve || [],
          weeklyCurve,
          startDate: curve.startDate || null,
          startWeek: curve.startWeek,
          totalKg: curve.totalKg,
          sourceFile: curve.sourceFile || null,
          productionCycle: 1,
        }),
      })
      alert('Szablon utworzony!')
    } catch (e) { console.error('Error saving template:', e); alert('Błąd zapisu szablonu') }
    finally { setSavingTemplate(null) }
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
            <h3 className="font-semibold text-gray-700 mt-6 mb-3">Normy produkcyjne</h3>

                  {/* Temp bazowa */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 border">
                    <div className="grid grid-cols-1 gap-4" style={{maxWidth:'200px'}}>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">🌡️ Temperatura bazowa GDH (°C)</label>
                        <input type="number" step="0.5" className="w-full border rounded px-3 py-2 text-sm mt-1"
                          value={formData.baseTemp || ''}
                          onChange={(e) => setFormData({...formData, baseTemp: parseFloat(e.target.value) || 6.0})}
                          placeholder="6.0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* LATO */}
                  <div className="bg-orange-50 rounded-lg p-4 mb-4 border border-orange-200">
                    <p className="text-sm font-semibold text-orange-800 mb-3">☀️ Sezon letni</p>
                    <div className="grid grid-cols-1 gap-4 mb-3">
                      <div style={{maxWidth:'200px'}}>
                        <label className="text-xs text-gray-500 font-medium">Norma LATO (kg/pęd)</label>
                        <input type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                          value={formData.yieldSummerPerShoot}
                          onChange={(e) => setFormData({...formData, yieldSummerPerShoot: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    </div>
                    <div className="bg-orange-100/50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-orange-700 mb-2">❄️ Zimowane w tunelu</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500">🌸 GDH do kwitnienia</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhWinteredFlowerSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhWinteredFlowerSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 7000"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">🍒 GDH do owocowania</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhWinteredFruitSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhWinteredFruitSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 10000"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-orange-100/50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-orange-700 mb-2">🌱 Wysadzona (doniczka/korzeń)</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500">🌸 GDH do kwitnienia</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhPlantedFlowerSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhPlantedFlowerSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 9000"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">🍒 GDH do owocowania</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhPlantedFruitSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhPlantedFruitSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 12000"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-orange-100/50 rounded-lg p-3">
                      <p className="text-xs font-medium text-orange-700 mb-2">🚚 Ze szkółki (Long Canes)</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500">🌸 GDH do kwitnienia</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhLcFlowerSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhLcFlowerSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 8000"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">🍒 GDH do owocowania</label>
                          <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                            value={formData.gdhLcFruitSummer || ''}
                            onChange={(e) => setFormData({...formData, gdhLcFruitSummer: parseInt(e.target.value) || 0})}
                            placeholder="np. 10500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* JESIEŃ */}
                  <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                    <p className="text-sm font-semibold text-red-800 mb-3">🍂 Sezon jesienny</p>
                    <div className="grid grid-cols-1 gap-4 mb-3">
                      <div style={{maxWidth:'200px'}}>
                        <label className="text-xs text-gray-500 font-medium">Norma JESIEŃ (kg/pęd)</label>
                        <input type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                          value={formData.yieldAutumnPerShoot}
                          onChange={(e) => setFormData({...formData, yieldAutumnPerShoot: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    </div>
                    <div className="bg-red-100/50 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-700 mb-2">GDH od wypuszczenia pędów jesiennych do owocowania</p>
                      <div style={{maxWidth:'200px'}}>
                        <label className="text-xs text-gray-500">GDH do owocowania</label>
                        <input type="number" className="w-full border rounded px-3 py-2 text-sm mt-1 bg-white"
                          value={formData.gdhFruitAutumn || ''}
                          onChange={(e) => setFormData({...formData, gdhFruitAutumn: parseInt(e.target.value) || 0})}
                          placeholder="np. 5000"
                        />
                      </div>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-700 mt-6 mb-3">Wzorcowy rozkład owocowania</h3>

                  {/* LATO curve */}
                  <div className="bg-orange-50 rounded-lg p-4 mb-4 border border-orange-200">
                    <p className="text-sm font-semibold text-orange-800 mb-3">☀️ WZORCOWY ROZKŁAD OWOCOWANIA — LATO</p>
                    <p className="text-xs text-gray-500 mb-3">Procentowy udział zbiorów w kolejnych tygodniach owocowania. Suma = 100%</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mb-2">
                        <thead><tr className="border-b">
                          <th className="text-left py-1.5 px-2 text-xs text-gray-500 w-32">Tydzień</th>
                          <th className="text-right py-1.5 px-2 text-xs text-gray-500 w-24">%</th>
                          <th className="py-1.5 px-2 text-xs text-gray-500">Rozkład</th>
                        </tr></thead>
                        <tbody>
                          {(parseCurve(formData.harvestCurveSummer) || []).map((val: number, i: number) => (
                            <tr key={i} className="border-b hover:bg-orange-100/50">
                              <td className="py-1 px-2 text-xs font-medium text-orange-800">{['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'][i] || (i+1)+'.'} tydzień</td>
                              <td className="py-1 px-2 text-right">
                                <input type="number" step="0.01" className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  value={val}
                                  onChange={(e) => {
                                    const curve = parseCurve(formData.harvestCurveSummer) || []
                                    curve[i] = parseFloat(e.target.value) || 0
                                    setFormData({...formData, harvestCurveSummer: curve.join(', ')})
                                  }}
                                />
                              </td>
                              <td className="py-1 px-2">
                                <div className="bg-gray-100 rounded-full h-4 overflow-hidden" style={{maxWidth:'300px'}}>
                                  <div className="h-full bg-orange-400 rounded-full" style={{width: val + '%'}} />
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-orange-100 font-bold">
                            <td className="py-1.5 px-2 text-xs">SUMA</td>
                            <td className="py-1.5 px-2 text-right text-sm">{(parseCurve(formData.harvestCurveSummer) || []).reduce((s: number, v: number) => s + v, 0).toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-xs text-gray-500">{Math.abs((parseCurve(formData.harvestCurveSummer) || []).reduce((s: number, v: number) => s + v, 0) - 100) < 1 ? '✅' : '⚠️ Suma powinna = 100%'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="text-xs text-orange-600 hover:text-orange-800 underline" onClick={() => {
                        const curve = parseCurve(formData.harvestCurveSummer) || []
                        curve.push(0)
                        setFormData({...formData, harvestCurveSummer: curve.join(', ')})
                      }}>+ Dodaj tydzień</button>
                      {(parseCurve(formData.harvestCurveSummer) || []).length > 1 && (
                        <button type="button" className="text-xs text-red-600 hover:text-red-800 underline" onClick={() => {
                          const curve = parseCurve(formData.harvestCurveSummer) || []
                          curve.pop()
                          setFormData({...formData, harvestCurveSummer: curve.join(', ')})
                        }}>- Usuń ostatni</button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Lub wpisz ręcznie (oddzielone przecinkami):</p>
                    <input className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="np. 1.15, 16.04, 26.07, 27.16, 21.38, 8.20"
                      value={typeof formData.harvestCurveSummer === 'string' ? formData.harvestCurveSummer : (Array.isArray(formData.harvestCurveSummer) ? formData.harvestCurveSummer.join(', ') : String(formData.harvestCurveSummer || ''))}
                      onChange={(e) => setFormData({...formData, harvestCurveSummer: e.target.value})}
                    />
                  </div>

                  {/* JESIEŃ curve */}
                  <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                    <p className="text-sm font-semibold text-red-800 mb-3">🍂 WZORCOWY ROZKŁAD OWOCOWANIA — JESIEŃ</p>
                    <p className="text-xs text-gray-500 mb-3">Procentowy udział zbiorów w kolejnych tygodniach owocowania jesiennego. Suma = 100%</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mb-2">
                        <thead><tr className="border-b">
                          <th className="text-left py-1.5 px-2 text-xs text-gray-500 w-32">Tydzień</th>
                          <th className="text-right py-1.5 px-2 text-xs text-gray-500 w-24">%</th>
                          <th className="py-1.5 px-2 text-xs text-gray-500">Rozkład</th>
                        </tr></thead>
                        <tbody>
                          {(parseCurve(formData.harvestCurveAutumn) || []).map((val: number, i: number) => (
                            <tr key={i} className="border-b hover:bg-red-100/50">
                              <td className="py-1 px-2 text-xs font-medium text-red-800">{['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'][i] || (i+1)+'.'} tydzień</td>
                              <td className="py-1 px-2 text-right">
                                <input type="number" step="0.01" className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  value={val}
                                  onChange={(e) => {
                                    const curve = parseCurve(formData.harvestCurveAutumn) || []
                                    curve[i] = parseFloat(e.target.value) || 0
                                    setFormData({...formData, harvestCurveAutumn: curve.join(', ')})
                                  }}
                                />
                              </td>
                              <td className="py-1 px-2">
                                <div className="bg-gray-100 rounded-full h-4 overflow-hidden" style={{maxWidth:'300px'}}>
                                  <div className="h-full bg-red-400 rounded-full" style={{width: val + '%'}} />
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-red-100 font-bold">
                            <td className="py-1.5 px-2 text-xs">SUMA</td>
                            <td className="py-1.5 px-2 text-right text-sm">{(parseCurve(formData.harvestCurveAutumn) || []).reduce((s: number, v: number) => s + v, 0).toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-xs text-gray-500">{Math.abs((parseCurve(formData.harvestCurveAutumn) || []).reduce((s: number, v: number) => s + v, 0) - 100) < 1 ? '✅' : '⚠️ Suma powinna = 100%'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="text-xs text-red-600 hover:text-red-800 underline" onClick={() => {
                        const curve = parseCurve(formData.harvestCurveAutumn) || []
                        curve.push(0)
                        setFormData({...formData, harvestCurveAutumn: curve.join(', ')})
                      }}>+ Dodaj tydzień</button>
                      {(parseCurve(formData.harvestCurveAutumn) || []).length > 1 && (
                        <button type="button" className="text-xs text-red-600 hover:text-red-800 underline" onClick={() => {
                          const curve = parseCurve(formData.harvestCurveAutumn) || []
                          curve.pop()
                          setFormData({...formData, harvestCurveAutumn: curve.join(', ')})
                        }}>- Usuń ostatni</button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Lub wpisz ręcznie (oddzielone przecinkami):</p>
                    <input className="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="np. 5, 15, 25, 25, 15, 10, 5"
                      value={typeof formData.harvestCurveAutumn === 'string' ? formData.harvestCurveAutumn : (Array.isArray(formData.harvestCurveAutumn) ? formData.harvestCurveAutumn.join(', ') : String(formData.harvestCurveAutumn || ''))}
                      onChange={(e) => setFormData({...formData, harvestCurveAutumn: e.target.value})}
                    />
                  </div>

                  </div>

            {/* Statystyki zbierania */}
            <div>
              <h3 className="font-medium mb-3 text-gray-700">Statystyki zbierania</h3>
              <div className="grid grid-cols-2 gap-4">
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
                  <div className="text-green-600 text-xs">Temp. bazowa</div>
                  <div className="font-semibold">{variety.baseTemp ?? '6.0'}°C</div>
                </div>

                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-blue-600 text-xs">GDH owocowanie lato (zim.)</div>
                  <div className="font-semibold">{variety.gdhWinteredFruitSummer?.toLocaleString('pl-PL') || '–'}</div>
                </div>
              </div>

              {/* Szczegóły - rozwijane */}
              {expandedId === variety.id && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* Tabs */}
                  <div className="flex gap-1 border-b">
                    <button
                      onClick={() => setActiveTab(p => ({ ...p, [variety.id]: 'info' }))}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${(activeTab[variety.id] || 'info') === 'info' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >Parametry</button>
                    <button
                      onClick={() => { setActiveTab(p => ({ ...p, [variety.id]: 'curves' })); fetchCurvesForVariety(variety.id) }}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab[variety.id] === 'curves' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    ><BarChart3 className="w-3.5 h-3.5" />Krzywe historyczne</button>
                  </div>

                  {(activeTab[variety.id] || 'info') === 'info' && (
                    <>
                  {variety.description && (
                    <p className="text-gray-600">{variety.description}</p>
                  )}

                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="text-gray-500 text-xs">Wydajność zbierania</div>
                      <div className="font-semibold">{variety.pickingEfficiency ?? '–'} kg/h</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded">
                      <div className="text-red-600 text-xs">% odpadu</div>
                      <div className="font-semibold">{variety.wastePercent ?? 0}%</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded">
                      <div className="text-yellow-600 text-xs">% II kategorii</div>
                      <div className="font-semibold">{variety.secondCategoryPercent ?? 0}%</div>
                    </div>
                  </div>

                  {/* Wizualizacja krzywych */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Krzywa zbioru LATO</h4>
                      <div className="flex items-end gap-1 h-20">
                        {(Array.isArray(variety.harvestCurveSummer) ? variety.harvestCurveSummer : []).map((val: number, i: number) => (
                          <div
                            key={i}
                            className="bg-orange-400 rounded-t flex-1 min-w-[8px]"
                            style={{ height: `${(val / 20) * 100}%` }}
                            title={`Tydzień ${i + 1}: ${val}%`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(Array.isArray(variety.harvestCurveSummer) ? variety.harvestCurveSummer : []).length} tygodni
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Krzywa zbioru JESIEŃ</h4>
                      <div className="flex items-end gap-1 h-20">
                        {(Array.isArray(variety.harvestCurveAutumn) ? variety.harvestCurveAutumn : []).map((val: number, i: number) => (
                          <div
                            key={i}
                            className="bg-amber-400 rounded-t flex-1 min-w-[8px]"
                            style={{ height: `${(val / 30) * 100}%` }}
                            title={`Tydzień ${i + 1}: ${val}%`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(Array.isArray(variety.harvestCurveAutumn) ? variety.harvestCurveAutumn : []).length} tygodni
                      </div>
                    </div>
                  </div>
                    </>
                  )}

                  {activeTab[variety.id] === 'curves' && (
                    <div className="space-y-3">
                      {loadingCurves[variety.id] ? (
                        <div className="text-center text-gray-400 py-8">Ładowanie krzywych...</div>
                      ) : (varietyCurves[variety.id] || []).length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>Brak krzywych historycznych dla tej odmiany</p>
                          <p className="text-xs mt-1">Zaimportuj dane z MaxCrop w zakładce Szablony</p>
                        </div>
                      ) : (
                        (varietyCurves[variety.id] || []).map(curve => {
                          const maxVal = Math.max(...(curve.curve || []), 1)
                          return (
                            <div key={curve.id} className="bg-white border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${curve.season === 'summer' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                    {curve.season === 'summer' ? '☀️ Lato' : '🍂 Jesień'} {curve.year}
                                  </span>
                                  <span className="text-sm font-medium">{(curve.totalKg / 1000).toFixed(1)}t</span>
                                  <span className="text-xs text-gray-400">T{curve.startWeek}{curve.startDate ? ` (${curve.startDate.split('-').reverse().join('.')})` : ''}</span>
                                  {curve.section && <span className="text-xs text-indigo-600">{curve.section.name}</span>}
                                </div>
                                <Button
                                  size="sm" variant="outline"
                                  disabled={savingTemplate === curve.id}
                                  onClick={() => saveAsTemplate(curve, variety)}
                                  className="text-xs"
                                >
                                  <Database className="w-3.5 h-3.5 mr-1" />
                                  {savingTemplate === curve.id ? 'Zapisuję...' : 'Zapisz jako szablon'}
                                </Button>
                              </div>
                              {/* Sparkline */}
                              <div className="flex items-end gap-0.5 h-10">
                                {(curve.curve || []).map((val, i) => (
                                  <div
                                    key={i}
                                    className={`flex-1 rounded-t min-w-[4px] ${curve.season === 'summer' ? 'bg-orange-400' : 'bg-red-400'}`}
                                    style={{ height: `${(val / maxVal) * 40}px`, minHeight: val > 0 ? '2px' : '0' }}
                                    title={`Tydzień ${i + 1}: ${val.toFixed(1)}%`}
                                  />
                                ))}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {curve.curve.length} tyg. | {curve.dailyCurve?.length || 0} dni{curve.sourceFile ? ` | ${curve.sourceFile}` : ''}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
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
              Brak odmian. Kliknij &quot;Dodaj odmianę&quot; żeby dodać pierwszą.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
