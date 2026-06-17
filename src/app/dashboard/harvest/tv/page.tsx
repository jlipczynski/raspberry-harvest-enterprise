'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceLine, ComposedChart, Line,
} from 'recharts'

// Hide dashboard layout (sidebar, padding) when TV page is mounted
function useHideDashboardLayout() {
  useEffect(() => {
    document.body.classList.add('tv-mode')
    const style = document.createElement('style')
    style.id = 'tv-mode-style'
    style.textContent = `
      body.tv-mode aside, body.tv-mode .lg\\:ml-64 { margin-left: 0 !important; }
      body.tv-mode aside { display: none !important; }
      body.tv-mode .pt-14 { padding-top: 0 !important; }
      body.tv-mode main { padding: 0 !important; }
      body.tv-mode .lg\\:pt-0 { padding-top: 0 !important; }
      body.tv-mode .lg\\:p-6 { padding: 0 !important; }
      body.tv-mode .p-4 { padding: 0 !important; }
    `
    document.head.appendChild(style)
    return () => {
      document.body.classList.remove('tv-mode')
      document.getElementById('tv-mode-style')?.remove()
    }
  }, [])
}

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

const BLOCK_COLORS: Record<string, string> = {
  'Blok A': '#3b82f6',
  'Blok B': '#ef4444',
  'Blok C': '#f59e0b',
  'Blok D': '#10b981',
}

function getBlockColor(name: string): string {
  return BLOCK_COLORS[name] || '#6b7280'
}

interface DailyForecastBlock {
  blockName: string
  days: Array<{
    date: string
    predictedKg: number
    actualKg: number
    gdhDaily: number
  }>
  totalPredicted7d: number
}

const SLIDE_COUNT = 5
const DEFAULT_INTERVAL = 12000 // 12s per slide

export default function HarvestTVPage() {
  useHideDashboardLayout()
  const [entries, setEntries] = useState<HarvestEntry[]>([])
  const [blockPlans, setBlockPlans] = useState<BlockPlan[]>([])
  const [dailyForecasts, setDailyForecasts] = useState<DailyForecastBlock[]>([])
  const [forecastTemps, setForecastTemps] = useState<Array<{ date: string; avgTunnelTemp: number }>>([])
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(new Date())

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [harvestRes, planRes, dailyRes] = await Promise.all([
        fetch('/api/plantation/harvest'),
        fetch('/api/plantation/harvest/plan'),
        fetch('/api/harvest-forecast/daily'),
      ])
      if (harvestRes.ok) {
        const data = await harvestRes.json()
        setEntries(data.entries || [])
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setBlockPlans(data.blocks || [])
      }
      if (dailyRes.ok) {
        const data = await dailyRes.json()
        setDailyForecasts(data.blocks || [])
        setForecastTemps(data.forecastTemps || [])
      }
    } catch (e) {
      console.error('TV fetch error:', e)
    }
  }, [])

  // Initial fetch + auto-refresh every 5 min
  useEffect(() => {
    fetchData()
    const interval = setInterval(() => { fetchData() }, 5 * 60 * 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-rotate slides
  useEffect(() => {
    if (paused) return
    const interval = setInterval(() => {
      setSlide(s => (s + 1) % SLIDE_COUNT)
    }, DEFAULT_INTERVAL)
    return () => clearInterval(interval)
  }, [paused])

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Block summaries
  const blockSummaries = useMemo(() => {
    const blockGroups = new Map<string, number>()
    for (const entry of entries) {
      const name = entry.block?.name || entry.areaName
      blockGroups.set(name, (blockGroups.get(name) || 0) + entry.weightKg)
    }

    const planMap = new Map<string, { total: number; summer: number; autumn: number }>()
    for (const bp of blockPlans) {
      const existing = planMap.get(bp.blockName) || { total: 0, summer: 0, autumn: 0 }
      existing.total += bp.plannedKg
      existing.summer += bp.plannedSummerKg || 0
      existing.autumn += bp.plannedAutumnKg || 0
      planMap.set(bp.blockName, existing)
    }

    const allNames = new Set([...blockGroups.keys(), ...planMap.keys()])
    return Array.from(allNames).sort().map(name => {
      const harvested = blockGroups.get(name) || 0
      const plan = planMap.get(name) || { total: 0, summer: 0, autumn: 0 }
      return {
        blockName: name,
        harvestedKg: Math.round(harvested * 100) / 100,
        plannedKg: plan.total,
        plannedSummerKg: plan.summer,
        plannedAutumnKg: plan.autumn,
        percentage: plan.total > 0 ? Math.round((harvested / plan.total) * 1000) / 10 : 0,
      }
    })
  }, [entries, blockPlans])

  const totalHarvested = blockSummaries.reduce((s, b) => s + b.harvestedKg, 0)
  const totalPlanned = blockSummaries.reduce((s, b) => s + b.plannedKg, 0)
  const totalPercentage = totalPlanned > 0 ? Math.round((totalHarvested / totalPlanned) * 1000) / 10 : 0

  // Cumulative chart data with target at end of November
  const cumulativeChartData = useMemo(() => {
    const dateMap = new Map<string, number>()
    for (const entry of entries) {
      const dateKey = entry.date.slice(0, 10)
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + entry.weightKg)
    }
    const sorted = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    const result: Array<{ date: string; dateRaw: string; cumulative: number; target: number | null }> = []
    let runningTotal = 0
    for (const [date, kg] of sorted) {
      runningTotal += kg
      result.push({
        date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        dateRaw: date,
        cumulative: Math.round(runningTotal * 10) / 10,
        target: null,
      })
    }

    // Add target point at end of November
    if (totalPlanned > 0) {
      const year = new Date().getFullYear()
      const seasonEnd = `${year}-11-30`
      const lastDate = sorted.length > 0 ? sorted[sorted.length - 1][0] : ''
      if (lastDate < seasonEnd) {
        result.push({
          date: '30 lis',
          dateRaw: seasonEnd,
          cumulative: null as unknown as number,
          target: Math.round(totalPlanned),
        })
      }
    }
    return result
  }, [entries, totalPlanned])

  // Daily stacked bars
  const { dailyChartData, blockNames } = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>()
    const names = new Set<string>()
    for (const entry of entries) {
      const name = entry.block?.name || entry.areaName
      names.add(name)
      const dateKey = entry.date.slice(0, 10)
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, {})
      const day = dateMap.get(dateKey)!
      day[name] = (day[name] || 0) + entry.weightKg
    }
    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, blocks]) => ({
        date: new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        ...Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      }))
    return { dailyChartData: data, blockNames: Array.from(names).sort() }
  }, [entries])

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.()
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white cursor-pointer select-none"
      onClick={() => setPaused(p => !p)}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-green-400">Zbiory Malin</h1>
          <span className="text-gray-500 text-sm">Sezon 2026</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-1.5">
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setSlide(i) }}
                className={`w-2.5 h-2.5 rounded-full transition-all ${i === slide ? 'bg-green-400 scale-125' : 'bg-gray-600 hover:bg-gray-500'}`}
              />
            ))}
          </div>
          {paused && <span className="text-amber-400 text-xs font-medium">PAUZA</span>}
          <button
            onClick={(e) => { e.stopPropagation(); goFullscreen() }}
            className="text-gray-500 hover:text-white text-xs border border-gray-700 px-2 py-1 rounded"
          >
            Fullscreen
          </button>
          <span className="text-gray-500 text-lg font-mono">
            {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Slides */}
      <div className="p-8">
        {/* Slide 0: Big numbers */}
        {slide === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] gap-12">
            <div className="text-center">
              <div className="text-gray-400 text-xl mb-2">Zebrano</div>
              <div className="text-8xl font-black text-green-400 tracking-tight">
                {totalHarvested.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
                <span className="text-4xl ml-3 text-green-500">kg</span>
              </div>
            </div>

            <div className="w-full max-w-3xl">
              <div className="flex justify-between text-sm text-gray-500 mb-2">
                <span>0 kg</span>
                <span>{totalPlanned.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg</span>
              </div>
              <div className="bg-gray-800 rounded-full h-8 overflow-hidden">
                <div
                  className="h-8 rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000"
                  style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                />
              </div>
              <div className="text-center mt-3">
                <span className="text-5xl font-bold text-white">{totalPercentage}%</span>
                <span className="text-gray-500 text-lg ml-3">realizacji celu</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-8 w-full max-w-4xl mt-4">
              {blockSummaries.map(block => (
                <div key={block.blockName} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                    <span className="text-lg text-gray-300">{block.blockName}</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: getBlockColor(block.blockName) }}>
                    {block.harvestedKg.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
                    <span className="text-sm text-gray-500 ml-1">kg</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{block.percentage}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slide 1: Cumulative chart */}
        {slide === 1 && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col">
            <h2 className="text-3xl font-bold text-gray-200 mb-6">Zbiory narastajaco</h2>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={600}>
                <ComposedChart data={cumulativeChartData} margin={{ top: 10, right: 40, left: 40, bottom: 10 }}>
                  <defs>
                    <linearGradient id="tvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fontSize: 14, fill: '#9ca3af' }} />
                  <YAxis
                    tick={{ fontSize: 14, fill: '#9ca3af' }}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v} kg`}
                    domain={[0, totalPlanned > 0 ? Math.ceil(totalPlanned * 1.05) : 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                    formatter={(value?: number, name?: string) => {
                      if (value == null) return ['', '']
                      return [`${value.toLocaleString('pl-PL')} kg`, name === 'cumulative' ? 'Zebrano' : 'Cel sezonu']
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#tvGradient)"
                    connectNulls={false}
                  />
                  {totalPlanned > 0 && (
                    <ReferenceLine
                      y={totalPlanned}
                      stroke="#ef4444"
                      strokeDasharray="8 4"
                      strokeWidth={2}
                      label={{ value: `Cel: ${(totalPlanned / 1000).toFixed(1)}t`, position: 'insideTopRight', fill: '#ef4444', fontSize: 16, fontWeight: 'bold' }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#ef4444"
                    strokeWidth={0}
                    dot={{ r: 8, fill: '#ef4444', stroke: '#ef4444' }}
                    connectNulls={false}
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Slide 2: Daily stacked bars */}
        {slide === 2 && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col">
            <h2 className="text-3xl font-bold text-gray-200 mb-6">Dzienne zbiory per blok</h2>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={600}>
                <BarChart data={dailyChartData} margin={{ top: 10, right: 40, left: 40, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fontSize: 14, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 14, fill: '#9ca3af' }} tickFormatter={v => `${v} kg`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                    formatter={(value?: number, name?: string) => [`${(value ?? 0).toLocaleString('pl-PL')} kg`, name ?? '']}
                  />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 14 }} />
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
            </div>
          </div>
        )}

        {/* Slide 3: 7-day daily forecast */}
        {slide === 3 && dailyForecasts.length > 0 && (
          <div className="min-h-[calc(100vh-120px)] flex flex-col">
            <h2 className="text-3xl font-bold text-gray-200 mb-6">Prognoza zbiorów — 7 dni</h2>
            <div className="flex-1 flex flex-col justify-center">
              <table className="w-full text-lg">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="py-4 px-4 text-left text-xl">Dzień</th>
                    {dailyForecasts.map(b => (
                      <th key={b.blockName} className="py-4 px-4 text-right text-xl">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getBlockColor(b.blockName) }} />
                          {b.blockName}
                        </span>
                      </th>
                    ))}
                    <th className="py-4 px-4 text-right text-xl font-bold text-white">Razem</th>
                    <th className="py-4 px-4 text-right text-lg text-gray-400">Temp</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyForecasts[0]?.days.map((day, dayIdx) => {
                    const dayTotal = dailyForecasts.reduce((s, b) => s + b.days[dayIdx].predictedKg, 0)
                    const isToday = day.date === new Date().toISOString().slice(0, 10)
                    const temp = forecastTemps.find(f => f.date === day.date)?.avgTunnelTemp
                    return (
                      <tr
                        key={day.date}
                        className={`border-b border-gray-800 ${isToday ? 'bg-green-900/30' : ''}`}
                      >
                        <td className="py-3 px-4 text-gray-300">
                          {new Date(day.date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {isToday && <span className="ml-2 text-green-400 text-sm">(dziś)</span>}
                        </td>
                        {dailyForecasts.map(b => (
                          <td key={b.blockName} className="py-3 px-4 text-right font-bold" style={{ color: getBlockColor(b.blockName) }}>
                            {b.days[dayIdx].predictedKg.toLocaleString('pl-PL')} kg
                          </td>
                        ))}
                        <td className="py-3 px-4 text-right font-black text-2xl text-white">
                          {Math.round(dayTotal).toLocaleString('pl-PL')}
                          <span className="text-sm text-gray-400 ml-1">kg</span>
                        </td>
                        <td className="py-3 px-4 text-right text-lg text-amber-400">
                          {temp != null ? `${temp.toFixed(1)}°` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-gray-600 bg-gray-900">
                    <td className="py-4 px-4 text-xl font-bold text-gray-200">Razem 7 dni</td>
                    {dailyForecasts.map(b => (
                      <td key={b.blockName} className="py-4 px-4 text-right text-xl font-bold" style={{ color: getBlockColor(b.blockName) }}>
                        {b.totalPredicted7d.toLocaleString('pl-PL')} kg
                      </td>
                    ))}
                    <td className="py-4 px-4 text-right text-3xl font-black text-green-400">
                      {Math.round(dailyForecasts.reduce((s, b) => s + b.totalPredicted7d, 0)).toLocaleString('pl-PL')}
                      <span className="text-lg text-green-500 ml-1">kg</span>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Slide 4: Per-block detail cards */}
        {slide === 4 && (
          <div className="min-h-[calc(100vh-120px)]">
            <h2 className="text-3xl font-bold text-gray-200 mb-8">Realizacja per blok</h2>
            <div className="grid grid-cols-2 gap-8">
              {blockSummaries.map(block => (
                <div
                  key={block.blockName}
                  className="bg-gray-900 rounded-2xl p-8 border border-gray-800"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: getBlockColor(block.blockName) }} />
                    <span className="text-2xl font-bold text-gray-200">{block.blockName}</span>
                    <span className="ml-auto text-4xl font-black" style={{ color: getBlockColor(block.blockName) }}>
                      {block.percentage}%
                    </span>
                  </div>

                  <div className="bg-gray-800 rounded-full h-6 overflow-hidden mb-6">
                    <div
                      className="h-6 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(block.percentage, 100)}%`,
                        backgroundColor: getBlockColor(block.blockName),
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Zebrano</div>
                      <div className="text-2xl font-bold" style={{ color: getBlockColor(block.blockName) }}>
                        {block.harvestedKg.toLocaleString('pl-PL')} kg
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-sm mb-1">Cel sezonu</div>
                      <div className="text-2xl font-bold text-gray-300">
                        {block.plannedKg.toLocaleString('pl-PL')} kg
                      </div>
                    </div>
                  </div>

                  {(block.plannedSummerKg > 0 || block.plannedAutumnKg > 0) && (
                    <div className="flex gap-6 mt-4 pt-4 border-t border-gray-800 text-sm text-gray-500">
                      {block.plannedSummerKg > 0 && (
                        <span>Lato: {block.plannedSummerKg.toLocaleString('pl-PL')} kg</span>
                      )}
                      {block.plannedAutumnKg > 0 && (
                        <span>Jesien: {block.plannedAutumnKg.toLocaleString('pl-PL')} kg</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
