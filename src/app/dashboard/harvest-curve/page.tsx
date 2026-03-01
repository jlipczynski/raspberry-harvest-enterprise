'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, FileSpreadsheet, Save, Sun, Leaf, Trash2, BarChart3, Pencil, X, Check } from 'lucide-react'
import * as XLSX from 'xlsx'

// ==================== TYPES ====================
interface Variety { id: string; name: string }
interface Section { id: string; name: string; variety?: Variety; blockName?: string }
interface HarvestCurveRecord {
  id: string; year: number; season: string; curve: number[]; totalKg: number
  startWeek: number; sectionId?: string; varietyId?: string; sourceFile?: string
  importedAt: string; section?: { id: string; name: string }; variety?: { id: string; name: string }
}

interface RawRow { date: string; area: string; weightReal: number }
interface WeekRow { week: number; kg: number; dates: string; season: 'summer' | 'autumn' }
interface DayData { date: string; kg: number; dayOfWeek: number }
interface AreaImport {
  area: string
  totalKg: number
  weeks: WeekRow[]
  days: DayData[]
  assignedSectionIds: string[]
}

type TabType = 'import' | 'history'

// ==================== HELPERS ====================
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
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (typeof value === 'string' && value.includes('.')) {
    const [day, mon, yr] = value.split('.')
    return `${yr}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return String(value)
}

const YEAR_COLORS: Record<number, string> = {
  2022: '#94a3b8', 2023: '#f59e0b', 2024: '#3b82f6', 2025: '#22c55e', 2026: '#ef4444'
}
const getYearColor = (y: number) => YEAR_COLORS[y] || '#8b5cf6'

// ==================== COMPONENT ====================
export default function HarvestCurvePage() {
  const [sections, setSections] = useState<Section[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('import')

  // Import
  const [fileName, setFileName] = useState('')
  const [importYear, setImportYear] = useState(new Date().getFullYear())
  const [areas, setAreas] = useState<AreaImport[]>([])
  const [selectedAreaIdx, setSelectedAreaIdx] = useState(0)
  const [saving, setSaving] = useState(false)

  // History
  const [savedCurves, setSavedCurves] = useState<HarvestCurveRecord[]>([])
  const [filterVariety, setFilterVariety] = useState('')
  const [yAxis, setYAxis] = useState<'kg' | 'percent'>('kg')

  // Edit
  const [editingCurve, setEditingCurve] = useState<HarvestCurveRecord | null>(null)
  const [editForm, setEditForm] = useState({ varietyId: '', sectionId: '', year: 2025, season: 'summer' })

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (activeTab === 'history') fetchCurves() }, [activeTab, filterVariety])

  const fetchAll = async () => {
    try {
      const [pRes, vRes] = await Promise.all([fetch('/api/plantation'), fetch('/api/varieties')])
      const pData = await pRes.json()
      const vData = await vRes.json()
      const allSections: Section[] = []
      pData.blocks?.forEach((b: any) => b.sections?.forEach((s: any) => allSections.push({ ...s, blockName: b.name })))
      setSections(allSections)
      setVarieties(vData.varieties || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchCurves = async () => {
    try {
      const params = new URLSearchParams()
      if (filterVariety) params.set('varietyId', filterVariety)
      const res = await fetch(`/api/harvest-curves?${params}`)
      const data = await res.json()
      setSavedCurves(data.curves || [])
    } catch (e) { console.error(e) }
  }

  // ==================== FILE UPLOAD ====================
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        // Find header row
        let headerIdx = 0
        for (let i = 0; i < Math.min(10, json.length); i++) {
          if (json[i]?.some((c: any) => String(c).toLowerCase().includes('data') || String(c).toLowerCase().includes('date'))) { headerIdx = i; break }
        }
        const headers = json[headerIdx].map((h: any) => String(h || '').toLowerCase())
        const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date'))
        const areaIdx = headers.findIndex(h => h.includes('obszar') || h.includes('area'))
        const weightIdx = headers.findIndex(h => h.includes('waga') && h.includes('rzecz'))

        // Parse rows
        const rows: RawRow[] = []
        for (let i = headerIdx + 1; i < json.length; i++) {
          const row = json[i]; if (!row?.[dateIdx]) continue
          const date = parseExcelDate(row[dateIdx]); if (!date) continue
          const area = String(row[areaIdx] || '')
          if (!area || area === 'Cala plantacja' || area.startsWith('CaBy')) continue
          rows.push({ date, area, weightReal: parseFloat(row[weightIdx]) || 0 })
        }

        // Auto-detect year
        if (rows.length > 0) setImportYear(new Date(rows[0].date).getFullYear())

        // Group by area → weeks
        const areaMap: Record<string, Record<number, number>> = {}
        rows.forEach(r => {
          if (!areaMap[r.area]) areaMap[r.area] = {}
          const wk = getWeekNumber(new Date(r.date))
          areaMap[r.area][wk] = (areaMap[r.area][wk] || 0) + r.weightReal
        })

        const yr = rows.length > 0 ? new Date(rows[0].date).getFullYear() : new Date().getFullYear()
        // Also build daily data per area
        const areaDailyMap: Record<string, Record<string, number>> = {}
        rows.forEach(r => {
          if (!areaDailyMap[r.area]) areaDailyMap[r.area] = {}
          areaDailyMap[r.area][r.date] = (areaDailyMap[r.area][r.date] || 0) + r.weightReal
        })

        const parsed: AreaImport[] = Object.entries(areaMap).map(([area, weekMap]) => {
          const weeks: WeekRow[] = Object.entries(weekMap)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([wk, kg]) => ({ week: Number(wk), kg, dates: getWeekDates(Number(wk), yr), season: 'summer' as const }))
          const days: DayData[] = Object.entries(areaDailyMap[area] || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, kg]) => ({ date, kg, dayOfWeek: new Date(date).getDay() }))
          return { area, totalKg: weeks.reduce((s, w) => s + w.kg, 0), weeks, days, assignedSectionIds: [] }
        }).sort((a, b) => b.totalKg - a.totalKg)

        setAreas(parsed)
        setSelectedAreaIdx(0)
      } catch (err) { console.error(err); alert('Błąd parsowania pliku') }
    }
    reader.readAsArrayBuffer(file)
  }

  // ==================== SEASON TOGGLE ====================
  const toggleWeekSeason = (areaIdx: number, weekIdx: number) => {
    setAreas(prev => prev.map((a, ai) => {
      if (ai !== areaIdx) return a
      const newWeeks = [...a.weeks]
      const clickedWeek = newWeeks[weekIdx]
      const newSeason = clickedWeek.season === 'summer' ? 'autumn' : 'summer'

      // If switching to autumn: set this and all following to autumn
      // If switching to summer: set this and all preceding to summer
      if (newSeason === 'autumn') {
        for (let i = weekIdx; i < newWeeks.length; i++) {
          newWeeks[i] = { ...newWeeks[i], season: 'autumn' }
        }
      } else {
        for (let i = 0; i <= weekIdx; i++) {
          newWeeks[i] = { ...newWeeks[i], season: 'summer' }
        }
      }
      return { ...a, weeks: newWeeks }
    }))
  }

  // ==================== SAVE ====================
  const saveArea = async (areaIdx: number) => {
    const area = areas[areaIdx]
    if (area.assignedSectionIds.length === 0) { alert('Przypisz co najmniej jedną sekcję!'); return }

    const summerWeeks = area.weeks.filter(w => w.season === 'summer')
    const autumnWeeks = area.weeks.filter(w => w.season === 'autumn')
    const curvesToCreate: any[] = []
    const sectionNames: string[] = []

    for (const sectionId of area.assignedSectionIds) {
      const section = sections.find(s => s.id === sectionId)
      if (!section) continue
      sectionNames.push(section.name)

      // Build daily curves from area daily data
      const allDays = area.days.sort((a, b) => a.date.localeCompare(b.date))
      const summerWeekNums = new Set(summerWeeks.map(w => w.week))
      const autumnWeekNums = new Set(autumnWeeks.map(w => w.week))
      const summerDays = allDays.filter(d => summerWeekNums.has(getWeekNumber(new Date(d.date))))
      const autumnDays = allDays.filter(d => autumnWeekNums.has(getWeekNumber(new Date(d.date))))

      if (summerWeeks.length > 0) {
        const summerTotal = summerWeeks.reduce((s, w) => s + w.kg, 0)
        const summerCurve = summerWeeks.map(w => summerTotal > 0 ? Math.round((w.kg / summerTotal) * 1000) / 10 : 0)
        const summerDailyCurve = summerDays.map(d => Math.round(d.kg * 10) / 10)
        curvesToCreate.push({
          year: importYear, season: 'summer', curve: summerCurve, totalKg: summerTotal,
          startWeek: summerWeeks[0].week, sectionId,
          varietyId: section.variety?.id || null, sourceFile: fileName,
          dailyCurve: summerDailyCurve,
          startDate: summerDays[0]?.date || null,
        })
      }
      if (autumnWeeks.length > 0) {
        const autumnTotal = autumnWeeks.reduce((s, w) => s + w.kg, 0)
        const autumnCurve = autumnWeeks.map(w => autumnTotal > 0 ? Math.round((w.kg / autumnTotal) * 1000) / 10 : 0)
        const autumnDailyCurve = autumnDays.map(d => Math.round(d.kg * 10) / 10)
        curvesToCreate.push({
          year: importYear, season: 'autumn', curve: autumnCurve, totalKg: autumnTotal,
          startWeek: autumnWeeks[0].week, sectionId,
          varietyId: section.variety?.id || null, sourceFile: fileName,
          dailyCurve: autumnDailyCurve,
          startDate: autumnDays[0]?.date || null,
        })
      }
    }

    try {
      setSaving(true)
      await fetch('/api/harvest-curves', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curves: curvesToCreate }),
      })

      // Also save to section fields
      for (const sectionId of area.assignedSectionIds) {
        if (summerWeeks.length > 0) {
          const summerTotal = summerWeeks.reduce((s, w) => s + w.kg, 0)
          const curve = summerWeeks.map(w => summerTotal > 0 ? Math.round((w.kg / summerTotal) * 1000) / 10 : 0)
          await fetch(`/api/plantation/section/${sectionId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ harvestCurveSummer: curve }),
          })
        }
        if (autumnWeeks.length > 0) {
          const autumnTotal = autumnWeeks.reduce((s, w) => s + w.kg, 0)
          const curve = autumnWeeks.map(w => autumnTotal > 0 ? Math.round((w.kg / autumnTotal) * 1000) / 10 : 0)
          await fetch(`/api/plantation/section/${sectionId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ harvestCurveAutumn: curve }),
          })
        }
      }

      alert(`✓ Zapisano krzywe dla ${sectionNames.join(', ')} (${importYear})`)
    } catch (e) { console.error(e); alert('Błąd zapisu') }
    finally { setSaving(false) }
  }

  const saveAll = async () => {
    const assigned = areas.filter(a => a.assignedSectionIds.length > 0)
    if (assigned.length === 0) { alert('Przypisz sekcje do co najmniej jednego obszaru!'); return }
    setSaving(true)
    for (let i = 0; i < areas.length; i++) {
      if (areas[i].assignedSectionIds.length > 0) await saveArea(i)
    }
    setSaving(false)
  }

  // ==================== HISTORY ====================
  const deleteCurve = async (id: string) => {
    if (!confirm('Usunąć krzywą?')) return
    await fetch(`/api/harvest-curves/${id}`, { method: 'DELETE' })
    fetchCurves()
  }

  const startEdit = (c: HarvestCurveRecord) => {
    setEditingCurve(c)
    setEditForm({ varietyId: c.varietyId || '', sectionId: c.sectionId || '', year: c.year, season: c.season })
  }

  const saveEdit = async () => {
    if (!editingCurve) return
    await fetch(`/api/harvest-curves/${editingCurve.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditingCurve(null)
    fetchCurves()
  }

  // Group curves: by variety → by season
  const groupCurves = () => {
    const groups: Record<string, { summer: HarvestCurveRecord[]; autumn: HarvestCurveRecord[] }> = {}
    savedCurves.forEach(c => {
      const vName = c.variety?.name || 'Bez odmiany'
      if (!groups[vName]) groups[vName] = { summer: [], autumn: [] }
      if (c.season === 'summer') groups[vName].summer.push(c)
      else groups[vName].autumn.push(c)
    })
    return groups
  }

  const renderChart = (curves: HarvestCurveRecord[]) => {
    if (curves.length === 0) return null
    const byYear: Record<number, HarvestCurveRecord> = {}
    curves.forEach(c => { if (!byYear[c.year]) byYear[c.year] = c })
    const unique = Object.values(byYear)

    const allWeeks = new Set<number>()
    unique.forEach(c => c.curve.forEach((_, i) => allWeeks.add(c.startWeek + i)))
    const sortedWeeks = [...allWeeks].sort((a, b) => a - b)
    if (sortedWeeks.length === 0) return null

    let maxVal: number
    if (yAxis === 'kg') {
      maxVal = Math.max(...unique.flatMap(c => c.curve.map(pct => (pct / 100) * c.totalKg)))
    } else {
      maxVal = Math.max(...unique.flatMap(c => c.curve))
    }
    if (maxVal === 0) maxVal = 1

    return (
      <div>
        <div className="flex flex-wrap gap-3 mb-3">
          {unique.map(c => (
            <div key={c.id} className="flex items-center gap-1 text-sm">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: getYearColor(c.year) }} />
              <span className="font-medium">{c.year}</span>
              <span className="text-gray-400">({(c.totalKg / 1000).toFixed(1)}t)</span>
              {c.section && <span className="text-gray-400 text-xs">• {c.section.name}</span>}
            </div>
          ))}
        </div>
        <div className="relative h-48 border-l border-b border-gray-200 ml-12 mb-2">
          <div className="absolute -left-12 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400 py-1 w-10 text-right">
            <span>{yAxis === 'kg' ? `${(maxVal / 1000).toFixed(1)}t` : `${maxVal.toFixed(0)}%`}</span>
            <span>{yAxis === 'kg' ? `${(maxVal / 2000).toFixed(1)}t` : `${(maxVal / 2).toFixed(0)}%`}</span>
            <span>0</span>
          </div>
          <svg className="w-full h-full" viewBox={`0 0 ${Math.max(sortedWeeks.length, 1) * 10} 100`} preserveAspectRatio="none">
            {unique.map(c => {
              const pts = c.curve.map((pct, i) => {
                const wi = sortedWeeks.indexOf(c.startWeek + i)
                if (wi < 0) return null
                const x = sortedWeeks.length > 1 ? (wi / (sortedWeeks.length - 1)) * sortedWeeks.length * 10 : 5
                const val = yAxis === 'kg' ? (pct / 100) * c.totalKg : pct
                const y = 100 - (val / maxVal) * 90
                return `${x},${y}`
              }).filter(Boolean).join(' ')
              return (
                <g key={c.id}>
                  <polyline points={pts} fill="none" stroke={getYearColor(c.year)} strokeWidth="2.5" strokeLinejoin="round" />
                  {c.curve.map((pct, i) => {
                    const wi = sortedWeeks.indexOf(c.startWeek + i)
                    if (wi < 0) return null
                    const cx = sortedWeeks.length > 1 ? (wi / (sortedWeeks.length - 1)) * sortedWeeks.length * 10 : 5
                    const val = yAxis === 'kg' ? (pct / 100) * c.totalKg : pct
                    const cy = 100 - (val / maxVal) * 90
                    return <circle key={i} cx={cx} cy={cy} r="2" fill={getYearColor(c.year)} />
                  })}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="flex ml-12">{sortedWeeks.map(w => <div key={w} className="flex-1 text-center text-xs text-gray-500">T{w}</div>)}</div>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  const currentArea = areas[selectedAreaIdx]
  const summerWeeks = currentArea?.weeks.filter(w => w.season === 'summer') || []
  const autumnWeeks = currentArea?.weeks.filter(w => w.season === 'autumn') || []
  const summerTotal = summerWeeks.reduce((s, w) => s + w.kg, 0)
  const autumnTotal = autumnWeeks.reduce((s, w) => s + w.kg, 0)
  const assignedCount = areas.filter(a => a.assignedSectionIds.length > 0).length
  const curveGroups = groupCurves()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Krzywe zbioru</h1>
        <p className="text-gray-500">Import danych MaxCrop → przypisz do sekcji → oznacz sezony</p>
      </div>

      {/* TABS */}
      <div className="flex gap-2">
        <Button variant={activeTab === 'import' ? 'default' : 'outline'} onClick={() => setActiveTab('import')} className={activeTab === 'import' ? 'bg-green-600 hover:bg-green-700' : ''}>
          <Upload className="w-4 h-4 mr-2" />Import MaxCrop
        </Button>
        <Button variant={activeTab === 'history' ? 'default' : 'outline'} onClick={() => { setActiveTab('history'); fetchCurves() }} className={activeTab === 'history' ? 'bg-green-600 hover:bg-green-700' : ''}>
          <BarChart3 className="w-4 h-4 mr-2" />Historia krzywych
        </Button>
      </div>

      {/* ==================== IMPORT TAB ==================== */}
      {activeTab === 'import' && (
        <>
          {/* Upload + Year */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600" />Import pliku MaxCrop</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                <Button variant="outline" className="w-full h-16 border-dashed border-2">
                  <div className="flex flex-col items-center"><Upload className="w-5 h-5 mb-1" /><span className="text-sm">{fileName || 'Kliknij lub przeciągnij plik XLS/XLSX'}</span></div>
                </Button>
              </div>
              {areas.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                  <span className="text-sm font-semibold text-amber-800">⚠️ Rok danych:</span>
                  <select className="h-10 text-lg font-bold border-2 border-amber-400 rounded-lg px-3 bg-white" value={importYear} onChange={e => setImportYear(parseInt(e.target.value))}>
                    {[2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className="text-sm text-amber-700">Wykryto {areas.length} obszarów</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Area list - assign sections */}
          {areas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Przypisz obszary do sekcji</span>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={saveAll} disabled={assignedCount === 0 || saving}>
                    <Save className="w-4 h-4 mr-2" />{saving ? 'Zapisuję...' : `Zapisz wszystkie (${assignedCount})`}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {areas.map((area, idx) => (
                    <div
                      key={area.area}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedAreaIdx === idx ? 'bg-green-50 border-green-400' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelectedAreaIdx(idx)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{area.area}</span>
                          <span className="text-sm text-gray-400">{(area.totalKg / 1000).toFixed(1)}t</span>
                          <span className="text-xs text-gray-400">{area.weeks.length} tyg.</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-gray-500">→</span>
                        {area.assignedSectionIds.map(sid => {
                          const sec = sections.find(s => s.id === sid)
                          return sec ? (
                            <span key={sid} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                              {sec.blockName}/{sec.name}
                              <button onClick={() => setAreas(prev => prev.map((a, i) => i === idx ? { ...a, assignedSectionIds: a.assignedSectionIds.filter(id => id !== sid) } : a))} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                            </span>
                          ) : null
                        })}
                        <select
                          className="h-8 border rounded-md px-2 text-xs min-w-40"
                          value=""
                          onChange={e => {
                            const val = e.target.value; if (!val) return
                            setAreas(prev => prev.map((a, i) => i === idx && !a.assignedSectionIds.includes(val) ? { ...a, assignedSectionIds: [...a.assignedSectionIds, val] } : a))
                          }}
                        >
                          <option value="">+ dodaj sekcję</option>
                          {sections.filter(s => !area.assignedSectionIds.includes(s.id)).map(s => (
                            <option key={s.id} value={s.id}>{s.blockName} / {s.name} ({s.variety?.name})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Week table for selected area */}
          {currentArea && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{currentArea.area}</span>
                    <span className="text-sm font-normal text-gray-500">{(currentArea.totalKg / 1000).toFixed(1)}t łącznie</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {summerTotal > 0 && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded">
                        <Sun className="w-4 h-4" /> Lato: {(summerTotal / 1000).toFixed(1)}t ({summerWeeks.length} tyg.)
                      </span>
                    )}
                    {autumnTotal > 0 && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded">
                        <Leaf className="w-4 h-4" /> Jesień: {(autumnTotal / 1000).toFixed(1)}t ({autumnWeeks.length} tyg.)
                      </span>
                    )}
                    {currentArea.assignedSectionIds.length > 0 && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => saveArea(selectedAreaIdx)} disabled={saving}>
                        <Save className="w-4 h-4 mr-1" />Zapisz
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-3">Kliknij na sezon w wierszu, aby oznaczyć od którego tygodnia zaczyna się jesień. Wszystkie kolejne tygodnie automatycznie zmienią się na jesień.</p>

                {/* Bar chart */}
                <div style={{ height: '200px' }} className="flex items-end gap-1 mb-4">
                  {currentArea.weeks.map((w, i) => {
                    const maxKg = Math.max(...currentArea.weeks.map(x => x.kg))
                    const heightPx = maxKg > 0 ? Math.round((w.kg / maxKg) * 180) : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ height: '100%' }}>
                        <div
                          className={`w-full rounded-t transition-colors ${w.season === 'summer' ? 'bg-orange-400' : 'bg-red-400'}`}
                          style={{ height: heightPx + 'px', minHeight: w.kg > 0 ? '4px' : '0' }}
                        />
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                          T{w.week}: {w.kg.toFixed(0)} kg ({w.season === 'summer' ? 'lato' : 'jesień'})
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 mb-4">
                  {currentArea.weeks.map((w, i) => (
                    <div key={i} className="flex-1 text-center text-xs text-gray-500">T{w.week}</div>
                  ))}
                </div>

                {/* Week table with season toggles */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3 w-20">Tydzień</th>
                        <th className="text-left py-2 px-3">Daty</th>
                        <th className="text-right py-2 px-3">kg</th>
                        <th className="text-right py-2 px-3 w-16">%</th>
                        <th className="text-right py-2 px-3 w-16">Σ%</th>
                        <th className="text-center py-2 px-3 w-32">Sezon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentArea.weeks.map((w, i) => {
                        const seasonTotal = w.season === 'summer' ? summerTotal : autumnTotal
                        const pct = seasonTotal > 0 ? (w.kg / seasonTotal) * 100 : 0
                        const isBoundary = i > 0 && currentArea.weeks[i - 1].season !== w.season
                        const sameSeasonWeeks = currentArea.weeks.filter(x => x.season === w.season)
                        const idxInSeason = sameSeasonWeeks.indexOf(w)
                        const cumPct = sameSeasonWeeks.slice(0, idxInSeason + 1).reduce((s, x) => s + (seasonTotal > 0 ? (x.kg / seasonTotal) * 100 : 0), 0)
                        return (
                          <tr key={i} className={`border-b hover:bg-gray-50 ${isBoundary ? 'border-t-4 border-t-gray-300' : ''}`}>
                            <td className="py-2 px-3 font-medium">T{w.week}</td>
                            <td className="py-2 px-3 text-gray-500">{w.dates}</td>
                            <td className="py-2 px-3 text-right font-medium">{w.kg.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={pct > 15 ? 'text-green-600 font-medium' : ''}>{pct.toFixed(1)}%</span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={cumPct >= 99.5 ? 'text-green-700 font-bold' : 'text-gray-500'}>{cumPct.toFixed(1)}%</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => toggleWeekSeason(selectedAreaIdx, i)}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                                  w.season === 'summer'
                                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                }`}
                              >
                                {w.season === 'summer' ? <><Sun className="w-3 h-3" />Lato</> : <><Leaf className="w-3 h-3" />Jesień</>}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === 'history' && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <Label className="text-xs text-gray-500">Odmiana</Label>
                  <select className="h-9 border rounded-md px-3 text-sm ml-1" value={filterVariety} onChange={e => setFilterVariety(e.target.value)}>
                    <option value="">Wszystkie</option>
                    {varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs text-gray-500">Oś Y:</Label>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => setYAxis('kg')} className={`px-3 py-1 text-sm rounded-md ${yAxis === 'kg' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>kg</button>
                    <button onClick={() => setYAxis('percent')} className={`px-3 py-1 text-sm rounded-md ${yAxis === 'percent' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>%</button>
                  </div>
                  <span className="text-sm text-gray-400">{savedCurves.length} krzywych</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit modal */}
          {editingCurve && (
            <Card className="border-blue-300 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-blue-800">✏️ Edycja krzywej</h3>
                  <Button variant="ghost" size="icon" onClick={() => setEditingCurve(null)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label className="text-xs">Rok</Label><select className="w-full h-9 border rounded-md px-3 text-sm" value={editForm.year} onChange={e => setEditForm({ ...editForm, year: parseInt(e.target.value) })}>{[2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                  <div><Label className="text-xs">Sezon</Label><select className="w-full h-9 border rounded-md px-3 text-sm" value={editForm.season} onChange={e => setEditForm({ ...editForm, season: e.target.value })}><option value="summer">☀️ Lato</option><option value="autumn">🍂 Jesień</option></select></div>
                  <div><Label className="text-xs">Odmiana</Label><select className="w-full h-9 border rounded-md px-3 text-sm" value={editForm.varietyId} onChange={e => setEditForm({ ...editForm, varietyId: e.target.value })}><option value="">—</option>{varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                  <div><Label className="text-xs">Sekcja</Label><select className="w-full h-9 border rounded-md px-3 text-sm" value={editForm.sectionId} onChange={e => setEditForm({ ...editForm, sectionId: e.target.value })}><option value="">—</option>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={saveEdit}>Zapisz</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingCurve(null)}>Anuluj</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grouped by variety, split summer/autumn */}
          {Object.entries(curveGroups).map(([varName, { summer, autumn }]) => (
            <div key={varName} className="space-y-4">
              <h2 className="text-lg font-bold">{varName}</h2>

              {summer.length > 0 && (
                <Card className="border-orange-200">
                  <CardHeader className="bg-orange-50 py-3">
                    <CardTitle className="text-base flex items-center gap-2"><Sun className="w-4 h-4 text-orange-500" />Lato ({summer.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    {renderChart(summer)}
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-gray-50"><th className="text-left py-2 px-3">Rok</th><th className="text-left py-2 px-3">Sekcja</th><th className="text-right py-2 px-3">kg</th><th className="text-left py-2 px-3">Start</th><th className="py-2 px-3 text-right">Akcje</th></tr></thead>
                      <tbody>{summer.map(c => (
                        <tr key={c.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: getYearColor(c.year) }} /><span className="font-bold">{c.year}</span></div></td>
                          <td className="py-2 px-3 text-gray-600">{c.section?.name || '—'}</td>
                          <td className="py-2 px-3 text-right font-medium">{(c.totalKg / 1000).toFixed(1)}t</td>
                          <td className="py-2 px-3 text-gray-500">T{c.startWeek}</td>
                          <td className="py-2 px-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => startEdit(c)}><Pencil className="w-4 h-4 text-blue-400" /></Button><Button variant="ghost" size="icon" onClick={() => deleteCurve(c.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button></div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {autumn.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="bg-red-50 py-3">
                    <CardTitle className="text-base flex items-center gap-2"><Leaf className="w-4 h-4 text-red-500" />Jesień ({autumn.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    {renderChart(autumn)}
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-gray-50"><th className="text-left py-2 px-3">Rok</th><th className="text-left py-2 px-3">Sekcja</th><th className="text-right py-2 px-3">kg</th><th className="text-left py-2 px-3">Start</th><th className="py-2 px-3 text-right">Akcje</th></tr></thead>
                      <tbody>{autumn.map(c => (
                        <tr key={c.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: getYearColor(c.year) }} /><span className="font-bold">{c.year}</span></div></td>
                          <td className="py-2 px-3 text-gray-600">{c.section?.name || '—'}</td>
                          <td className="py-2 px-3 text-right font-medium">{(c.totalKg / 1000).toFixed(1)}t</td>
                          <td className="py-2 px-3 text-gray-500">T{c.startWeek}</td>
                          <td className="py-2 px-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => startEdit(c)}><Pencil className="w-4 h-4 text-blue-400" /></Button><Button variant="ghost" size="icon" onClick={() => deleteCurve(c.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button></div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}

          {savedCurves.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Brak zapisanych krzywych. Zaimportuj dane z zakładki "Import MaxCrop".</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
