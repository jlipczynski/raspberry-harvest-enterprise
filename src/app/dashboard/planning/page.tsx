'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Users, AlertTriangle, BarChart3, Target, Loader2, FileDown, Printer, Calendar, Info, ChevronDown, ChevronUp } from 'lucide-react'

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
  autumnGdhStartDate?: string | null
  autumnFruitDate?: string | null
  autumnCurrentGdh?: number
  gdhAutumnFruit?: number | null
  baseTemp: number
  flowerThreshold: number | null      // backward compat (= summer)
  fruitThreshold: number | null       // backward compat (= summer)
  flowerThresholdSummer: number | null
  fruitThresholdSummer: number | null
  fruitThresholdAutumn: number | null
  dailyGdh: Array<{ date: string; cumulativeGdh: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay { date: string; gdhTunnel: number; avgTunnelTemp?: number }

interface GdhApiResponse {
  sections: SectionGdh[]
  forecast: {
    meteoDays: ForecastDay[]
    scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best?: ForecastDay[] }
    seasonalAnomaly?: { months: Array<{ month: string; anomaly: number }>; avgAnomaly: number; verdict: string } | null
    lastForecastDate: string
    historicalYears: number
  } | null
  gdhParams?: { upperTemp: number; forecastBaseTemp: number }
}

interface TemplateAssignment {
  id: string; templateId: string; targetYear: number; season: string; adjustmentPercent: number; isActive: boolean; createdAt: string
  template: {
    id: string; name: string
    weeklyCurveSummer: number[]; dailyCurveSummer: number[]; startWeekSummer?: number; startDateSummer?: string; totalKgSummer: number
    weeklyCurveAutumn: number[]; dailyCurveAutumn: number[]; startWeekAutumn?: number; startDateAutumn?: string; totalKgAutumn: number
  }
}
interface AvailableTemplate {
  id: string; name: string; season: string; varietyId?: string; productionYear: number
  weeklyCurve: number[]; weeklyCurveSummer: number[]; weeklyCurveAutumn: number[]
  dailyCurveSummer: number[]; dailyCurveAutumn: number[]
  startDateSummer?: string; startDateAutumn?: string
  totalKgSummer: number; totalKgAutumn: number
  winteredInTunnel: boolean; plantSource?: string; productionCycle: number; totalKg: number
}
interface PlantationSection {
  id: string; name: string; metersLength: number; potsPerMeter: number; shootsPerPot: number
  potsOverride?: number | null
  yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; varietyId: string
  winteredInTunnel?: boolean; plantMaterialType?: string; plantSource?: string; productionYear?: number
  harvestCurveSummer?: number[]; harvestCurveAutumn?: number[]
  templateAssignments?: TemplateAssignment[]
  variety?: { id: string; name: string; yieldSummerPerShoot?: number; yieldAutumnPerShoot?: number; harvestCurveSummer?: number[]; harvestCurveAutumn?: number[]; pickingEfficiency?: number; wastePercent?: number; secondCategoryPercent?: number }
}
interface Block { id: string; name: string; sections: PlantationSection[] }

const ALL_SCENARIOS = ['p90', 'p50', 'p10', 'best'] as const
type Scenario = typeof ALL_SCENARIOS[number]
const SCENARIO_LABELS: Record<Scenario, string> = { p90: 'P90 — ciepły rok', p50: 'P50 — typowy rok', p10: 'P10 — zimny rok', best: 'ECMWF' }
const SCENARIO_SHORT: Record<Scenario, string> = { p90: 'P90', p50: 'P50', p10: 'P10', best: 'ECMWF' }

// ==================== TEMPLATE SCORING ====================
const scoreTemplate = (t: AvailableTemplate, section: PlantationSection): number => {
  let score = 0
  if (t.varietyId && t.varietyId === section.varietyId) score += 40
  if (t.winteredInTunnel === (section.winteredInTunnel ?? false)) score += 30
  if (t.plantSource && t.plantSource === section.plantSource) score += 20
  if (section.productionYear && Math.abs(t.productionCycle - (new Date().getFullYear() - section.productionYear + 1)) <= 1) score += 10
  return score
}

// ==================== SPARKLINE ====================
const CurveSparkline = ({ curve, color }: { curve: number[]; color: string }) => {
  if (!curve?.length) return null
  const max = Math.max(...curve)
  if (max === 0) return null
  const w = 120, h = 32
  const points = curve.map((v, i) =>
    `${(i / Math.max(curve.length - 1, 1)) * w},${h - (v / max) * (h - 4)}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="mt-1">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

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
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [staffingTiers, setStaffingTiers] = useState<StaffingTier[]>(DEFAULT_TIERS)
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplate[]>([])
  const [curveDropdownOpen, setCurveDropdownOpen] = useState<string | null>(null)
  const [showCurveAssignment, setShowCurveAssignment] = useState(false)
  const [planView, setPlanView] = useState<'weekly' | 'daily'>('weekly')
  const [planSections, setPlanSections] = useState<string>('all')
  const [planDateMode, setPlanDateMode] = useState<'season' | 'range'>('season')
  const [planDateFrom, setPlanDateFrom] = useState<string>('')
  const [planDateTo, setPlanDateTo] = useState<string>('')
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
      fetch('/api/templates').then(r => r.json()),
    ]).then(([gdh, plantation, templatesData]) => {
      setGdhData(gdh)
      setBlocks(plantation.blocks || [])
      setAvailableTemplates((templatesData.templates || []).map((t: Record<string, unknown>) => ({
        id: t.id, name: t.name, season: t.season, varietyId: t.varietyId,
        productionYear: t.productionYear, weeklyCurve: t.weeklyCurve as number[] ?? [],
        weeklyCurveSummer: (t.weeklyCurveSummer as number[]) ?? [], weeklyCurveAutumn: (t.weeklyCurveAutumn as number[]) ?? [],
        dailyCurveSummer: (t.dailyCurveSummer as number[]) ?? [], dailyCurveAutumn: (t.dailyCurveAutumn as number[]) ?? [],
        startDateSummer: t.startDateSummer as string | undefined, startDateAutumn: t.startDateAutumn as string | undefined,
        totalKgSummer: (t.totalKgSummer as number) ?? 0, totalKgAutumn: (t.totalKgAutumn as number) ?? 0,
        winteredInTunnel: t.winteredInTunnel, plantSource: t.plantSource, productionCycle: t.productionCycle, totalKg: (t.totalKg as number) ?? 0,
      })))
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const assignCurve = useCallback(async (sectionId: string, templateId: string, season: string) => {
    try {
      await fetch(`/api/plantation/section/${sectionId}/assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, season, targetYear: new Date().getFullYear() }),
      })
      window.location.reload()
    } catch (e) { console.error('Error assigning curve:', e) }
  }, [])

  const unassignCurve = useCallback(async (sectionId: string) => {
    try {
      await fetch(`/api/plantation/section/${sectionId}/assignment`, { method: 'DELETE' })
      const pRes = await fetch('/api/plantation')
      const pData = await pRes.json()
      setBlocks(pData.blocks || [])
    } catch (e) { console.error('Error unassigning curve:', e) }
    setCurveDropdownOpen(null)
  }, [])

  const allPlantationSections = useMemo(() =>
    blocks.flatMap(b => b.sections.map(s => ({ ...s, blockName: b.name }))),
    [blocks]
  )

  // ==================== CORE: fruit start date per section from GDH ====================
  // GDH per-section: uses section.baseTemp + avgTunnelTemp from forecast (not hardcoded 4.5)
  const GDH_UPPER_TEMP = gdhData?.gdhParams?.upperTemp ?? 26.0

  const sectionFruitDates = useMemo(() => {
    if (!gdhData?.sections?.length || !gdhData.forecast) return new Map<string, { fruitDate: string | null; autumnFruitDate: string | null }>()

    const forecast = gdhData.forecast
    const toKey = (d: string | Date) => typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)

    /** Compute daily GDH from tunnel temp using section-specific baseTemp */
    const gdhFromTunnelTemp = (avgTemp: number, baseTemp: number): number => {
      const effective = Math.min(avgTemp, GDH_UPPER_TEMP)
      return Math.max(0, effective - baseTemp) * 24
    }

    /** Get per-section daily GDH from a forecast day, using avgTunnelTemp if available */
    const forecastDayGdh = (day: ForecastDay, baseTemp: number): number => {
      if (day.avgTunnelTemp != null) {
        return gdhFromTunnelTemp(day.avgTunnelTemp, baseTemp)
      }
      // Fallback for old cached data without avgTunnelTemp — use gdhTunnel as-is
      return day.gdhTunnel
    }

    const result = new Map<string, { fruitDate: string | null; autumnFruitDate: string | null }>()

    for (const section of gdhData.sections) {
      if (!section.fruitThreshold) { result.set(section.id, { fruitDate: null, autumnFruitDate: null }); continue }

      const baseTemp = section.baseTemp

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
        cumGdh += forecastDayGdh(day, baseTemp)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      const scenarioData = scenario === 'best'
        ? (forecast.scenarios.best || forecast.scenarios.p50)
        : forecast.scenarios[scenario]

      for (const day of scenarioData) {
        if (gdhStartDate && day.date < gdhStartDate) continue
        cumGdh += forecastDayGdh(day, baseTemp)
        dailyGdh.set(day.date, Math.round(cumGdh))
      }

      // Find date when fruitThreshold is reached
      const entries = [...dailyGdh.entries()].sort(([a], [b]) => a.localeCompare(b))
      let fruitDate: string | null = null
      for (const [date, gdh] of entries) {
        if (gdh >= section.fruitThreshold) { fruitDate = date; break }
      }

      // Autumn fruit date — tylko z API (real readings) lub prognoza per-section
      let autumnFruitDate: string | null = section.autumnFruitDate ?? null
      if (!autumnFruitDate && section.autumnGdhStartDate && section.gdhAutumnFruit) {
        const autumnStart = section.autumnGdhStartDate
        const autumnThreshold = section.gdhAutumnFruit
        let cumAutumn = section.autumnCurrentGdh ?? 0
        const lastMeteoDate = forecast.meteoDays.at(-1)?.date ?? ''
        for (const day of forecast.meteoDays) {
          if (day.date < autumnStart) continue
          cumAutumn += forecastDayGdh(day, baseTemp)
          if (cumAutumn >= autumnThreshold) { autumnFruitDate = day.date; break }
        }
        if (!autumnFruitDate) {
          const scenarioData = scenario === 'best'
            ? (forecast.scenarios.best || forecast.scenarios.p50)
            : forecast.scenarios[scenario]
          for (const day of scenarioData) {
            if (day.date <= lastMeteoDate) continue
            if (day.date < autumnStart) continue
            cumAutumn += forecastDayGdh(day, baseTemp)
            if (cumAutumn >= autumnThreshold) { autumnFruitDate = day.date; break }
          }
        }
      }
      result.set(section.id, { fruitDate, autumnFruitDate })
    }

    return result
  }, [gdhData, scenario, GDH_UPPER_TEMP])

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
      totalSummerKg: number
      totalAutumnKg: number
      curveSource: 'assignment' | 'section' | 'variety' | 'none'
      summerAssignment: TemplateAssignment | null
      autumnAssignment: TemplateAssignment | null
      weeklyKg: Array<{ week: number; kg: number; summerKg: number; autumnKg: number }>
      dailyKg: Array<{ date: string; kg: number; summerKg: number; autumnKg: number }>
      eff: number
    }> = []

    for (const section of allPlantationSections) {
      const v = section.variety
      const sectionDates = sectionFruitDates.get(section.id)
      const fruitDate = sectionDates?.fruitDate ?? null
      const autumnFruitDate = sectionDates?.autumnFruitDate ?? null
      // Skip sections that have neither a fruit date (summer) nor autumnFruitDate (autumn)
      if (!fruitDate && !autumnFruitDate) continue

      const startWeek = fruitDate ? getWeekNumber(new Date(fruitDate)) : null
      const pots = (section.potsOverride != null && section.potsOverride > 0) ? section.potsOverride : section.metersLength * section.potsPerMeter
      const shoots = pots * section.shootsPerPot
      const eff = v?.pickingEfficiency ?? null
      if (!eff) continue // brak wydajności = pomijamy sekcję

      // Yields from DB: section-level overrides variety-level
      // --- SUMMER ---
      const summerYield = section.yieldSummerPerShoot ?? v?.yieldSummerPerShoot ?? 0
      // Priority: 1. SectionTemplateAssignment curve  2. Section curve  3. Variety curve  4. Flat
      const summerAssignment = (section.templateAssignments || [])
        .filter(a => a.season === 'summer' && a.isActive)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      const sectionSummerCurve = (section.harvestCurveSummer as number[] | undefined)
      const varietySummerCurve = (v?.harvestCurveSummer as number[] | undefined)
      // Weekly curves for fallback
      const assignmentSummerWeeklyCurve = summerAssignment?.template?.weeklyCurveSummer
      const summerWeeklyCurve = (assignmentSummerWeeklyCurve?.length ? assignmentSummerWeeklyCurve : null)
        ?? (sectionSummerCurve?.length ? sectionSummerCurve : null)
        ?? (varietySummerCurve?.length ? varietySummerCurve : null)
        ?? null
      // Daily curves from template assignment (% per day)
      const summerDailyCurve = summerAssignment?.template?.dailyCurveSummer
      const summerStartDate = summerAssignment?.template?.startDateSummer

      // --- AUTUMN ---
      const autumnYield = section.yieldAutumnPerShoot ?? v?.yieldAutumnPerShoot ?? 0
      const autumnAssignment = (section.templateAssignments || [])
        .filter(a => a.season === 'autumn' && a.isActive)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      const sectionAutumnCurve = (section.harvestCurveAutumn as number[] | undefined)
      const varietyAutumnCurve = (v?.harvestCurveAutumn as number[] | undefined)
      const assignmentAutumnWeeklyCurve = autumnAssignment?.template?.weeklyCurveAutumn
      const autumnWeeklyCurve = (assignmentAutumnWeeklyCurve?.length ? assignmentAutumnWeeklyCurve : null)
        ?? (sectionAutumnCurve?.length ? sectionAutumnCurve : null)
        ?? (varietyAutumnCurve?.length ? varietyAutumnCurve : null)
        ?? null
      const autumnDailyCurve = autumnAssignment?.template?.dailyCurveAutumn
      const autumnStartDate = autumnAssignment?.template?.startDateAutumn

      const summerKg = shoots * summerYield
      const autumnKg = (autumnFruitDate && autumnYield > 0) ? shoots * autumnYield : 0
      const totalKg = summerKg + autumnKg

      // Build dailyKg array — per-day kg values
      const dailyKgMap = new Map<string, { summerKg: number; autumnKg: number }>()

      // --- SUMMER daily distribution ---
      if (summerKg > 0 && fruitDate && summerWeeklyCurve) {
        if (summerDailyCurve?.length && fruitDate) {
          // Use daily curve from template — real per-day distribution
          summerDailyCurve.forEach((pct, i) => {
            const d = new Date(fruitDate)
            d.setDate(d.getDate() + i)
            const dateStr = d.toISOString().slice(0, 10)
            const kg = Math.round(summerKg * pct / 100)
            const existing = dailyKgMap.get(dateStr)
            if (existing) { existing.summerKg += kg } else { dailyKgMap.set(dateStr, { summerKg: kg, autumnKg: 0 }) }
          })
        } else {
          // Fallback: weekly curve divided by 7
          summerWeeklyCurve.forEach((pct, i) => {
            const weekStart = new Date(fruitDate)
            weekStart.setDate(weekStart.getDate() + i * 7)
            const weekKg = Math.round(summerKg * pct / 100)
            const dayKg = Math.round(weekKg / 7)
            for (let d = 0; d < 7; d++) {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + d)
              const dateStr = day.toISOString().slice(0, 10)
              const existing = dailyKgMap.get(dateStr)
              if (existing) { existing.summerKg += dayKg } else { dailyKgMap.set(dateStr, { summerKg: dayKg, autumnKg: 0 }) }
            }
          })
        }
      }

      // --- AUTUMN daily distribution ---
      if (autumnKg > 0 && autumnWeeklyCurve) {
        if (autumnDailyCurve?.length && (autumnFruitDate || autumnStartDate)) {
          // Use daily curve from template
          autumnDailyCurve.forEach((pct, i) => {
            const d = new Date(autumnFruitDate ?? autumnStartDate!)
            d.setDate(d.getDate() + i)
            const dateStr = d.toISOString().slice(0, 10)
            const kg = Math.round(autumnKg * pct / 100)
            const existing = dailyKgMap.get(dateStr)
            if (existing) { existing.autumnKg += kg } else { dailyKgMap.set(dateStr, { summerKg: 0, autumnKg: kg }) }
          })
        } else if (autumnFruitDate) {
          // Fallback: weekly curve divided by 7
          const autumnStartDate2 = new Date(autumnFruitDate)
          autumnWeeklyCurve.forEach((pct, i) => {
            const weekStart = new Date(autumnStartDate2)
            weekStart.setDate(weekStart.getDate() + i * 7)
            const weekKg = Math.round(autumnKg * pct / 100)
            const dayKg = Math.round(weekKg / 7)
            for (let d = 0; d < 7; d++) {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + d)
              const dateStr = day.toISOString().slice(0, 10)
              const existing = dailyKgMap.get(dateStr)
              if (existing) { existing.autumnKg += dayKg } else { dailyKgMap.set(dateStr, { summerKg: 0, autumnKg: dayKg }) }
            }
          })
        }
      }

      // Convert dailyKgMap to sorted array
      const dailyKgArr = [...dailyKgMap.entries()]
        .map(([date, vals]) => ({ date, kg: vals.summerKg + vals.autumnKg, summerKg: vals.summerKg, autumnKg: vals.autumnKg }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Aggregate dailyKg → weeklyKg
      const weeklyKgMap = new Map<number, { kg: number; summerKg: number; autumnKg: number }>()
      for (const day of dailyKgArr) {
        const wk = getWeekNumber(new Date(day.date))
        const existing = weeklyKgMap.get(wk)
        if (existing) { existing.kg += day.kg; existing.summerKg += day.summerKg; existing.autumnKg += day.autumnKg }
        else { weeklyKgMap.set(wk, { kg: day.kg, summerKg: day.summerKg, autumnKg: day.autumnKg }) }
      }
      const weeklyKg = [...weeklyKgMap.entries()]
        .map(([week, vals]) => ({ week, kg: vals.kg, summerKg: vals.summerKg, autumnKg: vals.autumnKg }))
        .sort((a, b) => a.week - b.week)

      // Update weekMap for global aggregation
      for (const wk of weeklyKg) {
        const hrs = Math.round(wk.kg / eff)
        if (!weekMap[wk.week]) weekMap[wk.week] = { kg: 0, hrs: 0, sections: [] }
        weekMap[wk.week].kg += wk.kg
        weekMap[wk.week].hrs += hrs
        if (!weekMap[wk.week].sections.includes(section.name)) weekMap[wk.week].sections.push(section.name)
      }

      const hasSummerAssignment = !!summerAssignment
      const hasAutumnAssignment = !!autumnAssignment
      const curveSource = hasSummerAssignment || hasAutumnAssignment ? 'assignment' as const
        : (sectionSummerCurve?.length || sectionAutumnCurve?.length) ? 'section' as const
        : (varietySummerCurve?.length || varietyAutumnCurve?.length) ? 'variety' as const
        : 'none' as const
      sectionDetails.push({ section, fruitStartDate: fruitDate ?? null, startWeek, totalKg, totalSummerKg: summerKg, totalAutumnKg: autumnKg, weeklyKg, dailyKg: dailyKgArr, eff, curveSource, summerAssignment: summerAssignment || null, autumnAssignment: autumnAssignment || null })
    }

    const weeks = Object.entries(weekMap)
      .map(([wk, data]) => {
        const dailyKg = Math.round(data.kg / 7)
        const dailyHrs = Math.round(data.hrs / 7)
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
  }, [allPlantationSections, sectionFruitDates, hoursPerDay, staffingTiers])

  const totalKgAll = weeklyPlan.sectionDetails.reduce((s, d) => s + d.totalKg, 0)
  const totalSummerKg = weeklyPlan.sectionDetails.reduce((s, d) => s + d.totalSummerKg, 0)
  const totalAutumnKg = weeklyPlan.sectionDetails.reduce((s, d) => s + d.totalAutumnKg, 0)

  // ==================== FILTERED PLAN DATA ====================
  const filteredPlanData = useMemo(() => {
    if (!weeklyPlan.sectionDetails.length) return { weeks: [], days: [] }

    const year = new Date().getFullYear()
    const DAY_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

    // Filtruj sekcje
    const activeSections = planSections === 'all'
      ? weeklyPlan.sectionDetails
      : weeklyPlan.sectionDetails.filter(d => d.section.id === planSections)

    // Zakres dat
    const fromDate = planDateMode === 'range' && planDateFrom ? planDateFrom : null
    const toDate = planDateMode === 'range' && planDateTo ? planDateTo : null

    // ── Widok TYGODNIOWY ──
    const weeks = weeklyPlan.weeks
      .map(w => {
        // Przelicz kg tylko dla wybranych sekcji
        const kg = activeSections.reduce((sum, d) => {
          const wd = d.weeklyKg.find(x => x.week === w.week)
          return sum + (wd?.kg ?? 0)
        }, 0)
        // Przelicz godziny z per-section eff
        const hrs = activeSections.reduce((sum, d) => {
          const wd = d.weeklyKg.find(x => x.week === w.week)
          return sum + Math.round((wd?.kg ?? 0) / d.eff)
        }, 0)
        const dailyKg = Math.round(kg / 7)
        const dailyHrs = Math.round(hrs / 7)
        const pickers = Math.ceil(dailyHrs / hoursPerDay)
        const tier = matchStaffingTier(dailyKg, staffingTiers)
        const qc = tier?.qualityControl || 0
        const weighing = tier?.weighingStaff || 0
        const infra = tier?.infrastructure || 0
        return {
          ...w,
          kg,
          dailyKg,
          hrs,
          dailyHrs,
          pickers,
          qc,
          weighing,
          infra,
          totalStaff: pickers + qc + weighing + infra,
        }
      })
      .filter(w => {
        if (w.kg <= 0) return false
        if (!fromDate && !toDate) return true
        // Oblicz daty tygodnia
        const jan1 = new Date(year, 0, 1)
        const daysToMonday = (jan1.getDay() + 6) % 7
        const monday = new Date(year, 0, 1 - daysToMonday + (w.week - 1) * 7)
        const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
        if (fromDate && sunday < new Date(fromDate)) return false
        if (toDate && monday > new Date(toDate)) return false
        return true
      })

    // ── Widok DZIENNY ──
    // Zbierz wszystkie daty z dailyKg wszystkich aktywnych sekcji
    const dayMap = new Map<string, { kg: number; summerKg: number; autumnKg: number; hrs: number; sectionKg: Record<string, number> }>()
    for (const detail of activeSections) {
      for (const d of detail.dailyKg) {
        if (d.kg <= 0) continue
        if (fromDate && d.date < fromDate) continue
        if (toDate && d.date > toDate) continue
        const existing = dayMap.get(d.date)
        if (existing) {
          existing.kg += d.kg
          existing.summerKg += d.summerKg
          existing.autumnKg += d.autumnKg
          existing.hrs += Math.round(d.kg / detail.eff)
          existing.sectionKg[detail.section.id] = (existing.sectionKg[detail.section.id] ?? 0) + d.kg
        } else {
          const sectionKg: Record<string, number> = {}
          sectionKg[detail.section.id] = d.kg
          dayMap.set(d.date, { kg: d.kg, summerKg: d.summerKg, autumnKg: d.autumnKg, hrs: Math.round(d.kg / detail.eff), sectionKg })
        }
      }
    }

    const days = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        const d = new Date(date)
        const pickers = Math.ceil(data.hrs / hoursPerDay)
        const tier = matchStaffingTier(data.kg, staffingTiers)
        const qc = tier?.qualityControl || 0
        const weighing = tier?.weighingStaff || 0
        const infra = tier?.infrastructure || 0
        return {
          date,
          dateDisplay: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
          dayName: DAY_SHORT[d.getDay()],
          kg: data.kg,
          summerKg: data.summerKg,
          autumnKg: data.autumnKg,
          hrs: data.hrs,
          pickers,
          qc,
          weighing,
          infra,
          totalStaff: pickers + qc + weighing + infra,
          sectionKg: data.sectionKg,
        }
      })

    return { weeks, days }
  }, [weeklyPlan, planSections, planDateMode, planDateFrom, planDateTo, hoursPerDay, staffingTiers])

  const peakPickers = Math.max(...filteredPlanData.days.map(d => d.pickers), 0)
  const peakTotalStaff = Math.max(...filteredPlanData.days.map(d => d.totalStaff), 0)
  const bottleneckThreshold = peakPickers * 0.8
  const bottleneckWeeks = filteredPlanData.weeks.filter(w => w.pickers >= bottleneckThreshold)

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
    doc.text(`Scenariusz: ${SCENARIO_SHORT[scenario]} | ${7} dni/tydz. × ${hoursPerDay}h/dzień | Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, 14, 22)

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
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Szczegóły per sekcja', 14, lastY + 10)

    autoTable(doc, {
      startY: lastY + 14,
      head: [['Sekcja', 'Odmiana', 'Start', 'Tydzień', 'Lato (kg)', 'Jesień (kg)', 'Razem (kg)', 'kg/h']],
      body: weeklyPlan.sectionDetails.map(d => [
        `${d.section.blockName}/${d.section.name}`,
        d.section.variety?.name || '?',
        d.fruitStartDate ? new Date(d.fruitStartDate).toLocaleDateString('pl-PL') : '—',
        d.startWeek ? `T${d.startWeek}` : '—',
        d.totalSummerKg > 0 ? Math.round(d.totalSummerKg).toLocaleString('pl-PL') : '—',
        d.totalAutumnKg > 0 ? Math.round(d.totalAutumnKg).toLocaleString('pl-PL') : '—',
        d.totalKg.toLocaleString('pl-PL'),
        `${d.eff}`,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    })

    doc.save(`planowanie-zbiorow-${scenario}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }, [weeklyPlan, scenario, hoursPerDay])

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
      <p class="meta">Scenariusz: ${SCENARIO_SHORT[scenario]} | ${7} dni/tydz. × ${hoursPerDay}h/dzień | ${new Date().toLocaleDateString('pl-PL')}</p>
      ${tableRef.current.innerHTML}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`)
    printWindow.document.close()
  }, [scenario, hoursPerDay])

  // ==================== RENDER ====================
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Ładowanie danych GDH i plantacji...</div>

  const noFruitDates = weeklyPlan.sectionDetails.length === 0 && allPlantationSections.length > 0

  // Sections missing from planning — distinguish "no planting date" vs "future planting"
  const plannedSectionIds = new Set(weeklyPlan.sectionDetails.map(d => d.section.id))
  const today = new Date().toISOString().slice(0, 10)
  const missingSections = allPlantationSections
    .filter(s => !plannedSectionIds.has(s.id))
    .map(s => {
      const gdhSection = gdhData?.sections?.find(g => g.id === s.id)
      const gdhStartDate = gdhSection?.gdhStartDate || null
      return { section: s, gdhStartDate }
    })
  const sectionsNoPlantingDate = missingSections.filter(m => !m.gdhStartDate)
  const sectionsFuturePlanting = missingSections.filter(m => m.gdhStartDate && m.gdhStartDate > today)

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

      {/* KPI tiles + Bottleneck + Workers — moved to top */}
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
              <p className="text-xs text-green-600">Zbiór brutto (do zerwania)</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                <span className="text-green-600">{(totalSummerKg / 1000).toFixed(1)}t lato</span>
                {' + '}
                <span className="text-amber-600">{(totalAutumnKg / 1000).toFixed(1)}t jesień</span>
              </p>
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
            <p className="text-xs text-gray-500 -mt-3 mb-4">Zbiór {7} dni/tydz. × {hoursPerDay}h/dzień — zbieracze + KJ + wagi + infrastruktura</p>
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
        </>
      )}

      {/* MaxCrop data analysis — collapsible */}
      <details className="bg-slate-50 border border-slate-200 rounded-xl">
        <summary className="cursor-pointer px-5 py-3 flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
          <Info className="w-4 h-4 text-blue-500 shrink-0" />
          Analiza danych MaxCrop 2025 — skąd pochodzą krzywe i normy
        </summary>
        <div className="px-5 pb-5 text-xs text-slate-600 space-y-4">
          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Źródło danych</h4>
            <p>Plik <code className="bg-slate-200 px-1 rounded">sum_of_crops_2025_05_01_2025_12_06.xls</code> — eksport z MaxCrop za okres 1 maja – 6 grudnia 2025. Łącznie <strong>117 858 kg</strong> z sekcji A1-9, A10-19, B01-07, B08-13, D, C.</p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Yield per shoot — dane realne vs stare seedowe</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="border-b border-slate-300 text-slate-500">
                  <th className="text-left py-1 px-2">Sekcja</th><th className="text-left py-1 px-2">Odmiana</th>
                  <th className="text-right py-1 px-2">Real lato</th><th className="text-right py-1 px-2">Seed lato</th><th className="text-right py-1 px-2">Diff</th>
                  <th className="text-right py-1 px-2">Real jesień</th><th className="text-right py-1 px-2">Seed jesień</th><th className="text-right py-1 px-2">Diff</th>
                </tr></thead>
                <tbody className="font-mono">
                  <tr className="border-b border-slate-100"><td className="py-1 px-2">A1-9</td><td className="px-2">DJ</td><td className="text-right px-2">1.47</td><td className="text-right px-2 text-slate-400">1.48</td><td className="text-right px-2 text-green-600">-1%</td><td className="text-right px-2 font-semibold">0.63</td><td className="text-right px-2 text-slate-400">0.44</td><td className="text-right px-2 text-red-600 font-semibold">+43%</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1 px-2">A10-19</td><td className="px-2">DJ</td><td className="text-right px-2">1.48</td><td className="text-right px-2 text-slate-400">1.48</td><td className="text-right px-2 text-green-600">0%</td><td className="text-right px-2 font-semibold">0.70</td><td className="text-right px-2 text-slate-400">0.44</td><td className="text-right px-2 text-red-600 font-semibold">+60%</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1 px-2">B08-13</td><td className="px-2 font-semibold text-purple-700">Ruby</td><td className="text-right px-2 font-semibold">2.13</td><td className="text-right px-2 text-slate-400">1.55</td><td className="text-right px-2 text-red-600 font-semibold">+37%</td><td className="text-right px-2 font-semibold">0.00</td><td className="text-right px-2 text-slate-400">0.51</td><td className="text-right px-2 text-red-600 font-semibold">-100%</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-1 px-2">D</td><td className="px-2">DJ (PLUG r.1)</td><td className="text-right px-2 font-semibold">1.74</td><td className="text-right px-2 text-slate-400">1.48</td><td className="text-right px-2 text-red-600 font-semibold">+17%</td><td className="text-right px-2">0.13</td><td className="text-right px-2 text-slate-400">0.44</td><td className="text-right px-2 text-blue-600">-71%</td></tr>
                  <tr><td className="py-1 px-2">C</td><td className="px-2">DJ</td><td className="text-right px-2 text-red-600">0.00</td><td className="text-right px-2 text-slate-400">1.48</td><td className="text-right px-2 text-red-600 font-semibold">-100%</td><td className="text-right px-2">0.22</td><td className="text-right px-2 text-slate-400">0.44</td><td className="text-right px-2 text-blue-600">-50%</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Krzywe tygodniowe — realne vs stare seed [2,6,12,16,15,13,11,9,7,5,3,1]</h4>
            <div className="space-y-2">
              <div>
                <span className="font-medium text-blue-700">DJ LATO (śr. A1-9, A10-19, D):</span>{' '}
                <code className="bg-blue-50 px-1 rounded">[0.5, 1.8, 2.5, 8.3, 18.2, 19.9, 22.1, 17.0, 7.8, 2.6]</code>
                <span className="text-slate-400 ml-2">— peak 22% w jednym tygodniu (seed mówił 16%)</span>
              </div>
              <div>
                <span className="font-medium text-purple-700">Ruby LATO (B08-13):</span>{' '}
                <code className="bg-purple-50 px-1 rounded">[0.5, 3.8, 6.3, 14.3, 12.4, 16.3, 17.4, 19.1, 5.9, 3.9]</code>
                <span className="text-slate-400 ml-2">— peak później niż DJ (wk 30 vs 29), bardziej płaska</span>
              </div>
              <div>
                <span className="font-medium text-amber-700">DJ JESIEŃ (A1-9, A10-19):</span>{' '}
                <code className="bg-amber-50 px-1 rounded">[2.8, 10.1, 10.0, 17.1, 22.9, 15.1, 11.8, 5.9, 3.5, 0.4, 0.2]</code>
                <span className="text-slate-400 ml-2">— 11 tyg. (seed: 7 tyg.)</span>
              </div>
              <div>
                <span className="font-medium text-red-600">Ruby JESIEŃ:</span>{' '}
                <span className="bg-red-50 px-1 rounded font-semibold">BRAK — Ruby nie daje jesieni (potwierdzone: B08-13 kończy 6 VIII)</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Peak day: 4 526 kg (14 VII 2025)</h4>
            <p>Top 5 dni: 14 VII (4.5t), 21 VII (3.4t), 26 VII (3.2t), 22 VII (3.2t), 10 VII (3.1t). Okres szczytu: 5–26 lipca, potrzeba 40-71 zbieraczy dziennie przy 8 kg/h × 8h.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <h4 className="font-semibold text-amber-800 mb-1">Co poprawiono vs stary kod</h4>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>Krzywe DJ i Ruby z realnych danych MaxCrop (nie identyczne placeholdery)</li>
              <li>Ruby jesień = 0 (było 0.51 kg/pęd — błąd)</li>
              <li>DJ jesień = 0.67 kg/pęd na odmianę (było 0.44 — zaniżone o 43-60%)</li>
              <li>Yieldy per sekcja z MaxCrop: C=0 lato / 0.22 jesień, D(PLUG)=1.74/0.13, B08-13=2.13/0</li>
              <li>Każda sekcja liczy LATO + JESIEŃ osobno (było: albo/albo wg startWeek {'<'} 30)</li>
              <li>Jesień startuje od tygodnia 33 (mid-sierpień), niezależnie od lata</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="font-semibold text-blue-800 mb-1">Przeliczenie total (weryfikacja)</h4>
            <div className="font-mono text-[11px] space-y-0.5 text-blue-700">
              <div className="font-semibold text-blue-900 mb-1">I klasa (MaxCrop):</div>
              <div>A1-9:  10 584 pędów × (1.47+0.63) = 22 228 kg</div>
              <div>A10-19: 9 360 pędów × (1.48+0.70) = 20 405 kg</div>
              <div>B01-07: 8 400 pędów × (1.55+0.00) = 13 020 kg</div>
              <div>B08-13: 7 200 pędów × (2.13+0.00) = 15 336 kg</div>
              <div>C01-05: 6 000 pędów × (0.00+0.22) =  1 320 kg</div>
              <div>C06-11: 7 200 pędów × (0.00+0.22) =  1 584 kg</div>
              <div>D01-09: 10 800 pędów × (1.74+0.13) = 20 196 kg</div>
              <div>D10-18: 10 800 pędów × (1.74+0.13) = 20 196 kg</div>
              <div className="font-bold border-t border-blue-300 pt-1">I klasa: 114 285 kg ≈ 114t (MaxCrop: 118t)</div>
              <div className="font-bold text-green-700 mt-1">Brutto (do zerwania): 114 285 × 1.33 ≈ 150t (I kl + ~22% II kl + ~3% odpad)</div>
              <div className="text-blue-500">Zbieracze zbierają WSZYSTKO — prognoza brutto to podstawa planowania załogi</div>
            </div>
          </div>
        </div>
      </details>

      {noFruitDates && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="font-semibold text-amber-800">Brak dat owocowania</p>
          <p className="text-sm text-amber-600 mt-1">Żadna sekcja nie ma jeszcze prognozowanej daty owocowania z GDH. Sprawdź macierz plantacji — czy są odczyty temperatur i progi GDH?</p>
        </div>
      )}

      {/* Missing sections warnings */}
      {sectionsNoPlantingDate.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-amber-800">Uzupełnij datę wysadzenia</h3></div>
          <p className="text-sm text-amber-600 mb-3">Poniższe sekcje nie mają daty wysadzenia — nie można obliczyć GDH i daty owocowania.</p>
          <div className="flex flex-wrap gap-2">
            {sectionsNoPlantingDate.map(m => (
              <span key={m.section.id} className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                {m.section.blockName}/{m.section.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {sectionsFuturePlanting.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Calendar className="w-5 h-5 text-blue-600" /><h3 className="font-semibold text-blue-800">Planowane wysadzenie</h3></div>
          <div className="flex flex-wrap gap-2">
            {sectionsFuturePlanting.map(m => (
              <span key={m.section.id} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {m.section.blockName}/{m.section.name}: {new Date(m.gdhStartDate!).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Curve assignment warnings */}
      {weeklyPlan.sectionDetails.some(d => d.curveSource === 'none') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><h3 className="font-semibold text-amber-800">Wybierz szablon zbiorów</h3></div>
          <p className="text-sm text-amber-600 mb-3">Poniższe sekcje nie mają krzywej zbiorów — nie są uwzględnione w prognozach. Przypisz szablon lub dodaj krzywą do odmiany.</p>
          <div className="flex flex-wrap gap-2">
            {weeklyPlan.sectionDetails.filter(d => d.curveSource === 'none').map(d => (
              <span key={d.section.id} className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                {d.section.blockName}/{d.section.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Curve assignment per section — collapsible */}
      {weeklyPlan.sectionDetails.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <button
            onClick={() => setShowCurveAssignment(!showCurveAssignment)}
            className="w-full flex items-center justify-between text-left"
          >
            <h3 className="font-semibold text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-500" />Krzywe zbiorów per sekcja</h3>
            {showCurveAssignment ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {showCurveAssignment && <div className="space-y-2 mt-4">
            {weeklyPlan.sectionDetails
              .sort((a, b) => (a.section.blockName + a.section.name).localeCompare(b.section.blockName + b.section.name))
              .map(d => {
                const matchingTemplates = availableTemplates.filter(t =>
                  t.varietyId === d.section.varietyId ||
                  !t.varietyId
                ).sort((a, b) => scoreTemplate(b, d.section) - scoreTemplate(a, d.section))
                const isOpen = curveDropdownOpen === d.section.id
                return (
                  <div key={d.section.id} className={`border rounded-lg p-3 ${d.curveSource === 'none' ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium"><span className="text-gray-400">{d.section.blockName}/</span>{d.section.name}</span>
                        <span className="text-xs text-gray-500">{d.section.variety?.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          d.curveSource === 'assignment' ? 'bg-green-100 text-green-700' :
                          d.curveSource === 'section' ? 'bg-blue-100 text-blue-700' :
                          d.curveSource === 'variety' ? 'bg-purple-100 text-purple-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {d.curveSource === 'assignment' ? 'Szablon' :
                           d.curveSource === 'section' ? 'Sekcja' :
                           d.curveSource === 'variety' ? 'Odmiana' : 'Brak krzywej zbiorów'}
                        </span>
                        {d.summerAssignment && <span className="text-xs text-green-600">{d.summerAssignment.template.name}</span>}
                        {d.autumnAssignment && <span className="text-xs text-amber-600">{d.autumnAssignment.template.name}</span>}
                      </div>
                      <button
                        onClick={() => setCurveDropdownOpen(isOpen ? null : d.section.id)}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        Wybierz szablon
                      </button>
                    </div>
                    {isOpen && (
                      <div className="mt-3 border-t pt-3 space-y-3">
                        {/* Użyj danych producenckich */}
                        <button
                          onClick={() => unassignCurve(d.section.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                            d.curveSource === 'variety' || d.curveSource === 'none'
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-gray-200 hover:bg-purple-50 text-gray-700'
                          }`}
                        >
                          <div className="font-medium">Użyj danych producenckich (odmiana)</div>
                          <div className="text-xs text-gray-400">Odepnij szablon — użyje krzywej z odmiany</div>
                        </button>
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-2">Wybierz szablon ({matchingTemplates.length})</p>
                          {matchingTemplates.length === 0 ? (
                            <p className="text-xs text-gray-400">Brak pasujących szablonów</p>
                          ) : (
                            <div className="space-y-1 max-h-60 overflow-y-auto">
                              {matchingTemplates.map((t, i) => {
                                const isAssigned = d.summerAssignment?.templateId === t.id || d.autumnAssignment?.templateId === t.id
                                return (
                                  <button
                                    key={t.id}
                                    onClick={() => assignCurve(d.section.id, t.id, 'summer')}
                                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-purple-50 border transition-colors cursor-pointer ${isAssigned ? 'border-purple-400 bg-purple-50' : 'border-transparent'}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{t.name}</span>
                                      {i === 0 && scoreTemplate(t, d.section) >= 70 && (
                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Sugerowany</span>
                                      )}
                                    </div>
                                    <div className="text-gray-400">{t.productionYear} | {t.weeklyCurve?.length || 0} tyg. | {(t.totalKg / 1000).toFixed(1)}t</div>
                                    <CurveSparkline curve={t.weeklyCurve} color="#8b5cf6" />
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>}
        </div>
      )}


      {weeklyPlan.weeks.length > 0 && (
        <>
          {/* Unified harvest plan */}
          <div className="bg-white rounded-xl border p-6" ref={tableRef}>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-500" />Plan zbiorów</h3>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              {/* Toggle weekly/daily */}
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  className={planView === 'weekly' ? 'bg-green-600 text-white px-3 py-1.5 text-sm' : 'px-3 py-1.5 text-sm'}
                  onClick={() => setPlanView('weekly')}>Tygodniowo</button>
                <button
                  className={planView === 'daily' ? 'bg-green-600 text-white px-3 py-1.5 text-sm' : 'px-3 py-1.5 text-sm'}
                  onClick={() => setPlanView('daily')}>Dziennie</button>
              </div>

              {/* Section select */}
              <select
                className="border rounded-lg px-3 py-1.5 text-sm"
                value={planSections}
                onChange={e => setPlanSections(e.target.value)}>
                <option value="all">Cała plantacja</option>
                {weeklyPlan.sectionDetails.map(d => (
                  <option key={d.section.id} value={d.section.id}>
                    {d.section.blockName}/{d.section.name}
                  </option>
                ))}
              </select>

              {/* Date range */}
              <div className="flex items-center gap-2">
                <button
                  className={planDateMode === 'season' ? 'bg-gray-200 px-3 py-1.5 text-sm rounded-lg' : 'px-3 py-1.5 text-sm border rounded-lg'}
                  onClick={() => setPlanDateMode('season')}>Cały sezon</button>
                <button
                  className={planDateMode === 'range' ? 'bg-gray-200 px-3 py-1.5 text-sm rounded-lg' : 'px-3 py-1.5 text-sm border rounded-lg'}
                  onClick={() => setPlanDateMode('range')}>Zakres dat</button>
                {planDateMode === 'range' && (
                  <>
                    <input type="date" className="border rounded-lg px-2 py-1 text-sm"
                      value={planDateFrom} onChange={e => setPlanDateFrom(e.target.value)} />
                    <span className="text-gray-400">—</span>
                    <input type="date" className="border rounded-lg px-2 py-1 text-sm"
                      value={planDateTo} onChange={e => setPlanDateTo(e.target.value)} />
                  </>
                )}
              </div>
            </div>

            {/* Weekly view */}
            {planView === 'weekly' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b-2 border-gray-300">
                      <th className="text-left py-2 px-3">Tydzień</th>
                      <th className="text-right py-2 px-3">kg/tydzień</th>
                      {planSections !== 'all' && (
                        <th className="text-right py-2 px-3 text-gray-500">% sezonu</th>
                      )}
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
                    {filteredPlanData.weeks.map((w, wi) => {
                      const cum = filteredPlanData.weeks.slice(0, wi + 1).reduce((s, x) => s + x.kg, 0)
                      const isBottleneck = w.pickers >= bottleneckThreshold
                      return (
                        <tr key={w.week} className={`border-b transition-colors ${isBottleneck ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                          <td className="py-2 px-3">
                            T{w.week} <span className="text-gray-400 text-xs">({w.dates})</span>
                          </td>
                          <td className="text-right px-3">{w.kg.toLocaleString('pl-PL')} kg</td>
                          {planSections !== 'all' && (() => {
                            const sectionDetail = weeklyPlan.sectionDetails
                              .find(d => d.section.id === planSections)
                            if (!sectionDetail) return <td className="text-right px-3 text-gray-500 text-xs">—</td>
                            
                            // Określ czy tydzień jest letni czy jesienny na podstawie danych kg
                            const weekData = sectionDetail.weeklyKg.find(x => x.week === w.week)
                            const isSummer = !weekData || weekData.summerKg >= weekData.autumnKg

                            const base = isSummer ? sectionDetail.totalSummerKg : sectionDetail.totalAutumnKg
                            const pct = base > 0 ? (w.kg / base * 100).toFixed(1) + '%' : '—'
                            
                            return (
                              <td className="text-right px-3 text-gray-500 text-xs">
                                {pct}
                              </td>
                            )
                          })()}
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
            )}

            {/* Daily view */}
            {planView === 'daily' && (() => {
              const dailySections = planSections === 'all'
                ? weeklyPlan.sectionDetails
                : weeklyPlan.sectionDetails.filter(d => d.section.id === planSections)
              const sectionColSpan = dailySections.length
              return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b-2 border-gray-300">
                      <th className="text-left py-2 px-3">Data</th>
                      <th className="text-left py-2 px-3">Dzień</th>
                      <th className="text-right py-2 px-3">kg/dzień</th>
                      {dailySections.map(sec => (
                        <th key={sec.section.id} className="text-right py-2 px-2 text-xs text-gray-400 max-w-[80px] whitespace-normal break-words text-center" title={`${sec.section.blockName}/${sec.section.name}`}>
                          {sec.section.blockName}/{sec.section.name}
                        </th>
                      ))}
                      <th className="text-right py-2 px-3">h pracy</th>
                      <th className="text-right py-2 px-3 text-blue-600">Zbieracze</th>
                      <th className="text-right py-2 px-3 text-amber-600">KJ</th>
                      <th className="text-right py-2 px-3 text-cyan-600">Wagi</th>
                      <th className="text-right py-2 px-3 text-purple-600">Infra</th>
                      <th className="text-right py-2 px-3 font-bold text-orange-700">Łącznie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlanData.days.map(d => (
                      <tr key={d.date} className={`border-b ${d.dayName === 'Sb' || d.dayName === 'Nd' ? 'bg-gray-50' : ''}`}>
                        <td className="py-2 px-3 font-medium">{d.dateDisplay}</td>
                        <td className="py-2 px-3 text-gray-600">{d.dayName}</td>
                        <td className="text-right px-3 font-medium">{d.kg.toLocaleString('pl-PL')} kg</td>
                        {dailySections.map(sec => {
                          const secKg = d.sectionKg[sec.section.id] ?? 0
                          return (
                            <td key={sec.section.id} className="text-right px-2 text-xs text-gray-500">
                              {secKg > 0 ? secKg.toLocaleString('pl-PL') : '—'}
                            </td>
                          )
                        })}
                        <td className="text-right px-3 text-gray-500">{d.hrs}h</td>
                        <td className="text-right px-3 font-semibold text-blue-600">{d.pickers}</td>
                        <td className="text-right px-3 text-amber-600">{d.qc}</td>
                        <td className="text-right px-3 text-cyan-600">{d.weighing}</td>
                        <td className="text-right px-3 text-purple-600">{d.infra}</td>
                        <td className="text-right px-3 font-bold text-orange-700">{d.totalStaff}</td>
                      </tr>
                    ))}
                    {/* Summary row */}
                    <tr className="border-t-2 border-gray-300 font-bold">
                      <td className="py-2 px-3" colSpan={2}>SUMA</td>
                      <td className="text-right px-3">{filteredPlanData.days.reduce((s, d) => s + d.kg, 0).toLocaleString('pl-PL')} kg</td>
                      {dailySections.map(sec => {
                        const total = filteredPlanData.days.reduce((s, d) => s + (d.sectionKg[sec.section.id] ?? 0), 0)
                        return (
                          <td key={sec.section.id} className="text-right px-2 text-xs">{total > 0 ? total.toLocaleString('pl-PL') : '—'}</td>
                        )
                      })}
                      <td className="text-right px-3 text-gray-500">{filteredPlanData.days.reduce((s, d) => s + d.hrs, 0)}h</td>
                      <td className="text-right px-3 text-blue-600">{Math.max(...filteredPlanData.days.map(d => d.pickers), 0)}</td>
                      <td className="text-right px-3 text-amber-600" colSpan={3}></td>
                      <td className="text-right px-3 text-orange-700">{Math.max(...filteredPlanData.days.map(d => d.totalStaff), 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              )
            })()}
          </div>

          {/* Per-section breakdown */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><Target className="w-5 h-5 text-indigo-500" />Start zbiorów per sekcja (z GDH)</h3>
            <div className="flex gap-4 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> Lato</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Jesień</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3">Sekcja</th>
                    <th className="text-left py-2 px-3">Odmiana</th>
                    <th className="text-center py-2 px-3">Start owocowania</th>
                    <th className="text-center py-2 px-3">Tydzień</th>
                    <th className="text-right py-2 px-3">Lato (kg)</th>
                    <th className="text-right py-2 px-3">Jesień (kg)</th>
                    <th className="text-right py-2 px-3">Razem (kg)</th>
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
                          <td className="text-center px-3 font-medium">{d.startWeek ? `T${d.startWeek}` : '—'}</td>
                          <td className="text-right px-3 text-green-700">{d.totalSummerKg > 0 ? `${Math.round(d.totalSummerKg).toLocaleString('pl-PL')}` : '—'}</td>
                          <td className="text-right px-3 text-amber-700">{d.totalAutumnKg > 0 ? `${Math.round(d.totalAutumnKg).toLocaleString('pl-PL')}` : '—'}</td>
                          <td className="text-right px-3 font-medium">{d.totalKg.toLocaleString('pl-PL')}</td>
                          <td className="text-right px-3 text-gray-500">{d.eff} kg/h</td>
                          <td className="px-3">
                            <div className="flex items-end gap-0.5 h-5">
                              {d.weeklyKg.map(w => {
                                const color = w.autumnKg > w.summerKg ? 'bg-amber-400' : 'bg-green-400'
                                return (
                                  <div
                                    key={w.week}
                                    className={`flex-1 ${color} rounded-t`}
                                    style={{ height: `${(w.kg / maxWeekKg) * 20}px`, minHeight: w.kg > 0 ? '2px' : '0' }}
                                    title={`T${w.week}: ${w.kg.toLocaleString('pl-PL')} kg${w.summerKg > 0 ? ` (lato: ${w.summerKg.toLocaleString('pl-PL')})` : ''}${w.autumnKg > 0 ? ` (jesień: ${w.autumnKg.toLocaleString('pl-PL')})` : ''}`}
                                  />
                                )
                              })}
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
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-500" />Oś czasu zbiorów per sekcja</h3>
            <div className="flex gap-4 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Lato</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Jesień</span>
            </div>
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
                            {/* individual week cells colored by season */}
                            {sectionWeeks.map(w => {
                              const wLeft = ((w.week - minWeek) / range) * 100
                              const wWidth = (1 / range) * 100
                              const opacity = 0.3 + (w.kg / maxKg) * 0.7
                              const isAutumn = w.autumnKg > w.summerKg
                              const color = isAutumn ? `rgba(245, 158, 11, ${opacity})` : `rgba(34, 197, 94, ${opacity})`
                              return (
                                <div
                                  key={w.week}
                                  className="absolute top-0.5 bottom-0.5 rounded-sm"
                                  style={{ left: `${wLeft}%`, width: `${wWidth}%`, background: color }}
                                  title={`${d.section.name} T${w.week}: ${w.kg.toLocaleString('pl-PL')} kg${w.summerKg > 0 ? ` (lato: ${w.summerKg.toLocaleString('pl-PL')})` : ''}${w.autumnKg > 0 ? ` (jesień: ${w.autumnKg.toLocaleString('pl-PL')})` : ''}`}
                                />
                              )
                            })}
                            {/* total label */}
                            <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-sm pointer-events-none" style={{ left: `${left}%`, width: `${width}%` }}>
                              {(d.totalKg / 1000).toFixed(1)}t{d.totalSummerKg > 0 && d.totalAutumnKg > 0 ? ' (L+J)' : d.totalAutumnKg > 0 ? ' (J)' : ' (L)'}
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
                      const weekDataMap = new Map(d.weeklyKg.map(w => [w.week, w]))
                      return (
                        <tr key={d.section.id}>
                          <td className="py-0.5 px-1 font-medium truncate">
                            <span className="text-gray-400">{d.section.blockName}/</span>{d.section.name}
                          </td>
                          {weeklyPlan.weeks.map(w => {
                            const wd = weekDataMap.get(w.week)
                            const kg = wd?.kg || 0
                            const intensity = kg / maxSectionKg
                            const isAutumn = wd ? wd.autumnKg > wd.summerKg : false
                            const bg = kg === 0 ? 'bg-gray-50'
                              : isAutumn
                                ? (intensity > 0.8 ? 'bg-amber-600 text-white'
                                  : intensity > 0.6 ? 'bg-amber-500 text-white'
                                  : intensity > 0.4 ? 'bg-amber-400 text-white'
                                  : intensity > 0.2 ? 'bg-amber-300'
                                  : 'bg-amber-200')
                                : (intensity > 0.8 ? 'bg-green-600 text-white'
                                  : intensity > 0.6 ? 'bg-green-500 text-white'
                                  : intensity > 0.4 ? 'bg-green-400 text-white'
                                  : intensity > 0.2 ? 'bg-green-300'
                                  : 'bg-green-200')
                            return (
                              <td key={w.week} className="py-0.5 px-0.5">
                                <div className={`${bg} rounded text-center py-0.5`} title={`${d.section.name} T${w.week}: ${kg.toLocaleString('pl-PL')} kg${wd && wd.summerKg > 0 ? ` (lato: ${wd.summerKg.toLocaleString('pl-PL')})` : ''}${wd && wd.autumnKg > 0 ? ` (jesień: ${wd.autumnKg.toLocaleString('pl-PL')})` : ''}`}>
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
