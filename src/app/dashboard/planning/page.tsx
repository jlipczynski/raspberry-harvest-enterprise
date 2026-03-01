'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Users, AlertTriangle, BarChart3, Target, Loader2, FileDown, Printer } from 'lucide-react'

// ==================== TYPES ====================
interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyId: string
  varietyName: string
  winteredInTunnel: boolean
  plantMaterialType: string | null
  gdhStartDate: string | null
  flowerThreshold: number | null
  fruitThreshold: number | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay { date: string; gdhTunnel: number }

interface GdhApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best?: ForecastDay[] }
    seasonalAnomaly?: { months: Array<{ month: string; anomaly: number }>; avgAnomaly: number; verdict: string } | null
    lastForecastDate: string
    historicalYears: number
  } | null
}

interface PlantationSection {
  id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number
  yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; varietyId: string
  variety?: { id: string; name: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; harvestCurveSummer?: number[]; harvestCurveAutumn?: number[]; pickingEfficiency?: number; wastePercent?: number; secondCategoryPercent?: number }
}
interface Block { id: string; name: string; sections: PlantationSection[] }

const ALL_SCENARIOS = ['p90', 'p50', 'p10', 'best'] as const
type Scenario = typeof ALL_SCENARIOS[number]
const SCENARIO_LABELS: Record<Scenario, string> = { p90: 'P90 — ciepły rok', p50: 'P50 — typowy rok', p10: 'P10 — zimny rok', best: 'ECMWF' }
const SCENARIO_SHORT: Record<Scenario, string> = { p90: 'P90', p50: 'P50', p10: 'P10', best: 'ECMWF' }
const defaultCurve = [5, 10, 15, 20, 20, 15, 10, 5]

// ==================== HELPERS ====================
const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

const getWeekDates = (weekNum: number, year: number = new Date().getFullYear()) => {
  const jan1 = new Date(year, 0, 1)
  const daysToMonday = (jan1.getDay() + 6) % 7
  const monday = new Date(year, 0, 1 - daysToMonday + (weekNum - 1) * 7)
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`
  return `${fmt(monday)}-${fmt(sunday)}`
}

// ==================== COMPONENT ====================
export default function PlanningPage() {
  const [gdhData, setGdhData] = useState<GdhApiResponse | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [scenario, setScenario] = useState<Scenario>('p50')
  const [hoursPerWeek, setHoursPerWeek] = useState(48)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/gdh').then(r => r.json()),
      fetch('/api/plantation').then(r => r.json()),
    ]).then(([gdh, plantation]) => {
      setGdhData(gdh)
      setBlocks(plantation.blocks || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const allPlantationSections = useMemo(() =>
    blocks.flatMap(b => b.sections.map(s => ({ ...s, blockName: b.name }))),
    [blocks]
  )

  // ==================== CORE: fruit start date per section from GDH ====================
  const sectionFruitDates = useMemo(() => {
    if (!gdhData?.sections?.length || !gdhData.forecast) return new Map<string, string | null>()

    const forecast = gdhData.forecast
    const toKey = (d: string | Date) => typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)

    const result = new Map<string, string | null>()

    for (const section of gdhData.sections) {
      if (!section.fruitThreshold) { result.set(section.id, null); continue }

      // Build cumulative GDH timeline: real + meteo + scenario
      const dailyGdh = new Map<string, number>()
      const gdhStartDate = section.gdhStartDate || ''

      let lastRealGdh = 0
      let lastRealDate = ''
      for (const d of section.dailyGdh) {
        const key = toKey(d.date)
        dailyGdh.set(key, d.cumulativeGdh)
        lastRealGdh = d.cumulativeGdh
        lastRealDate = key
      }

      let cumGdh = lastRealGdh
      for (const day of forecast.meteoDays) {
        if (day.date <= lastRealDate) continue
        if (gdhStartDate && day.date < gdhStartDate) continue
        cumGdh += day.gdhTunnel
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      const scenarioData = scenario === 'best'
        ? (forecast.scenarios.best || forecast.scenarios.p50)
        : forecast.scenarios[scenario]

      for (const day of scenarioData) {
        if (gdhStartDate && day.date < gdhStartDate) continue
        cumGdh += day.gdhTunnel
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      // Find date when fruitThreshold is reached
      const entries = [...dailyGdh.entries()].sort(([a], [b]) => a.localeCompare(b))
      let fruitDate: string | null = null
      for (const [date, gdh] of entries) {
        if (gdh >= section.fruitThreshold) { fruitDate = date; break }
      }

      result.set(section.id, fruitDate)
    }

    return result
  }, [gdhData, scenario])

  // ==================== WEEKLY AGGREGATION ====================
  const weeklyPlan = useMemo(() => {
    if (!allPlantationSections.length) return { weeks: [], sectionDetails: [] }

    const year = new Date().getFullYear()
    const weekMap: Record<number, { kg: number; hrs: number; sections: string[] }> = {}
    const sectionDetails: Array<{
      section: PlantationSection & { blockName: string }
      fruitStartDate: string | null
      startWeek: number | null
      totalKg: number
      weeklyKg: Array<{ week: number; kg: number }>
      eff: number
    }> = []

    for (const section of allPlantationSections) {
      const v = section.variety
      const fruitDate = sectionFruitDates.get(section.id)

      if (!fruitDate) continue // no fruit date prediction → skip

      const startWeek = getWeekNumber(new Date(fruitDate))

      // Production calc
      const shoots = section.metersLength * section.potsPerMeter * section.shootsPerPot
      const isSummer = startWeek < 30
      const yieldPerShoot = isSummer
        ? (section.yieldSummerPerShoot || v?.yieldSummerPerShoot || 0)
        : (section.yieldAutumnPerShoot || v?.yieldAutumnPerShoot || 0)
      const totalKg = shoots * yieldPerShoot
      const curve = isSummer
        ? (v?.harvestCurveSummer as number[] || defaultCurve)
        : (v?.harvestCurveAutumn as number[] || defaultCurve)
      const eff = v?.pickingEfficiency || 6 // kg/h

      const weeklyKg: Array<{ week: number; kg: number }> = []

      curve.forEach((pct, i) => {
        const week = startWeek + i
        const kg = Math.round(totalKg * pct / 100)
        const hrs = Math.round(kg / eff)

        weeklyKg.push({ week, kg })

        if (!weekMap[week]) weekMap[week] = { kg: 0, hrs: 0, sections: [] }
        weekMap[week].kg += kg
        weekMap[week].hrs += hrs
        weekMap[week].sections.push(section.name)
      })

      sectionDetails.push({ section, fruitStartDate: fruitDate, startWeek, totalKg, weeklyKg, eff })
    }

    const weeks = Object.entries(weekMap)
      .map(([wk, data]) => ({
        week: +wk,
        dates: getWeekDates(+wk, year),
        kg: data.kg,
        hrs: data.hrs,
        workers: Math.ceil(data.hrs / hoursPerWeek),
        sectionCount: data.sections.length,
        sections: data.sections,
      }))
      .sort((a, b) => a.week - b.week)

    return { weeks, sectionDetails }
  }, [allPlantationSections, sectionFruitDates, hoursPerWeek])

  const peakWorkers = Math.max(...weeklyPlan.weeks.map(w => w.workers), 0)
  const totalKgAll = weeklyPlan.sectionDetails.reduce((s, d) => s + d.totalKg, 0)
  const bottleneckThreshold = peakWorkers * 0.8
  const bottleneckWeeks = weeklyPlan.weeks.filter(w => w.workers >= bottleneckThreshold)

  // ==================== PDF EXPORT ====================
  const handleExportPdf = useCallback(async () => {
    if (!weeklyPlan.weeks.length) return
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Planowanie zbiorów — zapotrzebowanie na pracowników', 14, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Scenariusz: ${SCENARIO_SHORT[scenario]} | ${hoursPerWeek}h/tydzień | Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, 14, 22)

    const head = [['Tydzień', 'Daty', 'Zbiór (kg)', 'Godziny', 'Pracownicy', 'Sekcji zbiera']]
    const body = weeklyPlan.weeks.map(w => [
      `T${w.week}`, w.dates, w.kg.toLocaleString('pl-PL'),
      `${w.hrs}h`, `${w.workers}`, `${w.sectionCount}`,
    ])

    autoTable(doc, {
      startY: 26, head, body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [34, 197, 94], textColor: 255 },
    })

    // Section breakdown table
    const lastY = (doc as any).lastAutoTable?.finalY ?? 100
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Szczegóły per sekcja', 14, lastY + 10)

    autoTable(doc, {
      startY: lastY + 14,
      head: [['Sekcja', 'Odmiana', 'Start owocowania', 'Tydzień startu', 'Prognoza (kg)', 'Wydajność (kg/h)']],
      body: weeklyPlan.sectionDetails.map(d => [
        `${d.section.blockName}/${d.section.name}`,
        d.section.variety?.name || '?',
        d.fruitStartDate ? new Date(d.fruitStartDate).toLocaleDateString('pl-PL') : '—',
        d.startWeek ? `T${d.startWeek}` : '—',
        d.totalKg.toLocaleString('pl-PL'),
        `${d.eff}`,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    })

    doc.save(`planowanie-zbiorow-${scenario}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }, [weeklyPlan, scenario, hoursPerWeek])

  const handlePrint = useCallback(() => {
    if (!tableRef.current) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Planowanie zbiorów</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #1f2937; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        .meta { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; }
        th { background: #f3f4f6; font-weight: 600; }
        td:first-child { text-align: left; font-weight: 500; }
        .highlight { background: #fef2f2; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>Planowanie zbiorów — zapotrzebowanie na pracowników</h1>
      <p class="meta">Scenariusz: ${SCENARIO_SHORT[scenario]} | ${hoursPerWeek}h/tydzień | ${new Date().toLocaleDateString('pl-PL')}</p>
      ${tableRef.current.innerHTML}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`)
    printWindow.document.close()
  }, [scenario, hoursPerWeek])

  // ==================== RENDER ====================
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Ładowanie danych GDH i plantacji...</div>

  const noFruitDates = weeklyPlan.sectionDetails.length === 0 && allPlantationSections.length > 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planowanie zbiorów</h1>
          <p className="text-gray-500">Na podstawie dat owocowania z macierzy GDH</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Scenariusz:</label>
            <select className="h-8 border rounded-md px-2 text-xs bg-white" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}>
              {ALL_SCENARIOS.map(sc => <option key={sc} value={sc}>{SCENARIO_LABELS[sc]}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">h/tydzień:</label>
            <input type="number" className="h-8 w-16 border rounded-md px-2 text-xs bg-white text-center" value={hoursPerWeek} onChange={e => setHoursPerWeek(Math.max(1, +e.target.value))} />
          </div>
          <button onClick={handleExportPdf} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
            <FileDown className="w-3.5 h-3.5" />PDF
          </button>
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
            <Printer className="w-3.5 h-3.5" />Drukuj
          </button>
        </div>
      </div>

      {noFruitDates && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="font-semibold text-amber-800">Brak dat owocowania</p>
          <p className="text-sm text-amber-600 mt-1">Żadna sekcja nie ma jeszcze prognozowanej daty owocowania z GDH. Sprawdź macierz plantacji — czy są odczyty temperatur i progi GDH?</p>
        </div>
      )}

      {weeklyPlan.weeks.length > 0 && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl p-4 border text-center">
              <p className="text-3xl font-bold">{weeklyPlan.sectionDetails.length}</p>
              <p className="text-xs text-gray-500">Sekcji zbiera</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
              <p className="text-3xl font-bold text-green-700">{(totalKgAll / 1000).toFixed(1)}t</p>
              <p className="text-xs text-green-600">Prognoza total</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
              <p className="text-3xl font-bold text-blue-600">{peakWorkers}</p>
              <p className="text-xs text-blue-600">Pracowników max</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 text-center">
              <p className="text-3xl font-bold text-purple-600">{weeklyPlan.weeks.length}</p>
              <p className="text-xs text-purple-600">Tygodni zbiorów</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 text-center">
              <p className="text-3xl font-bold text-indigo-600">{SCENARIO_SHORT[scenario]}</p>
              <p className="text-xs text-indigo-600">Scenariusz</p>
            </div>
          </div>

          {/* Bottleneck warnings */}
          {bottleneckWeeks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-amber-800">Wąskie gardła — wysokie zapotrzebowanie</h3></div>
              <div className="flex flex-wrap gap-2">
                {bottleneckWeeks.map(w => (
                  <span key={w.week} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                    T{w.week}: {w.workers} os. ({w.kg.toLocaleString('pl-PL')} kg, {w.sectionCount} sekcji)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Workers bar chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" />Zapotrzebowanie na pracowników — tydzień po tygodniu</h3>
            <div className="flex items-end gap-1 h-48 mb-2">
              {weeklyPlan.weeks.map(w => {
                const isBottleneck = w.workers >= bottleneckThreshold
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className={`w-full rounded-t transition-all cursor-pointer ${isBottleneck ? 'bg-gradient-to-t from-red-500 to-orange-400' : 'bg-gradient-to-t from-blue-500 to-blue-400'} hover:opacity-80`}
                      style={{ height: `${peakWorkers > 0 ? (w.workers / peakWorkers) * 180 : 0}px`, minHeight: w.workers > 0 ? '8px' : '0' }}
                    />
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
                      <div className="font-bold text-blue-400">T{w.week} ({w.dates})</div>
                      <div>{w.kg.toLocaleString('pl-PL')} kg</div>
                      <div>{w.workers} pracowników ({w.hrs}h)</div>
                      <div>{w.sectionCount} sekcji zbiera</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1">{weeklyPlan.weeks.map(w => (
              <div key={w.week} className="flex-1 text-center text-xs text-gray-500">
                <div>T{w.week}</div>
                <div className="text-[10px] text-gray-400">{w.dates.split('-')[0]}</div>
              </div>
            ))}</div>
          </div>

          {/* Detailed table */}
          <div className="bg-white rounded-xl border p-6" ref={tableRef}>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-500" />Tygodniowy plan zbiorów</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3">Tydzień</th>
                    <th className="text-right py-2 px-3">Zbiór (kg)</th>
                    <th className="text-right py-2 px-3">Kumulatywnie</th>
                    <th className="text-right py-2 px-3">Godziny</th>
                    <th className="text-right py-2 px-3">Pracownicy</th>
                    <th className="text-right py-2 px-3">Sekcji</th>
                    <th className="text-left py-2 px-3">Zbierające sekcje</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyPlan.weeks.map((w, wi) => {
                    const cum = weeklyPlan.weeks.slice(0, wi + 1).reduce((s, x) => s + x.kg, 0)
                    const isBottleneck = w.workers >= bottleneckThreshold
                    return (
                      <tr key={w.week} className={`border-b ${isBottleneck ? 'bg-red-50' : ''}`}>
                        <td className="py-2 px-3">T{w.week} <span className="text-gray-400 text-xs">({w.dates})</span></td>
                        <td className="text-right px-3 font-medium">{w.kg.toLocaleString('pl-PL')} kg</td>
                        <td className="text-right px-3 text-gray-500">{(cum / 1000).toFixed(2)}t</td>
                        <td className="text-right px-3 text-gray-500">{w.hrs}h</td>
                        <td className="text-right px-3 font-medium">{w.workers} os.</td>
                        <td className="text-right px-3">{w.sectionCount}</td>
                        <td className="px-3 text-xs text-gray-500 max-w-[200px] truncate" title={w.sections.join(', ')}>{w.sections.join(', ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-section breakdown */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-indigo-500" />Start zbiorów per sekcja (z GDH)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3">Sekcja</th>
                    <th className="text-left py-2 px-3">Odmiana</th>
                    <th className="text-center py-2 px-3">Start owocowania</th>
                    <th className="text-center py-2 px-3">Tydzień</th>
                    <th className="text-right py-2 px-3">Prognoza (kg)</th>
                    <th className="text-right py-2 px-3">Wydajność</th>
                    <th className="text-left py-2 px-3">Rozkład tygodniowy</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyPlan.sectionDetails
                    .sort((a, b) => (a.startWeek || 99) - (b.startWeek || 99))
                    .map(d => {
                      const maxWeekKg = Math.max(...d.weeklyKg.map(w => w.kg), 1)
                      return (
                        <tr key={d.section.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">
                            <span className="text-gray-400">{d.section.blockName}/</span>{d.section.name}
                          </td>
                          <td className="py-2 px-3 text-gray-600">{d.section.variety?.name || '?'}</td>
                          <td className="text-center px-3">
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              {d.fruitStartDate ? new Date(d.fruitStartDate).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : '—'}
                            </span>
                          </td>
                          <td className="text-center px-3 font-medium">T{d.startWeek}</td>
                          <td className="text-right px-3">{d.totalKg.toLocaleString('pl-PL')} kg</td>
                          <td className="text-right px-3 text-gray-500">{d.eff} kg/h</td>
                          <td className="px-3">
                            <div className="flex items-end gap-0.5 h-5">
                              {d.weeklyKg.map(w => (
                                <div
                                  key={w.week}
                                  className="flex-1 bg-green-400 rounded-t"
                                  style={{ height: `${(w.kg / maxWeekKg) * 20}px`, minHeight: w.kg > 0 ? '2px' : '0' }}
                                  title={`T${w.week}: ${w.kg.toLocaleString('pl-PL')} kg`}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Heatmap: sections × weeks */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4">Mapa ciepła — sekcje × tygodnie</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1 px-1 font-medium text-gray-500 min-w-[100px]">Sekcja</th>
                    {weeklyPlan.weeks.map(w => (
                      <th key={w.week} className="py-1 px-0.5 font-medium text-gray-500 text-center min-w-[36px]">T{w.week}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeklyPlan.sectionDetails
                    .sort((a, b) => (a.startWeek || 99) - (b.startWeek || 99))
                    .map(d => {
                      const maxSectionKg = Math.max(...d.weeklyKg.map(w => w.kg), 1)
                      const weekKgMap = new Map(d.weeklyKg.map(w => [w.week, w.kg]))
                      return (
                        <tr key={d.section.id}>
                          <td className="py-0.5 px-1 font-medium truncate">
                            <span className="text-gray-400">{d.section.blockName}/</span>{d.section.name}
                          </td>
                          {weeklyPlan.weeks.map(w => {
                            const kg = weekKgMap.get(w.week) || 0
                            const intensity = kg / maxSectionKg
                            const bg = kg === 0 ? 'bg-gray-50'
                              : intensity > 0.8 ? 'bg-green-600 text-white'
                              : intensity > 0.6 ? 'bg-green-500 text-white'
                              : intensity > 0.4 ? 'bg-green-400'
                              : intensity > 0.2 ? 'bg-green-300'
                              : 'bg-green-200'
                            return (
                              <td key={w.week} className="py-0.5 px-0.5">
                                <div className={`${bg} rounded text-center py-0.5`} title={`${d.section.name} T${w.week}: ${kg.toLocaleString('pl-PL')} kg`}>
                                  {kg > 0 ? (kg >= 1000 ? `${(kg / 1000).toFixed(1)}` : kg) : ''}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  {/* Sum row */}
                  <tr className="border-t-2 border-gray-400 font-bold">
                    <td className="py-1 px-1">SUMA</td>
                    {weeklyPlan.weeks.map(w => (
                      <td key={w.week} className="py-1 px-0.5 text-center">
                        <div className="bg-gray-100 rounded py-0.5">{(w.kg / 1000).toFixed(1)}</div>
                      </td>
                    ))}
                  </tr>
                  <tr className="font-bold text-blue-700">
                    <td className="py-1 px-1">LUDZIE</td>
                    {weeklyPlan.weeks.map(w => (
                      <td key={w.week} className="py-1 px-0.5 text-center">
                        <div className={`rounded py-0.5 ${w.workers >= bottleneckThreshold ? 'bg-red-100 text-red-700' : 'bg-blue-50'}`}>{w.workers}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
