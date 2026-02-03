'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Layers, X, Pencil, Trash2, Save, ChevronDown, ChevronUp, Upload, FileText, Calendar, Users, TrendingUp, Sun, Leaf as LeafIcon } from 'lucide-react'

interface Variety {
  id: string
  name: string
  yieldSummerPerShoot?: number
  yieldAutumnPerShoot?: number
  gdhSummer?: number
  gdhAutumn?: number
  harvestCurveSummer?: number[]
  harvestCurveAutumn?: number[]
  pickingEfficiency?: number
}

interface Section {
  id: string
  name: string
  metersLength: number
  potsPerMeter: number
  shootsPerPot: number
  plantingYear?: number
  productionYear?: number
  plantMaterialType?: string
  yieldSummerPerShoot?: number
  yieldAutumnPerShoot?: number
  gdhSummer?: number
  gdhAutumn?: number
  certificateUrl?: string
  deliveryProofUrl?: string
  varietyId: string
  variety?: Variety
}

interface Block {
  id: string
  name: string
  sections: Section[]
}

interface Farm {
  id: string
  name: string
}

interface WeatherData {
  date: string
  gdhCumulative: number
}

const PLANT_MATERIAL_TYPES = [
  { value: 'SMALL_POT', label: 'Mała doniczka (szkółka)' },
  { value: 'ROOT', label: 'Z korzenia' },
  { value: 'LONGCANE', label: 'Longcane zimowany' },
  { value: 'PLUG', label: 'Plug' },
]

const defaultCurveSummer = [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1]
const defaultCurveAutumn = [5, 15, 25, 25, 15, 10, 5]

export default function PlantationPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [farm, setFarm] = useState<Farm | null>(null)
  const [weatherData, setWeatherData] = useState<WeatherData[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [blockName, setBlockName] = useState('')
  
  const [showSectionForm, setShowSectionForm] = useState<string | null>(null)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  
  const [sectionForm, setSectionForm] = useState({
    name: '',
    metersLength: 100,
    potsPerMeter: 2,
    shootsPerPot: 2,
    plantingYear: new Date().getFullYear(),
    productionYear: 1,
    plantMaterialType: 'SMALL_POT',
    varietyId: '',
    yieldSummerPerShoot: 0,
    yieldAutumnPerShoot: 0,
    gdhSummer: 0,
    gdhAutumn: 0,
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [plantationRes, weatherRes] = await Promise.all([
        fetch('/api/plantation'),
        fetch('/api/weather')
      ])
      
      const plantationData = await plantationRes.json()
      const weatherDataRes = await weatherRes.json()
      
      setBlocks(plantationData.blocks || [])
      setVarieties(plantationData.varieties || [])
      setFarm(plantationData.farm)
      setWeatherData(weatherDataRes.weatherData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get current GDH from weather data
  const getCurrentGdh = () => {
    if (weatherData.length === 0) return 0
    const sorted = [...weatherData].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    return sorted[0]?.gdhCumulative || 0
  }

  // Calculate section stats
  const calcSectionStats = (section: Section) => {
    const variety = varieties.find(v => v.id === section.varietyId)
    
    const pots = section.metersLength * section.potsPerMeter
    const shoots = pots * section.shootsPerPot
    
    const yieldSummer = section.yieldSummerPerShoot || variety?.yieldSummerPerShoot || 0
    const yieldAutumn = section.yieldAutumnPerShoot || variety?.yieldAutumnPerShoot || 0
    const gdhSummer = section.gdhSummer || variety?.gdhSummer || 20000
    const gdhAutumn = section.gdhAutumn || variety?.gdhAutumn || 25000
    
    const forecastSummer = shoots * yieldSummer
    const forecastAutumn = shoots * yieldAutumn
    const forecastTotal = forecastSummer + forecastAutumn
    
    const currentGdh = getCurrentGdh()
    const gdhProgressSummer = Math.min(100, (currentGdh / gdhSummer) * 100)
    const gdhProgressAutumn = Math.min(100, (currentGdh / gdhAutumn) * 100)
    
    // Estimate start date (simplified - assume ~50 GDH per day average)
    const gdhRemainingSummer = Math.max(0, gdhSummer - currentGdh)
    const gdhRemainingAutumn = Math.max(0, gdhAutumn - currentGdh)
    const daysToSummer = Math.ceil(gdhRemainingSummer / 50)
    const daysToAutumn = Math.ceil(gdhRemainingAutumn / 50)
    
    const today = new Date()
    const startDateSummer = new Date(today.getTime() + daysToSummer * 24 * 60 * 60 * 1000)
    const startDateAutumn = new Date(today.getTime() + daysToAutumn * 24 * 60 * 60 * 1000)
    
    return {
      pots,
      shoots,
      yieldSummer,
      yieldAutumn,
      gdhSummer,
      gdhAutumn,
      forecastSummer,
      forecastAutumn,
      forecastTotal,
      currentGdh,
      gdhProgressSummer,
      gdhProgressAutumn,
      gdhRemainingSummer,
      gdhRemainingAutumn,
      startDateSummer,
      startDateAutumn,
      curveSummer: variety?.harvestCurveSummer || defaultCurveSummer,
      curveAutumn: variety?.harvestCurveAutumn || defaultCurveAutumn,
      pickingEfficiency: variety?.pickingEfficiency || 8,
    }
  }

  // Generate weekly forecast
  const getWeeklyForecast = (totalKg: number, curve: number[], startDate: Date, efficiency: number) => {
    const weeks: { week: number, date: string, kg: number, workers: number, hours: number }[] = []
    const startWeek = getWeekNumber(startDate)
    
    curve.forEach((percent, i) => {
      const kg = Math.round(totalKg * percent / 100)
      const hours = Math.round(kg / efficiency)
      const workers = Math.ceil(hours / (8 * 6)) // 8h/day, 6 days/week
      
      const weekDate = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000)
      
      weeks.push({
        week: startWeek + i,
        date: weekDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        kg,
        workers,
        hours
      })
    })
    
    return weeks
  }

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  // Block operations
  const resetBlockForm = () => {
    setBlockName('')
    setEditingBlock(null)
    setShowBlockForm(false)
  }

  const saveBlock = async () => {
    if (!blockName.trim() || !farm) return
    
    try {
      if (editingBlock) {
        await fetch(`/api/plantation/block/${editingBlock.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: blockName })
        })
      } else {
        await fetch('/api/plantation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block: { name: blockName }, farmId: farm.id })
        })
      }
      
      resetBlockForm()
      fetchData()
    } catch (error) {
      console.error('Error saving block:', error)
    }
  }

  const deleteBlock = async (blockId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten blok wraz ze wszystkimi sekcjami?')) return
    
    try {
      await fetch(`/api/plantation/block/${blockId}`, { method: 'DELETE' })
      fetchData()
    } catch (error) {
      console.error('Error deleting block:', error)
    }
  }

  // Section operations
  const resetSectionForm = () => {
    setSectionForm({
      name: '',
      metersLength: 100,
      potsPerMeter: 2,
      shootsPerPot: 2,
      plantingYear: new Date().getFullYear(),
      productionYear: 1,
      plantMaterialType: 'SMALL_POT',
      varietyId: '',
      yieldSummerPerShoot: 0,
      yieldAutumnPerShoot: 0,
      gdhSummer: 0,
      gdhAutumn: 0,
    })
    setEditingSection(null)
    setShowSectionForm(null)
  }

  const startAddSection = (blockId: string) => {
    resetSectionForm()
    setShowSectionForm(blockId)
  }

  const startEditSection = (blockId: string, section: Section) => {
    setEditingSection(section)
    const variety = varieties.find(v => v.id === section.varietyId)
    
    setSectionForm({
      name: section.name || '',
      metersLength: section.metersLength,
      potsPerMeter: section.potsPerMeter,
      shootsPerPot: section.shootsPerPot,
      plantingYear: section.plantingYear || new Date().getFullYear(),
      productionYear: section.productionYear || 1,
      plantMaterialType: section.plantMaterialType || 'SMALL_POT',
      varietyId: section.varietyId,
      yieldSummerPerShoot: section.yieldSummerPerShoot || variety?.yieldSummerPerShoot || 0,
      yieldAutumnPerShoot: section.yieldAutumnPerShoot || variety?.yieldAutumnPerShoot || 0,
      gdhSummer: section.gdhSummer || variety?.gdhSummer || 0,
      gdhAutumn: section.gdhAutumn || variety?.gdhAutumn || 0,
    })
    setShowSectionForm(blockId)
  }

  const onVarietyChange = (varietyId: string) => {
    const variety = varieties.find(v => v.id === varietyId)
    if (variety) {
      setSectionForm({
        ...sectionForm,
        varietyId,
        yieldSummerPerShoot: variety.yieldSummerPerShoot || 0,
        yieldAutumnPerShoot: variety.yieldAutumnPerShoot || 0,
        gdhSummer: variety.gdhSummer || 0,
        gdhAutumn: variety.gdhAutumn || 0,
      })
    } else {
      setSectionForm({ ...sectionForm, varietyId })
    }
  }

  const saveSection = async (blockId: string) => {
    if (!sectionForm.name.trim() || !sectionForm.varietyId) return
    
    const payload = {
      name: sectionForm.name,
      metersLength: sectionForm.metersLength,
      potsPerMeter: sectionForm.potsPerMeter,
      shootsPerPot: sectionForm.shootsPerPot,
      plantingYear: sectionForm.plantingYear,
      productionYear: sectionForm.productionYear,
      plantMaterialType: sectionForm.plantMaterialType,
      varietyId: sectionForm.varietyId,
      yieldSummerPerShoot: sectionForm.yieldSummerPerShoot || null,
      yieldAutumnPerShoot: sectionForm.yieldAutumnPerShoot || null,
      gdhSummer: sectionForm.gdhSummer || null,
      gdhAutumn: sectionForm.gdhAutumn || null,
      blockId,
    }
    
    try {
      if (editingSection) {
        await fetch(`/api/plantation/section/${editingSection.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } else {
        await fetch('/api/plantation/section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: payload })
        })
      }
      
      resetSectionForm()
      fetchData()
    } catch (error) {
      console.error('Error saving section:', error)
    }
  }

  const deleteSection = async (sectionId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę sekcję?')) return
    
    try {
      await fetch(`/api/plantation/section/${sectionId}`, { method: 'DELETE' })
      fetchData()
    } catch (error) {
      console.error('Error deleting section:', error)
    }
  }

  // Calculate form preview
  const formPreview = () => {
    const pots = sectionForm.metersLength * sectionForm.potsPerMeter
    const shoots = pots * sectionForm.shootsPerPot
    const forecastSummer = shoots * (sectionForm.yieldSummerPerShoot || 0)
    const forecastAutumn = shoots * (sectionForm.yieldAutumnPerShoot || 0)
    return { pots, shoots, forecastSummer, forecastAutumn, total: forecastSummer + forecastAutumn }
  }

  // Stats
  const totalStats = blocks.reduce((acc, block) => {
    block.sections.forEach(section => {
      const stats = calcSectionStats(section)
      acc.pots += stats.pots
      acc.shoots += stats.shoots
      acc.forecastSummer += stats.forecastSummer
      acc.forecastAutumn += stats.forecastAutumn
    })
    return acc
  }, { pots: 0, shoots: 0, forecastSummer: 0, forecastAutumn: 0 })

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Ładowanie...</div></div>
  }

  const preview = formPreview()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plantacja</h1>
          <p className="text-gray-500">{farm?.name}</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowBlockForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj blok
        </Button>
      </div>

      {/* Statystyki ogólne */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Bloki</div>
            <div className="text-2xl font-bold">{blocks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Sekcje</div>
            <div className="text-2xl font-bold">{blocks.reduce((s, b) => s + b.sections.length, 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Doniczki</div>
            <div className="text-2xl font-bold">{totalStats.pots.toLocaleString('pl-PL')}</div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50">
          <CardContent className="pt-4">
            <div className="text-sm text-orange-600">Prognoza LATO</div>
            <div className="text-2xl font-bold text-orange-700">{(totalStats.forecastSummer / 1000).toFixed(1)} t</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50">
          <CardContent className="pt-4">
            <div className="text-sm text-amber-600">Prognoza JESIEŃ</div>
            <div className="text-2xl font-bold text-amber-700">{(totalStats.forecastAutumn / 1000).toFixed(1)} t</div>
          </CardContent>
        </Card>
      </div>

      {/* Formularz bloku */}
      {showBlockForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>{editingBlock ? 'Edytuj blok' : 'Nowy blok'}</span>
              <Button variant="ghost" size="icon" onClick={resetBlockForm}><X className="w-4 h-4" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>Nazwa bloku</Label>
                <Input placeholder="np. Blok E" value={blockName} onChange={(e) => setBlockName(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={saveBlock} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />{editingBlock ? 'Zapisz' : 'Dodaj'}
                </Button>
                <Button variant="outline" onClick={resetBlockForm}>Anuluj</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista bloków */}
      <div className="space-y-4">
        {blocks.map((block) => (
          <Card key={block.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-green-600" />
                  {block.name}
                  <span className="text-sm font-normal text-gray-500">({block.sections.length} sekcji)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => startAddSection(block.id)}>
                    <Plus className="w-4 h-4 mr-1" />Sekcja
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingBlock(block); setBlockName(block.name); setShowBlockForm(true) }}>
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteBlock(block.id)} className="text-red-500 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Formularz sekcji */}
              {showSectionForm === block.id && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium mb-4">{editingSection ? 'Edytuj sekcję' : 'Nowa sekcja'}</h4>
                  
                  {/* Dane podstawowe */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Nazwa sekcji *</Label>
                      <Input value={sectionForm.name} onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})} placeholder="np. A01-05" />
                    </div>
                    <div>
                      <Label>Odmiana *</Label>
                      <select className="w-full h-10 px-3 border rounded-md" value={sectionForm.varietyId} onChange={(e) => onVarietyChange(e.target.value)}>
                        <option value="">Wybierz...</option>
                        {varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Rok nasadzenia</Label>
                      <Input type="number" value={sectionForm.plantingYear} onChange={(e) => setSectionForm({...sectionForm, plantingYear: parseInt(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>Rok produkcyjny</Label>
                      <Input type="number" value={sectionForm.productionYear} onChange={(e) => setSectionForm({...sectionForm, productionYear: parseInt(e.target.value) || 1})} />
                    </div>
                  </div>

                  {/* Parametry nasadzenia */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Metry bieżące</Label>
                      <Input type="number" value={sectionForm.metersLength} onChange={(e) => setSectionForm({...sectionForm, metersLength: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>Doniczek na metr</Label>
                      <Input type="number" step="0.1" value={sectionForm.potsPerMeter} onChange={(e) => setSectionForm({...sectionForm, potsPerMeter: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>Pędów w doniczce</Label>
                      <Input type="number" step="0.1" value={sectionForm.shootsPerPot} onChange={(e) => setSectionForm({...sectionForm, shootsPerPot: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>Typ materiału</Label>
                      <select className="w-full h-10 px-3 border rounded-md" value={sectionForm.plantMaterialType} onChange={(e) => setSectionForm({...sectionForm, plantMaterialType: e.target.value})}>
                        {PLANT_MATERIAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Normy i GDH */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Norma LATO (kg/pęd)</Label>
                      <Input type="number" step="0.01" value={sectionForm.yieldSummerPerShoot} onChange={(e) => setSectionForm({...sectionForm, yieldSummerPerShoot: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>Norma JESIEŃ (kg/pęd)</Label>
                      <Input type="number" step="0.01" value={sectionForm.yieldAutumnPerShoot} onChange={(e) => setSectionForm({...sectionForm, yieldAutumnPerShoot: parseFloat(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>GDH LATO</Label>
                      <Input type="number" value={sectionForm.gdhSummer} onChange={(e) => setSectionForm({...sectionForm, gdhSummer: parseInt(e.target.value) || 0})} />
                    </div>
                    <div>
                      <Label>GDH JESIEŃ</Label>
                      <Input type="number" value={sectionForm.gdhAutumn} onChange={(e) => setSectionForm({...sectionForm, gdhAutumn: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>

                  {/* Podgląd obliczeń */}
                  <div className="bg-white p-3 rounded border mb-4">
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div><span className="text-gray-500">Doniczki:</span> <strong>{preview.pots.toLocaleString('pl-PL')}</strong></div>
                      <div><span className="text-gray-500">Pędy:</span> <strong>{preview.shoots.toLocaleString('pl-PL')}</strong></div>
                      <div><span className="text-orange-600">LATO:</span> <strong>{preview.forecastSummer.toLocaleString('pl-PL')} kg</strong></div>
                      <div><span className="text-amber-600">JESIEŃ:</span> <strong>{preview.forecastAutumn.toLocaleString('pl-PL')} kg</strong></div>
                      <div><span className="text-green-600">RAZEM:</span> <strong>{preview.total.toLocaleString('pl-PL')} kg</strong></div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => saveSection(block.id)} className="bg-green-600 hover:bg-green-700">
                      <Save className="w-4 h-4 mr-2" />{editingSection ? 'Zapisz' : 'Dodaj'}
                    </Button>
                    <Button variant="outline" onClick={resetSectionForm}>Anuluj</Button>
                  </div>
                </div>
              )}

              {/* Lista sekcji */}
              {block.sections.length > 0 ? (
                <div className="space-y-3">
                  {block.sections.map((section) => {
                    const stats = calcSectionStats(section)
                    const isExpanded = expandedSection === section.id
                    const weeklySummer = getWeeklyForecast(stats.forecastSummer, stats.curveSummer, stats.startDateSummer, stats.pickingEfficiency)
                    const weeklyAutumn = getWeeklyForecast(stats.forecastAutumn, stats.curveAutumn, stats.startDateAutumn, stats.pickingEfficiency)
                    const maxKgSummer = Math.max(...weeklySummer.map(w => w.kg))
                    const maxKgAutumn = Math.max(...weeklyAutumn.map(w => w.kg))

                    return (
                      <div key={section.id} className="border rounded-lg overflow-hidden">
                        {/* Nagłówek sekcji */}
                        <div 
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                          onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{section.name}</span>
                            <span className="text-sm px-2 py-0.5 bg-green-100 text-green-700 rounded">{section.variety?.name}</span>
                            <span className="text-sm text-gray-500">{section.metersLength}m</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm"><span className="text-orange-600">{stats.forecastSummer.toLocaleString('pl-PL')}</span> + <span className="text-amber-600">{stats.forecastAutumn.toLocaleString('pl-PL')}</span> kg</span>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); startEditSection(block.id, section) }}>
                              <Pencil className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteSection(section.id) }} className="text-red-500 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Rozwinięte szczegóły */}
                        {isExpanded && (
                          <div className="p-4 space-y-6 border-t">
                            {/* Podsumowanie */}
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                              <div className="bg-gray-50 p-2 rounded">
                                <div className="text-gray-500 text-xs">Doniczki</div>
                                <div className="font-semibold">{stats.pots.toLocaleString('pl-PL')}</div>
                              </div>
                              <div className="bg-gray-50 p-2 rounded">
                                <div className="text-gray-500 text-xs">Pędy</div>
                                <div className="font-semibold">{stats.shoots.toLocaleString('pl-PL')}</div>
                              </div>
                              <div className="bg-orange-50 p-2 rounded">
                                <div className="text-orange-600 text-xs">Prognoza LATO</div>
                                <div className="font-semibold">{stats.forecastSummer.toLocaleString('pl-PL')} kg</div>
                              </div>
                              <div className="bg-amber-50 p-2 rounded">
                                <div className="text-amber-600 text-xs">Prognoza JESIEŃ</div>
                                <div className="font-semibold">{stats.forecastAutumn.toLocaleString('pl-PL')} kg</div>
                              </div>
                              <div className="bg-green-50 p-2 rounded">
                                <div className="text-green-600 text-xs">RAZEM</div>
                                <div className="font-semibold">{stats.forecastTotal.toLocaleString('pl-PL')} kg</div>
                              </div>
                              <div className="bg-blue-50 p-2 rounded">
                                <div className="text-blue-600 text-xs">Rok prod.</div>
                                <div className="font-semibold">{section.productionYear || 1}</div>
                              </div>
                            </div>

                            {/* Status GDH */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-orange-50 p-4 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-orange-700 flex items-center gap-2"><Sun className="w-4 h-4" /> GDH LATO</span>
                                  <span className="text-sm text-orange-600">{stats.currentGdh.toLocaleString('pl-PL')} / {stats.gdhSummer.toLocaleString('pl-PL')}</span>
                                </div>
                                <div className="w-full bg-orange-200 rounded-full h-3 mb-2">
                                  <div className="bg-orange-500 h-3 rounded-full transition-all" style={{ width: `${stats.gdhProgressSummer}%` }} />
                                </div>
                                <div className="flex justify-between text-xs text-orange-600">
                                  <span>Pozostało: {stats.gdhRemainingSummer.toLocaleString('pl-PL')} GDH</span>
                                  <span className="font-medium">Start: {stats.startDateSummer.toLocaleDateString('pl-PL')}</span>
                                </div>
                              </div>
                              <div className="bg-amber-50 p-4 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-amber-700 flex items-center gap-2"><LeafIcon className="w-4 h-4" /> GDH JESIEŃ</span>
                                  <span className="text-sm text-amber-600">{stats.currentGdh.toLocaleString('pl-PL')} / {stats.gdhAutumn.toLocaleString('pl-PL')}</span>
                                </div>
                                <div className="w-full bg-amber-200 rounded-full h-3 mb-2">
                                  <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${stats.gdhProgressAutumn}%` }} />
                                </div>
                                <div className="flex justify-between text-xs text-amber-600">
                                  <span>Pozostało: {stats.gdhRemainingAutumn.toLocaleString('pl-PL')} GDH</span>
                                  <span className="font-medium">Start: {stats.startDateAutumn.toLocaleDateString('pl-PL')}</span>
                                </div>
                              </div>
                            </div>

                            {/* Wykresy tygodniowe */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* LATO */}
                              <div>
                                <h4 className="font-medium text-orange-700 mb-3 flex items-center gap-2">
                                  <Sun className="w-4 h-4" /> Prognoza tygodniowa - LATO
                                </h4>
                                <div className="flex items-end gap-1 h-32 mb-2">
                                  {weeklySummer.map((w, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center">
                                      <div 
                                        className="w-full bg-orange-400 rounded-t min-h-[4px] relative group"
                                        style={{ height: `${(w.kg / maxKgSummer) * 100}%` }}
                                      >
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                          T{w.week}: {w.kg} kg<br/>{w.workers} os. / {w.hours}h
                                        </div>
                                      </div>
                                      <span className="text-xs text-gray-500 mt-1">T{w.week}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-gray-500 text-center">
                                  Szczyt: T{weeklySummer.find(w => w.kg === maxKgSummer)?.week} ({maxKgSummer.toLocaleString('pl-PL')} kg)
                                </div>
                              </div>

                              {/* JESIEŃ */}
                              <div>
                                <h4 className="font-medium text-amber-700 mb-3 flex items-center gap-2">
                                  <LeafIcon className="w-4 h-4" /> Prognoza tygodniowa - JESIEŃ
                                </h4>
                                <div className="flex items-end gap-1 h-32 mb-2">
                                  {weeklyAutumn.map((w, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center">
                                      <div 
                                        className="w-full bg-amber-400 rounded-t min-h-[4px] relative group"
                                        style={{ height: `${(w.kg / maxKgAutumn) * 100}%` }}
                                      >
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                          T{w.week}: {w.kg} kg<br/>{w.workers} os. / {w.hours}h
                                        </div>
                                      </div>
                                      <span className="text-xs text-gray-500 mt-1">T{w.week}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-gray-500 text-center">
                                  Szczyt: T{weeklyAutumn.find(w => w.kg === maxKgAutumn)?.week} ({maxKgAutumn.toLocaleString('pl-PL')} kg)
                                </div>
                              </div>
                            </div>

                            {/* Tabela tygodniowa */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="px-2 py-1 text-left">Sezon</th>
                                    <th className="px-2 py-1 text-left">Tydzień</th>
                                    <th className="px-2 py-1 text-right">Prognoza</th>
                                    <th className="px-2 py-1 text-right">Pracownicy</th>
                                    <th className="px-2 py-1 text-right">Roboczogodziny</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {weeklySummer.slice(0, 4).map((w, i) => (
                                    <tr key={`s-${i}`} className="border-b hover:bg-orange-50">
                                      <td className="px-2 py-1"><span className="text-orange-600">LATO</span></td>
                                      <td className="px-2 py-1">T{w.week} ({w.date})</td>
                                      <td className="px-2 py-1 text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td>
                                      <td className="px-2 py-1 text-right">{w.workers} os.</td>
                                      <td className="px-2 py-1 text-right">{w.hours}h</td>
                                    </tr>
                                  ))}
                                  {weeklyAutumn.slice(0, 3).map((w, i) => (
                                    <tr key={`a-${i}`} className="border-b hover:bg-amber-50">
                                      <td className="px-2 py-1"><span className="text-amber-600">JESIEŃ</span></td>
                                      <td className="px-2 py-1">T{w.week} ({w.date})</td>
                                      <td className="px-2 py-1 text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td>
                                      <td className="px-2 py-1 text-right">{w.workers} os.</td>
                                      <td className="px-2 py-1 text-right">{w.hours}h</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">Brak sekcji w tym bloku</p>
              )}
            </CardContent>
          </Card>
        ))}

        {blocks.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">Brak bloków. Kliknij "Dodaj blok" żeby rozpocząć.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
