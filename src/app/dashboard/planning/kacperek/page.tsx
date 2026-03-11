'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileDown, Sun, Leaf, Printer, ChevronDown, ChevronUp } from 'lucide-react'

interface Variety { id: string; name: string; pickingEfficiency?: number; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number }
interface Section {
  id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number
  potsOverride?: number | null
  yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; varietyId: string; variety?: Variety
  harvestCurveSummer: number[]; harvestCurveAutumn: number[]
  winteredInTunnel?: boolean; plantingDate?: string
  gdhSummer?: number; gdhAutumn?: number
}
interface Block { id: string; name: string; sections: Section[] }
interface HarvestCurveRecord { id: string; year: number; season: string; curve: number[]; dailyCurve: number[]; startDate?: string; totalKg: number; startWeek: number; sectionId?: string; varietyId?: string }
interface DayRow { date: string; dayName: string; week: number; kg: number; delivered: number; season: 'summer' | 'autumn' }

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']

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

const getDeviation = (planned: number, delivered: number) => {
  if (delivered === 0 || planned === 0) return null
  return ((delivered - planned) / planned) * 100
}

const getDeviationEmoji = (dev: number | null) => {
  if (dev === null) return ''
  const abs = Math.abs(dev)
  if (abs <= 15) return '😊'
  if (abs <= 30) return '😐'
  return '🤬'
}

const getDeviationColor = (dev: number | null) => {
  if (dev === null) return ''
  const abs = Math.abs(dev)
  if (abs <= 15) return 'text-green-600 bg-green-50'
  if (abs <= 30) return 'text-orange-600 bg-orange-50'
  return 'text-red-600 bg-red-50'
}

export default function KacperekReport() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [savedCurves, setSavedCurves] = useState<HarvestCurveRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [dailyData, setDailyData] = useState<DayRow[]>([])
  const [weeklyData, setWeeklyData] = useState<{ week: number; dates: string; kg: number; delivered: number; season: 'summer' | 'autumn' }[]>([])
  const [, setExpandedWeeksChart] = useState<Set<number>>(new Set())
  const [, setExpandedWeeksDaily] = useState<Set<number>>(new Set())
  const [weeklyRangeEnd, setWeeklyRangeEnd] = useState(99)
  const [dailyRangeEnd, setDailyRangeEnd] = useState(99)
  const reportRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => new Date(), [])
  const year = today.getFullYear()
  const reportDate = today.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  const currentWeek = getWeekNumber(today)

  const fetchData = async () => {
    try {
      const [pRes, vRes, cRes] = await Promise.all([
        fetch('/api/plantation'), fetch('/api/varieties'), fetch('/api/harvest-curves'),
      ])
      const pData = await pRes.json(); const vData = await vRes.json(); const cData = await cRes.json()
      setBlocks(pData.blocks || []); setVarieties(vData.varieties || []); setSavedCurves(cData.curves || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const generateReport = useCallback(() => {
    const allSections = blocks.flatMap(b => b.sections.map(s => ({ ...s, blockName: b.name })))
    const weeklyMap: Record<number, { kg: number; summerKg: number; autumnKg: number }> = {}

    allSections.forEach(section => {
      const v = varieties.find(x => x.id === section.varietyId)
      const pots = (section.potsOverride != null && section.potsOverride > 0) ? section.potsOverride : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const sectionCurves = savedCurves.filter(c => c.sectionId === section.id)
      const summerCurve = sectionCurves.find(c => c.season === 'summer')
      const autumnCurve = sectionCurves.find(c => c.season === 'autumn')

      const summerYield = section.yieldSummerPerShoot || (v as Variety)?.yieldSummerPerShoot || 0
      const totalSummer = shoots * summerYield
      if (summerCurve && summerCurve.curve.length > 0) {
        summerCurve.curve.forEach((pct, i) => { const wk = summerCurve.startWeek + i; if (!weeklyMap[wk]) weeklyMap[wk] = { kg: 0, summerKg: 0, autumnKg: 0 }; weeklyMap[wk].kg += (pct / 100) * totalSummer; weeklyMap[wk].summerKg += (pct / 100) * totalSummer })
      } else if (section.harvestCurveSummer?.length > 0) {
        section.harvestCurveSummer.forEach((pct, i) => { const wk = 22 + i; if (!weeklyMap[wk]) weeklyMap[wk] = { kg: 0, summerKg: 0, autumnKg: 0 }; weeklyMap[wk].kg += (pct / 100) * totalSummer; weeklyMap[wk].summerKg += (pct / 100) * totalSummer })
      }

      const autumnYield = section.yieldAutumnPerShoot || (v as Variety)?.yieldAutumnPerShoot || 0
      const totalAutumn = shoots * autumnYield
      if (autumnCurve && autumnCurve.curve.length > 0) {
        autumnCurve.curve.forEach((pct, i) => { const wk = autumnCurve.startWeek + i; if (!weeklyMap[wk]) weeklyMap[wk] = { kg: 0, summerKg: 0, autumnKg: 0 }; weeklyMap[wk].kg += (pct / 100) * totalAutumn; weeklyMap[wk].autumnKg += (pct / 100) * totalAutumn })
      } else if (section.harvestCurveAutumn?.length > 0) {
        section.harvestCurveAutumn.forEach((pct, i) => { const wk = 33 + i; if (!weeklyMap[wk]) weeklyMap[wk] = { kg: 0, summerKg: 0, autumnKg: 0 }; weeklyMap[wk].kg += (pct / 100) * totalAutumn; weeklyMap[wk].autumnKg += (pct / 100) * totalAutumn })
      }
    })

    const weekly = Object.entries(weeklyMap).sort(([a], [b]) => Number(a) - Number(b)).filter(([wk]) => Number(wk) >= currentWeek).map(([wk, data]) => ({
      week: Number(wk), dates: getWeekDates(Number(wk), year), kg: Math.round(data.kg), delivered: 0,
      season: data.summerKg >= data.autumnKg ? 'summer' as const : 'autumn' as const,
    }))
    setWeeklyData(weekly)

    // Init: first 4 weeks expanded
    const first4 = new Set(weekly.slice(0, 4).map(w => w.week))
    setExpandedWeeksChart(new Set(weekly.map(w => w.week)))
    setExpandedWeeksDaily(first4)
    setWeeklyRangeEnd(weekly.length)
    setDailyRangeEnd(4)

    // Build daily data from dailyCurves if available
    const dailyFromCurves: Record<string, { kg: number; season: 'summer' | 'autumn' }> = {}
    const allSections2 = blocks.flatMap(b => b.sections.map(s => ({ ...s, blockName: b.name })))

    allSections2.forEach(section => {
      const v = varieties.find(x => x.id === section.varietyId)
      const pots = (section.potsOverride != null && section.potsOverride > 0) ? section.potsOverride : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const sectionCurves = savedCurves.filter(c => c.sectionId === section.id)

      sectionCurves.forEach(curve => {
        if (curve.dailyCurve && curve.dailyCurve.length > 0 && curve.startDate) {
          // Use actual daily data - scale from historical to projected
          const yieldPerShoot = curve.season === 'summer'
            ? (section.yieldSummerPerShoot || (v as Variety)?.yieldSummerPerShoot || 0)
            : (section.yieldAutumnPerShoot || (v as Variety)?.yieldAutumnPerShoot || 0)
          const projectedTotal = shoots * yieldPerShoot
          const historicalTotal = curve.dailyCurve.reduce((s, kg) => s + kg, 0)
          const scale = historicalTotal > 0 ? projectedTotal / historicalTotal : 0

          const start = new Date(curve.startDate)
          // Shift to current year
          const startThisYear = new Date(year, start.getMonth(), start.getDate())

          curve.dailyCurve.forEach((dayKg, i) => {
            const d = new Date(startThisYear)
            d.setDate(d.getDate() + i)
            const key = d.toISOString().split('T')[0]
            if (!dailyFromCurves[key]) dailyFromCurves[key] = { kg: 0, season: curve.season as 'summer' | 'autumn' }
            dailyFromCurves[key].kg += dayKg * scale
            if (curve.season === 'autumn') dailyFromCurves[key].season = 'autumn'
          })
        }
      })
    })

    const hasDailyCurves = Object.keys(dailyFromCurves).length > 0
    const days: DayRow[] = []

    if (hasDailyCurves) {
      // Use precise daily data
      Object.entries(dailyFromCurves)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([dateStr, data]) => {
          const d = new Date(dateStr)
          if (d < today) return
          const wk = getWeekNumber(d)
          days.push({
            date: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            dayName: DAY_NAMES[d.getDay()],
            week: wk,
            kg: Math.round(data.kg),
            delivered: 0,
            season: data.season,
          })
        })
    } else {
      // Fallback: divide weekly by 6
      weekly.forEach(w => {
        const jan1 = new Date(year, 0, 1); const daysToMonday = (jan1.getDay() + 6) % 7
        const monday = new Date(year, 0, 1 - daysToMonday + (w.week - 1) * 7)
        const dailyKg = Math.round(w.kg / 6)
        for (let d = 0; d < 7; d++) {
          const date = new Date(monday); date.setDate(monday.getDate() + d)
          if (date < today) continue
          const isSunday = date.getDay() === 0
          days.push({ date: date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }), dayName: DAY_NAMES[date.getDay()], week: w.week, kg: isSunday ? 0 : dailyKg, delivered: 0, season: w.season })
        }
      })
    }
    setDailyData(days)
  }, [blocks, varieties, savedCurves, currentWeek, year, today])

  useEffect(() => { fetchData() }, [])

  useEffect(() => { if (blocks.length > 0) generateReport() }, [blocks, savedCurves, varieties, generateReport])

  const updateDailyKg = (idx: number, value: number) => { setDailyData(prev => prev.map((d, i) => i === idx ? { ...d, kg: value } : d)) }
  const updateDailyDelivered = (idx: number, value: number) => { setDailyData(prev => prev.map((d, i) => i === idx ? { ...d, delivered: value } : d)) }
  
  const showMoreWeekly = () => setWeeklyRangeEnd(prev => Math.min(prev + 4, weeklyData.length))
  const showLessWeekly = () => setWeeklyRangeEnd(prev => Math.max(prev - 4, 1))
  const showMoreDaily = () => {
    const nextWeeks = weeklyData.slice(dailyRangeEnd, dailyRangeEnd + 2).map(w => w.week)
    setExpandedWeeksDaily(prev => { const n = new Set(prev); nextWeeks.forEach(w => n.add(w)); return n })
    setDailyRangeEnd(prev => Math.min(prev + 2, weeklyData.length))
  }
  const showLessDaily = () => {
    setDailyRangeEnd(prev => Math.max(prev - 2, 1))
    const removeWeeks = weeklyData.slice(Math.max(dailyRangeEnd - 2, 1), dailyRangeEnd).map(w => w.week)
    setExpandedWeeksDaily(prev => { const n = new Set(prev); removeWeeks.forEach(w => n.delete(w)); return n })
  }

  const totalKg = weeklyData.reduce((s, w) => s + w.kg, 0)
  const totalDelivered = weeklyData.reduce((s, w) => s + w.delivered, 0)
  const maxWeekKg = Math.max(...weeklyData.map(w => w.kg), 1)
  const visibleWeekly = weeklyData.slice(0, weeklyRangeEnd)
  const visibleDailyWeeks = weeklyData.slice(0, dailyRangeEnd).map(w => w.week)
  const visibleDaily = dailyData.filter(d => visibleDailyWeeks.includes(d.week))

  const handlePrint = () => { window.print() }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie raportu...</div>

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6 print:hidden">
        <a href="/dashboard/planning"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Powrót do planowania</Button></a>
        <div className="ml-auto flex gap-2"><Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Drukuj / PDF</Button></div>
      </div>

      <div ref={reportRef} id="report-content" className="bg-white rounded-2xl border shadow-lg overflow-hidden print:shadow-none print:border-none">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-pink-500 text-white p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium opacity-80 tracking-widest uppercase">GR Lipczyński — Wyszynki</h2>
              <h1 className="text-4xl font-black mt-2">🍓 RAPORT DLA KACPERKA 🍓</h1>
              <p className="text-lg mt-2 opacity-90">Stan na dzień: <strong>{reportDate}</strong></p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-black">{(totalKg / 1000).toFixed(1)}t</div>
              <div className="text-sm opacity-80 mt-1">prognoza od T{currentWeek}</div>
              {totalDelivered > 0 && <div className="text-lg mt-1">dostarczone: <strong>{(totalDelivered / 1000).toFixed(1)}t</strong></div>}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50">
          <div className="bg-white rounded-xl p-4 border text-center"><div className="text-3xl font-black text-green-600">{(totalKg / 1000).toFixed(1)}t</div><div className="text-xs text-gray-500 mt-1">Razem prognoza</div></div>
          <div className="bg-white rounded-xl p-4 border text-center"><div className="text-3xl font-black text-orange-500">{(weeklyData.filter(w => w.season === 'summer').reduce((s, w) => s + w.kg, 0) / 1000).toFixed(1)}t</div><div className="text-xs text-orange-600 mt-1">☀️ Lato</div></div>
          <div className="bg-white rounded-xl p-4 border text-center"><div className="text-3xl font-black text-red-500">{(weeklyData.filter(w => w.season === 'autumn').reduce((s, w) => s + w.kg, 0) / 1000).toFixed(1)}t</div><div className="text-xs text-red-600 mt-1">🍂 Jesień</div></div>
          <div className="bg-white rounded-xl p-4 border text-center"><div className="text-3xl font-black text-blue-600">{weeklyData.length}</div><div className="text-xs text-blue-600 mt-1">Tygodni zbioru</div></div>
        </div>

        {/* Legenda zgodności */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="font-medium">Zgodność:</span>
            <span>😊 ±15%</span>
            <span>😐 ±15-30%</span>
            <span>🤬 &gt;30%</span>
          </div>
        </div>

        {/* Weekly chart + table */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">📊 Prognoza tygodniowa</h2>
            <div className="flex gap-2 print:hidden">
              {weeklyRangeEnd > 4 && <Button size="sm" variant="outline" onClick={showLessWeekly}><ChevronUp className="w-4 h-4 mr-1" />Mniej</Button>}
              {weeklyRangeEnd < weeklyData.length && <Button size="sm" variant="outline" onClick={showMoreWeekly}><ChevronDown className="w-4 h-4 mr-1" />Więcej ({weeklyData.length - weeklyRangeEnd})</Button>}
            </div>
          </div>

          {/* Chart */}
          <div style={{ height: '220px' }} className="flex items-end gap-1 mb-2">
            {visibleWeekly.map((w, i) => {
              const heightPx = Math.round((w.kg / maxWeekKg) * 200)
              const color = w.season === 'summer' ? 'bg-gradient-to-t from-orange-500 to-amber-400' : 'bg-gradient-to-t from-red-500 to-orange-400'
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ height: '100%' }}>
                  <div className={`w-full rounded-t ${color}`} style={{ height: heightPx + 'px', minHeight: '4px' }} />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    T{w.week} ({w.dates}): {w.kg.toLocaleString('pl-PL')} kg
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-1 mb-4">{visibleWeekly.map((w, i) => (<div key={i} className="flex-1 text-center"><div className="text-xs font-medium text-gray-600">T{w.week}</div></div>))}</div>

          {/* Weekly table */}
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 bg-gray-50">
              <th className="text-left py-2 px-3">Tydzień</th>
              <th className="text-left py-2 px-3">Daty</th>
              <th className="text-center py-2 px-3">Sezon</th>
              <th className="text-right py-2 px-3">Plan kg</th>
              <th className="text-right py-2 px-3">Σ tony</th>
              <th className="text-right py-2 px-3">Dostarczone</th>
              <th className="text-right py-2 px-3">Σ dost.</th>
              <th className="text-center py-2 px-3 w-24">Zgodność</th>
            </tr></thead>
            <tbody>
              {visibleWeekly.map((w, i) => {
                const weekDays = dailyData.filter(d => d.week === w.week)
                const weekDelivered = weekDays.reduce((s, d) => s + d.delivered, 0)
                const cumKg = visibleWeekly.slice(0, i + 1).reduce((s, x) => s + x.kg, 0)
                const cumDelivered = visibleWeekly.slice(0, i + 1).reduce((s, x) => s + dailyData.filter(d => d.week === x.week).reduce((ss, d) => ss + d.delivered, 0), 0)
                const dev = getDeviation(w.kg, weekDelivered)
                return (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-bold">T{w.week}</td>
                    <td className="py-2 px-3 text-gray-500">{w.dates}</td>
                    <td className="py-2 px-3 text-center">
                      {w.season === 'summer' && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs"><Sun className="w-3 h-3 inline" /> Lato</span>}
                      {w.season === 'autumn' && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs"><Leaf className="w-3 h-3 inline" /> Jesień</span>}
                      
                    </td>
                    <td className="py-2 px-3 text-right font-medium">{w.kg.toLocaleString('pl-PL')}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{(cumKg / 1000).toFixed(2)}t</td>
                    <td className="py-2 px-3 text-right">{weekDelivered > 0 ? weekDelivered.toLocaleString('pl-PL') : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{cumDelivered > 0 ? (cumDelivered / 1000).toFixed(2) + 't' : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2 px-3 text-center">
                      {dev !== null ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getDeviationColor(dev)}`}>
                          <span className="text-lg">{getDeviationEmoji(dev)}</span>
                          {dev > 0 ? '+' : ''}{dev.toFixed(0)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-gray-100 font-bold border-t-2">
                <td className="py-2 px-3" colSpan={3}>RAZEM</td>
                <td className="py-2 px-3 text-right">{visibleWeekly.reduce((s, w) => s + w.kg, 0).toLocaleString('pl-PL')}</td>
                <td className="py-2 px-3 text-right">{(visibleWeekly.reduce((s, w) => s + w.kg, 0) / 1000).toFixed(2)}t</td>
                {(() => {
                  const allDel = dailyData.filter(d => visibleWeekly.some(w => w.week === d.week)).reduce((s, d) => s + d.delivered, 0)
                  const allPlan = visibleWeekly.reduce((s, w) => s + w.kg, 0)
                  const dev = getDeviation(allPlan, allDel)
                  return <>
                    <td className="py-2 px-3 text-right">{allDel > 0 ? allDel.toLocaleString('pl-PL') : '—'}</td>
                    <td className="py-2 px-3 text-right">{allDel > 0 ? (allDel / 1000).toFixed(2) + 't' : '—'}</td>
                    <td className="py-2 px-3 text-center">
                      {dev !== null ? <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ' + getDeviationColor(dev)}><span className="text-lg">{getDeviationEmoji(dev)}</span>{dev > 0 ? '+' : ''}{dev.toFixed(0)}%</span> : '—'}
                    </td>
                  </>
                })()}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Daily breakdown */}
        <div className="p-6 border-t">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">📅 Rozbicie dzienne <span className="text-sm font-normal text-gray-400">(kliknij aby skorygować)</span></h2>
            <div className="flex gap-2 print:hidden">
              {dailyRangeEnd > 2 && <Button size="sm" variant="outline" onClick={showLessDaily}><ChevronUp className="w-4 h-4 mr-1" />Mniej</Button>}
              {dailyRangeEnd < weeklyData.length && <Button size="sm" variant="outline" onClick={showMoreDaily}><ChevronDown className="w-4 h-4 mr-1" />Więcej ({weeklyData.length - dailyRangeEnd} tyg.)</Button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b-2 bg-gray-50">
                <th className="text-left py-2 px-3 w-12">Tyg.</th>
                <th className="text-left py-2 px-3">Data</th>
                <th className="text-left py-2 px-3 w-10">Dzień</th>
                <th className="text-right py-2 px-3">Plan kg</th>
                <th className="text-right py-2 px-3">Dostarczone</th>
                <th className="text-center py-2 px-3 w-24">Zgodność</th>
              </tr></thead>
              <tbody>
                {visibleDaily.map((d, i) => {
                  const globalIdx = dailyData.indexOf(d)
                  const prevWeek = i > 0 ? visibleDaily[i - 1].week : null
                  const isNewWeek = d.week !== prevWeek
                  const dev = getDeviation(d.kg, d.delivered)
                  return (
                    <tr key={globalIdx} className={`border-b hover:bg-gray-50 ${isNewWeek && i > 0 ? 'border-t-2 border-t-gray-300' : ''} ${d.dayName === 'Nd' ? 'bg-gray-50 text-gray-400' : ''}`}>
                      <td className="py-1.5 px-3 text-gray-400 text-xs">{isNewWeek ? `T${d.week}` : ''}</td>
                      <td className="py-1.5 px-3">{d.date}</td>
                      <td className="py-1.5 px-3 font-medium">{d.dayName}</td>
                      <td className="py-1.5 px-3 text-right">
                        {d.dayName === 'Nd' ? <span className="text-gray-300">—</span> : (
                          <input type="number" value={d.kg} onChange={e => updateDailyKg(globalIdx, parseInt(e.target.value) || 0)} className="w-20 text-right border rounded px-2 py-0.5 text-sm font-medium print:border-none print:bg-transparent" />
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {d.dayName === 'Nd' ? <span className="text-gray-300">—</span> : (
                          <input type="number" value={d.delivered || ''} placeholder="—" onChange={e => updateDailyDelivered(globalIdx, parseInt(e.target.value) || 0)} className="w-20 text-right border rounded px-2 py-0.5 text-sm print:border-none print:bg-transparent" />
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {d.dayName === 'Nd' ? '' : dev !== null ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getDeviationColor(dev)}`}>
                            <span className="text-base">{getDeviationEmoji(dev)}</span>
                            {dev > 0 ? '+' : ''}{dev.toFixed(0)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold border-t-2">
                  <td className="py-2 px-3" colSpan={3}>RAZEM (dzienne)</td>
                  <td className="py-2 px-3 text-right">{visibleDaily.reduce((s, d) => s + d.kg, 0).toLocaleString('pl-PL')} kg</td>
                  <td className="py-2 px-3 text-right">{visibleDaily.reduce((s, d) => s + d.delivered, 0) > 0 ? visibleDaily.reduce((s, d) => s + d.delivered, 0).toLocaleString('pl-PL') + ' kg' : '—'}</td>
                  <td className="py-2 px-3 text-center">
                    {(() => {
                      const totalDel = visibleDaily.reduce((s, d) => s + d.delivered, 0)
                      const totalPlan = visibleDaily.reduce((s, d) => s + d.kg, 0)
                      const dev = getDeviation(totalPlan, totalDel)
                      if (dev === null) return '—'
                      return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getDeviationColor(dev)}`}><span className="text-lg">{getDeviationEmoji(dev)}</span>{dev > 0 ? '+' : ''}{dev.toFixed(0)}%</span>
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 text-center text-sm text-gray-400 border-t">
          <p>GR Lipczyński — Gospodarstwo Malinowe Wyszynki • Wygenerowano: {new Date().toLocaleString('pl-PL')}</p>
          <p className="mt-1">🍓 Raport przygotowany specjalnie dla Kacperka z miłością 🍓</p>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex justify-center gap-4 mt-8 mb-12 print:hidden">
        <Button size="lg" className="bg-red-600 hover:bg-red-700 text-lg px-8 py-6" onClick={handlePrint}><FileDown className="w-5 h-5 mr-2" />Generuj PDF / Drukuj</Button>
        <a href="/dashboard/planning"><Button size="lg" variant="outline" className="text-lg px-8 py-6"><ArrowLeft className="w-5 h-5 mr-2" />Powrót</Button></a>
      </div>

      <style jsx global>{`
        @media print {
          body > *:not(#report-content) { }
          .print\\:hidden { display: none !important; }
          input[type="number"] { border: none !important; background: transparent !important; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </div>
  )
}
