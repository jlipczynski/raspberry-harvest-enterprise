'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Database, Upload, Filter, Thermometer, Sprout, ChevronDown, ChevronUp, Trash2, Edit, Search } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Template {
  id: string; name: string; description?: string; productionYear: number; productionCycle: number
  season: string; plantingDate?: string; winteredInTunnel: boolean; plantSource?: string
  dailyCurve: number[]; weeklyCurve: number[]; startDate?: string; endDate?: string; startWeek?: number
  totalKg: number; outsideTemps?: any; insideTunnelTemps?: any; tempAdjustmentFactor?: number
  gdhData?: any; gdhToFlowering?: number; gdhToFirstFruit?: number; tempSources: string[]
  sourceFile?: string; notes?: string; variety?: { id: string; name: string }
  _count?: { sectionAssignments: number }
}
interface Variety { id: string; name: string }
interface WeekRow { week: number; kg: number; dates: string; season: 'summer' | 'autumn' }
interface DayData { date: string; kg: number; dayOfWeek: number }
interface AreaImport { area: string; totalKg: number; weeks: WeekRow[]; days: DayData[] }
interface RawRow { date: string; area: string; weightReal: number }

const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
const getWeekDates = (weekNum: number, year: number) => {
  const jan1 = new Date(year, 0, 1)
  const daysToMonday = (jan1.getDay() + 6) % 7
  const monday = new Date(year, 0, 1 - daysToMonday + (weekNum - 1) * 7)
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`
  return `${fmt(monday)}-${fmt(sunday)}`
}

const parseExcelDate = (value: any): string => {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (d) return new Date(d.y, d.m - 1, d.d).toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    const parts = value.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)
    if (parts) return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`
    const parts2 = value.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/)
    if (parts2) return `${parts2[3]}-${parts2[2].padStart(2, '0')}-${parts2[1].padStart(2, '0')}`
  }
  return ''
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ varietyId: '', season: '', cycle: '', tunnel: '', search: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Template>>({})
  const [sortBy, setSortBy] = useState<'year' | 'name' | 'totalKg'>('year')
  const [showImport, setShowImport] = useState(false)
  const [areas, setAreas] = useState<AreaImport[]>([])
  const [selectedAreaIdx, setSelectedAreaIdx] = useState<number | null>(null)
  const [importYear, setImportYear] = useState(new Date().getFullYear())
  const [fileName, setFileName] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      const [tRes, vRes] = await Promise.all([fetch('/api/templates'), fetch('/api/varieties')])
      const tData = await tRes.json(); const vData = await vRes.json()
      setTemplates(tData.templates || []); setVarieties(vData.varieties || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    let headerIdx = 0
    for (let i = 0; i < Math.min(10, json.length); i++) {
      if (json[i]?.some((c: any) => String(c).toLowerCase().includes('data') || String(c).toLowerCase().includes('date'))) { headerIdx = i; break }
    }
    const headers = json[headerIdx].map((h: any) => String(h || '').toLowerCase())
    const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date'))
    const areaIdx = headers.findIndex(h => h.includes('obszar') || h.includes('area'))
    const weightIdx = headers.findIndex(h => h.includes('waga') && h.includes('rzecz'))

    const rows: RawRow[] = []
    for (let i = headerIdx + 1; i < json.length; i++) {
      const row = json[i]; if (!row?.[dateIdx]) continue
      const date = parseExcelDate(row[dateIdx]); if (!date) continue
      const area = String(row[areaIdx] || '')
      if (!area || area === 'Cala plantacja' || area.startsWith('CaBy')) continue
      rows.push({ date, area, weightReal: parseFloat(row[weightIdx]) || 0 })
    }

    if (rows.length > 0) setImportYear(new Date(rows[0].date).getFullYear())

    const areaMap: Record<string, Record<number, number>> = {}
    const areaDailyMap: Record<string, Record<string, number>> = {}
    rows.forEach(r => {
      if (!areaMap[r.area]) areaMap[r.area] = {}
      if (!areaDailyMap[r.area]) areaDailyMap[r.area] = {}
      const wk = getWeekNumber(new Date(r.date))
      areaMap[r.area][wk] = (areaMap[r.area][wk] || 0) + r.weightReal
      areaDailyMap[r.area][r.date] = (areaDailyMap[r.area][r.date] || 0) + r.weightReal
    })

    const yr = rows.length > 0 ? new Date(rows[0].date).getFullYear() : new Date().getFullYear()
    const parsed: AreaImport[] = Object.entries(areaMap).map(([area, weekMap]) => {
      const weeks: WeekRow[] = Object.entries(weekMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([wk, kg]) => ({ week: Number(wk), kg, dates: getWeekDates(Number(wk), yr), season: 'summer' as const }))
      const days: DayData[] = Object.entries(areaDailyMap[area] || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, kg]) => ({ date, kg, dayOfWeek: new Date(date).getDay() }))
      return { area, totalKg: weeks.reduce((s, w) => s + w.kg, 0), weeks, days }
    }).sort((a, b) => b.totalKg - a.totalKg)

    setAreas(parsed)
    setSelectedAreaIdx(parsed.length > 0 ? 0 : null)
    setImportYear(yr)
  }, [])

  const toggleSeason = (areaIdx: number, weekIdx: number) => {
    setAreas(prev => prev.map((a, ai) => {
      if (ai !== areaIdx) return a
      const newWeeks = [...a.weeks]
      const current = newWeeks[weekIdx].season
      if (current === 'summer') {
        for (let i = weekIdx; i < newWeeks.length; i++) newWeeks[i] = { ...newWeeks[i], season: 'autumn' }
      } else {
        for (let i = 0; i <= weekIdx; i++) newWeeks[i] = { ...newWeeks[i], season: 'summer' }
      }
      return { ...a, weeks: newWeeks }
    }))
  }

  const saveAreaToTemplateDB = async (area: AreaImport) => {
    const summerWeeks = area.weeks.filter(w => w.season === 'summer')
    const autumnWeeks = area.weeks.filter(w => w.season === 'autumn')
    const newTemplates: any[] = []
    if (summerWeeks.length > 0) {
      const total = summerWeeks.reduce((s, w) => s + w.kg, 0)
      const curve = summerWeeks.map(w => total > 0 ? Math.round((w.kg / total) * 1000) / 10 : 0)
      const weekNums = new Set(summerWeeks.map(w => w.week))
      const days = area.days.filter(d => weekNums.has(getWeekNumber(new Date(d.date))))
      newTemplates.push({ name: `${area.area} - Lato ${importYear}`, productionYear: importYear, season: 'summer',
        dailyCurve: days.map(d => Math.round(d.kg * 10) / 10), weeklyCurve: curve,
        startDate: days[0]?.date || null, endDate: days[days.length - 1]?.date || null,
        startWeek: summerWeeks[0].week, totalKg: total, sourceFile: fileName })
    }
    if (autumnWeeks.length > 0) {
      const total = autumnWeeks.reduce((s, w) => s + w.kg, 0)
      const curve = autumnWeeks.map(w => total > 0 ? Math.round((w.kg / total) * 1000) / 10 : 0)
      const weekNums = new Set(autumnWeeks.map(w => w.week))
      const days = area.days.filter(d => weekNums.has(getWeekNumber(new Date(d.date))))
      newTemplates.push({ name: `${area.area} - Jesień ${importYear}`, productionYear: importYear, season: 'autumn',
        dailyCurve: days.map(d => Math.round(d.kg * 10) / 10), weeklyCurve: curve,
        startDate: days[0]?.date || null, endDate: days[days.length - 1]?.date || null,
        startWeek: autumnWeeks[0].week, totalKg: total, sourceFile: fileName })
    }
    for (const t of newTemplates) {
      await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) })
    }
    return newTemplates.length
  }

  const saveAllToTemplateDB = async () => {
    let count = 0
    for (const area of areas) { count += await saveAreaToTemplateDB(area) }
    alert(`Dodano ${count} krzywych do bazy!`)
    setShowImport(false); setAreas([]); setSelectedAreaIdx(null); fetchAll()
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Usunąć szablon?')) return
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const startEdit = (t: Template) => {
    setEditingId(t.id)
    setEditForm({ name: t.name, description: t.description, productionCycle: t.productionCycle,
      plantingDate: t.plantingDate, winteredInTunnel: t.winteredInTunnel, plantSource: t.plantSource,
      notes: t.notes, gdhToFlowering: t.gdhToFlowering, gdhToFirstFruit: t.gdhToFirstFruit })
  }

  const saveEdit = async (id: string) => {
    await fetch(`/api/templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
    setEditingId(null); fetchAll()
  }

  const filtered = templates.filter(t => {
    if (filter.varietyId && t.variety?.id !== filter.varietyId) return false
    if (filter.season && t.season !== filter.season) return false
    if (filter.cycle && t.productionCycle !== parseInt(filter.cycle)) return false
    if (filter.tunnel && String(t.winteredInTunnel) !== filter.tunnel) return false
    if (filter.search && !t.name.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  }).sort((a, b) => sortBy === 'year' ? b.productionYear - a.productionYear : sortBy === 'name' ? a.name.localeCompare(b.name) : b.totalKg - a.totalKg)

  const selectedArea = selectedAreaIdx !== null ? areas[selectedAreaIdx] : null
  const summerBorderIdx = selectedArea ? selectedArea.weeks.findIndex((w, i, arr) => i < arr.length - 1 && w.season === 'summer' && arr[i + 1].season === 'autumn') : -1

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="w-7 h-7 text-green-600" />Baza Krzywych Produkcji</h1>
          <p className="text-gray-500 mt-1">{templates.length} szablonów • importuj MaxCrop, opisz metadane, użyj w planowaniu</p>
        </div>
        <Button onClick={() => setShowImport(!showImport)} className={showImport ? 'bg-gray-600' : 'bg-green-600 hover:bg-green-700'}>
          <Upload className="w-4 h-4 mr-2" />{showImport ? 'Zamknij import' : 'Import MaxCrop'}
        </Button>
      </div>

      {showImport && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-lg">📥 Import danych MaxCrop</h3>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-500">Rok:</span>
              <select value={importYear} onChange={e => setImportYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm">
                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {areas.length === 0 ? (
            <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
              <Upload className="w-8 h-8 text-gray-400" />
              <span className="text-gray-500">Kliknij lub przeciągnij plik XLS/XLSX</span>
              <input type="file" accept=".xls,.xlsx" onChange={handleFile} className="hidden" />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {areas.map((a, i) => (
                  <button key={i} onClick={() => setSelectedAreaIdx(i)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedAreaIdx === i ? 'bg-green-600 text-white border-green-600' : 'bg-white hover:bg-gray-50'}`}>
                    {a.area} <span className="opacity-70">({(a.totalKg / 1000).toFixed(1)}t)</span>
                  </button>
                ))}
              </div>
              {selectedArea && (
                <div className="space-y-4">
                  <div className="flex items-end gap-1" style={{ height: '150px' }}>
                    {selectedArea.weeks.map((w, i) => {
                      const maxKg = Math.max(...selectedArea.weeks.map(x => x.kg))
                      const h = Math.round((w.kg / maxKg) * 140)
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ height: '100%' }}>
                          <div className={`w-full rounded-t cursor-pointer ${w.season === 'summer' ? 'bg-orange-400 hover:bg-orange-500' : 'bg-red-400 hover:bg-red-500'}`}
                            style={{ height: h + 'px', minHeight: '4px' }} onClick={() => toggleSeason(selectedAreaIdx!, i)} />
                          <div className="text-[10px] text-gray-500 mt-1">T{w.week}</div>
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            T{w.week}: {w.kg.toLocaleString('pl-PL')} kg • {w.season === 'summer' ? '☀️' : '🍂'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white"><tr className="border-b">
                        <th className="text-left py-1.5 px-2">Tydzień</th><th className="text-left py-1.5 px-2">Daty</th>
                        <th className="text-right py-1.5 px-2">kg</th><th className="text-right py-1.5 px-2">%</th>
                        <th className="text-center py-1.5 px-2">Sezon</th>
                      </tr></thead>
                      <tbody>
                        {selectedArea.weeks.map((w, i) => (
                          <tr key={i} className={`border-b hover:bg-gray-50 ${i === summerBorderIdx ? 'border-b-4 border-b-red-300' : ''}`}>
                            <td className="py-1.5 px-2 font-medium">T{w.week}</td>
                            <td className="py-1.5 px-2 text-gray-500">{w.dates}</td>
                            <td className="py-1.5 px-2 text-right">{w.kg.toLocaleString('pl-PL')}</td>
                            <td className="py-1.5 px-2 text-right text-gray-500">{(w.kg / selectedArea.totalKg * 100).toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-center">
                              <button onClick={() => toggleSeason(selectedAreaIdx!, i)}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${w.season === 'summer' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                {w.season === 'summer' ? '☀️ Lato' : '🍂 Jesień'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveAreaToTemplateDB(selectedArea).then(n => { alert(`Dodano ${n} krzyw(ych)`); fetchAll() })} className="bg-blue-600 hover:bg-blue-700">
                      📊 Dodaj do bazy krzywych
                    </Button>
                    <Button onClick={saveAllToTemplateDB} variant="outline" className="border-blue-300 text-blue-700">
                      📊 Dodaj wszystkie ({areas.length}) do bazy
                    </Button>
                    <Button variant="outline" onClick={() => { setAreas([]); setSelectedAreaIdx(null) }} className="ml-auto text-gray-500">Wyczyść</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input placeholder="Szukaj..." value={filter.search} onChange={e => setFilter(p => ({ ...p, search: e.target.value }))} className="border rounded-lg pl-9 pr-3 py-2 text-sm w-48" />
          </div>
          <select value={filter.varietyId} onChange={e => setFilter(p => ({ ...p, varietyId: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Wszystkie odmiany</option>
            {varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={filter.season} onChange={e => setFilter(p => ({ ...p, season: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Oba sezony</option><option value="summer">☀️ Lato</option><option value="autumn">🍂 Jesień</option>
          </select>
          <select value={filter.cycle} onChange={e => setFilter(p => ({ ...p, cycle: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Wszystkie cykle</option><option value="1">1. rok</option><option value="2">2. rok</option><option value="3">3. rok</option>
          </select>
          <select value={filter.tunnel} onChange={e => setFilter(p => ({ ...p, tunnel: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Tunel / pole</option><option value="true">❄️ Tunel</option><option value="false">🌿 Pole</option>
          </select>
          <div className="ml-auto flex gap-1">
            {(['year', 'name', 'totalKg'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} className={`text-xs px-2 py-1 rounded ${sortBy === s ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-500'}`}>
                {s === 'year' ? 'Rok' : s === 'name' ? 'Nazwa' : 'Produkcja'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">{templates.length === 0 ? 'Baza jest pusta' : 'Brak wyników'}</p>
          <p className="text-gray-400 mt-2">{templates.length === 0 ? 'Kliknij "Import MaxCrop" aby dodać krzywe' : 'Zmień filtry'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const isExpanded = expandedId === t.id
            const isEditing = editingId === t.id
            const dailyMax = Math.max(...(t.dailyCurve || []), 1)
            const hasTemps = t.outsideTemps || t.insideTunnelTemps
            const hasGDH = t.gdhData
            return (
              <div key={t.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg ${t.season === 'summer' ? 'bg-orange-500' : 'bg-red-500'}`}>
                    {t.season === 'summer' ? '☀️' : '🍂'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                      <span>{t.variety?.name || '—'}</span><span>•</span><span>{t.productionYear}</span>
                      <span>•</span><span>{t.productionCycle}. rok</span>
                      {t.winteredInTunnel && <><span>•</span><span className="text-blue-600">❄️</span></>}
                    </div>
                  </div>
                  <div className="flex items-end gap-px h-8 w-28">
                    {(t.weeklyCurve || []).map((v, i) => (
                      <div key={i} className="flex-1 rounded-t" style={{ height: `${(v / Math.max(...(t.weeklyCurve || [1]))) * 28}px`, minHeight: '1px', background: t.season === 'summer' ? '#fb923c' : '#f87171' }} />
                    ))}
                  </div>
                  <div className="text-right w-20">
                    <div className="font-bold text-green-700">{(t.totalKg / 1000).toFixed(1)}t</div>
                    <div className="text-xs text-gray-400">{t.dailyCurve?.length || 0}d</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasTemps && <Thermometer className="w-4 h-4 text-blue-400" />}
                    {hasGDH && <Sprout className="w-4 h-4 text-green-400" />}
                  </div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-6">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-xs font-medium text-gray-500">Nazwa</label><input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" /></div>
                          <div><label className="text-xs font-medium text-gray-500">Opis</label><input value={editForm.description || ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" /></div>
                          <div><label className="text-xs font-medium text-gray-500">Cykl produkcji</label><select value={editForm.productionCycle || 1} onChange={e => setEditForm(p => ({ ...p, productionCycle: parseInt(e.target.value) }))} className="w-full border rounded-lg px-3 py-2 mt-1"><option value={1}>1. rok</option><option value={2}>2. rok</option><option value={3}>3. rok</option></select></div>
                          <div><label className="text-xs font-medium text-gray-500">Data sadzenia</label><input type="date" value={editForm.plantingDate || ''} onChange={e => setEditForm(p => ({ ...p, plantingDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" /></div>
                          <div><label className="text-xs font-medium text-gray-500">Źródło sadzonek</label><select value={editForm.plantSource || ''} onChange={e => setEditForm(p => ({ ...p, plantSource: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1"><option value="">—</option><option value="long_canes">Long canes</option><option value="tray_plants">Tray plants</option><option value="nursery">Szkółka</option></select></div>
                          <div className="flex items-center gap-2 mt-6"><input type="checkbox" checked={editForm.winteredInTunnel || false} onChange={e => setEditForm(p => ({ ...p, winteredInTunnel: e.target.checked }))} className="w-4 h-4" /><label className="text-sm">Zimowane w tunelu</label></div>
                          <div><label className="text-xs font-medium text-gray-500">GDH do kwitnienia</label><input type="number" value={editForm.gdhToFlowering || ''} onChange={e => setEditForm(p => ({ ...p, gdhToFlowering: parseFloat(e.target.value) || undefined }))} className="w-full border rounded-lg px-3 py-2 mt-1" /></div>
                          <div><label className="text-xs font-medium text-gray-500">GDH do owocowania</label><input type="number" value={editForm.gdhToFirstFruit || ''} onChange={e => setEditForm(p => ({ ...p, gdhToFirstFruit: parseFloat(e.target.value) || undefined }))} className="w-full border rounded-lg px-3 py-2 mt-1" /></div>
                        </div>
                        <div><label className="text-xs font-medium text-gray-500">Notatki</label><textarea value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 mt-1" rows={2} /></div>
                        <div className="flex gap-2"><Button onClick={() => saveEdit(t.id)} className="bg-green-600 hover:bg-green-700">Zapisz</Button><Button variant="outline" onClick={() => setEditingId(null)}>Anuluj</Button></div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-3">
                          <div className="bg-white rounded-lg p-3 border text-center"><div className="text-lg font-bold">{t.productionYear}</div><div className="text-xs text-gray-400">Rok danych</div></div>
                          <div className="bg-white rounded-lg p-3 border text-center"><div className="text-lg font-bold">{t.productionCycle}.</div><div className="text-xs text-gray-400">Rok produkcji</div></div>
                          <div className="bg-white rounded-lg p-3 border text-center"><div className="text-lg font-bold text-sm">{t.plantingDate || '—'}</div><div className="text-xs text-gray-400">Data sadzenia</div></div>
                          <div className="bg-white rounded-lg p-3 border text-center"><div className="text-lg font-bold text-sm">{t.startDate || '—'}</div><div className="text-xs text-gray-400">Pierwszy zbiór</div></div>
                          <div className="bg-white rounded-lg p-3 border text-center"><div className="text-lg font-bold">{t.dailyCurve?.length || 0}d</div><div className="text-xs text-gray-400">Dni zbioru</div></div>
                        </div>
                        <div>
                          <h4 className="font-medium text-sm mb-2">📊 Krzywa dzienna</h4>
                          <div className="flex items-end gap-px h-32 bg-white rounded-lg p-2 border">
                            {(t.dailyCurve || []).map((v, i) => (
                              <div key={i} className="flex-1 group relative flex flex-col justify-end" style={{ height: '100%' }}>
                                <div className="rounded-t" style={{ height: `${(v / dailyMax) * 120}px`, minHeight: '1px', background: t.season === 'summer' ? '#fb923c' : '#f87171' }} />
                                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">Dzień {i + 1}: {v.toFixed(1)} kg</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {!hasTemps && !hasGDH && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center text-sm">
                            <span className="text-amber-600">⚠️ Brak danych temperaturowych i GDH</span>
                          </div>
                        )}
                        {t.notes && <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700"><strong>Notatki:</strong> {t.notes}</div>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(t)}><Edit className="w-4 h-4 mr-1" />Edytuj metadane</Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => deleteTemplate(t.id)}><Trash2 className="w-4 h-4 mr-1" />Usuń</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
