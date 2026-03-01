'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Sun, Leaf, Users, TrendingUp, AlertTriangle, BarChart3, Target, Layers, Grid3X3 } from 'lucide-react'

interface Variety { id: string; name: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; harvestCurveSummer?: number[]; harvestCurveAutumn?: number[]; pickingEfficiency?: number; wastePercent?: number; secondCategoryPercent?: number }
interface Section { id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number; productionYear?: number; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; varietyId: string; variety?: Variety }
interface Block { id: string; name: string; sections: Section[] }

const defaultCurve = [5, 10, 15, 20, 20, 15, 10, 5]

const getWeekDates = (weekNum: number, year: number = new Date().getFullYear()) => {
  const jan1 = new Date(year, 0, 1)
  const daysToMonday = (jan1.getDay() + 6) % 7
  const firstMonday = new Date(year, 0, 1 - daysToMonday + (weekNum - 1) * 7)
  const sunday = new Date(firstMonday)
  sunday.setDate(firstMonday.getDate() + 6)
  const formatDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`
  return { start: formatDate(firstMonday), end: formatDate(sunday), label: `${formatDate(firstMonday)}-${formatDate(sunday)}` }
}

export default function PlanningPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'total' | 'section'>('total')
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [comparisonView, setComparisonView] = useState<'area' | 'heatmap' | 'bars'>('bars')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      setBlocks(data.blocks || [])
      setVarieties(data.varieties || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const allSections = blocks.flatMap(b => b.sections.map(s => ({ ...s, blockName: b.name })))

  const calcStats = (s: Section) => {
    const v = varieties.find(x => x.id === s.varietyId)
    const pots = s.metersLength * s.potsPerMeter
    const shoots = pots * s.shootsPerPot
    const ys = s.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0
    const ya = s.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0
    const fs = shoots * ys
    const fa = shoots * ya
    const curveSummer = v?.harvestCurveSummer || defaultCurve
    const curveAutumn = v?.harvestCurveAutumn || defaultCurve
    const eff = v?.pickingEfficiency || 6
    const waste = v?.wastePercent || 2
    const secondCat = v?.secondCategoryPercent || 8
    return { pots, shoots, fs, fa, total: fs + fa, curveSummer, curveAutumn, eff, waste, secondCat, variety: v }
  }

  const getWeeklyData = (total: number, curve: number[], eff: number, startWeek: number) => {
    return curve.map((p, i) => {
      const week = startWeek + i
      const kg = Math.round(total * p / 100)
      const hrs = Math.round(kg / eff)
      const workers = Math.ceil(hrs / 48)
      const dates = getWeekDates(week)
      return { week, pct: p, kg, hrs, workers, dates }
    })
  }

  const getAggregatedWeekly = (season: 'summer' | 'autumn') => {
    const weeklyTotals: { [week: number]: { kg: number, hrs: number, workers: number, dates?: { start: string, end: string, label: string } } } = {}
    allSections.forEach(section => {
      const stats = calcStats(section)
      const total = season === 'summer' ? stats.fs : stats.fa
      const curve = season === 'summer' ? stats.curveSummer : stats.curveAutumn
      const startWeek = season === 'summer' ? 22 : 33
      const weekly = getWeeklyData(total, curve, stats.eff, startWeek)
      weekly.forEach(w => {
        if (!weeklyTotals[w.week]) weeklyTotals[w.week] = { kg: 0, hrs: 0, workers: 0, dates: w.dates }
        weeklyTotals[w.week].kg += w.kg
        weeklyTotals[w.week].hrs += w.hrs
      })
    })
    Object.keys(weeklyTotals).forEach(week => { weeklyTotals[+week].workers = Math.ceil(weeklyTotals[+week].hrs / 48) })
    return Object.entries(weeklyTotals).map(([week, data]) => ({ week: +week, dates: getWeekDates(+week), ...data })).sort((a, b) => a.week - b.week)
  }

  const totals = allSections.reduce((acc, s) => {
    const st = calcStats(s)
    acc.pots += st.pots; acc.shoots += st.shoots; acc.fs += st.fs; acc.fa += st.fa
    acc.waste += (st.fs + st.fa) * st.waste / 100
    acc.secondCat += (st.fs + st.fa) * st.secondCat / 100
    return acc
  }, { pots: 0, shoots: 0, fs: 0, fa: 0, waste: 0, secondCat: 0 })

  const totalKg = totals.fs + totals.fa
  const firstCat = totalKg - totals.waste - totals.secondCat

  const summerWeekly = getAggregatedWeekly('summer')
  const autumnWeekly = getAggregatedWeekly('autumn')
  const maxSummerKg = Math.max(...summerWeekly.map(w => w.kg), 1)
  const maxAutumnKg = Math.max(...autumnWeekly.map(w => w.kg), 1)
  const peakWorkers = Math.max(...summerWeekly.map(w => w.workers), ...autumnWeekly.map(w => w.workers))
  const bottleneckThreshold = peakWorkers * 0.8
  const summerBottlenecks = summerWeekly.filter(w => w.workers >= bottleneckThreshold)
  const autumnBottlenecks = autumnWeekly.filter(w => w.workers >= bottleneckThreshold)

  const selectedSectionData = selectedSection ? allSections.find(s => s.id === selectedSection) : null
  const selectedStats = selectedSectionData ? calcStats(selectedSectionData) : null
  const selectedSummerWeekly = selectedStats ? getWeeklyData(selectedStats.fs, selectedStats.curveSummer, selectedStats.eff, 22) : []
  const selectedAutumnWeekly = selectedStats ? getWeeklyData(selectedStats.fa, selectedStats.curveAutumn, selectedStats.eff, 33) : []

  // Dane porównawcze dla wszystkich sekcji
  const getSectionComparison = (season: 'summer' | 'autumn') => {
    const startWeek = season === 'summer' ? 22 : 33
    const weeks: number[] = []
    const sectionData: { name: string, color: string, data: { week: number, kg: number }[] }[] = []
    const colors = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
    
    allSections.forEach((section, idx) => {
      const stats = calcStats(section)
      const total = season === 'summer' ? stats.fs : stats.fa
      const curve = season === 'summer' ? stats.curveSummer : stats.curveAutumn
      const weekly = getWeeklyData(total, curve, stats.eff, startWeek)
      
      weekly.forEach(w => { if (!weeks.includes(w.week)) weeks.push(w.week) })
      sectionData.push({
        name: section.name,
        color: colors[idx % colors.length],
        data: weekly.map(w => ({ week: w.week, kg: w.kg }))
      })
    })
    
    weeks.sort((a, b) => a - b)
    return { weeks, sectionData }
  }

  const summerComparison = getSectionComparison('summer')
  const autumnComparison = getSectionComparison('autumn')

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Planowanie zbiorów</h1><p className="text-gray-500">Sezon {new Date().getFullYear()}</p></div>
      </div>

      <div className="flex gap-2 items-center">
        <Button variant={viewMode === 'total' ? 'default' : 'outline'} onClick={() => { setViewMode('total'); setSelectedSection(null) }} className={viewMode === 'total' ? 'bg-green-600 hover:bg-green-700' : ''}><BarChart3 className="w-4 h-4 mr-2" />Cała plantacja</Button>
        <Button variant={viewMode === 'section' ? 'default' : 'outline'} onClick={() => setViewMode('section')} className={viewMode === 'section' ? 'bg-green-600 hover:bg-green-700' : ''}><Target className="w-4 h-4 mr-2" />Pojedyncza sekcja</Button>
        <a href="/dashboard/planning/kacperek" className="ml-auto relative group">
          <div className="relative px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-black text-lg shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 animate-pulse hover:animate-none cursor-pointer border-4 border-yellow-300">
            <span className="relative z-10 flex items-center gap-2">🍓 RAPORT DLA KACPERKA 🍓</span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="absolute -top-2 -right-2 bg-yellow-400 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full shadow animate-bounce">HOT!</span>
          </div>
        </a>
      </div>

      {viewMode === 'section' && (
        <div className="bg-white rounded-xl p-4 border">
          <label className="text-sm text-gray-500 mb-2 block">Wybierz sekcję:</label>
          <select className="w-full md:w-96 h-10 border rounded-lg px-3" value={selectedSection || ''} onChange={e => setSelectedSection(e.target.value || null)}>
            <option value="">-- Wybierz sekcję --</option>
            {blocks.map(block => (<optgroup key={block.id} label={block.name}>{block.sections.map(s => (<option key={s.id} value={s.id}>{s.name} ({s.variety?.name})</option>))}</optgroup>))}
          </select>
        </div>
      )}

      {viewMode === 'total' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white rounded-xl p-4 border text-center"><p className="text-3xl font-bold">{allSections.length}</p><p className="text-xs text-gray-500">Sekcji</p></div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center"><p className="text-3xl font-bold text-green-700">{(totalKg / 1000).toFixed(1)}t</p><p className="text-xs text-green-600">Razem</p></div>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center"><p className="text-3xl font-bold text-orange-600">{(totals.fs / 1000).toFixed(1)}t</p><p className="text-xs text-orange-600">Lato ☀️</p></div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center"><p className="text-3xl font-bold text-red-600">{(totals.fa / 1000).toFixed(1)}t</p><p className="text-xs text-red-600">Jesień 🍂</p></div>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-center"><p className="text-3xl font-bold text-emerald-600">{(firstCat / 1000).toFixed(1)}t</p><p className="text-xs text-emerald-600">I kat. ✓</p></div>
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-center"><p className="text-3xl font-bold text-yellow-600">{(totals.secondCat / 1000).toFixed(1)}t</p><p className="text-xs text-yellow-600">II kat.</p></div>
            <div className="bg-gray-100 rounded-xl p-4 border text-center"><p className="text-3xl font-bold text-gray-600">{(totals.waste / 1000).toFixed(1)}t</p><p className="text-xs text-gray-500">Odpad</p></div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center"><p className="text-3xl font-bold text-blue-600">{peakWorkers}</p><p className="text-xs text-blue-600">Pracowników max</p></div>
          </div>

          {(summerBottlenecks.length > 0 || autumnBottlenecks.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-amber-800">Wąskie gardła - wysokie zapotrzebowanie</h3></div>
              <div className="flex flex-wrap gap-2">
                {summerBottlenecks.map(w => (<span key={`s-${w.week}`} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">☀️ T{w.week}: {w.workers} os. ({w.kg.toLocaleString('pl-PL')} kg)</span>))}
                {autumnBottlenecks.map(w => (<span key={`a-${w.week}`} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">🍂 T{w.week}: {w.workers} os. ({w.kg.toLocaleString('pl-PL')} kg)</span>))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2"><Sun className="w-5 h-5 text-orange-500" />Sezon letni</h3>
                <div className="text-sm text-gray-500">Szczyt: <strong className="text-orange-600">{maxSummerKg.toLocaleString('pl-PL')} kg</strong></div>
              </div>
              <div className="flex items-end gap-1 h-48 mb-4">
                {summerWeekly.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div className={`w-full rounded-t transition-all cursor-pointer ${w.workers >= bottleneckThreshold ? 'bg-gradient-to-t from-red-500 to-orange-400' : 'bg-gradient-to-t from-orange-500 to-amber-400'} hover:opacity-80`} style={{ height: `${(w.kg / maxSummerKg) * 180}px`, minHeight: '8px' }} />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
                      <div className="font-bold text-orange-400">T{w.week} ({w.dates.label})</div>
                      <div>{w.kg.toLocaleString('pl-PL')} kg</div>
                      <div>{w.workers} pracowników • {w.hrs}h</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mb-4">{summerWeekly.map((w, i) => (<div key={i} className="flex-1 text-center text-xs text-gray-500"><div>T{w.week}</div><div className="text-[10px] text-gray-400">{w.dates.start}</div></div>))}</div>
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 border-b"><th className="text-left py-2">Tydzień</th><th className="text-right py-2">Zbiór</th><th className="text-right py-2">Σ tony</th><th className="text-right py-2">Pracownicy</th><th className="text-right py-2">Godziny</th></tr></thead>
                <tbody>{summerWeekly.map((w, wi) => { const cum = summerWeekly.slice(0, wi + 1).reduce((s, x) => s + x.kg, 0); return (<tr key={w.week} className={`border-b ${w.workers >= bottleneckThreshold ? 'bg-red-50' : ''}`}><td className="py-2">T{w.week} <span className="text-gray-400 text-xs">({w.dates.label})</span></td><td className="text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td><td className="text-right text-gray-500">{(cum / 1000).toFixed(2)}t</td><td className="text-right">{w.workers} os.</td><td className="text-right text-gray-500">{w.hrs}h</td></tr>)})}</tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2"><Leaf className="w-5 h-5 text-red-500" />Sezon jesienny</h3>
                <div className="text-sm text-gray-500">Szczyt: <strong className="text-red-600">{maxAutumnKg.toLocaleString('pl-PL')} kg</strong></div>
              </div>
              <div className="flex items-end gap-1 h-48 mb-4">
                {autumnWeekly.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div className={`w-full rounded-t transition-all cursor-pointer ${w.workers >= bottleneckThreshold ? 'bg-gradient-to-t from-purple-600 to-red-500' : 'bg-gradient-to-t from-red-500 to-orange-400'} hover:opacity-80`} style={{ height: `${(w.kg / maxAutumnKg) * 180}px`, minHeight: '8px' }} />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
                      <div className="font-bold text-red-400">T{w.week} ({w.dates.label})</div>
                      <div>{w.kg.toLocaleString('pl-PL')} kg</div>
                      <div>{w.workers} pracowników • {w.hrs}h</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mb-4">{autumnWeekly.map((w, i) => (<div key={i} className="flex-1 text-center text-xs text-gray-500"><div>T{w.week}</div><div className="text-[10px] text-gray-400">{w.dates.start}</div></div>))}</div>
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 border-b"><th className="text-left py-2">Tydzień</th><th className="text-right py-2">Zbiór</th><th className="text-right py-2">Σ tony</th><th className="text-right py-2">Pracownicy</th><th className="text-right py-2">Godziny</th></tr></thead>
                <tbody>{autumnWeekly.map((w, wi) => { const cum = autumnWeekly.slice(0, wi + 1).reduce((s, x) => s + x.kg, 0); return (<tr key={w.week} className={`border-b ${w.workers >= bottleneckThreshold ? 'bg-red-50' : ''}`}><td className="py-2">T{w.week} <span className="text-gray-400 text-xs">({w.dates.label})</span></td><td className="text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td><td className="text-right text-gray-500">{(cum / 1000).toFixed(2)}t</td><td className="text-right">{w.workers} os.</td><td className="text-right text-gray-500">{w.hrs}h</td></tr>)})}</tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" />Zapotrzebowanie na pracowników</h3>
            <div className="flex items-end h-32 gap-0.5">
              {summerWeekly.map((w, i) => (<div key={`sw-${i}`} className="flex-1"><div className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t" style={{ height: `${(w.workers / peakWorkers) * 120}px`, minHeight: '4px' }} /></div>))}
              <div className="w-6 flex items-center justify-center text-xs text-gray-400">|</div>
              {autumnWeekly.map((w, i) => (<div key={`aw-${i}`} className="flex-1"><div className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t" style={{ height: `${(w.workers / peakWorkers) * 120}px`, minHeight: '4px' }} /></div>))}
            </div>
            <div className="flex mt-2 text-xs"><div className="flex-1 text-center text-orange-600">☀️ LATO</div><div className="w-6" /><div className="flex-1 text-center text-red-600">🍂 JESIEŃ</div></div>
            <div className="mt-4 text-center"><span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full font-medium">Maksymalnie: {peakWorkers} pracowników</span></div>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" />Produkcja wg sekcji</h3>
            <div className="space-y-2">
              {allSections.map(section => {
                const st = calcStats(section)
                const pct = ((st.fs + st.fa) / totalKg * 100).toFixed(1)
                return (
                  <div key={section.id} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium truncate">{section.name}</div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500" style={{ width: `${(st.fs / totalKg) * 100}%` }} />
                      <div className="h-full bg-gradient-to-r from-red-400 to-red-500" style={{ width: `${(st.fa / totalKg) * 100}%` }} />
                    </div>
                    <div className="w-28 text-right text-sm"><span className="font-medium">{((st.fs + st.fa) / 1000).toFixed(1)}t</span><span className="text-gray-400 ml-1">({pct}%)</span></div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Wykres porównawczy sekcji */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Layers className="w-5 h-5 text-purple-500" />Porównanie sekcji w czasie</h3>
              <div className="flex gap-2">
                <Button size="sm" variant={comparisonView === 'bars' ? 'default' : 'outline'} onClick={() => setComparisonView('bars')} className={comparisonView === 'bars' ? 'bg-purple-600 hover:bg-purple-700' : ''}>
                  <BarChart3 className="w-4 h-4 mr-1" />Słupki
                </Button>
                <Button size="sm" variant={comparisonView === 'area' ? 'default' : 'outline'} onClick={() => setComparisonView('area')} className={comparisonView === 'area' ? 'bg-purple-600 hover:bg-purple-700' : ''}>
                  <TrendingUp className="w-4 h-4 mr-1" />Area
                </Button>
                <Button size="sm" variant={comparisonView === 'heatmap' ? 'default' : 'outline'} onClick={() => setComparisonView('heatmap')} className={comparisonView === 'heatmap' ? 'bg-purple-600 hover:bg-purple-700' : ''}>
                  <Grid3X3 className="w-4 h-4 mr-1" />Heatmap
                </Button>
              </div>
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-3 mb-4">
              {allSections.map((section, idx) => {
                const colors = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
                return (
                  <div key={section.id} className="flex items-center gap-1 text-xs">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[idx % colors.length] }} />
                    <span>{section.name}</span>
                  </div>
                )
              })}
            </div>

            {comparisonView === 'bars' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LATO Stacked Bars */}
                <div>
                  <h4 className="text-sm font-medium text-orange-600 mb-3 flex items-center gap-1"><Sun className="w-4 h-4" />Sezon letni</h4>
                  <div className="flex items-end gap-1 h-48">
                    {summerComparison.weeks.map((week, wi) => {
                      const weekData = summerComparison.sectionData.map(s => s.data.find(d => d.week === week)?.kg || 0)
                      const totalWeekKg = weekData.reduce((a, b) => a + b, 0)
                      const maxWeekKg = Math.max(...summerComparison.weeks.map(w => summerComparison.sectionData.reduce((sum, s) => sum + (s.data.find(d => d.week === w)?.kg || 0), 0)))
                      const colors = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
                      return (
                        <div key={week} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
                          <div className="flex flex-col-reverse w-full" style={{ height: `${(totalWeekKg / maxWeekKg) * 100}%` }}>
                            {weekData.map((kg, si) => {
                              if (kg === 0) return null
                              const pct = (kg / totalWeekKg) * 100
                              return <div key={si} style={{ height: `${pct}%`, backgroundColor: colors[si % colors.length] }} className="w-full first:rounded-t" />
                            })}
                          </div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            T{week}: {(totalWeekKg/1000).toFixed(1)}t
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1 mt-1">{summerComparison.weeks.map(w => (<div key={w} className="flex-1 text-center text-xs text-gray-500">T{w}</div>))}</div>
                </div>

                {/* JESIEŃ Stacked Bars */}
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-1"><Leaf className="w-4 h-4" />Sezon jesienny</h4>
                  <div className="flex items-end gap-1 h-48">
                    {autumnComparison.weeks.map((week, wi) => {
                      const weekData = autumnComparison.sectionData.map(s => s.data.find(d => d.week === week)?.kg || 0)
                      const totalWeekKg = weekData.reduce((a, b) => a + b, 0)
                      const maxWeekKg = Math.max(...autumnComparison.weeks.map(w => autumnComparison.sectionData.reduce((sum, s) => sum + (s.data.find(d => d.week === w)?.kg || 0), 0)))
                      const colors = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
                      return (
                        <div key={week} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
                          <div className="flex flex-col-reverse w-full" style={{ height: `${(totalWeekKg / maxWeekKg) * 100}%` }}>
                            {weekData.map((kg, si) => {
                              if (kg === 0) return null
                              const pct = (kg / totalWeekKg) * 100
                              return <div key={si} style={{ height: `${pct}%`, backgroundColor: colors[si % colors.length] }} className="w-full first:rounded-t" />
                            })}
                          </div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            T{week}: {(totalWeekKg/1000).toFixed(1)}t
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1 mt-1">{autumnComparison.weeks.map(w => (<div key={w} className="flex-1 text-center text-xs text-gray-500">T{w}</div>))}</div>
                </div>
              </div>
            )}

            {comparisonView === 'area' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LATO Area Chart */}
                <div>
                  <h4 className="text-sm font-medium text-orange-600 mb-3 flex items-center gap-1"><Sun className="w-4 h-4" />Sezon letni</h4>
                  <div className="relative h-48 border-l border-b border-gray-200">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {summerComparison.sectionData.map((section, idx) => {
                        const maxKg = Math.max(...summerComparison.sectionData.flatMap(s => s.data.map(d => d.kg)))
                        const points = section.data.map((d, i) => {
                          const x = (i / (section.data.length - 1)) * 100
                          const y = 100 - (d.kg / maxKg) * 90
                          return `${x},${y}`
                        }).join(' ')
                        const areaPoints = `0,100 ${points} 100,100`
                        return (
                          <g key={section.name}>
                            <polygon points={areaPoints} fill={section.color} fillOpacity="0.3" />
                            <polyline points={points} fill="none" stroke={section.color} strokeWidth="2" />
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>T{summerComparison.weeks[0]}</span>
                    <span>T{summerComparison.weeks[summerComparison.weeks.length - 1]}</span>
                  </div>
                </div>

                {/* JESIEŃ Area Chart */}
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-1"><Leaf className="w-4 h-4" />Sezon jesienny</h4>
                  <div className="relative h-48 border-l border-b border-gray-200">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {autumnComparison.sectionData.map((section, idx) => {
                        const maxKg = Math.max(...autumnComparison.sectionData.flatMap(s => s.data.map(d => d.kg)))
                        const points = section.data.map((d, i) => {
                          const x = (i / (section.data.length - 1)) * 100
                          const y = 100 - (d.kg / maxKg) * 90
                          return `${x},${y}`
                        }).join(' ')
                        const areaPoints = `0,100 ${points} 100,100`
                        return (
                          <g key={section.name}>
                            <polygon points={areaPoints} fill={section.color} fillOpacity="0.3" />
                            <polyline points={points} fill="none" stroke={section.color} strokeWidth="2" />
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>T{autumnComparison.weeks[0]}</span>
                    <span>T{autumnComparison.weeks[autumnComparison.weeks.length - 1]}</span>
                  </div>
                </div>
              </div>
            )}

            {comparisonView === 'heatmap' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LATO Heatmap */}
                <div>
                  <h4 className="text-sm font-medium text-orange-600 mb-3 flex items-center gap-1"><Sun className="w-4 h-4" />Sezon letni</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-1 px-1 font-medium text-gray-500">Sekcja</th>
                          {summerComparison.weeks.map(w => (
                            <th key={w} className="py-1 px-1 font-medium text-gray-500">T{w}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summerComparison.sectionData.map(section => {
                          const maxKg = Math.max(...summerComparison.sectionData.flatMap(s => s.data.map(d => d.kg)))
                          return (
                            <tr key={section.name}>
                              <td className="py-1 px-1 font-medium truncate max-w-20">{section.name}</td>
                              {section.data.map(d => {
                                const intensity = d.kg / maxKg
                                const bg = intensity > 0.8 ? 'bg-orange-600' : intensity > 0.6 ? 'bg-orange-500' : intensity > 0.4 ? 'bg-orange-400' : intensity > 0.2 ? 'bg-orange-300' : intensity > 0 ? 'bg-orange-200' : 'bg-gray-100'
                                return (
                                  <td key={d.week} className="py-1 px-1">
                                    <div className={`${bg} rounded text-center text-white text-[10px] py-1 min-w-8`} title={`${d.kg.toLocaleString('pl-PL')} kg`}>
                                      {d.kg > 0 ? (d.kg / 1000).toFixed(1) : '-'}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* JESIEŃ Heatmap */}
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-1"><Leaf className="w-4 h-4" />Sezon jesienny</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-1 px-1 font-medium text-gray-500">Sekcja</th>
                          {autumnComparison.weeks.map(w => (
                            <th key={w} className="py-1 px-1 font-medium text-gray-500">T{w}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {autumnComparison.sectionData.map(section => {
                          const maxKg = Math.max(...autumnComparison.sectionData.flatMap(s => s.data.map(d => d.kg)))
                          return (
                            <tr key={section.name}>
                              <td className="py-1 px-1 font-medium truncate max-w-20">{section.name}</td>
                              {section.data.map(d => {
                                const intensity = d.kg / maxKg
                                const bg = intensity > 0.8 ? 'bg-red-600' : intensity > 0.6 ? 'bg-red-500' : intensity > 0.4 ? 'bg-red-400' : intensity > 0.2 ? 'bg-red-300' : intensity > 0 ? 'bg-red-200' : 'bg-gray-100'
                                return (
                                  <td key={d.week} className="py-1 px-1">
                                    <div className={`${bg} rounded text-center text-white text-[10px] py-1 min-w-8`} title={`${d.kg.toLocaleString('pl-PL')} kg`}>
                                      {d.kg > 0 ? (d.kg / 1000).toFixed(1) : '-'}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === 'section' && selectedSectionData && selectedStats && (
        <>
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-xl font-bold">{selectedSectionData.name}</h2><p className="text-gray-500">{selectedSectionData.variety?.name} • {selectedSectionData.metersLength}m • Rok {selectedSectionData.productionYear}</p></div>
              <div className="text-right"><p className="text-3xl font-bold text-green-600">{((selectedStats.fs + selectedStats.fa) / 1000).toFixed(2)}t</p><p className="text-sm text-gray-500">prognoza</p></div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{selectedStats.pots.toLocaleString('pl-PL')}</p><p className="text-xs text-gray-500">Doniczek</p></div>
            <div className="bg-white rounded-xl p-4 border text-center"><p className="text-2xl font-bold">{selectedStats.shoots.toLocaleString('pl-PL')}</p><p className="text-xs text-gray-500">Pędów</p></div>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center"><p className="text-2xl font-bold text-orange-600">{selectedStats.fs.toLocaleString('pl-PL')}</p><p className="text-xs text-orange-600">kg Lato</p></div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center"><p className="text-2xl font-bold text-red-600">{selectedStats.fa.toLocaleString('pl-PL')}</p><p className="text-xs text-red-600">kg Jesień</p></div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center"><p className="text-2xl font-bold text-blue-600">{selectedStats.eff}</p><p className="text-xs text-blue-600">kg/h wydajność</p></div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center"><p className="text-2xl font-bold text-purple-600">{Math.max(...selectedSummerWeekly.map(w => w.workers), ...selectedAutumnWeekly.map(w => w.workers))}</p><p className="text-xs text-purple-600">Pracowników max</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Sun className="w-5 h-5 text-orange-500" />Sezon letni</h3>
              <div className="flex items-end gap-1 h-40 mb-4">
                {selectedSummerWeekly.map((w, i) => {
                  const max = Math.max(...selectedSummerWeekly.map(x => x.kg))
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                      <div className="w-full bg-gradient-to-t from-orange-500 to-amber-400 rounded-t hover:opacity-80 cursor-pointer" style={{ height: `${(w.kg / max) * 140}px`, minHeight: '8px' }} />
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">T{w.week} ({w.dates.label})<br/>{w.kg.toLocaleString('pl-PL')} kg • {w.workers} os.</div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1 mb-4">{selectedSummerWeekly.map((w, i) => (<div key={i} className="flex-1 text-center text-xs text-gray-500"><div>T{w.week}</div><div className="text-[10px] text-gray-400">{w.dates.start}</div></div>))}</div>
              <table className="w-full text-sm"><tbody>{selectedSummerWeekly.map(w => (<tr key={w.week} className="border-t"><td className="py-1">T{w.week} <span className="text-gray-400 text-xs">({w.dates.label})</span></td><td className="text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td><td className="text-right">{w.workers} os.</td><td className="text-right text-gray-500">{w.hrs}h</td></tr>))}</tbody></table>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Leaf className="w-5 h-5 text-red-500" />Sezon jesienny</h3>
              <div className="flex items-end gap-1 h-40 mb-4">
                {selectedAutumnWeekly.map((w, i) => {
                  const max = Math.max(...selectedAutumnWeekly.map(x => x.kg))
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                      <div className="w-full bg-gradient-to-t from-red-500 to-orange-400 rounded-t hover:opacity-80 cursor-pointer" style={{ height: `${(w.kg / max) * 140}px`, minHeight: '8px' }} />
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">T{w.week} ({w.dates.label})<br/>{w.kg.toLocaleString('pl-PL')} kg • {w.workers} os.</div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1 mb-4">{selectedAutumnWeekly.map((w, i) => (<div key={i} className="flex-1 text-center text-xs text-gray-500"><div>T{w.week}</div><div className="text-[10px] text-gray-400">{w.dates.start}</div></div>))}</div>
              <table className="w-full text-sm"><tbody>{selectedAutumnWeekly.map(w => (<tr key={w.week} className="border-t"><td className="py-1">T{w.week} <span className="text-gray-400 text-xs">({w.dates.label})</span></td><td className="text-right font-medium">{w.kg.toLocaleString('pl-PL')} kg</td><td className="text-right">{w.workers} os.</td><td className="text-right text-gray-500">{w.hrs}h</td></tr>))}</tbody></table>
            </div>
          </div>
        </>
      )}

      {viewMode === 'section' && !selectedSectionData && (
        <div className="bg-gray-50 rounded-xl p-12 text-center"><Target className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Wybierz sekcję z listy powyżej</p></div>
      )}
    </div>
  )
}
