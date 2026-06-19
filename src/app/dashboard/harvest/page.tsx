'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Target, Upload, Loader2, TrendingUp, AlertTriangle, Package, Sun, CloudRain, Tv, ArrowUpRight, ArrowDownRight, Minus, FileDown } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, Line, ComposedChart, ReferenceLine, Cell,
} from 'recharts'

interface HarvestEntry {
  id: string
  date: string
  areaName: string
  productClass: string
  weightKg: number
  quantity: number | null
  blockId: string | null
  block: { id: string; name: string } | null
  sourceFile: string | null
}

interface BlockPlan {
  blockId: string
  blockName: string
  plannedKg: number
  plannedSummerKg: number
  plannedAutumnKg: number
}

interface BlockSummary {
  blockName: string
  harvestedKg: number
  plannedKg: number
  plannedSummerKg: number
  plannedAutumnKg: number
  percentage: number
  remainingKg: number
  dailyData: Array<{ date: string; kg: number; cumulative: number }>
}

interface WeekRow {
  weekStart: string
  weekLabel: string
  forecastKg: number
  calibratedKg: number
  actualKg: number
  diffKg: number
  diffPct: number
  isPast: boolean
  isCurrent: boolean
}

interface WeeklyBlockForecast {
  blockName: string
  weeks: WeekRow[]
  totalPlannedKg: number
  totalHarvestedKg: number
  calibrationFactor: number
}

interface DailyPlanPoint {
  date: string
  planKg: number
  actualKg: number
  cumPlan: number
  cumActual: number
}

interface DailyForecastBlock {
  blockName: string
  days: Array<{
    date: string
    blockName: string
    predictedKg: number
    actualKg: number
    gdhDaily: number
    isPast: boolean
  }>
  totalPredicted7d: number
}

interface PredictionHistory {
  date: string
  blockName: string
  predictedKg: number
  actualKg: number | null
  ratio: number | null
  gdhDaily: number | null
}

const BLOCK_COLORS: Record<string, string> = {
  'Blok A': '#3b82f6',
  'Blok B': '#ef4444',
  'Blok C': '#f59e0b',
  'Blok D': '#10b981',
}

function getBlockColor(name: string): string {
  return BLOCK_COLORS[name] || '#6b7280'
}

function buildForecastRows(
  forecasts: DailyForecastBlock[],
  temps: Array<{ date: string; avgTunnelTemp: number }>,
  daysCount?: number,
) {
  const blockNames = forecasts.map(b => b.blockName).sort()
  const allDays = forecasts[0]?.days || []
  const days = daysCount ? allDays.slice(0, daysCount) : allDays
  const todayStr = new Date().toISOString().slice(0, 10)

  const rows = days.map(day => {
    const dt = new Date(day.date + 'T12:00:00')
    const dow = dt.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
    const dowLong = dt.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
    const total = forecasts.reduce((s, b) => s + (b.days.find(d => d.date === day.date)?.predictedKg || 0), 0)
    const temp = temps.find(t => t.date === day.date)?.avgTunnelTemp
    const blocks: Record<string, number> = {}
    for (const b of forecasts) blocks[b.blockName] = b.days.find(d => d.date === day.date)?.predictedKg || 0
    return { date: day.date, dow, dowLong, total, gdh: day.gdhDaily, temp, blocks, isToday: day.date === todayStr }
  })

  const totalAll = rows.reduce((s, d) => s + d.total, 0)
  return { blockNames, rows, totalAll }
}

function openForecastReport(
  forecasts: DailyForecastBlock[],
  temps: Array<{ date: string; avgTunnelTemp: number }>,
  daysCount: number = 7,
) {
  const { blockNames, rows, totalAll } = buildForecastRows(forecasts, temps, daysCount)
  const reportDate = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  const maxTotal = Math.max(...rows.map(d => d.total))

  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8">
<title>Prognoza zbiorów malin — ${reportDate}</title>
<style>
@page{size:A4 portrait;margin:12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#1e293b;padding:0;width:170mm;margin:0 auto}
.print-bar{text-align:center;padding:16px 0}
.print-bar button{background:#15803d;color:#fff;border:none;padding:10px 32px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.print-bar button:hover{background:#166534}
.header{text-align:center;padding:18px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:10px;border:1px solid #bbf7d0;margin-bottom:14px}
.header h1{font-size:18px;font-weight:800;color:#14532d}
.header .sub{font-size:11px;color:#16a34a;margin-top:1px}
.header .big{font-size:52px;font-weight:900;color:#15803d;margin:8px 0 0;letter-spacing:-2px;line-height:1}
.header .big span{font-size:18px;font-weight:500;color:#6b7280;letter-spacing:0}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#f8fafc;color:#64748b;font-weight:600;padding:6px 8px;text-align:right;border-bottom:2px solid #e2e8f0}
th:first-child{text-align:left}
td{padding:6px 8px;text-align:right;border-bottom:1px solid #f1f5f9}
td:first-child{text-align:left;font-weight:500;color:#374151}
tr.today td{background:#f0fdf4;font-weight:600}
tr.total td{border-top:2px solid #16a34a;font-weight:800;font-size:13px;background:#f0fdf4;color:#15803d}
tr.total td:first-child{color:#14532d}
.bar-cell{width:120px}
.bar-bg{height:14px;background:#f1f5f9;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#4ade80,#16a34a)}
.badge{background:#22c55e;color:#fff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px;vertical-align:middle}
.footer{text-align:center;margin-top:10px;color:#cbd5e1;font-size:9px}
@media print{.print-bar{display:none}}
</style></head><body>
<div class="print-bar"><button onclick="window.print()">Zapisz jako PDF / Drukuj</button></div>
<div class="header">
<h1>PROGNOZA ZBIORÓW MALIN</h1>
<div class="sub">Raport z ${reportDate}</div>
<div class="big">${Math.round(totalAll).toLocaleString('pl-PL')} <span>kg / ${daysCount} dni</span></div>
</div>
<table>
<thead><tr><th>Dzień</th>${blockNames.map(n => `<th>${n}</th>`).join('')}<th>Razem</th><th>Temp</th><th>GDH</th><th class="bar-cell"></th></tr></thead>
<tbody>
${rows.map(day => {
    const barW = Math.max(6, Math.round((day.total / maxTotal) * 100))
    return `<tr class="${day.isToday ? 'today' : ''}">
<td>${day.dowLong}${day.isToday ? '<span class="badge">dziś</span>' : ''}</td>
${blockNames.map(n => `<td>${(day.blocks[n] || 0).toFixed(1)}</td>`).join('')}
<td style="font-weight:800;font-size:14px">${Math.round(day.total)}</td>
<td style="color:#d97706">${day.temp != null ? day.temp.toFixed(1) + '°' : '—'}</td>
<td style="color:#2563eb">${Math.round(day.gdh)}</td>
<td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${barW}%"></div></div></td></tr>`
  }).join('\n')}
<tr class="total"><td>RAZEM ${daysCount} DNI</td>${blockNames.map(n => {
    const sum = rows.reduce((s, d) => s + (d.blocks[n] || 0), 0)
    return `<td>${Math.round(sum)}</td>`
  }).join('')}<td style="font-size:16px">${Math.round(totalAll).toLocaleString('pl-PL')} kg</td><td></td><td></td><td></td></tr>
</tbody></table>
<div class="footer">Raspberry Harvest Enterprise — prognoza GDH × krzywe zbiorów</div>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

async function downloadForecastExcel(
  forecasts: DailyForecastBlock[],
  temps: Array<{ date: string; avgTunnelTemp: number }>,
  daysCount: number = 7,
) {
  const XLSX = await import('xlsx')
  const { blockNames, rows, totalAll } = buildForecastRows(forecasts, temps, daysCount)

  const header = ['Data', 'Dzień', ...blockNames, 'RAZEM (kg)', 'Temp °C', 'GDH']
  const data = rows.map(day => [
    day.date,
    day.dowLong,
    ...blockNames.map(n => Math.round((day.blocks[n] || 0) * 10) / 10),
    Math.round(day.total * 10) / 10,
    day.temp != null ? Math.round(day.temp * 10) / 10 : '',
    Math.round(day.gdh),
  ])
  const totalRow = [
    '', `RAZEM ${daysCount} DNI`,
    ...blockNames.map(n => Math.round(rows.reduce((s, d) => s + (d.blocks[n] || 0), 0) * 10) / 10),
    Math.round(totalAll * 10) / 10, '', '',
  ]
  data.push(totalRow)

  const ws = XLSX.utils.aoa_to_sheet([header, ...data])

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 28 },
    ...blockNames.map(() => ({ wch: 10 })),
    { wch: 12 }, { wch: 8 }, { wch: 6 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Prognoza ${daysCount} dni`)
  XLSX.writeFile(wb, `prognoza-zbiorow-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function HarvestPage() {
  const [entries, setEntries] = useState<HarvestEntry[]>([])
  const [blockPlans, setBlockPlans] = useState<BlockPlan[]>([])
  const [weeklyForecasts, setWeeklyForecasts] = useState<WeeklyBlockForecast[]>([])
  const [dailyPlanVsActual, setDailyPlanVsActual] = useState<DailyPlanPoint[]>([])
  const [totalPlannedFromApi, setTotalPlannedFromApi] = useState(0)
  const [dailyForecasts, setDailyForecasts] = useState<DailyForecastBlock[]>([])
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistory[]>([])
  const [forecastTemps, setForecastTemps] = useState<Array<{ date: string; avgTunnelTemp: number }>>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [harvestRes, planRes, weeklyRes, dailyRes] = await Promise.all([
        fetch('/api/plantation/harvest'),
        fetch('/api/plantation/harvest/plan'),
        fetch('/api/harvest-forecast/weekly'),
        fetch('/api/harvest-forecast/daily?days=14'),
      ])

      if (harvestRes.ok) {
        const data = await harvestRes.json()
        setEntries(data.entries || [])
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setBlockPlans(data.blocks || [])
      }
      if (weeklyRes.ok) {
        const data = await weeklyRes.json()
        setWeeklyForecasts(data.blocks || [])
        setDailyPlanVsActual(data.dailyPlanVsActual || [])
        setTotalPlannedFromApi(data.totalPlannedKg || 0)
      }
      if (dailyRes.ok) {
        const data = await dailyRes.json()
        setDailyForecasts(data.blocks || [])
        setPredictionHistory(data.history || [])
        setForecastTemps(data.forecastTemps || [])
      }
    } catch (e) {
      console.error('Error fetching harvest data:', e)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/plantation/harvest', { method: 'POST', body: fd })
      const data = await res.json()

      if (res.ok && data.success) {
        const msg = `Zaimportowano ${data.totalRows} wierszy (${data.dateRange?.from} — ${data.dateRange?.to})${data.unmapped > 0 ? `. ${data.unmapped} niezmapowanych: ${data.unmappedAreas?.join(', ')}` : ''}`
        setUploadResult(msg)
        fetchData()
      } else {
        setUploadResult(`Błąd: ${data.error}`)
      }
    } catch {
      setUploadResult('Błąd połączenia')
    }

    setUploading(false)
    e.target.value = ''
  }

  // Build block summaries
  const blockSummaries: BlockSummary[] = useMemo(() => {
    const blockGroups = new Map<string, { kg: number; daily: Map<string, number> }>()

    for (const entry of entries) {
      const name = entry.block?.name || entry.areaName
      if (!blockGroups.has(name)) {
        blockGroups.set(name, { kg: 0, daily: new Map() })
      }
      const group = blockGroups.get(name)!
      group.kg += entry.weightKg
      const dateKey = entry.date.slice(0, 10)
      group.daily.set(dateKey, (group.daily.get(dateKey) || 0) + entry.weightKg)
    }

    const planMap = new Map<string, { total: number; summer: number; autumn: number }>()
    for (const bp of blockPlans) {
      const existing = planMap.get(bp.blockName) || { total: 0, summer: 0, autumn: 0 }
      existing.total += bp.plannedKg
      existing.summer += bp.plannedSummerKg || 0
      existing.autumn += bp.plannedAutumnKg || 0
      planMap.set(bp.blockName, existing)
    }

    const summaries: BlockSummary[] = []
    const allBlockNames = new Set([...blockGroups.keys(), ...planMap.keys()])

    for (const name of allBlockNames) {
      const group = blockGroups.get(name)
      const harvestedKg = group?.kg || 0
      const plan = planMap.get(name) || { total: 0, summer: 0, autumn: 0 }
      const plannedKg = plan.total

      const dailyData: Array<{ date: string; kg: number; cumulative: number }> = []
      if (group) {
        const sortedDays = Array.from(group.daily.entries()).sort(([a], [b]) => a.localeCompare(b))
        let cumulative = 0
        for (const [date, kg] of sortedDays) {
          cumulative += kg
          dailyData.push({ date, kg: Math.round(kg * 100) / 100, cumulative: Math.round(cumulative * 100) / 100 })
        }
      }

      summaries.push({
        blockName: name,
        harvestedKg: Math.round(harvestedKg * 100) / 100,
        plannedKg: Math.round(plannedKg * 100) / 100,
        plannedSummerKg: Math.round(plan.summer * 100) / 100,
        plannedAutumnKg: Math.round(plan.autumn * 100) / 100,
        percentage: plannedKg > 0 ? Math.round((harvestedKg / plannedKg) * 1000) / 10 : 0,
        remainingKg: Math.round(Math.max(0, plannedKg - harvestedKg) * 100) / 100,
        dailyData,
      })
    }

    return summaries.sort((a, b) => a.blockName.localeCompare(b.blockName))
  }, [entries, blockPlans])

  const totalHarvested = blockSummaries.reduce((s, b) => s + b.harvestedKg, 0)
  const totalPlanned = blockSummaries.reduce((s, b) => s + b.plannedKg, 0)
  const totalPlannedSummer = blockSummaries.reduce((s, b) => s + b.plannedSummerKg, 0)
  const totalPlannedAutumn = blockSummaries.reduce((s, b) => s + b.plannedAutumnKg, 0)
  const totalPercentage = totalPlanned > 0 ? Math.round((totalHarvested / totalPlanned) * 1000) / 10 : 0
  const totalRemaining = Math.max(0, totalPlanned - totalHarvested)

  // Build chart data: daily stacked bars per block
  const dailyChartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>()

    for (const entry of entries) {
      const name = entry.block?.name || entry.areaName
      const dateKey = entry.date.slice(0, 10)
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, {})
      const day = dateMap.get(dateKey)!
      day[name] = (day[name] || 0) + entry.weightKg
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, blocks]) => ({
        date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        dateRaw: date,
        ...Object.fromEntries(
          Object.entries(blocks).map(([k, v]) => [k, Math.round(v * 10) / 10])
        ),
      }))
  }, [entries])

  // Cumulative plan vs actual chart data from API
  // Season range: June 1 → November 30
  const cumulativeChartData = useMemo(() => {
    const year = new Date().getFullYear()
    const seasonStart = `${year}-06-01`
    const seasonEnd = `${year}-11-30`
    const today = new Date().toISOString().slice(0, 10)

    // If API returned dailyPlanVsActual, use it (has both plan and actual)
    if (dailyPlanVsActual.length > 0) {
      return dailyPlanVsActual
        .filter(d => d.date >= seasonStart && d.date <= seasonEnd)
        .filter(d => d.cumPlan > 0 || d.cumActual > 0)
        .map(d => ({
          date: new Date(d.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
          dateRaw: d.date,
          plan: Math.round(d.cumPlan),
          actual: d.date <= today ? Math.round(d.cumActual) : null,
        }))
    }

    // Fallback: build from entries only (no plan line)
    if (entries.length > 0) {
      const dateMap = new Map<string, number>()
      for (const entry of entries) {
        const dateKey = entry.date.slice(0, 10)
        if (dateKey >= seasonStart && dateKey <= seasonEnd) {
          dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + entry.weightKg)
        }
      }
      const sorted = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      let runningTotal = 0
      return sorted.map(([date, kg]) => {
        runningTotal += kg
        return {
          date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
          dateRaw: date,
          plan: null as number | null,
          actual: Math.round(runningTotal),
        }
      })
    }

    return []
  }, [dailyPlanVsActual, entries])

  // Trend analysis — based on chart data (season-filtered)
  const trendInfo = useMemo(() => {
    if (cumulativeChartData.length === 0) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayPoint = cumulativeChartData.filter(d => d.dateRaw <= today).pop()
    if (!todayPoint || !todayPoint.plan || todayPoint.plan === 0) return null

    const cumPlan = todayPoint.plan
    const cumActual = todayPoint.actual ?? 0
    const deviation = cumActual - cumPlan
    const deviationPct = Math.round((deviation / cumPlan) * 1000) / 10
    const status: 'ahead' | 'behind' | 'on-track' =
      deviationPct > 10 ? 'ahead' : deviationPct < -10 ? 'behind' : 'on-track'

    return { deviation: Math.round(deviation), deviationPct, status, cumPlan: Math.round(cumPlan), cumActual: Math.round(cumActual) }
  }, [cumulativeChartData])

  // Unique block names for chart bars
  const blockNames = useMemo(() => {
    const names = new Set<string>()
    for (const entry of entries) {
      names.add(entry.block?.name || entry.areaName)
    }
    return Array.from(names).sort()
  }, [entries])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zbiory</h1>
          <p className="text-gray-500">Realizacja zbiorów vs plan — sezon {new Date().getFullYear()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/harvest/tv">
            <Button variant="outline" size="sm">
              <Tv className="w-4 h-4 mr-1" />
              Widok TV
            </Button>
          </Link>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button asChild variant="outline" size="sm" disabled={uploading}>
              <span>
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Importowanie...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-1" />Import z MaxCrop (XLS)</>
                )}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {uploadResult && (
        <div className={`p-3 rounded-lg text-sm ${uploadResult.startsWith('Błąd') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {uploadResult}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
              <Package className="w-4 h-4" />
              Zebrano
            </div>
            <div className="text-3xl font-bold text-green-800">
              {totalHarvested.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
              <span className="text-lg ml-1">kg</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Cel sezonu</div>
            <div className="text-3xl font-bold text-gray-700">
              {totalPlanned.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
              <span className="text-lg ml-1">kg</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Pozostało do celu</div>
            <div className="text-3xl font-bold text-amber-600">
              {totalRemaining.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
              <span className="text-lg ml-1">kg</span>
            </div>
          </CardContent>
        </Card>
        <Card className={totalPercentage >= 100 ? 'bg-gradient-to-br from-green-50 to-emerald-100 border-green-200' : ''}>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Realizacja</div>
            <div className={`text-3xl font-bold ${totalPercentage >= 100 ? 'text-green-700' : 'text-blue-700'}`}>
              {totalPercentage}%
            </div>
            <div className="mt-2 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${totalPercentage >= 100 ? 'bg-green-500' : totalPercentage >= 50 ? 'bg-blue-500' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(totalPercentage, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7-day daily prediction */}
      {dailyForecasts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                Prognoza dzienna — najbliższe 7 dni
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                predykcja na podstawie GDH z prognozy pogody × krzywa odmiany
              </p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openForecastReport(dailyForecasts, forecastTemps, 7)}>
                <FileDown className="w-3.5 h-3.5 mr-1" />7 dni PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadForecastExcel(dailyForecasts, forecastTemps, 7)}>
                <FileDown className="w-3.5 h-3.5 mr-1" />7 dni Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => openForecastReport(dailyForecasts, forecastTemps, 14)}>
                <FileDown className="w-3.5 h-3.5 mr-1" />14 dni PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadForecastExcel(dailyForecasts, forecastTemps, 14)}>
                <FileDown className="w-3.5 h-3.5 mr-1" />14 dni Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500 text-xs">
                    <th className="py-2 px-2">Data</th>
                    {dailyForecasts.map(b => (
                      <th key={b.blockName} className="py-2 px-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getBlockColor(b.blockName) }} />
                          {b.blockName}
                        </span>
                      </th>
                    ))}
                    <th className="py-2 px-2 text-right font-semibold">Razem</th>
                    <th className="py-2 px-2 text-right text-gray-400">Temp °C</th>
                    <th className="py-2 px-2 text-right text-gray-400">GDH</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyForecasts[0]?.days.slice(0, 7).map((day, dayIdx) => {
                    const dayTotal = dailyForecasts.reduce((s, b) => s + b.days[dayIdx].predictedKg, 0)
                    const actualTotal = dailyForecasts.reduce((s, b) => s + b.days[dayIdx].actualKg, 0)
                    const isToday = day.date === new Date().toISOString().slice(0, 10)
                    const hasActual = actualTotal > 0

                    return (
                      <tr key={day.date} className={`border-b last:border-0 ${isToday ? 'bg-purple-50 font-medium' : ''}`}>
                        <td className="py-2 px-2">
                          {new Date(day.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {isToday && <span className="ml-1 text-xs text-purple-600">(dziś)</span>}
                        </td>
                        {dailyForecasts.map(b => {
                          const d = b.days[dayIdx]
                          return (
                            <td key={b.blockName} className="py-2 px-2 text-right">
                              <span className="font-medium">{d.predictedKg.toLocaleString('pl-PL')} kg</span>
                              {d.actualKg > 0 && (
                                <div className="text-xs text-green-600">
                                  real: {d.actualKg.toLocaleString('pl-PL')}
                                  {isToday && <span className="text-gray-400"> (w toku)</span>}
                                </div>
                              )}
                            </td>
                          )
                        })}
                        <td className="py-2 px-2 text-right font-bold">
                          {Math.round(dayTotal).toLocaleString('pl-PL')} kg
                          {hasActual && (
                            <div className="text-xs text-green-600 font-normal">
                              real: {Math.round(actualTotal).toLocaleString('pl-PL')}
                              {isToday && <span className="text-gray-400"> (w toku)</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-400 text-xs">
                          {forecastTemps.find(f => f.date === day.date)?.avgTunnelTemp.toFixed(1) ?? '—'}°
                        </td>
                        <td className="py-2 px-2 text-right text-gray-400 text-xs">
                          {day.gdhDaily.toFixed(0)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="border-t-2 font-bold bg-gray-50">
                    <td className="py-2 px-2">Razem 7 dni</td>
                    {dailyForecasts.map(b => (
                      <td key={b.blockName} className="py-2 px-2 text-right">
                        {b.totalPredicted7d.toLocaleString('pl-PL')} kg
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right">
                      {Math.round(dailyForecasts.reduce((s, b) => s + b.totalPredicted7d, 0)).toLocaleString('pl-PL')} kg
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prediction history — forecast vs actual chart + table */}
      {predictionHistory.length > 0 && (() => {
        // Aggregate per day: sum predicted and actual across blocks
        const dayMap = new Map<string, { predicted: number; actual: number; blocks: Array<{ name: string; predicted: number; actual: number }> }>()
        for (const h of predictionHistory) {
          const existing = dayMap.get(h.date) || { predicted: 0, actual: 0, blocks: [] }
          existing.predicted += h.predictedKg
          existing.actual += (h.actualKg ?? 0)
          existing.blocks.push({ name: h.blockName, predicted: h.predictedKg, actual: h.actualKg ?? 0 })
          dayMap.set(h.date, existing)
        }
        const historyDays = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => ({
            date,
            label: new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' }),
            predicted: Math.round(data.predicted),
            actual: Math.round(data.actual),
            diff: Math.round(data.actual - data.predicted),
            deviation: data.predicted > 0 ? Math.round(((data.actual - data.predicted) / data.predicted) * 100) : null,
            blocks: data.blocks.sort((a, b) => a.name.localeCompare(b.name)),
          }))

        const totalPredicted = historyDays.reduce((s, d) => s + d.predicted, 0)
        const totalActual = historyDays.reduce((s, d) => s + d.actual, 0)
        const totalDeviation = totalPredicted > 0 ? Math.round(((totalActual - totalPredicted) / totalPredicted) * 100) : null

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-5 h-5 text-blue-600" />
                Prognoza vs rzeczywistość
                {totalDeviation != null && (
                  <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${
                    Math.abs(totalDeviation) <= 15 ? 'bg-green-50 text-green-700' :
                    totalDeviation > 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    odchylenie: {totalDeviation > 0 ? '+' : ''}{totalDeviation}%
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Chart */}
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={historyDays} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} />
                  <Tooltip
                    formatter={(value?: number, name?: string) => [
                      `${(value ?? 0).toLocaleString('pl-PL')} kg`,
                      name === 'predicted' ? 'Prognoza' : 'Realne',
                    ]}
                  />
                  <Legend formatter={(value: string) => value === 'predicted' ? 'Prognoza' : 'Realne'} />
                  <Bar dataKey="actual" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="predicted" radius={[4, 4, 0, 0]}>
                    {historyDays.map((day, idx) => {
                      const color = day.predicted > day.actual
                        ? '#3b82f6'  // przeszacowane — niebieski
                        : day.predicted < day.actual
                          ? '#ef4444'  // niedoszacowane — czerwony
                          : '#22c55e'  // idealnie — zielony
                      return <Cell key={idx} fill={color} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500" /> Realne</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> Niedoszacowane</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> Przeszacowane</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500 text-xs">
                      <th className="py-2 px-2">Data</th>
                      <th className="py-2 px-2 text-right">Prognoza</th>
                      <th className="py-2 px-2 text-right">Realne</th>
                      <th className="py-2 px-2 text-right">Różnica</th>
                      <th className="py-2 px-2 text-right">Odchylenie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDays.map(day => (
                      <tr key={day.date} className="border-b last:border-0">
                        <td className="py-1.5 px-2 font-medium">{day.label}</td>
                        <td className="py-1.5 px-2 text-right text-blue-600">{day.predicted.toLocaleString('pl-PL')} kg</td>
                        <td className="py-1.5 px-2 text-right text-green-600 font-medium">{day.actual.toLocaleString('pl-PL')} kg</td>
                        <td className={`py-1.5 px-2 text-right font-medium ${day.diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {day.diff >= 0 ? '+' : ''}{day.diff.toLocaleString('pl-PL')} kg
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {day.deviation != null ? (
                            <span className={`font-medium ${
                              Math.abs(day.deviation) <= 15 ? 'text-green-600' :
                              day.deviation > 0 ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {day.deviation > 0 ? '+' : ''}{day.deviation}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold bg-gray-50">
                      <td className="py-2 px-2">Razem</td>
                      <td className="py-2 px-2 text-right text-blue-600">{totalPredicted.toLocaleString('pl-PL')} kg</td>
                      <td className="py-2 px-2 text-right text-green-600">{totalActual.toLocaleString('pl-PL')} kg</td>
                      <td className={`py-2 px-2 text-right ${totalActual - totalPredicted >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalActual - totalPredicted >= 0 ? '+' : ''}{(totalActual - totalPredicted).toLocaleString('pl-PL')} kg
                      </td>
                      <td className="py-2 px-2 text-right">
                        {totalDeviation != null && (
                          <span className={`${
                            Math.abs(totalDeviation) <= 15 ? 'text-green-600' :
                            totalDeviation > 0 ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            {totalDeviation > 0 ? '+' : ''}{totalDeviation}%
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Cumulative plan vs actual chart */}
      {cumulativeChartData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Zbiory narastająco — plan vs realizacja</CardTitle>
              {trendInfo && (
                <div className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                  trendInfo.status === 'ahead' ? 'bg-green-50 text-green-700' :
                  trendInfo.status === 'behind' ? 'bg-red-50 text-red-700' :
                  'bg-blue-50 text-blue-700'
                }`}>
                  {trendInfo.status === 'ahead' ? <ArrowUpRight className="w-4 h-4" /> :
                   trendInfo.status === 'behind' ? <ArrowDownRight className="w-4 h-4" /> :
                   <Minus className="w-4 h-4" />}
                  <span className="font-medium">
                    {trendInfo.deviationPct > 0 ? '+' : ''}{trendInfo.deviationPct}% vs plan
                  </span>
                  <span className="text-xs opacity-75">
                    ({trendInfo.deviation > 0 ? '+' : ''}{trendInfo.deviation.toLocaleString('pl-PL')} kg)
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={cumulativeChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v} kg`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const plan = payload.find(p => p.dataKey === 'plan')
                    const actual = payload.find(p => p.dataKey === 'actual')
                    const planVal = Number(plan?.value ?? 0)
                    const actualVal = Number(actual?.value ?? 0)
                    const diff = actualVal - planVal
                    const diffPct = planVal > 0 ? Math.round((diff / planVal) * 1000) / 10 : 0
                    return (
                      <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-semibold mb-1">{label}</p>
                        <p className="text-blue-600">Plan: {planVal.toLocaleString('pl-PL')} kg</p>
                        {actual?.value != null && (
                          <>
                            <p className="text-green-600">Realne: {actualVal.toLocaleString('pl-PL')} kg</p>
                            <p className={`font-medium ${diff >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              Odchylenie: {diff >= 0 ? '+' : ''}{diff.toLocaleString('pl-PL')} kg ({diffPct >= 0 ? '+' : ''}{diffPct}%)
                            </p>
                          </>
                        )}
                      </div>
                    )
                  }}
                />
                <Legend
                  formatter={(value) => value === 'plan' ? 'Plan (GDH + krzywa)' : value === 'actual' ? 'Realne zbiory' : value}
                />
                {totalPlanned > 0 && (
                  <ReferenceLine
                    y={totalPlanned}
                    stroke="#ef4444"
                    strokeDasharray="8 4"
                    strokeWidth={2}
                    label={{ value: `Cel: ${(totalPlanned / 1000).toFixed(1)}t`, position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="plan"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name="plan"
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#colorActual)"
                  name="actual"
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            {trendInfo && (
              <div className="mt-3 grid grid-cols-3 gap-4 text-center text-sm border-t pt-3">
                <div>
                  <div className="text-gray-500">Plan na dzisiaj</div>
                  <div className="font-bold text-blue-600">{trendInfo.cumPlan.toLocaleString('pl-PL')} kg</div>
                </div>
                <div>
                  <div className="text-gray-500">Zebrano realnie</div>
                  <div className="font-bold text-green-600">{trendInfo.cumActual.toLocaleString('pl-PL')} kg</div>
                </div>
                <div>
                  <div className="text-gray-500">Odchylenie</div>
                  <div className={`font-bold ${trendInfo.deviation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {trendInfo.deviation >= 0 ? '+' : ''}{trendInfo.deviation.toLocaleString('pl-PL')} kg
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {entries.length > 0 && (
        <>
          {/* Daily stacked bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dzienne zbiory per blok</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dailyChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v} kg`} />
                  <Tooltip
                    formatter={(value?: number, name?: string) => [`${(value ?? 0).toLocaleString('pl-PL')} kg`, name ?? '']}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend />
                  {blockNames.map(name => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="harvest"
                      fill={getBlockColor(name)}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Season breakdown: Lato vs Jesień */}
      {totalPlanned > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lato */}
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-500" />
                Sezon letni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700 mb-1">
                {totalPlannedSummer.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg
                <span className="text-sm font-normal text-gray-500 ml-2">cel</span>
              </div>
              <div className="text-sm text-gray-500 mb-3">
                Realizacja: {totalHarvested.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg zebrano
                {totalPlannedSummer > 0 && (
                  <span className="ml-1 font-medium text-amber-600">
                    ({Math.round((totalHarvested / totalPlannedSummer) * 1000) / 10}% celu letniego)
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {blockSummaries.filter(b => b.plannedSummerKg > 0).map(block => (
                  <div key={block.blockName} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                    <span className="w-16 font-medium">{block.blockName}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(block.plannedSummerKg > 0 ? (block.harvestedKg / block.plannedSummerKg) * 100 : 0, 100)}%`,
                          backgroundColor: getBlockColor(block.blockName),
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-gray-600 w-24 text-right">{block.plannedSummerKg.toLocaleString('pl-PL')} kg</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Jesień */}
          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-orange-500" />
                Sezon jesienny
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700 mb-1">
                {totalPlannedAutumn.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg
                <span className="text-sm font-normal text-gray-500 ml-2">cel</span>
              </div>
              <div className="text-sm text-gray-500 mb-3">
                Realizacja jesieni jeszcze nie rozpoczęta
              </div>
              <div className="space-y-2">
                {blockSummaries.filter(b => b.plannedAutumnKg > 0).map(block => (
                  <div key={block.blockName} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                    <span className="w-16 font-medium">{block.blockName}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-2.5 rounded-full bg-gray-200" style={{ width: '0%' }} />
                    </div>
                    <span className="text-gray-600 w-24 text-right">{block.plannedAutumnKg.toLocaleString('pl-PL')} kg</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Per-block cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-green-600" />
            Realizacja per blok
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockSummaries.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych. Zaimportuj plik XLS z MaxCrop.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blockSummaries.map(block => (
                <div key={block.blockName} className="border rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                      <span className="font-semibold text-gray-900">{block.blockName}</span>
                    </div>
                    {block.percentage > 120 && <TrendingUp className="w-5 h-5 text-green-500" />}
                    {block.plannedKg > 0 && block.percentage < 20 && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                  </div>

                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <span className="text-2xl font-bold" style={{ color: getBlockColor(block.blockName) }}>
                        {block.harvestedKg.toLocaleString('pl-PL')}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">kg zebrano</span>
                    </div>
                    {block.plannedKg > 0 && (
                      <div className="text-right">
                        <span className={`text-lg font-bold ${block.percentage >= 100 ? 'text-green-600' : 'text-gray-600'}`}>
                          {block.percentage}%
                        </span>
                      </div>
                    )}
                  </div>

                  {block.plannedKg > 0 && (
                    <>
                      <div className="bg-gray-100 rounded-full h-4 overflow-hidden mb-2">
                        <div
                          className="h-4 rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(block.percentage, 100)}%`,
                            backgroundColor: getBlockColor(block.blockName),
                            opacity: 0.8,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Plan: {block.plannedKg.toLocaleString('pl-PL')} kg</span>
                        <span>Pozostało: {block.remainingKg.toLocaleString('pl-PL')} kg</span>
                      </div>
                      {(block.plannedSummerKg > 0 || block.plannedAutumnKg > 0) && (
                        <div className="flex gap-3 text-xs text-gray-400 border-t pt-2">
                          {block.plannedSummerKg > 0 && (
                            <span className="flex items-center gap-1">
                              <Sun className="w-3 h-3 text-amber-400" />
                              Lato: {block.plannedSummerKg.toLocaleString('pl-PL')} kg
                            </span>
                          )}
                          {block.plannedAutumnKg > 0 && (
                            <span className="flex items-center gap-1">
                              <CloudRain className="w-3 h-3 text-orange-400" />
                              Jesień: {block.plannedAutumnKg.toLocaleString('pl-PL')} kg
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {block.plannedKg === 0 && (
                    <div className="text-xs text-gray-400 mt-1">Brak planu dla tego bloku</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Forecast vs Actual — GDH-driven comparison */}
      {weeklyForecasts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Prognoza tygodniowa vs realne zbiory
              <span className="text-xs text-gray-400 font-normal ml-2">plan (GDH + krzywa odmiany) vs MaxCrop</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {weeklyForecasts.map(block => {
                const visibleWeeks = block.weeks.filter(w => w.forecastKg > 0 || w.actualKg > 0)
                if (visibleWeeks.length === 0) return null

                return (
                  <div key={block.blockName} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                        <span className="font-semibold">{block.blockName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Kalibracja: <strong className={block.calibrationFactor > 1.1 ? 'text-green-600' : block.calibrationFactor < 0.9 ? 'text-red-600' : 'text-gray-700'}>{block.calibrationFactor.toFixed(2)}x</strong></span>
                        <span>Zebrano: {block.totalHarvestedKg.toLocaleString('pl-PL')} / {block.totalPlannedKg.toLocaleString('pl-PL')} kg</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500 text-xs">
                            <th className="py-2 px-2">Tydzien</th>
                            <th className="py-2 px-2 text-right">Plan</th>
                            <th className="py-2 px-2 text-right">Skorygowany</th>
                            <th className="py-2 px-2 text-right">Realne (MaxCrop)</th>
                            <th className="py-2 px-2 text-right">Odchylenie</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleWeeks.map(week => (
                            <tr
                              key={week.weekStart}
                              className={`border-b last:border-0 ${week.isCurrent ? 'bg-indigo-50 font-medium' : week.isPast ? '' : 'text-gray-400'}`}
                            >
                              <td className="py-1.5 px-2">
                                {week.weekLabel}
                                {week.isCurrent && <span className="ml-1 text-xs text-indigo-600">(teraz)</span>}
                              </td>
                              <td className="py-1.5 px-2 text-right">{week.forecastKg.toLocaleString('pl-PL')} kg</td>
                              <td className="py-1.5 px-2 text-right font-medium">{week.calibratedKg.toLocaleString('pl-PL')} kg</td>
                              <td className="py-1.5 px-2 text-right">
                                {week.isPast || week.isCurrent ? `${week.actualKg.toLocaleString('pl-PL')} kg` : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {(week.isPast || week.isCurrent) && week.forecastKg > 0 ? (
                                  <span className={`inline-flex items-center gap-0.5 ${week.diffKg > 0 ? 'text-green-600' : week.diffKg < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                    {week.diffKg > 0 ? <ArrowUpRight className="w-3 h-3" /> : week.diffKg < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    {week.diffPct > 0 ? '+' : ''}{week.diffPct}%
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
