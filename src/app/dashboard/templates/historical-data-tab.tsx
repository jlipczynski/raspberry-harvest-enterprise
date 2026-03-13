'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, FileSpreadsheet, Save, Sun, Leaf, Trash2, BarChart3, Pencil, X, TrendingUp, Anchor, AlertCircle, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'

// ==================== TYPES ====================
interface Variety { id: string; name: string }
interface Section { id: string; name: string; variety?: Variety; blockName?: string }
interface HarvestCurveRecord {
  id: string; year: number; season: string; curve: number[]; totalKg: number
  startWeek: number; sectionId?: string; varietyId?: string; sourceFile?: string
  importedAt: string; section?: { id: string; name: string }; variety?: { id: string; name: string }
  dailyCurve?: number[]; startDate?: string
}

interface CreateTemplateForm {
  name: string
  varietyId: string
  plantingDate: string
  plantSource: string
  productionYear: number
  winteredInTunnel: boolean
}

interface RawRow { date: string; area: string; weightReal: number }
interface WeekRow { week: number; kg: number; dates: string; season: 'summer' | 'autumn' }
interface DayData { date: string; kg: number; dayOfWeek: number; isPreHarvest: boolean }
interface AreaImport {
  area: string
  totalKg: number
  weeks: WeekRow[]
  days: DayData[]
  assignedSectionIds: string[]
  commercialStartDate: string | null  // data zakotwiczenia — raz ustawione, nie zmieniamy
}

interface ForecastData {
  sectionId: string
  sectionName: string
  varietyName: string
  season: string
  year: number
  estimatedTotalKg: number
  scaledTotalKg: number | null
  originalForecast: { week: number; weekDates: string; kg: number; pct: number }[]
  scaledForecast: { week: number; weekDates: string; kg: number; pct: number }[]
  actual: { week: number; weekDates: string; kg: number; pct: number }[]
  preHarvest: { week: number; weekDates: string; kg: number; pct: number }[]
  commercialStartDate: string | null
  gdhPredictedStartDate: string | null
}

type TabType = 'import' | 'history' | 'forecast'

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

const parseExcelDate = (value: unknown): string => {
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
export default function HistoricalDataTab({ onTemplateCreated }: { onTemplateCreated: () => void }) {
  const [sections, setSections] = useState<Section[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('import')

  // Template creation from selected curves
  const [selectedCurveIds, setSelectedCurveIds] = useState<string[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateTemplateForm>({
    name: '', varietyId: '', plantingDate: '', plantSource: '',
    productionYear: new Date().getFullYear(), winteredInTunnel: false,
  })
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  const toggleCurveSelection = (id: string) => {
    setSelectedCurveIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleCreateTemplate = async () => {
    if (selectedCurveIds.length < 2) return
    const selected = savedCurves.filter(c => selectedCurveIds.includes(c.id))
    if (selected.length === 0) return

    setCreatingTemplate(true)
    try {
      // Merge daily curves from selected sections
      const allDailyMap: Record<string, number> = {}
      for (const curve of selected) {
        if (curve.dailyCurve && curve.startDate) {
          curve.dailyCurve.forEach((kg, i) => {
            const d = new Date(curve.startDate!)
            d.setDate(d.getDate() + i)
            const ds = d.toISOString().split('T')[0]
            allDailyMap[ds] = (allDailyMap[ds] || 0) + kg
          })
        } else {
          // Fallback: use weekly curve percentages to build daily estimates
          const startDate = new Date(selected[0].startDate || `${curve.year}-01-01`)
          curve.curve.forEach((pct, i) => {
            const weekStart = new Date(startDate)
            weekStart.setDate(weekStart.getDate() + i * 7)
            for (let d = 0; d < 7; d++) {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + d)
              const ds = day.toISOString().split('T')[0]
              allDailyMap[ds] = (allDailyMap[ds] || 0) + (pct / 100 * curve.totalKg / 7)
            }
          })
        }
      }
      const sortedDates = Object.keys(allDailyMap).sort()
      const dailyCurve = sortedDates.map(d => Math.round(allDailyMap[d] * 10) / 10)
      const totalKg = dailyCurve.reduce((s, v) => s + v, 0)

      // Build weekly curve
      const weekMap: Record<number, number> = {}
      sortedDates.forEach((date, i) => {
        const wk = getWeekNumber(new Date(date))
        weekMap[wk] = (weekMap[wk] || 0) + dailyCurve[i]
      })
      const weekEntries = Object.entries(weekMap).sort(([a], [b]) => Number(a) - Number(b))
      const weeklyCurve = weekEntries.map(([, kg]) => totalKg > 0 ? Math.round((kg / totalKg) * 1000) / 10 : 0)

      const body = {
        name: createForm.name,
        productionYear: createForm.productionYear,
        productionCycle: 1,
        season: selected[0].season,
        plantingDate: createForm.plantingDate || null,
        winteredInTunnel: createForm.winteredInTunnel,
        plantSource: createForm.plantSource || null,
        varietyId: createForm.varietyId || null,
        dailyCurve,
        weeklyCurve,
        startDate: sortedDates[0] || null,
        endDate: sortedDates[sortedDates.length - 1] || null,
        startWeek: weekEntries.length > 0 ? Number(weekEntries[0][0]) : null,
        totalKg,
        tempSources: [],
        sourceFile: `Utworzono z ${selected.length} krzywych: ${selected.map(c => c.section?.name || c.id).join(', ')}`,
      }

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Nieznany błąd' }))
        throw new Error(errData.error || `Błąd HTTP ${res.status}`)
      }

      setSelectedCurveIds([])
      setShowCreateForm(false)
      setCreateForm({ name: '', varietyId: '', plantingDate: '', plantSource: '', productionYear: new Date().getFullYear(), winteredInTunnel: false })
      onTemplateCreated()
    } catch (e) {
      console.error(e)
      alert('Błąd tworzenia szablonu: ' + e)
    } finally {
      setCreatingTemplate(false)
    }
  }

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

  // Forecast (Prognoza)
  const [forecastSection, setForecastSection] = useState('')
  const [forecastSeason, setForecastSeason] = useState<'summer' | 'autumn'>('summer')
  const [forecastYear, setForecastYear] = useState(new Date().getFullYear())
  const [forecastData, setForecastData] = useState<ForecastData | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)

  const fetchAll = async () => {
    try {
      const [pRes, vRes] = await Promise.all([fetch('/api/plantation'), fetch('/api/varieties')])
      const pData = await pRes.json()
      const vData = await vRes.json()
      const allSections: Section[] = []
      pData.blocks?.forEach((b: { name: string; sections?: Section[] }) => b.sections?.forEach((s: Section) => allSections.push({ ...s, blockName: b.name })))
      setSections(allSections)
      setVarieties(vData.varieties || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchCurves = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterVariety) params.set('varietyId', filterVariety)
      const res = await fetch(`/api/harvest-curves?${params}`)
      const data = await res.json()
      setSavedCurves(data.curves || [])
    } catch (e) { console.error(e) }
  }, [filterVariety])

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (activeTab === 'history') fetchCurves() }, [activeTab, filterVariety, fetchCurves])

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
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

        // Find header row
        let headerIdx = 0
        for (let i = 0; i < Math.min(10, json.length); i++) {
          if (json[i]?.some((c: unknown) => String(c).toLowerCase().includes('data') || String(c).toLowerCase().includes('date'))) { headerIdx = i; break }
        }
        const headers = json[headerIdx].map((h: unknown) => String(h || '').toLowerCase())
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
          rows.push({ date, area, weightReal: parseFloat(String(row[weightIdx])) || 0 })
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
            .map(([date, kg]) => ({ date, kg, dayOfWeek: new Date(date).getDay(), isPreHarvest: false }))
          return { area, totalKg: weeks.reduce((s, w) => s + w.kg, 0), weeks, days, assignedSectionIds: [], commercialStartDate: null }
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
    const curvesToCreate: { year: number; season: string; curve: number[]; totalKg: number; startWeek: number; sectionId: string; varietyId: string | null; sourceFile: string; dailyCurve: number[]; startDate: string | null }[] = []
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

      // Also save to section fields + create Harvest records with pośpiech flag
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

        // Zapisz dzienne dane jako Harvest records z flagą pośpiech
        const harvestRecords = area.days.map(d => {
          const wk = getWeekNumber(new Date(d.date))
          const daySeason = summerWeeks.some(w => w.week === wk) ? 'summer' : 'autumn'
          return {
            date: d.date,
            yieldKg: d.kg,
            season: daySeason,
            isPreHarvest: d.isPreHarvest,
            sectionId,
          }
        })

        if (harvestRecords.length > 0) {
          await fetch('/api/harvests', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ harvests: harvestRecords }),
          })
        }

        // Ustaw HarvestSeason jeśli commercialStartDate jest zakotwiczone
        if (area.commercialStartDate) {
          for (const seasonType of ['summer', 'autumn'] as const) {
            const seasonWeeks = seasonType === 'summer' ? summerWeeks : autumnWeeks
            if (seasonWeeks.length > 0) {
              await fetch('/api/harvest-seasons', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sectionId,
                  year: importYear,
                  season: seasonType,
                  commercialStartDate: area.commercialStartDate,
                }),
              })
            }
          }
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

  // ==================== POŚPIECH / START TOGGLE ====================
  const markCommercialStart = (areaIdx: number, dayIdx: number) => {
    setAreas(prev => prev.map((a, ai) => {
      if (ai !== areaIdx) return a
      if (a.commercialStartDate) return a // Już zakotwiczone

      const newDays = [...a.days]
      // Wszystkie dni przed dayIdx = pośpiech
      for (let i = 0; i < dayIdx; i++) {
        newDays[i] = { ...newDays[i], isPreHarvest: true }
      }
      // Dzień dayIdx i kolejne = komercyjne
      for (let i = dayIdx; i < newDays.length; i++) {
        newDays[i] = { ...newDays[i], isPreHarvest: false }
      }
      return { ...a, days: newDays, commercialStartDate: newDays[dayIdx].date }
    }))
  }

  const resetCommercialStart = (areaIdx: number) => {
    setAreas(prev => prev.map((a, ai) => {
      if (ai !== areaIdx) return a
      const newDays = a.days.map(d => ({ ...d, isPreHarvest: false }))
      return { ...a, days: newDays, commercialStartDate: null }
    }))
  }

  // ==================== FORECAST ====================
  const fetchForecast = async () => {
    if (!forecastSection) return
    setForecastLoading(true)
    try {
      const res = await fetch(`/api/harvest-forecast/${forecastSection}?year=${forecastYear}&season=${forecastSeason}`)
      const data = await res.json()
      setForecastData(data)
    } catch (e) { console.error(e) }
    finally { setForecastLoading(false) }
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
                  <polyline points={pts} fill="none" stroke={getYearColor(c.year)} strokeWidth="1.5" strokeLinejoin="round" />
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
        <Button variant={activeTab === 'forecast' ? 'default' : 'outline'} onClick={() => setActiveTab('forecast')} className={activeTab === 'forecast' ? 'bg-green-600 hover:bg-green-700' : ''}>
          <TrendingUp className="w-4 h-4 mr-2" />Prognoza vs Realne
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
                <p className="text-sm text-gray-500 mb-3">Kliknij na sezon w wierszu, aby oznaczyć od którego tygodnia zaczyna się jesień.</p>

                {/* Pośpiech / Start zbiorów */}
                <div className={`p-4 rounded-lg border mb-4 ${currentArea.commercialStartDate ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Anchor className="w-4 h-4" />
                      <span className="font-semibold text-sm">
                        {currentArea.commercialStartDate
                          ? `Start zbiorów komercyjnych: ${new Date(currentArea.commercialStartDate).toLocaleDateString('pl-PL')}`
                          : 'Oznacz start zbiorów komercyjnych'}
                      </span>
                    </div>
                    {currentArea.commercialStartDate && (
                      <Button size="sm" variant="outline" onClick={() => resetCommercialStart(selectedAreaIdx)}>
                        <X className="w-3 h-3 mr-1" />Resetuj
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-3">
                    {currentArea.commercialStartDate
                      ? 'Dni przed startem oznaczone jako "pośpiech" — nie wchodzą do krzywej komercyjnej.'
                      : 'Kliknij "Start" przy dniu, który uznasz za początek zbiorów komercyjnych. Wcześniejsze dni zostaną oznaczone jako "pośpiech".'}
                  </p>

                  {/* Dzienne dane z togglem */}
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b">
                          <th className="text-left py-1 px-2">Data</th>
                          <th className="text-right py-1 px-2">kg</th>
                          <th className="text-center py-1 px-2 w-32">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentArea.days.slice(0, 30).map((d, di) => (
                          <tr key={d.date} className={`border-b ${d.isPreHarvest ? 'bg-gray-50 text-gray-400' : ''}`}>
                            <td className="py-1 px-2 font-medium">
                              {new Date(d.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </td>
                            <td className="py-1 px-2 text-right">{d.kg.toFixed(1)}</td>
                            <td className="py-1 px-2 text-center">
                              {currentArea.commercialStartDate ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${d.isPreHarvest ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                                  {d.isPreHarvest ? 'Pośpiech' : 'Komercyjny'}
                                </span>
                              ) : (
                                <button
                                  onClick={() => markCommercialStart(selectedAreaIdx, di)}
                                  className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                >
                                  Oznacz jako start
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {currentArea.days.length > 30 && (
                          <tr><td colSpan={3} className="py-2 text-center text-gray-400">... i {currentArea.days.length - 30} więcej dni</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

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
                      <thead><tr className="border-b bg-gray-50"><th className="w-10 py-2 px-3"></th><th className="text-left py-2 px-3">Rok</th><th className="text-left py-2 px-3">Sekcja</th><th className="text-right py-2 px-3">kg</th><th className="text-left py-2 px-3">Start</th><th className="py-2 px-3 text-right">Akcje</th></tr></thead>
                      <tbody>{summer.map(c => (
                        <tr key={c.id} className={`border-b hover:bg-gray-50 ${selectedCurveIds.includes(c.id) ? 'bg-green-50' : ''}`}>
                          <td className="py-2 px-3"><input type="checkbox" checked={selectedCurveIds.includes(c.id)} onChange={() => toggleCurveSelection(c.id)} className="w-4 h-4 accent-green-600" /></td>
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
                      <thead><tr className="border-b bg-gray-50"><th className="w-10 py-2 px-3"></th><th className="text-left py-2 px-3">Rok</th><th className="text-left py-2 px-3">Sekcja</th><th className="text-right py-2 px-3">kg</th><th className="text-left py-2 px-3">Start</th><th className="py-2 px-3 text-right">Akcje</th></tr></thead>
                      <tbody>{autumn.map(c => (
                        <tr key={c.id} className={`border-b hover:bg-gray-50 ${selectedCurveIds.includes(c.id) ? 'bg-green-50' : ''}`}>
                          <td className="py-2 px-3"><input type="checkbox" checked={selectedCurveIds.includes(c.id)} onChange={() => toggleCurveSelection(c.id)} className="w-4 h-4 accent-green-600" /></td>
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

          {/* Create template from selected */}
          {selectedCurveIds.length >= 2 && !showCreateForm && (
            <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center justify-between">
              <span className="text-green-800 font-medium">Zaznaczono {selectedCurveIds.length} krzywych</span>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateForm(true)} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />Utwórz szablon z zaznaczonych
                </Button>
                <Button variant="outline" onClick={() => setSelectedCurveIds([])}>Odznacz wszystkie</Button>
              </div>
            </div>
          )}

          {showCreateForm && (
            <Card className="border-green-300 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Plus className="w-5 h-5 text-green-600" />Utwórz szablon z {selectedCurveIds.length} zaznaczonych krzywych</span>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreateForm(false)}><X className="w-4 h-4" /></Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-medium">Nazwa szablonu</Label>
                    <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="np. Diamond Jubilee - tunele A+B"
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Odmiana</Label>
                    <select value={createForm.varietyId} onChange={e => setCreateForm(p => ({ ...p, varietyId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                      <option value="">— wybierz —</option>
                      {varieties.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Rok produkcji</Label>
                    <select value={createForm.productionYear} onChange={e => setCreateForm(p => ({ ...p, productionYear: parseInt(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                      {[2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Data sadzenia</Label>
                    <input type="date" value={createForm.plantingDate} onChange={e => setCreateForm(p => ({ ...p, plantingDate: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" disabled={createForm.winteredInTunnel} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Typ materiału</Label>
                    <select value={createForm.plantSource} onChange={e => setCreateForm(p => ({ ...p, plantSource: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                      <option value="">— wybierz —</option>
                      <option value="long_canes">Long cane</option>
                      <option value="tray_plants">Zimowane</option>
                      <option value="nursery">Szkółka</option>
                      <option value="plug">Plug</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input type="checkbox" checked={createForm.winteredInTunnel}
                      onChange={e => setCreateForm(p => ({ ...p, winteredInTunnel: e.target.checked, ...(e.target.checked ? { plantingDate: '' } : {}) }))}
                      className="w-4 h-4" />
                    <Label className="text-sm">Zimowane w tunelu</Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateTemplate} disabled={!createForm.name || creatingTemplate} className="bg-green-600 hover:bg-green-700">
                    <Save className="w-4 h-4 mr-2" />{creatingTemplate ? 'Tworzę...' : 'Zapisz szablon'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>Anuluj</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {savedCurves.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Brak zapisanych krzywych. Zaimportuj dane z zakładki &quot;Import MaxCrop&quot;.</p>
            </div>
          )}
        </>
      )}

      {/* ==================== FORECAST TAB ==================== */}
      {activeTab === 'forecast' && (
        <>
          {/* Filtry */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <Label className="text-xs text-gray-500">Sekcja</Label>
                  <select className="h-9 border rounded-md px-3 text-sm ml-1" value={forecastSection} onChange={e => setForecastSection(e.target.value)}>
                    <option value="">-- Wybierz sekcję --</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.blockName} / {s.name} ({s.variety?.name})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Sezon</Label>
                  <select className="h-9 border rounded-md px-3 text-sm ml-1" value={forecastSeason} onChange={e => setForecastSeason(e.target.value as 'summer' | 'autumn')}>
                    <option value="summer">Lato</option>
                    <option value="autumn">Jesień</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Rok</Label>
                  <select className="h-9 border rounded-md px-3 text-sm ml-1" value={forecastYear} onChange={e => setForecastYear(parseInt(e.target.value))}>
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <Button className="bg-green-600 hover:bg-green-700 ml-auto" onClick={fetchForecast} disabled={!forecastSection || forecastLoading}>
                  <TrendingUp className="w-4 h-4 mr-2" />{forecastLoading ? 'Ładowanie...' : 'Pokaż prognozę'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Wyniki prognozy */}
          {forecastData && (
            <>
              {/* Podsumowanie */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl p-4 border text-center">
                  <p className="text-xs text-gray-500">Sekcja</p>
                  <p className="text-lg font-bold">{forecastData.sectionName}</p>
                  <p className="text-xs text-gray-400">{forecastData.varietyName}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                  <p className="text-xs text-blue-600">Prognoza GDH</p>
                  <p className="text-2xl font-bold text-blue-700">{(forecastData.estimatedTotalKg / 1000).toFixed(1)}t</p>
                  <p className="text-xs text-blue-400">{forecastData.gdhPredictedStartDate ? `Start: ${new Date(forecastData.gdhPredictedStartDate).toLocaleDateString('pl-PL')}` : 'Brak daty GDH'}</p>
                </div>
                {forecastData.scaledTotalKg !== null && (
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center">
                    <p className="text-xs text-purple-600">Prognoza skalowana</p>
                    <p className="text-2xl font-bold text-purple-700">{(forecastData.scaledTotalKg / 1000).toFixed(1)}t</p>
                    <p className="text-xs text-purple-400">
                      {forecastData.scaledTotalKg > forecastData.estimatedTotalKg ? '+' : ''}
                      {(((forecastData.scaledTotalKg - forecastData.estimatedTotalKg) / forecastData.estimatedTotalKg) * 100).toFixed(0)}% vs prognoza
                    </p>
                  </div>
                )}
                <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                  <p className="text-xs text-green-600">Zebrano (komercyjne)</p>
                  <p className="text-2xl font-bold text-green-700">{(forecastData.actual.reduce((s, w) => s + w.kg, 0) / 1000).toFixed(1)}t</p>
                  <p className="text-xs text-green-400">{forecastData.actual.length} tygodni danych</p>
                </div>
                {forecastData.commercialStartDate && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-center">
                    <p className="text-xs text-amber-600">Zakotwiczenie</p>
                    <p className="text-lg font-bold text-amber-700">{new Date(forecastData.commercialStartDate).toLocaleDateString('pl-PL')}</p>
                    <p className="text-xs text-amber-400">Pośpiech: {(forecastData.preHarvest.reduce((s, w) => s + w.kg, 0)).toFixed(0)} kg</p>
                  </div>
                )}
              </div>

              {/* 3-warstwowy wykres */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    Krzywa zbiorów — 3 warstwy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Legenda */}
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-1 rounded" style={{ backgroundColor: '#93c5fd' }} />
                      <span className="text-gray-600">Oryginalna prognoza (GDH)</span>
                    </div>
                    {forecastData.scaledForecast.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-8 h-1 rounded" style={{ backgroundColor: '#c084fc' }} />
                        <span className="text-gray-600">Auto-skalowana prognoza</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }} />
                      <span className="text-gray-600">Realne dane (komercyjne)</span>
                    </div>
                    {forecastData.preHarvest.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d1d5db' }} />
                        <span className="text-gray-600">Pośpiech (przed startem)</span>
                      </div>
                    )}
                  </div>

                  {(() => {
                    // Zbierz wszystkie tygodnie
                    const allWeeks = new Set<number>()
                    forecastData.originalForecast.forEach(w => allWeeks.add(w.week))
                    forecastData.scaledForecast.forEach(w => allWeeks.add(w.week))
                    forecastData.actual.forEach(w => allWeeks.add(w.week))
                    forecastData.preHarvest.forEach(w => allWeeks.add(w.week))
                    const sortedWeeks = [...allWeeks].sort((a, b) => a - b)
                    if (sortedWeeks.length === 0) return <p className="text-gray-400 text-center py-8">Brak danych do wyświetlenia</p>

                    const maxKg = Math.max(
                      ...forecastData.originalForecast.map(w => w.kg),
                      ...forecastData.scaledForecast.map(w => w.kg),
                      ...forecastData.actual.map(w => w.kg),
                      ...forecastData.preHarvest.map(w => w.kg),
                      1
                    )

                    const getX = (week: number) => {
                      const idx = sortedWeeks.indexOf(week)
                      return sortedWeeks.length > 1 ? (idx / (sortedWeeks.length - 1)) * 100 : 50
                    }
                    const getY = (kg: number) => 100 - (kg / maxKg) * 85

                    const makeLine = (data: { week: number; kg: number }[]) => {
                      return data.map(d => `${getX(d.week)},${getY(d.kg)}`).join(' ')
                    }

                    return (
                      <div>
                        <div className="relative h-64 border-l border-b border-gray-200 ml-12 mb-2">
                          {/* Oś Y */}
                          <div className="absolute -left-12 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400 py-1 w-10 text-right">
                            <span>{(maxKg / 1000).toFixed(1)}t</span>
                            <span>{(maxKg / 2000).toFixed(1)}t</span>
                            <span>0</span>
                          </div>

                          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {/* Oryginalna prognoza — linia przerywana */}
                            <polyline
                              points={makeLine(forecastData.originalForecast)}
                              fill="none"
                              stroke="#93c5fd"
                              strokeWidth="1.5"
                              strokeDasharray="4 2"
                              strokeLinejoin="round"
                            />

                            {/* Skalowana prognoza — linia ciągła */}
                            {forecastData.scaledForecast.length > 0 && (
                              <polyline
                                points={makeLine(forecastData.scaledForecast)}
                                fill="none"
                                stroke="#c084fc"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                              />
                            )}

                            {/* Pośpiech — szare słupki */}
                            {forecastData.preHarvest.map(w => {
                              const x = getX(w.week)
                              const y = getY(w.kg)
                              const barWidth = sortedWeeks.length > 1 ? 80 / sortedWeeks.length : 20
                              return (
                                <rect
                                  key={`pre-${w.week}`}
                                  x={x - barWidth / 2}
                                  y={y}
                                  width={barWidth}
                                  height={100 - y}
                                  fill="#d1d5db"
                                  opacity="0.6"
                                  rx="1"
                                />
                              )
                            })}

                            {/* Realne dane — zielone słupki */}
                            {forecastData.actual.map(w => {
                              const x = getX(w.week)
                              const y = getY(w.kg)
                              const barWidth = sortedWeeks.length > 1 ? 80 / sortedWeeks.length : 20
                              return (
                                <rect
                                  key={`act-${w.week}`}
                                  x={x - barWidth / 2}
                                  y={y}
                                  width={barWidth}
                                  height={100 - y}
                                  fill="#22c55e"
                                  opacity="0.7"
                                  rx="1"
                                />
                              )
                            })}

                          </svg>
                        </div>

                        {/* Oś X */}
                        <div className="flex ml-12">
                          {sortedWeeks.map(w => (
                            <div key={w} className="flex-1 text-center text-xs text-gray-500">T{w}</div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Tabela szczegółowa */}
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3">Tydzień</th>
                          <th className="text-right py-2 px-3 text-blue-600">Prognoza GDH</th>
                          {forecastData.scaledForecast.length > 0 && (
                            <th className="text-right py-2 px-3 text-purple-600">Skalowana</th>
                          )}
                          <th className="text-right py-2 px-3 text-green-600">Realne</th>
                          <th className="text-right py-2 px-3">Odchylenie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const allWeeks = new Set<number>()
                          forecastData.originalForecast.forEach(w => allWeeks.add(w.week))
                          forecastData.scaledForecast.forEach(w => allWeeks.add(w.week))
                          forecastData.actual.forEach(w => allWeeks.add(w.week))
                          return [...allWeeks].sort((a, b) => a - b).map(week => {
                            const orig = forecastData.originalForecast.find(w => w.week === week)
                            const scaled = forecastData.scaledForecast.find(w => w.week === week)
                            const actual = forecastData.actual.find(w => w.week === week)
                            const ref = scaled || orig
                            const deviation = ref && actual ? ((actual.kg - ref.kg) / ref.kg * 100) : null

                            return (
                              <tr key={week} className="border-b hover:bg-gray-50">
                                <td className="py-2 px-3 font-medium">T{week}</td>
                                <td className="py-2 px-3 text-right text-blue-600">{orig ? `${(orig.kg / 1000).toFixed(2)}t` : '—'}</td>
                                {forecastData.scaledForecast.length > 0 && (
                                  <td className="py-2 px-3 text-right text-purple-600">{scaled ? `${(scaled.kg / 1000).toFixed(2)}t` : '—'}</td>
                                )}
                                <td className="py-2 px-3 text-right text-green-600 font-medium">{actual ? `${(actual.kg / 1000).toFixed(2)}t` : '—'}</td>
                                <td className="py-2 px-3 text-right">
                                  {deviation !== null ? (
                                    <span className={deviation > 0 ? 'text-green-600' : 'text-red-600'}>
                                      {deviation > 0 ? '+' : ''}{deviation.toFixed(0)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Info o pośpiechu */}
              {forecastData.preHarvest.length > 0 && (
                <Card className="border-gray-200">
                  <CardHeader className="py-3 bg-gray-50">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-500" />
                      Dane pośpiechowe (nie wchodzą do krzywej komercyjnej)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="flex gap-4 text-sm">
                      <span className="text-gray-600">Łącznie: <strong>{forecastData.preHarvest.reduce((s, w) => s + w.kg, 0).toFixed(0)} kg</strong></span>
                      <span className="text-gray-600">Tygodnie: <strong>{forecastData.preHarvest.map(w => `T${w.week}`).join(', ')}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!forecastData && !forecastLoading && (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Wybierz sekcję i kliknij &quot;Pokaż prognozę&quot; aby zobaczyć 3-warstwowy wykres.</p>
              <p className="text-gray-400 text-sm mt-2">Oryginalna prognoza (GDH) + Auto-skalowana + Realne dane</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
