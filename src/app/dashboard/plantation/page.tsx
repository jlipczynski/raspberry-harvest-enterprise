'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Layers, X, Pencil, Trash2, ChevronDown, ChevronUp, Thermometer, Loader2, TrendingUp } from 'lucide-react'
import GDHModule, { type ApiResponse as GdhApiResponse } from './gdh-module'
import GDHMatrix from './gdh-matrix'

interface Variety { id: string; name: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number }
interface Section { id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number; potsOverride?: number | null; plantingYear?: number; productionYear?: number; plantMaterialType?: string; plantSource?: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; varietyId: string; variety?: Variety; winteredInTunnel?: boolean; plantingDate?: string; autumnShootDate?: string; _tempCount?: number; _count?: { temperatureReadings: number } }
interface Block { id: string; name: string; sections: Section[] }
interface Farm { id: string; name: string }
interface TempReading { id: string; timestamp: string; temperature: number; sourceFile?: string }

const PLANT_TYPES = [{ value: 'SMALL_POT', label: 'Doniczka' }, { value: 'ROOT', label: 'Korzeń' }, { value: 'LONGCANE', label: 'Longcane' }, { value: 'PLUG', label: 'Plug' }]
const PLANT_SOURCES = [{ value: '', label: 'Nie określono' }, { value: 'OWN', label: 'Własne plugi' }, { value: 'NURSERY', label: 'Zewnętrzna szkółka' }]

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
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [sectionForm, setSectionForm] = useState({ name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2, potsOverride: '' as string | number, plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT', plantSource: '', varietyId: '', yieldSummerPerShoot: '' as string | number, yieldAutumnPerShoot: '' as string | number, winteredInTunnel: false, plantingDate: '', autumnShootDate: '' })

  // Temperature readings state (per section)
  const [tempReadings, setTempReadings] = useState<Record<string, TempReading[]>>({})
  const [tempCounts, setTempCounts] = useState<Record<string, number>>({})
  const [loadingTemps, setLoadingTemps] = useState<string | null>(null)
  const [tempPage, setTempPage] = useState<Record<string, number>>({})
  const [tempTotalPages, setTempTotalPages] = useState<Record<string, number>>({})
  const [showGDH, setShowGDH] = useState(true)
  const [gdhData, setGdhData] = useState<GdhApiResponse | null>(null)
  const [gdhLoading, setGdhLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    async function fetchGdh() {
      try {
        const res = await fetch('/api/gdh')
        const json = await res.json()
        setGdhData(json)
      } catch (e) {
        console.error('Error fetching GDH:', e)
      } finally {
        setGdhLoading(false)
      }
    }
    fetchGdh()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/plantation')
      if (!res.ok) {
        console.error('fetchData failed:', res.status)
        alert(`Błąd ładowania danych plantacji: ${res.status}`)
        return
      }
      const data = await res.json()
      if (data.error) {
        alert(`Błąd serwera: ${data.error}`)
        return
      }
      const bs = data.blocks || []
      setBlocks(bs); setVarieties(data.varieties || []); setFarm(data.farm)
      const counts: Record<string, number> = {}
      bs.forEach((b: Block) => b.sections.forEach((s: Section) => {
        counts[s.id] = s._count?.temperatureReadings ?? 0
      }))
      setTempCounts(counts)
    } catch (e) { console.error(e); alert(`Błąd sieci: ${e}`) } finally { setLoading(false) }
  }

  // Fetch temp counts for all sections
  const fetchTempCounts = useCallback(async () => {
    if (blocks.length === 0) return
    const sectionIds = blocks.flatMap(b => b.sections.map(s => s.id))
    const counts: Record<string, number> = {}
    await Promise.all(sectionIds.map(async (id) => {
      try {
        const res = await fetch(`/api/plantation/section/${id}/temperatures?limit=1`)
        const data = await res.json()
        counts[id] = data.total || 0
      } catch { counts[id] = 0 }
    }))
    setTempCounts(counts)
  }, [blocks])



  // Fetch temp readings for a specific section
  const fetchTempReadings = async (sectionId: string, page = 1) => {
    setLoadingTemps(sectionId)
    try {
      const res = await fetch(`/api/plantation/section/${sectionId}/temperatures?page=${page}&limit=50`)
      const data = await res.json()
      setTempReadings(prev => ({ ...prev, [sectionId]: data.readings }))
      setTempPage(prev => ({ ...prev, [sectionId]: data.page }))
      setTempTotalPages(prev => ({ ...prev, [sectionId]: data.totalPages }))
    } catch (e) { console.error(e) }
    setLoadingTemps(null)
  }

  const clearTempReadings = async (sectionId: string) => {
    if (!confirm('Usunąć wszystkie pomiary temperatury dla tej sekcji?')) return
    await fetch(`/api/plantation/section/${sectionId}/temperatures`, { method: 'DELETE' })
    setTempReadings(prev => ({ ...prev, [sectionId]: [] }))
    setTempCounts(prev => ({ ...prev, [sectionId]: 0 }))
  }

  const calcStats = (s: Section) => {
    const v = varieties.find(x => x.id === s.varietyId)
    const pots = (s.potsOverride != null && s.potsOverride > 0) ? s.potsOverride : s.metersLength * s.potsPerMeter
    const shoots = pots * s.shootsPerPot
    const ys = s.yieldSummerPerShoot ?? v?.yieldSummerPerShoot ?? 0
    const ya = s.yieldAutumnPerShoot ?? v?.yieldAutumnPerShoot ?? 0
    return { pots, shoots, fs: shoots * ys, fa: shoots * ya }
  }

  const resetBlock = () => { setBlockName(''); setEditingBlock(null); setShowBlockForm(false) }
  const saveBlock = async () => {
    if (!blockName.trim()) return
    try {
      let res: Response
      if (editingBlock) {
        res = await fetch(`/api/plantation/block/${editingBlock.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: blockName }) })
      } else {
        res = await fetch('/api/plantation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block: { name: blockName } }) })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Błąd zapisu: ${err.error || res.status}`)
        return
      }
      resetBlock()
      await fetchData()
    } catch (e) {
      alert(`Błąd sieci: ${e}`)
    }
  }
  const delBlock = async (id: string) => { if (confirm('Usunąć blok?')) { await fetch(`/api/plantation/block/${id}`, { method: 'DELETE' }); fetchData() } }

  const resetSection = () => { setSectionForm({ name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2, potsOverride: '', plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT', plantSource: '', varietyId: '', yieldSummerPerShoot: '', yieldAutumnPerShoot: '', winteredInTunnel: false, plantingDate: '', autumnShootDate: '' }); setEditingSection(null); setShowSectionForm(null) }
  const startAddSection = (bid: string) => { resetSection(); setShowSectionForm(bid) }
  const startEditSection = (bid: string, s: Section) => {
    setEditingSection(s)
    const v = varieties.find(x => x.id === s.varietyId)
    setSectionForm({ name: s.name || '', metersLength: s.metersLength, potsPerMeter: s.potsPerMeter, shootsPerPot: s.shootsPerPot, potsOverride: s.potsOverride ?? '', plantingYear: s.plantingYear || new Date().getFullYear(), productionYear: s.productionYear || 1, plantMaterialType: s.plantMaterialType || 'SMALL_POT', plantSource: s.plantSource || '', varietyId: s.varietyId, yieldSummerPerShoot: s.yieldSummerPerShoot ?? '', yieldAutumnPerShoot: s.yieldAutumnPerShoot ?? '', winteredInTunnel: s.winteredInTunnel || false, plantingDate: s.plantingDate ? s.plantingDate.slice(0, 10) : '', autumnShootDate: s.autumnShootDate ? s.autumnShootDate.slice(0, 10) : '' })
    setShowSectionForm(bid)
  }
  const onVarChange = (vid: string) => {
    setSectionForm({ ...sectionForm, varietyId: vid })
  }
  const saveSection = async (bid: string) => {
    if (!sectionForm.name) { alert('Wpisz nazwę sekcji'); return }
    if (!sectionForm.varietyId) { alert('Wybierz odmianę'); return }
    const payload = {
      ...sectionForm,
      blockId: bid,
      yieldSummerPerShoot: sectionForm.yieldSummerPerShoot !== '' ? Number(sectionForm.yieldSummerPerShoot) : null,
      yieldAutumnPerShoot: sectionForm.yieldAutumnPerShoot !== '' ? Number(sectionForm.yieldAutumnPerShoot) : null,
      autumnShootDate: sectionForm.autumnShootDate || null,
    }
    try {
      let res: Response
      if (editingSection) {
        res = await fetch(`/api/plantation/section/${editingSection.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        res = await fetch('/api/plantation/section', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: payload }) })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Błąd zapisu sekcji: ${err.error || res.status}`)
        return
      }
      resetSection()
      await fetchData()
    } catch (e) {
      alert(`Błąd sieci: ${e}`)
    }
  }
  const delSection = async (id: string) => { if (confirm('Usunąć sekcję?')) { await fetch(`/api/plantation/section/${id}`, { method: 'DELETE' }); fetchData() } }

  const pv = (() => { const potsCalc = sectionForm.metersLength * sectionForm.potsPerMeter; const potsOvr = sectionForm.potsOverride !== '' && sectionForm.potsOverride !== null && Number(sectionForm.potsOverride) > 0 ? Number(sectionForm.potsOverride) : null; const pots = potsOvr ?? potsCalc; const shoots = pots * sectionForm.shootsPerPot; const fs = shoots * (Number(sectionForm.yieldSummerPerShoot) || 0); const fa = shoots * (Number(sectionForm.yieldAutumnPerShoot) || 0); return { pots, shoots, fs, fa, total: fs + fa, potsOvr } })()
  const totals = blocks.reduce((a, b) => { b.sections.forEach(s => { const st = calcStats(s); a.fs += st.fs; a.fa += st.fa; a.pots += st.pots; a.sections++ }); return a }, { fs: 0, fa: 0, pots: 0, sections: 0 })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Konfiguracja plantacji</h1><p className="text-gray-500">{farm?.name}</p></div>
        <Button onClick={() => setShowBlockForm(true)} className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 mr-2" />Nowy blok</Button>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{blocks.length}</p><p className="text-xs text-gray-500">Bloków</p></div>
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{totals.sections}</p><p className="text-xs text-gray-500">Sekcji</p></div>
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{totals.pots.toLocaleString('pl-PL')}</p><p className="text-xs text-gray-500">Doniczek</p></div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center"><p className="text-2xl font-bold text-orange-600">{(totals.fs / 1000).toFixed(1)}t</p><p className="text-xs text-orange-600">Lato ☀️</p></div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center"><p className="text-2xl font-bold text-red-600">{(totals.fa / 1000).toFixed(1)}t</p><p className="text-xs text-red-600">Jesień 🍂</p></div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center"><p className="text-2xl font-bold text-green-700">{((totals.fs + totals.fa) / 1000).toFixed(1)}t</p><p className="text-xs text-green-700">Razem</p></div>
      </div>

      {showBlockForm && (
        <div className="bg-gray-50 rounded-xl p-5 border">
          <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">{editingBlock ? 'Edytuj blok' : 'Nowy blok'}</h3><Button variant="ghost" size="icon" className="hover:cursor-pointer" onClick={resetBlock}><X className="w-4 h-4" /></Button></div>
          <div className="flex gap-3"><Input placeholder="Nazwa bloku" value={blockName} onChange={e => setBlockName(e.target.value)} className="flex-1" /><Button onClick={saveBlock} className="bg-green-600 hover:bg-green-700">{editingBlock ? 'Zapisz' : 'Dodaj'}</Button></div>
        </div>
      )}

      {/* GDH Module */}
      <div>
        <button
          onClick={() => setShowGDH(!showGDH)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl hover:from-green-100 hover:to-blue-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-gray-800">Moduł GDH — Godziny Wzrostu</span>
          </div>
          {showGDH ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        {showGDH && (
          <div className="mt-3">
            <GDHModule initialData={gdhData} initialLoading={gdhLoading} />
          </div>
        )}
      </div>

      {/* GDH Matrix - plantation overview */}
      {showGDH && (
        <div className="mt-3">
          <GDHMatrix initialData={gdhData} initialLoading={gdhLoading} />
        </div>
      )}

      <div className="space-y-3">
        {blocks.map(block => {
          const blockStats = block.sections.reduce((a, s) => { const st = calcStats(s); return { pots: a.pots + st.pots, fs: a.fs + st.fs, fa: a.fa + st.fa } }, { pots: 0, fs: 0, fa: 0 })
          const isExpanded = expandedBlock === block.id
          return (
            <div key={block.id} className="bg-white rounded-xl border overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => setExpandedBlock(isExpanded ? null : block.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-green-600 text-white flex items-center justify-center font-bold text-lg">{block.name.slice(-1)}</div>
                  <div><h3 className="font-semibold">{block.name}</h3><p className="text-sm text-gray-500">{block.sections.length} sekcji • {blockStats.pots.toLocaleString('pl-PL')} doniczek</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm"><span className="text-orange-600 font-medium">{(blockStats.fs/1000).toFixed(1)}t</span><span className="text-gray-400 mx-1">+</span><span className="text-red-600 font-medium">{(blockStats.fa/1000).toFixed(1)}t</span></div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  <Button variant="ghost" size="icon" className="hover:cursor-pointer" onClick={e => { e.stopPropagation(); startAddSection(block.id) }}><Plus className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="hover:cursor-pointer" onClick={e => { e.stopPropagation(); setEditingBlock(block); setBlockName(block.name); setShowBlockForm(true) }}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="hover:cursor-pointer text-red-500" onClick={e => { e.stopPropagation(); delBlock(block.id) }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t">
                  {showSectionForm === block.id && (
                    <div className="p-5 bg-blue-50 border-b">
                      <h4 className="font-semibold mb-4">{editingSection ? 'Edytuj sekcję' : 'Nowa sekcja'}</h4>
                      <div className="grid grid-cols-5 gap-3 mb-3">
                        <div><Label className="text-xs">Nazwa</Label><Input value={sectionForm.name} onChange={e => setSectionForm({...sectionForm, name: e.target.value})} /></div>
                        <div><Label className="text-xs">Odmiana</Label><select className="w-full h-10 border rounded-md px-3" value={sectionForm.varietyId} onChange={e => onVarChange(e.target.value)}><option value="">Wybierz...</option>{varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                        <div><Label className="text-xs">Metry bieżące</Label><Input type="number" value={sectionForm.metersLength} onChange={e => setSectionForm({...sectionForm, metersLength: +e.target.value})} /></div>
                        <div><Label className="text-xs">Typ materiału</Label><select className="w-full h-10 border rounded-md px-3" value={sectionForm.plantMaterialType} onChange={e => setSectionForm({...sectionForm, plantMaterialType: e.target.value})}>{PLANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                        <div><Label className="text-xs">Źródło sadzonek</Label><select className="w-full h-10 border rounded-md px-3" value={sectionForm.plantSource} onChange={e => setSectionForm({...sectionForm, plantSource: e.target.value})}>{PLANT_SOURCES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div><Label className="text-xs">Doniczek/m</Label><Input type="number" step="0.1" value={sectionForm.potsPerMeter} onChange={e => setSectionForm({...sectionForm, potsPerMeter: +e.target.value})} /></div>
                        <div><Label className="text-xs">Pędów/don.</Label><Input type="number" step="0.1" value={sectionForm.shootsPerPot} onChange={e => setSectionForm({...sectionForm, shootsPerPot: +e.target.value})} /></div>
                        <div><Label className="text-xs">Rok nasadz.</Label><Input type="number" value={sectionForm.plantingYear} onChange={e => setSectionForm({...sectionForm, plantingYear: +e.target.value})} /></div>
                      </div>
                      <div className="mt-2 flex items-center gap-3 mb-3">
                        <Label className="text-xs whitespace-nowrap">Doniczek (ręcznie):</Label>
                        <Input
                          type="number"
                          step="1"
                          placeholder={String(Math.round(sectionForm.metersLength * sectionForm.potsPerMeter))}
                          value={sectionForm.potsOverride}
                          onChange={e => setSectionForm({...sectionForm, potsOverride: e.target.value === '' ? '' : +e.target.value})}
                          className="w-32"
                        />
                        {sectionForm.potsOverride !== '' && sectionForm.potsOverride !== null && Number(sectionForm.potsOverride) > 0 && (
                          <button
                            type="button"
                            onClick={() => setSectionForm({...sectionForm, potsOverride: ''})}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            ✕ Wyczyść (wróć do auto)
                          </button>
                        )}
                        <div><Label className="text-xs">Rok prod.</Label><Input type="number" value={sectionForm.productionYear} onChange={e => setSectionForm({...sectionForm, productionYear: +e.target.value})} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-orange-100 p-3 rounded-lg"><p className="text-xs text-orange-700 font-medium mb-2">☀️ Sezon letni</p><div><Label className="text-xs">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldSummerPerShoot} onChange={e => setSectionForm({...sectionForm, yieldSummerPerShoot: +e.target.value})} className="bg-white" /></div></div>
                        <div className="bg-red-100 p-3 rounded-lg"><p className="text-xs text-red-700 font-medium mb-2">🍂 Sezon jesienny</p><div><Label className="text-xs">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldAutumnPerShoot} onChange={e => setSectionForm({...sectionForm, yieldAutumnPerShoot: +e.target.value})} className="bg-white" /></div></div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4"><p className="text-xs text-blue-700 font-medium mb-2">🌱 Wzrost i owocowanie</p><div className="space-y-3"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={sectionForm.winteredInTunnel} onChange={e => setSectionForm({...sectionForm, winteredInTunnel: e.target.checked})} className="w-4 h-4 rounded" /><span className="text-sm">Zimowana w tunelu (GDH od 1.01)</span></label><div className="grid grid-cols-2 gap-3">{!sectionForm.winteredInTunnel && <div><Label className="text-xs">Data wysadzenia</Label><Input type="date" value={sectionForm.plantingDate} onChange={e => setSectionForm({...sectionForm, plantingDate: e.target.value})} className="bg-white" /></div>}<div><Label className="text-xs">Data wypuszczenia pędów jesiennych</Label><Input type="date" value={sectionForm.autumnShootDate} onChange={e => setSectionForm({...sectionForm, autumnShootDate: e.target.value})} className="bg-white" /></div></div></div></div>
                      {/* Temperature readings table */}
                      {editingSection && (
                        <div className="bg-white border border-blue-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Thermometer className="w-4 h-4 text-blue-600" />
                              <p className="text-xs text-blue-700 font-medium">Pomiary temperatury</p>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tempCounts[editingSection.id] || 0} pomiarów</span>
                            </div>
                            <div className="flex gap-2">
                              {!tempReadings[editingSection.id] && (
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => fetchTempReadings(editingSection.id)}>
                                  {loadingTemps === editingSection.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                  Pokaż dane
                                </Button>
                              )}
                              {(tempCounts[editingSection.id] || 0) > 0 && (
                                <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 hover:text-red-700" onClick={() => clearTempReadings(editingSection.id)}>Wyczyść</Button>
                              )}
                            </div>
                          </div>
                          {tempReadings[editingSection.id] && (
                            <>
                              <div className="max-h-60 overflow-y-auto border rounded">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                      <th className="text-left px-3 py-2 font-medium text-gray-600">Data i czas</th>
                                      <th className="text-right px-3 py-2 font-medium text-gray-600">Temperatura (°C)</th>
                                      <th className="text-right px-3 py-2 font-medium text-gray-600">Plik źródłowy</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {tempReadings[editingSection.id].map(r => (
                                      <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-1.5 text-gray-700">{new Date(r.timestamp).toLocaleString('pl-PL')}</td>
                                        <td className={`px-3 py-1.5 text-right font-mono ${r.temperature < 0 ? 'text-blue-600' : r.temperature > 30 ? 'text-red-600' : 'text-gray-900'}`}>{r.temperature.toFixed(1)}</td>
                                        <td className="px-3 py-1.5 text-right text-gray-400 truncate max-w-[150px]">{r.sourceFile || '-'}</td>
                                      </tr>
                                    ))}
                                    {tempReadings[editingSection.id].length === 0 && (
                                      <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Brak pomiarów. Przeciągnij PDF lub CSV z danymi temperatury.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                              {(tempTotalPages[editingSection.id] || 1) > 1 && (
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-xs text-gray-500">Strona {tempPage[editingSection.id] || 1} z {tempTotalPages[editingSection.id]}</span>
                                  <div className="flex gap-1">
                                    <Button variant="outline" size="sm" className="text-xs h-6 px-2" disabled={(tempPage[editingSection.id] || 1) <= 1} onClick={() => fetchTempReadings(editingSection.id, (tempPage[editingSection.id] || 1) - 1)}>Poprz.</Button>
                                    <Button variant="outline" size="sm" className="text-xs h-6 px-2" disabled={(tempPage[editingSection.id] || 1) >= (tempTotalPages[editingSection.id] || 1)} onClick={() => fetchTempReadings(editingSection.id, (tempPage[editingSection.id] || 1) + 1)}>Nast.</Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <div className="bg-gray-900 text-white p-3 rounded-lg flex justify-between items-center mb-4">
                        <div className="flex gap-6 text-sm"><div><span className="text-gray-400">Doniczki:</span> <strong className={pv.potsOvr ? 'text-orange-400' : ''}>{pv.pots.toLocaleString('pl-PL')}</strong>{pv.potsOvr && <span className="text-[10px] text-orange-400 ml-1">✏️ ręcznie</span>}</div><div><span className="text-gray-400">Pędy:</span> <strong>{pv.shoots.toLocaleString('pl-PL')}</strong></div></div>
                        <div className="flex gap-4 text-sm"><div><span className="text-orange-400">Lato:</span> <strong>{pv.fs.toLocaleString('pl-PL')} kg</strong></div><div><span className="text-red-400">Jesień:</span> <strong>{pv.fa.toLocaleString('pl-PL')} kg</strong></div><div><span className="text-green-400">Razem:</span> <strong>{pv.total.toLocaleString('pl-PL')} kg</strong></div></div>
                      </div>
                      <div className="flex gap-2"><Button onClick={() => saveSection(block.id)} className="bg-green-600 hover:bg-green-700">{editingSection ? 'Zapisz' : 'Dodaj'}</Button><Button variant="outline" onClick={resetSection}>Anuluj</Button></div>
                    </div>
                  )}
                  <div className="divide-y">
                    {block.sections.map(section => { const st = calcStats(section); return (
                      <div key={section.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4"><div className="w-1 h-10 rounded-full bg-gradient-to-b from-orange-400 to-red-400" /><div><p className="font-medium">{section.name}</p><p className="text-xs text-gray-500">{section.variety?.name} • {section.metersLength}m • <span className={section.potsOverride ? 'text-orange-600 font-medium' : ''}>{st.pots.toLocaleString('pl-PL')} don.{section.potsOverride ? ' ✏️' : ''}</span> • Rok {section.productionYear}</p></div></div>
                        <div className="flex items-center gap-4">
                          {(tempCounts[section.id] || 0) > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Thermometer className="w-3 h-3" />{tempCounts[section.id]}</span>
                          )}
                          <div className="text-sm text-right"><span className="text-orange-600">{st.fs.toLocaleString('pl-PL')}</span><span className="text-gray-400 mx-1">+</span><span className="text-red-600">{st.fa.toLocaleString('pl-PL')}</span><span className="text-gray-500 ml-1">kg</span></div><Button variant="ghost" size="icon" className="hover:cursor-pointer cursor-pointer" onClick={() => startEditSection(block.id, section)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="hover:cursor-pointer text-red-500" onClick={() => delSection(section.id)}><Trash2 className="w-4 h-4" /></Button></div>
                      </div>
                    )})}
                    {block.sections.length === 0 && <div className="px-5 py-8 text-center text-gray-400">Brak sekcji. Kliknij + aby dodać.</div>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {blocks.length === 0 && <div className="bg-white rounded-xl border-2 border-dashed p-12 text-center"><Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Brak bloków. Kliknij &ldquo;Nowy blok&rdquo; aby rozpocząć.</p></div>}
      </div>
    </div>
  )
}
