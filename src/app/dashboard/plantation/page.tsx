'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Layers, X, Pencil, Trash2, Save, ChevronDown, ChevronUp, Sun, Leaf, Users } from 'lucide-react'

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

const PLANT_TYPES = [
  { value: 'SMALL_POT', label: 'Doniczka' },
  { value: 'ROOT', label: 'Korzen' },
  { value: 'LONGCANE', label: 'Longcane' },
  { value: 'PLUG', label: 'Plug' },
]

const defaultCurve = [5, 10, 15, 20, 20, 15, 10, 5]

export default function PlantationPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [farm, setFarm] = useState<Farm | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [blockName, setBlockName] = useState('')
  const [showSectionForm, setShowSectionForm] = useState<string | null>(null)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [sectionForm, setSectionForm] = useState({
    name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2,
    plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT',
    varietyId: '', yieldSummerPerShoot: 0, yieldAutumnPerShoot: 0, gdhSummer: 20000, gdhAutumn: 25000,
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      setBlocks(data.blocks || [])
      setVarieties(data.varieties || [])
      setFarm(data.farm)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const calcStats = (s: Section) => {
    const v = varieties.find(x => x.id === s.varietyId)
    const pots = s.metersLength * s.potsPerMeter
    const shoots = pots * s.shootsPerPot
    const ys = s.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0
    const ya = s.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0
    const gs = s.gdhSummer || v?.gdhSummer || 20000
    const ga = s.gdhAutumn || v?.gdhAutumn || 25000
    const fs = shoots * ys
    const fa = shoots * ya
    const curveSummer = v?.harvestCurveSummer || defaultCurve
    const curveAutumn = v?.harvestCurveAutumn || defaultCurve
    const eff = v?.pickingEfficiency || 8
    return { pots, shoots, ys, ya, gs, ga, fs, fa, total: fs + fa, curveSummer, curveAutumn, eff }
  }

  const getWeekly = (total: number, curve: number[], eff: number) => {
    return curve.map((p, i) => {
      const kg = Math.round(total * p / 100)
      const hrs = Math.round(kg / eff)
      const workers = Math.ceil(hrs / 48)
      return { week: i + 1, pct: p, kg, hrs, workers }
    })
  }

  // Block ops
  const resetBlock = () => { setBlockName(''); setEditingBlock(null); setShowBlockForm(false) }
  const saveBlock = async () => {
    if (!blockName.trim() || !farm) return
    if (editingBlock) await fetch(`/api/plantation/block/${editingBlock.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: blockName }) })
    else await fetch('/api/plantation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block: { name: blockName }, farmId: farm.id }) })
    resetBlock(); fetchData()
  }
  const delBlock = async (id: string) => { if (confirm('Usunąć blok?')) { await fetch(`/api/plantation/block/${id}`, { method: 'DELETE' }); fetchData() } }

  // Section ops
  const resetSection = () => {
    setSectionForm({ name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2, plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT', varietyId: '', yieldSummerPerShoot: 0, yieldAutumnPerShoot: 0, gdhSummer: 20000, gdhAutumn: 25000 })
    setEditingSection(null); setShowSectionForm(null)
  }
  const startAddSection = (bid: string) => { resetSection(); setShowSectionForm(bid) }
  const startEditSection = (bid: string, s: Section) => {
    setEditingSection(s)
    const v = varieties.find(x => x.id === s.varietyId)
    setSectionForm({
      name: s.name || '', metersLength: s.metersLength, potsPerMeter: s.potsPerMeter, shootsPerPot: s.shootsPerPot,
      plantingYear: s.plantingYear || new Date().getFullYear(), productionYear: s.productionYear || 1,
      plantMaterialType: s.plantMaterialType || 'SMALL_POT', varietyId: s.varietyId,
      yieldSummerPerShoot: s.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0,
      yieldAutumnPerShoot: s.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0,
      gdhSummer: s.gdhSummer || v?.gdhSummer || 20000, gdhAutumn: s.gdhAutumn || v?.gdhAutumn || 25000
    })
    setShowSectionForm(bid)
  }
  const onVarChange = (vid: string) => {
    const v = varieties.find(x => x.id === vid)
    setSectionForm({ ...sectionForm, varietyId: vid, yieldSummerPerShoot: v?.yieldSummerPerShoot || 0, yieldAutumnPerShoot: v?.yieldAutumnPerShoot || 0, gdhSummer: v?.gdhSummer || 20000, gdhAutumn: v?.gdhAutumn || 25000 })
  }
  const saveSection = async (bid: string) => {
    if (!sectionForm.name || !sectionForm.varietyId) return
    const payload = { ...sectionForm, blockId: bid }
    if (editingSection) await fetch(`/api/plantation/section/${editingSection.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    else await fetch('/api/plantation/section', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: payload }) })
    resetSection(); fetchData()
  }
  const delSection = async (id: string) => { if (confirm('Usunąć sekcję?')) { await fetch(`/api/plantation/section/${id}`, { method: 'DELETE' }); fetchData() } }

  const preview = () => {
    const pots = sectionForm.metersLength * sectionForm.potsPerMeter
    const shoots = pots * sectionForm.shootsPerPot
    const fs = shoots * (sectionForm.yieldSummerPerShoot || 0)
    const fa = shoots * (sectionForm.yieldAutumnPerShoot || 0)
    return { pots, shoots, fs, fa, total: fs + fa }
  }

  const totals = blocks.reduce((a, b) => {
    b.sections.forEach(s => { const st = calcStats(s); a.fs += st.fs; a.fa += st.fa; a.pots += st.pots })
    return a
  }, { fs: 0, fa: 0, pots: 0 })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  const pv = preview()

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plantacja</h1>
          <p className="text-gray-500 mt-1">{farm?.name}</p>
        </div>
        <Button onClick={() => setShowBlockForm(true)} className="bg-gray-900 hover:bg-gray-800">
          <Plus className="w-4 h-4 mr-2" />Nowy blok
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Bloki</p>
          <p className="text-3xl font-bold">{blocks.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Doniczki</p>
          <p className="text-3xl font-bold">{totals.pots.toLocaleString('pl-PL')}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-orange-200">
          <p className="text-sm text-orange-600 mb-1 flex items-center gap-1"><Sun className="w-4 h-4" />Lato</p>
          <p className="text-3xl font-bold text-orange-700">{(totals.fs / 1000).toFixed(1)} t</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-5 border border-red-200">
          <p className="text-sm text-red-600 mb-1 flex items-center gap-1"><Leaf className="w-4 h-4" />Jesień</p>
          <p className="text-3xl font-bold text-red-700">{(totals.fa / 1000).toFixed(1)} t</p>
        </div>
      </div>

      {/* Block form */}
      {showBlockForm && (
        <div className="bg-gray-50 rounded-2xl p-6 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{editingBlock ? 'Edytuj blok' : 'Nowy blok'}</h3>
            <Button variant="ghost" size="icon" onClick={resetBlock}><X className="w-4 h-4" /></Button>
          </div>
          <div className="flex gap-4">
            <Input placeholder="Nazwa bloku" value={blockName} onChange={e => setBlockName(e.target.value)} className="flex-1" />
            <Button onClick={saveBlock} className="bg-gray-900">{editingBlock ? 'Zapisz' : 'Dodaj'}</Button>
          </div>
        </div>
      )}

      {/* Blocks */}
      <div className="space-y-6">
        {blocks.map(block => (
          <div key={block.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Block header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold">
                  {block.name.charAt(block.name.length - 1)}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{block.name}</h3>
                  <p className="text-sm text-gray-500">{block.sections.length} sekcji</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => startAddSection(block.id)}>
                  <Plus className="w-4 h-4 mr-1" />Sekcja
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setEditingBlock(block); setBlockName(block.name); setShowBlockForm(true) }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => delBlock(block.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Section form */}
            {showSectionForm === block.id && (
              <div className="p-6 bg-blue-50 border-b">
                <h4 className="font-semibold mb-4">{editingSection ? 'Edytuj sekcję' : 'Nowa sekcja'}</h4>
                
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div><Label className="text-xs text-gray-500">Nazwa</Label><Input value={sectionForm.name} onChange={e => setSectionForm({...sectionForm, name: e.target.value})} /></div>
                  <div><Label className="text-xs text-gray-500">Odmiana</Label>
                    <select className="w-full h-10 border rounded-md px-3" value={sectionForm.varietyId} onChange={e => onVarChange(e.target.value)}>
                      <option value="">Wybierz...</option>
                      {varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-xs text-gray-500">Metry bieżące</Label><Input type="number" value={sectionForm.metersLength} onChange={e => setSectionForm({...sectionForm, metersLength: +e.target.value})} /></div>
                  <div><Label className="text-xs text-gray-500">Typ materiału</Label>
                    <select className="w-full h-10 border rounded-md px-3" value={sectionForm.plantMaterialType} onChange={e => setSectionForm({...sectionForm, plantMaterialType: e.target.value})}>
                      {PLANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div><Label className="text-xs text-gray-500">Doniczek/m</Label><Input type="number" step="0.1" value={sectionForm.potsPerMeter} onChange={e => setSectionForm({...sectionForm, potsPerMeter: +e.target.value})} /></div>
                  <div><Label className="text-xs text-gray-500">Pędów/don.</Label><Input type="number" step="0.1" value={sectionForm.shootsPerPot} onChange={e => setSectionForm({...sectionForm, shootsPerPot: +e.target.value})} /></div>
                  <div><Label className="text-xs text-gray-500">Rok nasadz.</Label><Input type="number" value={sectionForm.plantingYear} onChange={e => setSectionForm({...sectionForm, plantingYear: +e.target.value})} /></div>
                  <div><Label className="text-xs text-gray-500">Rok prod.</Label><Input type="number" value={sectionForm.productionYear} onChange={e => setSectionForm({...sectionForm, productionYear: +e.target.value})} /></div>
                </div>

                {/* Lato / Jesien side by side */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gradient-to-br from-amber-100 to-orange-100 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-1"><Sun className="w-4 h-4" />Lato</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs text-orange-600">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldSummerPerShoot} onChange={e => setSectionForm({...sectionForm, yieldSummerPerShoot: +e.target.value})} className="bg-white" /></div>
                      <div><Label className="text-xs text-orange-600">GDH</Label><Input type="number" value={sectionForm.gdhSummer} onChange={e => setSectionForm({...sectionForm, gdhSummer: +e.target.value})} className="bg-white" /></div>
                    </div>
                    <p className="mt-3 text-center text-2xl font-bold text-orange-700">{pv.fs.toLocaleString('pl-PL')} kg</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-100 to-orange-100 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1"><Leaf className="w-4 h-4" />Jesień</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs text-red-600">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldAutumnPerShoot} onChange={e => setSectionForm({...sectionForm, yieldAutumnPerShoot: +e.target.value})} className="bg-white" /></div>
                      <div><Label className="text-xs text-red-600">GDH</Label><Input type="number" value={sectionForm.gdhAutumn} onChange={e => setSectionForm({...sectionForm, gdhAutumn: +e.target.value})} className="bg-white" /></div>
                    </div>
                    <p className="mt-3 text-center text-2xl font-bold text-red-700">{pv.fa.toLocaleString('pl-PL')} kg</p>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-900 text-white p-4 rounded-xl flex justify-between items-center mb-4">
                  <div className="flex gap-8">
                    <div><span className="text-gray-400 text-sm">Doniczki</span><p className="text-xl font-bold">{pv.pots.toLocaleString('pl-PL')}</p></div>
                    <div><span className="text-gray-400 text-sm">Pędy</span><p className="text-xl font-bold">{pv.shoots.toLocaleString('pl-PL')}</p></div>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 text-sm">Razem</span>
                    <p className="text-3xl font-bold">{pv.total.toLocaleString('pl-PL')} kg</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => saveSection(block.id)} className="bg-gray-900">{editingSection ? 'Zapisz' : 'Dodaj'}</Button>
                  <Button variant="outline" onClick={resetSection}>Anuluj</Button>
                </div>
              </div>
            )}

            {/* Sections list */}
            <div className="divide-y">
              {block.sections.map(section => {
                const st = calcStats(section)
                const isExp = expandedSection === section.id
                const wSummer = getWeekly(st.fs, st.curveSummer, st.eff)
                const wAutumn = getWeekly(st.fa, st.curveAutumn, st.eff)
                const maxS = Math.max(...wSummer.map(w => w.kg))
                const maxA = Math.max(...wAutumn.map(w => w.kg))

                return (
                  <div key={section.id}>
                    {/* Section row */}
                    <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedSection(isExp ? null : section.id)}>
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-12 rounded-full bg-gradient-to-b from-orange-400 to-red-400" />
                        <div>
                          <p className="font-medium">{section.name}</p>
                          <p className="text-sm text-gray-500">{section.variety?.name} • {section.metersLength}m • Rok {section.productionYear}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Prognoza</p>
                          <p className="font-semibold">
                            <span className="text-orange-600">{st.fs.toLocaleString('pl-PL')}</span>
                            <span className="text-gray-400 mx-1">+</span>
                            <span className="text-red-600">{st.fa.toLocaleString('pl-PL')}</span>
                            <span className="text-gray-500 ml-1">kg</span>
                          </p>
                        </div>
                        {isExp ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); startEditSection(block.id, section) }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); delSection(section.id) }} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExp && (
                      <div className="px-6 pb-6 bg-gray-50 space-y-6">
                        {/* Quick stats */}
                        <div className="grid grid-cols-5 gap-3 pt-4">
                          {[
                            { label: 'Doniczki', value: st.pots.toLocaleString('pl-PL'), color: 'bg-gray-100' },
                            { label: 'Pędy', value: st.shoots.toLocaleString('pl-PL'), color: 'bg-gray-100' },
                            { label: 'Lato', value: `${st.fs.toLocaleString('pl-PL')} kg`, color: 'bg-orange-100 text-orange-700' },
                            { label: 'Jesień', value: `${st.fa.toLocaleString('pl-PL')} kg`, color: 'bg-red-100 text-red-700' },
                            { label: 'Razem', value: `${st.total.toLocaleString('pl-PL')} kg`, color: 'bg-green-100 text-green-700' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                              <p className="text-xs opacity-70">{label}</p>
                              <p className="font-bold">{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Charts side by side */}
                        <div className="grid grid-cols-2 gap-6">
                          {/* LATO Chart */}
                          <div className="bg-white rounded-2xl p-5 border">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-semibold text-orange-700 flex items-center gap-2"><Sun className="w-5 h-5" />Sezon letni</h4>
                              <span className="text-sm text-gray-500">Szczyt: {maxS.toLocaleString('pl-PL')} kg</span>
                            </div>
                            {/* Bar chart */}
                            <div className="flex items-end gap-2 h-40 mb-3">
                              {wSummer.map((w, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center">
                                  <div className="w-full flex flex-col items-center justify-end h-32">
                                    <div 
                                      className="w-full bg-gradient-to-t from-orange-500 to-amber-400 rounded-t-lg transition-all hover:from-orange-600 hover:to-amber-500 relative group"
                                      style={{ height: `${(w.kg / maxS) * 100}%`, minHeight: '8px' }}
                                    >
                                      <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs hidden group-hover:block whitespace-nowrap z-10">
                                        <strong>{w.kg.toLocaleString('pl-PL')} kg</strong><br/>
                                        {w.workers} osób • {w.hrs}h
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-xs text-gray-500 mt-2">T{w.week}</span>
                                </div>
                              ))}
                            </div>
                            {/* Weekly table */}
                            <div className="text-xs space-y-1">
                              {wSummer.slice(0, 4).map(w => (
                                <div key={w.week} className="flex justify-between py-1 border-b border-gray-100">
                                  <span>Tydzień {w.week}</span>
                                  <span className="font-medium">{w.kg.toLocaleString('pl-PL')} kg</span>
                                  <span className="text-gray-500">{w.workers} os. • {w.hrs}h</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* JESIEN Chart */}
                          <div className="bg-white rounded-2xl p-5 border">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-semibold text-red-700 flex items-center gap-2"><Leaf className="w-5 h-5" />Sezon jesienny</h4>
                              <span className="text-sm text-gray-500">Szczyt: {maxA.toLocaleString('pl-PL')} kg</span>
                            </div>
                            {/* Bar chart */}
                            <div className="flex items-end gap-2 h-40 mb-3">
                              {wAutumn.map((w, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center">
                                  <div className="w-full flex flex-col items-center justify-end h-32">
                                    <div 
                                      className="w-full bg-gradient-to-t from-red-500 to-orange-400 rounded-t-lg transition-all hover:from-red-600 hover:to-orange-500 relative group"
                                      style={{ height: `${(w.kg / maxA) * 100}%`, minHeight: '8px' }}
                                    >
                                      <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs hidden group-hover:block whitespace-nowrap z-10">
                                        <strong>{w.kg.toLocaleString('pl-PL')} kg</strong><br/>
                                        {w.workers} osób • {w.hrs}h
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-xs text-gray-500 mt-2">T{w.week}</span>
                                </div>
                              ))}
                            </div>
                            {/* Weekly table */}
                            <div className="text-xs space-y-1">
                              {wAutumn.slice(0, 4).map(w => (
                                <div key={w.week} className="flex justify-between py-1 border-b border-gray-100">
                                  <span>Tydzień {w.week}</span>
                                  <span className="font-medium">{w.kg.toLocaleString('pl-PL')} kg</span>
                                  <span className="text-gray-500">{w.workers} os. • {w.hrs}h</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Workers summary */}
                        <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-4">
                          <Users className="w-8 h-8 text-blue-600" />
                          <div>
                            <p className="text-sm text-blue-600">Maksymalne zapotrzebowanie na pracowników</p>
                            <p className="text-2xl font-bold text-blue-700">
                              {Math.max(...wSummer.map(w => w.workers), ...wAutumn.map(w => w.workers))} osób
                              <span className="text-sm font-normal text-blue-500 ml-2">(w szczycie sezonu)</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {block.sections.length === 0 && (
                <div className="px-6 py-12 text-center text-gray-400">
                  Brak sekcji. Kliknij "+ Sekcja" aby dodać.
                </div>
              )}
            </div>
          </div>
        ))}

        {blocks.length === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Brak bloków. Kliknij "Nowy blok" aby rozpocząć.</p>
          </div>
        )}
      </div>
    </div>
  )
}
