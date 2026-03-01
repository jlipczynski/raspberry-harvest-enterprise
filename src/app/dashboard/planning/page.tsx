'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Users, AlertTriangle, BarChart3, Target, Loader2, FileDown, Printer, Calendar, TrendingUp } from 'lucide-react'

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

// ==================== STAFFING TIERS ====================
interface StaffingTier {
  id: string
  dailyKgFrom: number
  dailyKgTo: number
  pickersFrom: number
  pickersTo: number
  qualityControl: number
  weighingStaff: number
  infrastructure: number
}

const DEFAULT_TIERS: StaffingTier[] = [
  { id: '1', dailyKgFrom: 0, dailyKgTo: 500, pickersFrom: 1, pickersTo: 10, qualityControl: 1, weighingStaff: 1, infrastructure: 1 },
  { id: '2', dailyKgFrom: 500, dailyKgTo: 1500, pickersFrom: 10, pickersTo: 25, qualityControl: 2, weighingStaff: 1, infrastructure: 2 },
  { id: '3', dailyKgFrom: 1500, dailyKgTo: 3000, pickersFrom: 25, pickersTo: 50, qualityControl: 3, weighingStaff: 2, infrastructure: 3 },
  { id: '4', dailyKgFrom: 3000, dailyKgTo: 5000, pickersFrom: 50, pickersTo: 80, qualityControl: 5, weighingStaff: 3, infrastructure: 4 },
]

function matchStaffingTier(dailyKg: number, tiers: StaffingTier[]): StaffingTier | null {
  for (const tier of tiers) {
    if (dailyKg >= tier.dailyKgFrom && dailyKg < tier.dailyKgTo) return tier
  }
  // If above all tiers, use the last one
  return tiers.length > 0 ? tiers[tiers.length - 1] : null
}

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
  const [pickingDaysPerWeek, setPickingDaysPerWeek] = useState(6)
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [staffingTiers, setStaffingTiers] = useState<StaffingTier[]>(DEFAULT_TIERS)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load staffing tiers from localStorage (same source as workers config page)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('staffingTiers')
      if (saved) try { setStaffingTiers(JSON.parse(saved)) } catch {}
    }

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
      const eff = v?.pickingEfficiency || 8 // kg/h

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
      .map(([wk, data]) => {
        // Daily calculation: kg per picking day, workers per picking day
        const dailyKg = Math.round(data.kg / pickingDaysPerWeek)
        const dailyHrs = Math.round(data.hrs / pickingDaysPerWeek)
        const pickers = Math.ceil(dailyHrs / hoursPerDay)

        // Match staffing tier based on daily kg
        const tier = matchStaffingTier(dailyKg, staffingTiers)
        const qc = tier?.qualityControl || 0
        const weighing = tier?.weighingStaff || 0
        const infra = tier?.infrastructure || 0
        const totalStaff = pickers + qc + weighing + infra

        return {
          week: +wk,
          dates: getWeekDates(+wk, year),
          kg: data.kg,
          dailyKg,
          hrs: data.hrs,
          dailyHrs,
          pickers,
          workers: pickers, // backward compat
          qc,
          weighing,
          infra,
          totalStaff,
          sectionCount: data.sections.length,
          sections: data.sections,
        }
      })
      .sort((a, b) => a.week - b.week)

    return { weeks, sectionDetails }
  }, [allPlantationSections, sectionFruitDates, pickingDaysPerWeek, hoursPerDay, staffingTiers])

  const peakPickers = Math.max(...weeklyPlan.weeks.map(w => w.pickers), 0)
  const peakTotalStaff = Math.max(...weeklyPlan.weeks.map(w => w.totalStaff), 0)
  const totalKgAll = weeklyPlan.sectionDetails.reduce((s, d) => s + d.totalKg, 0)
  const bottleneckThreshold = peakPickers * 0.8
  const bottleneckWeeks = weeklyPlan.weeks.filter(w => w.pickers >= bottleneckThreshold)

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
    doc.text(`Scenariusz: ${SCENARIO_SHORT[scenario]} | ${pickingDaysPerWeek} dni zbioru/tydz. × ${hoursPerDay}h/dzień | Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, 14, 22)

    const head = [['Tydzień', 'Daty', 'Zbiór/tydz.', 'Zbiór/dzień', 'h/dzień', 'Zbieracze', 'KJ', 'Wagi', 'Infra', 'Łącznie', 'Sekcji']]
    const body = weeklyPlan.weeks.map(w => [
      `T${w.week}`, w.dates, `${w.kg.toLocaleString('pl-PL')} kg`,
      `${w.dailyKg.toLocaleString('pl-PL')} kg`, `${w.dailyHrs}h`,
      `${w.pickers}`, `${w.qc}`, `${w.weighing}`, `${w.infra}`, `${w.totalStaff}`, `${w.sectionCount}`,
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
  }, [weeklyPlan, scenario, pickingDaysPerWeek, hoursPerDay])

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
      <p class="meta">Scenariusz: ${SCENARIO_SHORT[scenario]} | ${pickingDaysPerWeek} dni zbioru/tydz. × ${hoursPerDay}h/dzień | ${new Date().toLocaleDateString('pl-PL')}</p>
      ${tableRef.current.innerHTML}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`)
    printWindow.document.close()
  }, [scenario, pickingDaysPerWeek, hoursPerDay])

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
            <label className="text-xs text-gray-500">Dni zbioru/tydz.:</label>
            <select className="h-8 border rounded-md px-2 text-xs bg-white" value={pickingDaysPerWeek} onChange={e => setPickingDaysPerWeek(+e.target.value)}>
              <option value={2}>2 dni</option>
              <option value={3}>3 dni</option>
              <option value={4}>4 dni</option>
              <option value={5}>5 dni</option>
              <option value={6}>6 dni</option>
              <option value={7}>7 dni</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">h/dzień:</label>
            <input type="number" className="h-8 w-14 border rounded-md px-2 text-xs bg-white text-center" value={hoursPerDay} onChange={e => setHoursPerDay(Math.max(1, Math.min(12, +e.target.value)))} />
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl p-4 border text-center">
              <p className="text-3xl font-bold">{weeklyPlan.sectionDetails.length}</p>
              <p className="text-xs text-gray-500">Sekcji zbiera</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
              <p className="text-3xl font-bold text-green-700">{(totalKgAll / 1000).toFixed(1)}t</p>
              <p className="text-xs text-green-600">Prognoza total</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
              <p className="text-3xl font-bold text-blue-600">{peakPickers}</p>
              <p className="text-xs text-blue-600">Zbieraczy max</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 text-center">
              <p className="text-3xl font-bold text-orange-600">{peakTotalStaff}</p>
              <p className="text-xs text-orange-600">Łącznie osób max</p>
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
                    T{w.week}: {w.totalStaff} os. ({w.pickers} zbieraczy + {w.qc + w.weighing + w.infra} wsparcie, {w.kg.toLocaleString('pl-PL')} kg)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Workers bar chart — stacked */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" />Zapotrzebowanie na personel (osób/dzień zbioru)</h3>
            <p className="text-xs text-gray-500 -mt-3 mb-4">{pickingDaysPerWeek}× w tygodniu po {hoursPerDay}h — zbieracze + KJ + wagi + infrastruktura</p>
            <div className="flex items-end gap-1 h-48 mb-2">
              {weeklyPlan.weeks.map(w => {
                const isBottleneck = w.pickers >= bottleneckThreshold
                const maxH = peakTotalStaff > 0 ? peakTotalStaff : 1
                const pickerH = (w.pickers / maxH) * 180
                const qcH = (w.qc / maxH) * 180
                const weighH = (w.weighing / maxH) * 180
                const infraH = (w.infra / maxH) * 180
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-end group relative">
                    <div className="w-full flex flex-col-reverse">
                      <div className={`w-full ${isBottleneck ? 'bg-red-500' : 'bg-blue-500'} transition-all`} style={{ height: `${pickerH}px`, minHeight: w.pickers > 0 ? '2px' : '0' }} />
                      {w.qc > 0 && <div className="w-full bg-amber-500" style={{ height: `${qcH}px`, minHeight: '2px' }} />}
                      {w.weighing > 0 && <div className="w-full bg-cyan-500" style={{ height: `${weighH}px`, minHeight: '2px' }} />}
                      {w.infra > 0 && <div className="w-full bg-purple-500 rounded-t" style={{ height: `${infraH}px`, minHeight: '2px' }} />}
                    </div>
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
                      <div className="font-bold text-blue-400">T{w.week} ({w.dates})</div>
                      <div>{w.dailyKg.toLocaleString('pl-PL')} kg/dzień</div>
                      <div className="text-blue-300">{w.pickers} zbieraczy</div>
                      <div className="text-amber-300">{w.qc} kontrola jakości</div>
                      <div className="text-cyan-300">{w.weighing} wagi</div>
                      <div className="text-purple-300">{w.infra} infrastruktura</div>
                      <div className="font-bold border-t border-gray-700 mt-1 pt-1">{w.totalStaff} osób łącznie</div>
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
            <div className="flex gap-4 mt-3 text-xs text-gray-500 justify-center flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Zbieracze</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Kontrola jakości</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-cyan-500 inline-block" /> Wagi</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Infrastruktura</span>
            </div>
          </div>

          {/* Detailed table */}
          <div className="bg-white rounded-xl border p-6" ref={tableRef}>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-500" />Tygodniowy plan zbiorów</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3">Tydzień</th>
                    <th className="text-right py-2 px-3">kg/tydzień</th>
                    <th className="text-right py-2 px-3">kg/dzień</th>
                    <th className="text-right py-2 px-3">Kumulat.</th>
                    <th className="text-right py-2 px-3">h/dzień</th>
                    <th className="text-right py-2 px-3 text-blue-600">Zbieracze</th>
                    <th className="text-right py-2 px-3 text-amber-600">KJ</th>
                    <th className="text-right py-2 px-3 text-cyan-600">Wagi</th>
                    <th className="text-right py-2 px-3 text-purple-600">Infra</th>
                    <th className="text-right py-2 px-3 font-bold text-orange-700">Łącznie</th>
                    <th className="text-right py-2 px-3">Sekcji</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyPlan.weeks.map((w, wi) => {
                    const cum = weeklyPlan.weeks.slice(0, wi + 1).reduce((s, x) => s + x.kg, 0)
                    const isBottleneck = w.pickers >= bottleneckThreshold
                    return (
                      <tr key={w.week} className={`border-b ${isBottleneck ? 'bg-red-50' : ''}`}>
                        <td className="py-2 px-3">T{w.week} <span className="text-gray-400 text-xs">({w.dates})</span></td>
                        <td className="text-right px-3">{w.kg.toLocaleString('pl-PL')} kg</td>
                        <td className="text-right px-3 font-medium">{w.dailyKg.toLocaleString('pl-PL')} kg</td>
                        <td className="text-right px-3 text-gray-500">{(cum / 1000).toFixed(2)}t</td>
                        <td className="text-right px-3 text-gray-500">{w.dailyHrs}h</td>
                        <td className="text-right px-3 font-semibold text-blue-600">{w.pickers}</td>
                        <td className="text-right px-3 text-amber-600">{w.qc}</td>
                        <td className="text-right px-3 text-cyan-600">{w.weighing}</td>
                        <td className="text-right px-3 text-purple-600">{w.infra}</td>
                        <td className="text-right px-3 font-bold text-orange-700">{w.totalStaff}</td>
                        <td className="text-right px-3">{w.sectionCount}</td>
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

          {/* Gantt: section harvest timeline */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-500" />Oś czasu zbiorów per sekcja</h3>
            <div className="overflow-x-auto">
              {(() => {
                const minWeek = Math.min(...weeklyPlan.weeks.map(w => w.week))
                const maxWeek = Math.max(...weeklyPlan.weeks.map(w => w.week))
                const range = maxWeek - minWeek + 1
                const sorted = [...weeklyPlan.sectionDetails].sort((a, b) => (a.startWeek || 99) - (b.startWeek || 99))
                return (
                  <div className="min-w-[600px]">
                    {/* week headers */}
                    <div className="flex items-center mb-1">
                      <div className="w-40 shrink-0" />
                      <div className="flex-1 flex">
                        {Array.from({ length: range }, (_, i) => (
                          <div key={i} className="flex-1 text-center text-[10px] text-gray-500 font-medium">T{minWeek + i}</div>
                        ))}
                      </div>
                    </div>
                    {sorted.map(d => {
                      const sectionWeeks = d.weeklyKg.filter(w => w.kg > 0)
                      const sMin = Math.min(...sectionWeeks.map(w => w.week))
                      const sMax = Math.max(...sectionWeeks.map(w => w.week))
                      const left = ((sMin - minWeek) / range) * 100
                      const width = ((sMax - sMin + 1) / range) * 100
                      const maxKg = Math.max(...sectionWeeks.map(w => w.kg), 1)
                      return (
                        <div key={d.section.id} className="flex items-center mb-0.5 group">
                          <div className="w-40 shrink-0 text-xs truncate pr-2">
                            <span className="text-gray-400">{d.section.blockName}/</span><span className="font-medium">{d.section.name}</span>
                          </div>
                          <div className="flex-1 relative h-6 bg-gray-50 rounded">
                            {/* bar background */}
                            <div className="absolute top-0.5 bottom-0.5 rounded" style={{ left: `${left}%`, width: `${width}%`, background: 'linear-gradient(90deg, #fbbf24, #ef4444, #fbbf24)' }} />
                            {/* individual week cells with intensity */}
                            {sectionWeeks.map(w => {
                              const wLeft = ((w.week - minWeek) / range) * 100
                              const wWidth = (1 / range) * 100
                              const opacity = 0.3 + (w.kg / maxKg) * 0.7
                              return (
                                <div
                                  key={w.week}
                                  className="absolute top-0.5 bottom-0.5 rounded-sm"
                                  style={{ left: `${wLeft}%`, width: `${wWidth}%`, background: `rgba(220, 38, 38, ${opacity})` }}
                                  title={`${d.section.name} T${w.week}: ${w.kg.toLocaleString('pl-PL')} kg`}
                                />
                              )
                            })}
                            {/* total label */}
                            <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-sm pointer-events-none" style={{ left: `${left}%`, width: `${width}%` }}>
                              {(d.totalKg / 1000).toFixed(1)}t
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {/* date labels */}
                    <div className="flex items-center mt-1">
                      <div className="w-40 shrink-0" />
                      <div className="flex-1 flex">
                        {Array.from({ length: range }, (_, i) => (
                          <div key={i} className="flex-1 text-center text-[9px] text-gray-400">{getWeekDates(minWeek + i).split('-')[0]}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Cumulative harvest chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" />Kumulatywny zbiór (narastająco)</h3>
            {(() => {
              let cum = 0
              const cumData = weeklyPlan.weeks.map(w => { cum += w.kg; return { week: w.week, dates: w.dates, cum, kg: w.kg } })
              const maxCum = cum
              const pctTarget = totalKgAll > 0 ? totalKgAll : maxCum
              return (
                <div>
                  <div className="flex items-end gap-1 h-48 mb-2 relative">
                    {/* target line */}
                    <div className="absolute left-0 right-0 border-t-2 border-dashed border-green-400 top-0 z-10" />
                    <div className="absolute left-1 top-0.5 text-[10px] text-green-600 font-medium z-10">{(pctTarget / 1000).toFixed(1)}t plan</div>
                    {cumData.map((d, i) => {
                      const prevCum = i > 0 ? cumData[i - 1].cum : 0
                      const barHeight = maxCum > 0 ? (d.cum / pctTarget) * 180 : 0
                      const prevHeight = maxCum > 0 ? (prevCum / pctTarget) * 180 : 0
                      const pct = pctTarget > 0 ? Math.round((d.cum / pctTarget) * 100) : 0
                      return (
                        <div key={d.week} className="flex-1 flex flex-col items-center group relative">
                          <div className="w-full relative" style={{ height: '180px' }}>
                            {/* cumulative bar */}
                            <div className="absolute bottom-0 left-0 right-0 bg-green-200 rounded-t" style={{ height: `${Math.min(barHeight, 180)}px` }} />
                            {/* weekly increment */}
                            <div className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-t" style={{ height: `${Math.min(barHeight - prevHeight, 180)}px`, bottom: `${Math.min(prevHeight, 180)}px` }} />
                          </div>
                          {/* tooltip */}
                          <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
                            <div className="font-bold text-green-400">T{d.week} ({d.dates})</div>
                            <div>+{d.kg.toLocaleString('pl-PL')} kg ten tydzień</div>
                            <div className="font-bold">{(d.cum / 1000).toFixed(2)}t kumulatywnie ({pct}%)</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1">{cumData.map(d => (
                    <div key={d.week} className="flex-1 text-center text-[10px] text-gray-500">T{d.week}</div>
                  ))}</div>
                  <div className="flex gap-3 mt-3 text-xs text-gray-500 justify-center">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> przyrost tygodniowy</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> kumulatywnie</span>
                  </div>
                </div>
              )
            })()}
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
                              : intensity > 0.8 ? 'bg-red-600 text-white'
                              : intensity > 0.6 ? 'bg-red-500 text-white'
                              : intensity > 0.4 ? 'bg-red-400 text-white'
                              : intensity > 0.2 ? 'bg-orange-300'
                              : 'bg-orange-200'
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
                    <td className="py-1 px-1">ZBIERACZE</td>
                    {weeklyPlan.weeks.map(w => (
                      <td key={w.week} className="py-1 px-0.5 text-center">
                        <div className={`rounded py-0.5 ${w.pickers >= bottleneckThreshold ? 'bg-red-100 text-red-700' : 'bg-blue-50'}`}>{w.pickers}</div>
                      </td>
                    ))}
                  </tr>
                  <tr className="font-bold text-orange-700">
                    <td className="py-1 px-1">ŁĄCZNIE</td>
                    {weeklyPlan.weeks.map(w => (
                      <td key={w.week} className="py-1 px-0.5 text-center">
                        <div className="rounded py-0.5 bg-orange-50">{w.totalStaff}</div>
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
