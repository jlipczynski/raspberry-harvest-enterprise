'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceLine,
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

const SLIDE_COUNT = 4
const DEFAULT_INTERVAL = 12000 // 12s per slide

export default function HarvestTVPage() {
  useHideDashboardLayout()
  const [entries, setEntries] = useState<HarvestEntry[]>([])
  const [blockPlans, setBlockPlans] = useState<BlockPlan[]>([])
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(new Date())

  // Fetch data
  const fetchData = useCallback(async () => {
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
      console.error('TV fetch error:', e)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh data every 5 min
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

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

  // Cumulative chart data
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
        cumulative: Math.round(cumulative * 10) / 10,
      }
    })
  }, [entries])

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
                <AreaChart data={cumulativeChartData} margin={{ top: 10, right: 40, left: 40, bottom: 10 }}>
                  <defs>
                    <linearGradient id="tvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fontSize: 14, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 14, fill: '#9ca3af' }} tickFormatter={v => `${v} kg`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                    formatter={(value?: number) => [`${(value ?? 0).toLocaleString('pl-PL')} kg`, 'Zebrano']}
                  />
                  {totalPlanned > 0 && (
                    <ReferenceLine
                      y={totalPlanned}
                      stroke="#ef4444"
                      strokeDasharray="8 4"
                      strokeWidth={2}
                      label={{ value: `Cel: ${totalPlanned.toLocaleString('pl-PL')} kg`, position: 'right', fill: '#ef4444', fontSize: 14 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#tvGradient)"
                  />
                </AreaChart>
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

        {/* Slide 3: Per-block detail cards */}
        {slide === 3 && (
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
