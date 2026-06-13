'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Target, Upload, Loader2, TrendingUp, AlertTriangle, Package, Sun, CloudRain, Tv, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, Line, ComposedChart, ReferenceLine,
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

const BLOCK_COLORS: Record<string, string> = {
  'Blok A': '#3b82f6',
  'Blok B': '#ef4444',
  'Blok C': '#f59e0b',
  'Blok D': '#10b981',
}

function getBlockColor(name: string): string {
  return BLOCK_COLORS[name] || '#6b7280'
}

export default function HarvestPage() {
  const [entries, setEntries] = useState<HarvestEntry[]>([])
  const [blockPlans, setBlockPlans] = useState<BlockPlan[]>([])
  const [weeklyForecasts, setWeeklyForecasts] = useState<WeeklyBlockForecast[]>([])
  const [dailyPlanVsActual, setDailyPlanVsActual] = useState<DailyPlanPoint[]>([])
  const [totalPlannedFromApi, setTotalPlannedFromApi] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [harvestRes, planRes, weeklyRes] = await Promise.all([
        fetch('/api/plantation/harvest'),
        fetch('/api/plantation/harvest/plan'),
        fetch('/api/harvest-forecast/weekly'),
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
  const cumulativeChartData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

    // If API returned dailyPlanVsActual, use it (has both plan and actual)
    if (dailyPlanVsActual.length > 0) {
      return dailyPlanVsActual
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
        dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + entry.weightKg)
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

  // Trend analysis
  const trendInfo = useMemo(() => {
    if (dailyPlanVsActual.length === 0) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayPoint = dailyPlanVsActual.filter(d => d.date <= today).pop()
    if (!todayPoint || todayPoint.cumPlan === 0) return null

    const deviation = todayPoint.cumActual - todayPoint.cumPlan
    const deviationPct = Math.round((deviation / todayPoint.cumPlan) * 1000) / 10
    const status: 'ahead' | 'behind' | 'on-track' =
      deviationPct > 10 ? 'ahead' : deviationPct < -10 ? 'behind' : 'on-track'

    return { deviation: Math.round(deviation), deviationPct, status, cumPlan: Math.round(todayPoint.cumPlan), cumActual: Math.round(todayPoint.cumActual) }
  }, [dailyPlanVsActual])

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
