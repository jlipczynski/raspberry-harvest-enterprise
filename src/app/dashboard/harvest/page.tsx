'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Target, Upload, Loader2, TrendingUp, AlertTriangle, Package } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceLine,
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
}

interface BlockSummary {
  blockName: string
  harvestedKg: number
  plannedKg: number
  percentage: number
  remainingKg: number
  dailyData: Array<{ date: string; kg: number; cumulative: number }>
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
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [harvestRes, planRes] = await Promise.all([
        fetch('/api/plantation/harvest'),
        fetch('/api/plantation/harvest/plan'),
      ])

      if (harvestRes.ok) {
        const data = await harvestRes.json()
        setEntries(data.entries || [])
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setBlockPlans(data.blocks || [])
      }
    } catch (e) {
      console.error('Error fetching harvest data:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

    const planMap = new Map<string, number>()
    for (const bp of blockPlans) {
      planMap.set(bp.blockName, (planMap.get(bp.blockName) || 0) + bp.plannedKg)
    }

    const summaries: BlockSummary[] = []
    const allBlockNames = new Set([...blockGroups.keys(), ...planMap.keys()])

    for (const name of allBlockNames) {
      const group = blockGroups.get(name)
      const harvestedKg = group?.kg || 0
      const plannedKg = planMap.get(name) || 0

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
        percentage: plannedKg > 0 ? Math.round((harvestedKg / plannedKg) * 1000) / 10 : 0,
        remainingKg: Math.round(Math.max(0, plannedKg - harvestedKg) * 100) / 100,
        dailyData,
      })
    }

    return summaries.sort((a, b) => a.blockName.localeCompare(b.blockName))
  }, [entries, blockPlans])

  const totalHarvested = blockSummaries.reduce((s, b) => s + b.harvestedKg, 0)
  const totalPlanned = blockSummaries.reduce((s, b) => s + b.plannedKg, 0)
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

  // Cumulative chart data: total cumulative over time
  const cumulativeChartData = useMemo(() => {
    const dateMap = new Map<string, number>()

    for (const entry of entries) {
      const dateKey = entry.date.slice(0, 10)
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + entry.weightKg)
    }

    const sorted = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    let cumulative = 0
    return sorted.map(([date, kg]) => {
      cumulative += kg
      return {
        date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        kg: Math.round(kg * 10) / 10,
        cumulative: Math.round(cumulative * 10) / 10,
        plan: Math.round(totalPlanned * 10) / 10,
      }
    })
  }, [entries, totalPlanned])

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
          <p className="text-gray-500">Realizacja zbiorów vs plan — sezon 2026</p>
        </div>
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

      {entries.length > 0 && (
        <>
          {/* Cumulative chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zbiory narastająco vs cel</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cumulativeChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v} kg`} />
                  <Tooltip
                    formatter={(value?: number, name?: string) => [
                      `${(value ?? 0).toLocaleString('pl-PL')} kg`,
                      name === 'cumulative' ? 'Zebrano narastająco' : name === 'plan' ? 'Cel sezonu' : 'Dziennie'
                    ]}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <ReferenceLine
                    y={totalPlanned}
                    stroke="#ef4444"
                    strokeDasharray="8 4"
                    strokeWidth={2}
                    label={{ value: `Cel: ${totalPlanned.toLocaleString('pl-PL')} kg`, position: 'right', fill: '#ef4444', fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#colorCumulative)"
                    name="cumulative"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Plan: {block.plannedKg.toLocaleString('pl-PL')} kg</span>
                        <span>Pozostało: {block.remainingKg.toLocaleString('pl-PL')} kg</span>
                      </div>
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
    </div>
  )
}
