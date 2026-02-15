'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Layers, X, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface Variety { id: string; name: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; gdhSummer?: number; gdhAutumn?: number }
interface Section { id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number; plantingYear?: number; productionYear?: number; plantMaterialType?: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; gdhSummer?: number; gdhAutumn?: number; varietyId: string; variety?: Variety; winteredInTunnel?: boolean; plantingDate?: string; winterShootsDate?: string }
interface Block { id: string; name: string; sections: Section[] }
interface Farm { id: string; name: string }

const PLANT_TYPES = [{ value: 'SMALL_POT', label: 'Doniczka' }, { value: 'ROOT', label: 'Korzeń' }, { value: 'LONGCANE', label: 'Longcane' }, { value: 'PLUG', label: 'Plug' }]

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
  const [sectionForm, setSectionForm] = useState({ name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2, plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT', varietyId: '', yieldSummerPerShoot: 0, yieldAutumnPerShoot: 0, gdhSummer: 20000, gdhAutumn: 25000, winteredInTunnel: false, plantingDate: '', winterShootsDate: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      setBlocks(data.blocks || []); setVarieties(data.varieties || []); setFarm(data.farm)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const calcStats = (s: Section) => {
    const v = varieties.find(x => x.id === s.varietyId)
    const pots = s.metersLength * s.potsPerMeter
    const shoots = pots * s.shootsPerPot
    const ys = s.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0
    const ya = s.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0
    return { pots, shoots, fs: shoots * ys, fa: shoots * ya }
  }

  const resetBlock = () => { setBlockName(''); setEditingBlock(null); setShowBlockForm(false) }
  const saveBlock = async () => {
    if (!blockName.trim() || !farm) return
    if (editingBlock) await fetch(`/api/plantation/block/${editingBlock.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: blockName }) })
    else await fetch('/api/plantation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block: { name: blockName }, farmId: farm.id }) })
    resetBlock(); fetchData()
  }
  const delBlock = async (id: string) => { if (confirm('Usunąć blok?')) { await fetch(`/api/plantation/block/${id}`, { method: 'DELETE' }); fetchData() } }

  const resetSection = () => { setSectionForm({ name: '', metersLength: 100, potsPerMeter: 2, shootsPerPot: 2, plantingYear: new Date().getFullYear(), productionYear: 1, plantMaterialType: 'SMALL_POT', varietyId: '', yieldSummerPerShoot: 0, yieldAutumnPerShoot: 0, gdhSummer: 20000, gdhAutumn: 25000, winteredInTunnel: false, plantingDate: '', winterShootsDate: '' }); setEditingSection(null); setShowSectionForm(null) }
  const startAddSection = (bid: string) => { resetSection(); setShowSectionForm(bid) }
  const startEditSection = (bid: string, s: Section) => {
    setEditingSection(s)
    const v = varieties.find(x => x.id === s.varietyId)
    setSectionForm({ name: s.name || '', metersLength: s.metersLength, potsPerMeter: s.potsPerMeter, shootsPerPot: s.shootsPerPot, plantingYear: s.plantingYear || new Date().getFullYear(), productionYear: s.productionYear || 1, plantMaterialType: s.plantMaterialType || 'SMALL_POT', varietyId: s.varietyId, yieldSummerPerShoot: s.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0, yieldAutumnPerShoot: s.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0, gdhSummer: s.gdhSummer || v?.gdhSummer || 20000, gdhAutumn: s.gdhAutumn || v?.gdhAutumn || 25000, winteredInTunnel: s.winteredInTunnel || false, plantingDate: s.plantingDate || '', winterShootsDate: s.winterShootsDate || '' })
    setShowSectionForm(bid)
  }
  const onVarChange = (vid: string) => {
    const v = varieties.find(x => x.id === vid)
    setSectionForm({ ...sectionForm, varietyId: vid, yieldSummerPerShoot: v?.yieldSummerPerShoot || 0, yieldAutumnPerShoot: v?.yieldAutumnPerShoot || 0, gdhSummer: v?.gdhSummer || 20000, gdhAutumn: v?.gdhAutumn || 25000 })
  }
  const saveSection = async (bid: string) => {
    if (!sectionForm.name || !sectionForm.varietyId) return
    if (editingSection) await fetch(`/api/plantation/section/${editingSection.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sectionForm, blockId: bid }) })
    else await fetch('/api/plantation/section', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: { ...sectionForm, blockId: bid } }) })
    resetSection(); fetchData()
  }
  const delSection = async (id: string) => { if (confirm('Usunąć sekcję?')) { await fetch(`/api/plantation/section/${id}`, { method: 'DELETE' }); fetchData() } }

  const pv = (() => { const pots = sectionForm.metersLength * sectionForm.potsPerMeter; const shoots = pots * sectionForm.shootsPerPot; const fs = shoots * (sectionForm.yieldSummerPerShoot || 0); const fa = shoots * (sectionForm.yieldAutumnPerShoot || 0); return { pots, shoots, fs, fa, total: fs + fa } })()
  const totals = blocks.reduce((a, b) => { b.sections.forEach(s => { const st = calcStats(s); a.fs += st.fs; a.fa += st.fa; a.pots += st.pots; a.sections++ }); return a }, { fs: 0, fa: 0, pots: 0, sections: 0 })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Konfiguracja plantacji</h1><p className="text-gray-500">{farm?.name}</p></div>
        <Button onClick={() => setShowBlockForm(true)} className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 mr-2" />Nowy blok</Button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{blocks.length}</p><p className="text-xs text-gray-500">Bloków</p></div>
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{totals.sections}</p><p className="text-xs text-gray-500">Sekcji</p></div>
        <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{totals.pots.toLocaleString('pl-PL')}</p><p className="text-xs text-gray-500">Doniczek</p></div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center"><p className="text-2xl font-bold text-orange-600">{(totals.fs / 1000).toFixed(1)}t</p><p className="text-xs text-orange-600">Lato ☀️</p></div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center"><p className="text-2xl font-bold text-red-600">{(totals.fa / 1000).toFixed(1)}t</p><p className="text-xs text-red-600">Jesień 🍂</p></div>
      </div>

      {showBlockForm && (
        <div className="bg-gray-50 rounded-xl p-5 border">
          <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">{editingBlock ? 'Edytuj blok' : 'Nowy blok'}</h3><Button variant="ghost" size="icon" className="hover:cursor-pointer" onClick={resetBlock}><X className="w-4 h-4" /></Button></div>
          <div className="flex gap-3"><Input placeholder="Nazwa bloku" value={blockName} onChange={e => setBlockName(e.target.value)} className="flex-1" /><Button onClick={saveBlock} className="bg-green-600 hover:bg-green-700">{editingBlock ? 'Zapisz' : 'Dodaj'}</Button></div>
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
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div><Label className="text-xs">Nazwa</Label><Input value={sectionForm.name} onChange={e => setSectionForm({...sectionForm, name: e.target.value})} /></div>
                        <div><Label className="text-xs">Odmiana</Label><select className="w-full h-10 border rounded-md px-3" value={sectionForm.varietyId} onChange={e => onVarChange(e.target.value)}><option value="">Wybierz...</option>{varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                        <div><Label className="text-xs">Metry bieżące</Label><Input type="number" value={sectionForm.metersLength} onChange={e => setSectionForm({...sectionForm, metersLength: +e.target.value})} /></div>
                        <div><Label className="text-xs">Typ materiału</Label><select className="w-full h-10 border rounded-md px-3" value={sectionForm.plantMaterialType} onChange={e => setSectionForm({...sectionForm, plantMaterialType: e.target.value})}>{PLANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div><Label className="text-xs">Doniczek/m</Label><Input type="number" step="0.1" value={sectionForm.potsPerMeter} onChange={e => setSectionForm({...sectionForm, potsPerMeter: +e.target.value})} /></div>
                        <div><Label className="text-xs">Pędów/don.</Label><Input type="number" step="0.1" value={sectionForm.shootsPerPot} onChange={e => setSectionForm({...sectionForm, shootsPerPot: +e.target.value})} /></div>
                        <div><Label className="text-xs">Rok nasadz.</Label><Input type="number" value={sectionForm.plantingYear} onChange={e => setSectionForm({...sectionForm, plantingYear: +e.target.value})} /></div>
                        <div><Label className="text-xs">Rok prod.</Label><Input type="number" value={sectionForm.productionYear} onChange={e => setSectionForm({...sectionForm, productionYear: +e.target.value})} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-orange-100 p-3 rounded-lg"><p className="text-xs text-orange-700 font-medium mb-2">☀️ Sezon letni</p><div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldSummerPerShoot} onChange={e => setSectionForm({...sectionForm, yieldSummerPerShoot: +e.target.value})} className="bg-white" /></div><div><Label className="text-xs">GDH</Label><Input type="number" value={sectionForm.gdhSummer} onChange={e => setSectionForm({...sectionForm, gdhSummer: +e.target.value})} className="bg-white" /></div></div></div>
                        <div className="bg-red-100 p-3 rounded-lg"><p className="text-xs text-red-700 font-medium mb-2">🍂 Sezon jesienny</p><div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">kg/pęd</Label><Input type="number" step="0.01" value={sectionForm.yieldAutumnPerShoot} onChange={e => setSectionForm({...sectionForm, yieldAutumnPerShoot: +e.target.value})} className="bg-white" /></div><div><Label className="text-xs">GDH</Label><Input type="number" value={sectionForm.gdhAutumn} onChange={e => setSectionForm({...sectionForm, gdhAutumn: +e.target.value})} className="bg-white" /></div></div></div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4"><p className="text-xs text-blue-700 font-medium mb-2">🌱 Wzrost i owocowanie</p><div className="space-y-3"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={sectionForm.winteredInTunnel} onChange={e => setSectionForm({...sectionForm, winteredInTunnel: e.target.checked})} className="w-4 h-4 rounded" /><span className="text-sm">Zimowana w tunelu (GDH od 1.01)</span></label><div className="grid grid-cols-2 gap-3">{!sectionForm.winteredInTunnel && <div><Label className="text-xs">Data wysadzenia</Label><Input type="date" value={sectionForm.plantingDate} onChange={e => setSectionForm({...sectionForm, plantingDate: e.target.value})} className="bg-white" /></div>}<div><Label className="text-xs">Dzień wypuszczenia pędów jesiennych</Label><Input type="date" value={sectionForm.winterShootsDate} onChange={e => setSectionForm({...sectionForm, winterShootsDate: e.target.value})} className="bg-white" /></div></div></div></div>
                      <div className="bg-gray-900 text-white p-3 rounded-lg flex justify-between items-center mb-4">
                        <div className="flex gap-6 text-sm"><div><span className="text-gray-400">Doniczki:</span> <strong>{pv.pots.toLocaleString('pl-PL')}</strong></div><div><span className="text-gray-400">Pędy:</span> <strong>{pv.shoots.toLocaleString('pl-PL')}</strong></div></div>
                        <div className="flex gap-4 text-sm"><div><span className="text-orange-400">Lato:</span> <strong>{pv.fs.toLocaleString('pl-PL')} kg</strong></div><div><span className="text-red-400">Jesień:</span> <strong>{pv.fa.toLocaleString('pl-PL')} kg</strong></div><div><span className="text-green-400">Razem:</span> <strong>{pv.total.toLocaleString('pl-PL')} kg</strong></div></div>
                      </div>
                      <div className="flex gap-2"><Button onClick={() => saveSection(block.id)} className="bg-green-600 hover:bg-green-700">{editingSection ? 'Zapisz' : 'Dodaj'}</Button><Button variant="outline" onClick={resetSection}>Anuluj</Button></div>
                    </div>
                  )}
                  <div className="divide-y">
                    {block.sections.map(section => { const st = calcStats(section); return (
                      <div key={section.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4"><div className="w-1 h-10 rounded-full bg-gradient-to-b from-orange-400 to-red-400" /><div><p className="font-medium">{section.name}</p><p className="text-xs text-gray-500">{section.variety?.name} • {section.metersLength}m • {st.pots.toLocaleString('pl-PL')} don. • Rok {section.productionYear}</p></div></div>
                        <div className="flex items-center gap-4"><div className="text-sm text-right"><span className="text-orange-600">{st.fs.toLocaleString('pl-PL')}</span><span className="text-gray-400 mx-1">+</span><span className="text-red-600">{st.fa.toLocaleString('pl-PL')}</span><span className="text-gray-500 ml-1">kg</span></div><Button variant="ghost" size="icon" className="hover:cursor-pointer cursor-pointer" onClick={() => startEditSection(block.id, section)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="hover:cursor-pointer text-red-500" onClick={() => delSection(section.id)}><Trash2 className="w-4 h-4" /></Button></div>
                      </div>
                    )})}
                    {block.sections.length === 0 && <div className="px-5 py-8 text-center text-gray-400">Brak sekcji. Kliknij + aby dodać.</div>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {blocks.length === 0 && <div className="bg-white rounded-xl border-2 border-dashed p-12 text-center"><Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Brak bloków. Kliknij "Nowy blok" aby rozpocząć.</p></div>}
      </div>
    </div>
  )
}
