'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Database, Thermometer, Sprout, ChevronDown, ChevronUp, Trash2, Edit, Search, Snowflake, BarChart3, Calendar, Truck, TrendingUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import HistoricalDataTab from './historical-data-tab'

type MainTab = 'szablony' | 'historyczne'


// Raspberry SVG icon
const RaspberryIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="10" cy="11" r="2.5" fill="#dc2626"/>
    <circle cx="14" cy="11" r="2.5" fill="#dc2626"/>
    <circle cx="12" cy="8" r="2.5" fill="#dc2626"/>
    <circle cx="8" cy="14" r="2.5" fill="#dc2626"/>
    <circle cx="12" cy="14.5" r="2.5" fill="#dc2626"/>
    <circle cx="16" cy="14" r="2.5" fill="#dc2626"/>
    <circle cx="10" cy="17" r="2.5" fill="#dc2626"/>
    <circle cx="14" cy="17" r="2.5" fill="#dc2626"/>
    <path d="M12 2 C12 2 14 4 14 5.5 C14 6.5 13 7 12 7 C11 7 10 6.5 10 5.5 C10 4 12 2 12 2Z" fill="#16a34a"/>
    <line x1="12" y1="2" x2="12" y2="7" stroke="#16a34a" strokeWidth="1"/>
  </svg>
)

// ===== TYPES =====
interface Variety { id: string; name: string; baseTemp?: number; gdhWinteredFlower?: number; gdhWinteredFruit?: number; gdhLcFlower?: number; gdhLcFruit?: number; gdhAutumnFlower?: number; gdhAutumnFruit?: number; autumnShootsDay?: number }
interface PlantationSection { id: string; name: string; blockName: string; varietyName: string; winteredInTunnel?: boolean; plantMaterialType?: string }
interface Template {
  tenantName?: string
  id: string; name: string; description?: string; productionYear: number; productionCycle: number
  season: string; plantingDate?: string; winteredInTunnel: boolean; plantSource?: string
  dailyCurve: number[]; weeklyCurve: number[]; startDate?: string; endDate?: string; startWeek?: number; totalKgSummer: number; totalKgAutumn: number; dailyCurveSummer: number[]; dailyCurveAutumn: number[]; weeklyCurveSummer: number[]; weeklyCurveAutumn: number[]; startWeekSummer?: number; startWeekAutumn?: number; totalKgSummer: number; totalKgAutumn: number; dailyCurveSummer: number[]; dailyCurveAutumn: number[]; weeklyCurveSummer: number[]; weeklyCurveAutumn: number[]; startWeekSummer?: number; startWeekAutumn?: number
  totalKg: number; outsideTemps?: TempPoint[]; insideTunnelTemps?: TempPoint[]; tempAdjustmentFactor?: number
  gdhData?: GdhPoint[]; gdhToFlowering?: number; gdhToFirstFruit?: number; tempSources: string[]
  sourceFile?: string; notes?: string; summerEndWeek?: number
  sourceSectionId?: string; sourceSection?: { id: string; name: string }
  variety?: { id: string; name: string; baseTemp?: number; gdhWinteredFlower?: number; gdhWinteredFruit?: number; gdhLcFlower?: number; gdhLcFruit?: number; gdhAutumnFlower?: number; gdhAutumnFruit?: number; autumnShootsDay?: number }
  _count?: { sectionAssignments: number }
}
interface TempPoint { date: string; min: number; max: number; avg: number }
interface GdhPoint { date: string; gdh: number; cumulativeGdh: number }

// ===== UTILS =====
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
const parseExcelDate = (value: unknown): string => {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'number') { const d = XLSX.SSF.parse_date_code(value); if (d) return new Date(d.y, d.m - 1, d.d).toISOString().split('T')[0] }
  if (typeof value === 'string') {
    const p = value.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (p) return p[1]+'-'+p[2].padStart(2,'0')+'-'+p[3].padStart(2,'0')
    const p2 = value.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/); if (p2) return p2[3]+'-'+p2[2].padStart(2,'0')+'-'+p2[1].padStart(2,'0')
  }
  return ''
}
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
const fmtDate = (d: string) => { const p = d.split('-'); return p[2]+'.'+p[1]+'.'+p[0] }

// ===== AUTO-DETECT SUMMER/AUTUMN BOUNDARY =====
function detectSummerEnd(weeks: { week: number; kg: number }[]): number {
  if (weeks.length < 3) return weeks[weeks.length - 1]?.week || 30
  const peak = Math.max(...weeks.map(w => w.kg))
  const peakIdx = weeks.findIndex(w => w.kg === peak)
  for (let i = peakIdx + 1; i < weeks.length; i++) {
    if (weeks[i].kg < peak * 0.2) return weeks[i - 1]?.week || 30
  }
  return weeks[weeks.length - 1]?.week || 30
}

// ===== UNIFIED CHART COMPONENT =====
function UnifiedChart({ template: t, outsideTemps, insideTemps, gdhPoints, summerEndWeek }: {
  template: Template; outsideTemps: TempPoint[]; insideTemps: TempPoint[]; gdhPoints: GdhPoint[]
  summerEndWeek?: number
}) {
  const [tooltip, setTooltip] = useState<{ x: number; content: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewRange, setViewRange] = useState<[number, number]>([0, 1])
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 1.6 : 0.6
      setViewRange(prev => {
        const center = (prev[0] + prev[1]) / 2
        const span = (prev[1] - prev[0]) * delta
        const half = span / 2
        return [Math.max(0, center - half), Math.min(1, center + half)] as [number, number]
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [setViewRange])
  const [layers, setLayers] = useState({
    harvest: true,
    tempOutside: true,
    gdhTunnel: true,
    tempInside: true,
    gdh: true,
    phases: true,
    markers: true,
  })
  const toggleLayer = (key: string) => setLayers(p => ({...p, [key]: !p[key as keyof typeof p]}))
    const [dragStart, setDragStart] = useState(0)
  const [dragViewStart, setDragViewStart] = useState<[number, number]>([0, 1])

  const baseTemp = t.variety?.baseTemp || 6.0
  const W = 900, H = 380, PAD = { top: 30, right: 60, bottom: 50, left: 60 }
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom

  // Build unified timeline from planting/first harvest
  const plantDate = t.plantingDate || ''
  const firstHarvest = t.startDate || ''
  const lastHarvest = t.endDate || (t.dailyCurve && t.startDate ? (() => { const d = new Date(t.startDate!); d.setDate(d.getDate() + t.dailyCurve.length); return d.toISOString().split('T')[0] })() : '')

  // Timeline start = planting or 60 days before harvest
  const timeStart = plantDate || (firstHarvest ? (() => { const d = new Date(firstHarvest); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0] })() : '')
  const timeEnd = lastHarvest || firstHarvest || ''
  if (!timeStart || !timeEnd) return <div className="text-gray-400 text-sm text-center py-8">Brak danych czasowych</div>

  const totalDays = daysBetween(timeStart, timeEnd)
  
  // Zoom/pan
  const visibleStart = Math.floor(totalDays * viewRange[0])
  const visibleEnd = Math.ceil(totalDays * viewRange[1])
  const visibleDays = visibleEnd - visibleStart
  const viewStartDate = (() => { const d = new Date(timeStart); d.setDate(d.getDate() + visibleStart); return d.toISOString().split('T')[0] })()
  const viewEndDate = (() => { const d = new Date(timeStart); d.setDate(d.getDate() + visibleEnd); return d.toISOString().split('T')[0] })()

  const zoomIn = () => {
    const mid = (viewRange[0] + viewRange[1]) / 2
    const span = (viewRange[1] - viewRange[0]) * 0.6
    setViewRange([Math.max(0, mid - span/2), Math.min(1, mid + span/2)])
  }
  const zoomOut = () => {
    const mid = (viewRange[0] + viewRange[1]) / 2
    const span = Math.min(1, (viewRange[1] - viewRange[0]) * 1.6)
    setViewRange([Math.max(0, mid - span/2), Math.min(1, mid + span/2)])
  }
  const panLeft = () => {
    const span = viewRange[1] - viewRange[0]
    const shift = span * 0.3
    if (viewRange[0] > 0) setViewRange([Math.max(0, viewRange[0] - shift), Math.max(span, viewRange[1] - shift)])
  }
  const panRight = () => {
    const span = viewRange[1] - viewRange[0]
    const shift = span * 0.3
    if (viewRange[1] < 1) setViewRange([Math.min(1 - span, viewRange[0] + shift), Math.min(1, viewRange[1] + shift)])
  }
  

  // Mini map drag
  const handleMiniMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    setIsDragging(true); setDragStart(x); setDragViewStart([...viewRange] as [number, number])
  }
  const handleMiniMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const delta = x - dragStart
    const span = dragViewStart[1] - dragViewStart[0]
    let newStart = dragViewStart[0] + delta
    if (newStart < 0) newStart = 0
    if (newStart + span > 1) newStart = 1 - span
    setViewRange([newStart, newStart + span])
  }
  const handleMiniMouseUp = () => setIsDragging(false)

  if (totalDays <= 0) return <div className="text-gray-400 text-sm text-center py-8">Błąd osi czasu</div>

  const dateToX = (date: string) => PAD.left + ((daysBetween(timeStart, date) - visibleStart) / visibleDays) * chartW

  // Build daily harvest map
  const dailyHarvest: Record<string, number> = {}
  if (t.dailyCurve && t.startDate) {
    t.dailyCurve.forEach((kg, i) => {
      const d = new Date(t.startDate!); d.setDate(d.getDate() + i)
      dailyHarvest[d.toISOString().split('T')[0]] = kg
    })
  }

  // Build weekly harvest data
  const weeklyHarvest: { weekStart: string; weekEnd: string; kg: number; week: number }[] = []
  if (t.dailyCurve && t.startDate) {
    const weekMap: Record<number, { kg: number; dates: string[] }> = {}
    t.dailyCurve.forEach((kg, i) => {
      const d = new Date(t.startDate!); d.setDate(d.getDate() + i)
      const wk = getWeekNumber(d)
      if (!weekMap[wk]) weekMap[wk] = { kg: 0, dates: [] }
      weekMap[wk].kg += kg
      weekMap[wk].dates.push(d.toISOString().split('T')[0])
    })
    Object.entries(weekMap).sort(([a],[b]) => Number(a)-Number(b)).forEach(([wk, data]) => {
      weeklyHarvest.push({ week: Number(wk), weekStart: data.dates[0], weekEnd: data.dates[data.dates.length-1], kg: data.kg })
    })
  }
  const maxWeekKg = Math.max(...weeklyHarvest.map(w => w.kg), 1)

  // Temp scales
  const allTemps = [...outsideTemps.map(t=>t.avg), ...insideTemps.map(t=>t.avg)]
  const tempMin = allTemps.length > 0 ? Math.min(...outsideTemps.map(t=>t.min), ...insideTemps.map(t=>t.min || 99)) - 2 : -5
  const tempMax = allTemps.length > 0 ? Math.max(...outsideTemps.map(t=>t.max), ...insideTemps.map(t=>t.max || -99)) + 2 : 35
  const tempToY = (v: number) => PAD.top + chartH - ((v - tempMin) / (tempMax - tempMin)) * chartH * 0.4

  // GDH scale (right axis)
  const maxGdh = gdhPoints.length > 0 ? gdhPoints[gdhPoints.length - 1].cumulativeGdh : 1
  const gdhToY = (v: number) => PAD.top + chartH - (v / maxGdh) * chartH * 0.85

  // Harvest bar scale (up to 60% of chart height)
  const harvestToH = (kg: number) => (kg / maxWeekKg) * chartH * 0.55

  // GDH at first harvest
  const gdhAtFirstHarvest = firstHarvest && gdhPoints.length > 0
    ? gdhPoints.find(p => p.date >= firstHarvest)?.cumulativeGdh || null : null

  // Month labels for X axis
  const months: { date: string; label: string }[] = []
  const cur = new Date(timeStart)
  cur.setDate(1); cur.setMonth(cur.getMonth() + 1)
  while (cur.toISOString().split('T')[0] <= timeEnd) {
    months.push({ date: cur.toISOString().split('T')[0], label: cur.toLocaleDateString('pl-PL', { month: 'short' }) })
    cur.setMonth(cur.getMonth() + 1)
  }

  // Build SVG paths (filtered to visible range)
  const outsideTempPath = outsideTemps.filter(p => p.date >= viewStartDate && p.date <= viewEndDate)
    .map((p, i) => `${i===0?'M':'L'}${dateToX(p.date).toFixed(1)},${tempToY(p.avg).toFixed(1)}`).join(' ')
  const insideTempPath = insideTemps.filter(p => p.date >= viewStartDate && p.date <= viewEndDate)
    .map((p, i) => `${i===0?'M':'L'}${dateToX(p.date).toFixed(1)},${tempToY(p.avg).toFixed(1)}`).join(' ')
  const gdhPath = gdhPoints.filter(p => p.date >= viewStartDate && p.date <= viewEndDate && p.cumulativeGdh > 0)
    .map((p, i) => `${i===0?'M':'L'}${dateToX(p.date).toFixed(1)},${gdhToY(p.cumulativeGdh).toFixed(1)}`).join(' ')

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = W / rect.width
    const x = (e.clientX - rect.left) * scaleX
    const dayIdx = Math.round(((x - PAD.left) / chartW) * visibleDays) + visibleStart
    if (dayIdx < 0 || dayIdx > totalDays) { setTooltip(null); return }
    const d = new Date(timeStart); d.setDate(d.getDate() + dayIdx)
    const ds = d.toISOString().split('T')[0]
    const parts: string[] = [fmtDate(ds)]
    const temp = outsideTemps.find(t => t.date === ds)
    if (temp) parts.push('Temp zew: ' + temp.avg.toFixed(1) + '°C')
    const tempIn = insideTemps.find(t => t.date === ds)
    if (tempIn) parts.push('Temp wew: ' + tempIn.avg.toFixed(1) + '°C')
    const gdh = gdhPoints.find(g => g.date === ds)
    if (gdh) parts.push('GDH: ' + gdh.cumulativeGdh.toLocaleString('pl-PL') + ' (+' + gdh.gdh + '/d)')
    const harv = dailyHarvest[ds]
    if (harv) parts.push('Zbiór: ' + harv.toFixed(1) + ' kg')
    setTooltip(parts.length > 0 ? { x, content: parts.join(" | ") } : null)
  }

  return (
    <div className="bg-white rounded-lg border p-3 overflow-x-auto">
      {/* Phase progress bar */}
      {layers.phases && (() => {
        const flowerGdh = t.winteredInTunnel ? t.variety?.gdhWinteredFlower : (t.plantSource === 'long_canes' ? t.variety?.gdhLcFlower : t.variety?.gdhWinteredFlower)
        const fruitGdh = t.winteredInTunnel ? t.variety?.gdhWinteredFruit : (t.plantSource === 'long_canes' ? t.variety?.gdhLcFruit : t.variety?.gdhWinteredFruit)
        if (!flowerGdh && !fruitGdh) return null
        if (gdhPoints.length === 0) return null
        
        const maxCumGdh = gdhPoints[gdhPoints.length - 1]?.cumulativeGdh || 1
        // Use tunnel GDH if inside temps available, otherwise outside GDH
        const gdhSource = insideTemps.length > 0 ? (() => {
          let cum = 0
          return insideTemps.map((tp) => {
            cum += Math.max(0, (tp.avg - baseTemp)) * 24
            return { date: tp.date, cumulativeGdh: cum }
          })
        })() : gdhPoints
        const flowerDate = flowerGdh ? gdhSource.find(p => p.cumulativeGdh >= flowerGdh)?.date : null
        const fruitDate = fruitGdh ? gdhSource.find(p => p.cumulativeGdh >= fruitGdh)?.date : null
        const plantD = plantDate || gdhPoints[0]?.date || ''

        const flowerPct = flowerGdh ? Math.min((flowerGdh / (fruitGdh || maxCumGdh)) * 100, 100) : 0

        const daysToFlower = flowerDate && plantD ? daysBetween(plantD, flowerDate) : null
        const daysFlowerToFruit = flowerDate && fruitDate ? daysBetween(flowerDate, fruitDate) : null
        const gdhFlowerToFruit = flowerGdh && fruitGdh ? fruitGdh - flowerGdh : null
        
        return (
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Fazy rozwoju wg normy odmiany</div>
            
            {/* Phase bar */}
            <div className="relative h-10 bg-gray-100 rounded-lg overflow-hidden mb-1">
              {/* Planting to flowering */}
              {flowerGdh && (
                <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-200 to-pink-200 flex items-center justify-center"
                  style={{width: flowerPct + '%'}}>
                  <span className="text-[10px] font-bold text-green-800 whitespace-nowrap px-1">
                    🌱→🌸 {flowerGdh.toLocaleString('pl-PL')} GDH
                    {daysToFlower ? ' (' + daysToFlower + ' dni)' : ''}
                  </span>
                </div>
              )}
              {/* Flowering to fruiting */}
              {flowerGdh && fruitGdh && (
                <div className="absolute top-0 h-full bg-gradient-to-r from-pink-200 to-red-300 flex items-center justify-center"
                  style={{left: flowerPct + '%', width: (100 - flowerPct) + '%'}}>
                  <span className="text-[10px] font-bold text-red-800 whitespace-nowrap px-1">
                    🌸→🍒 {gdhFlowerToFruit?.toLocaleString('pl-PL')} GDH
                    {daysFlowerToFruit ? ' (' + daysFlowerToFruit + ' dni)' : ''}
                  </span>
                </div>
              )}
              {/* Markers */}
              <div className="absolute left-0 top-0 h-full w-0.5 bg-green-600" />
              {flowerGdh && <div className="absolute top-0 h-full w-0.5 bg-pink-500" style={{left: flowerPct + '%'}} />}
              <div className="absolute right-0 top-0 h-full w-0.5 bg-red-600" />
            </div>
            
            {/* Labels below bar */}
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>🌱 {plantD ? fmtDate(plantD) : 'Sadzenie'} (0 GDH)</span>
              {flowerDate && <span className="text-pink-600">🌸 {fmtDate(flowerDate)} ({flowerGdh?.toLocaleString('pl-PL')} GDH)</span>}
              {fruitDate && <span className="text-red-600">🍒 {fmtDate(fruitDate)} ({fruitGdh?.toLocaleString('pl-PL')} GDH)</span>}
            </div>
            
            {/* Comparison with actual */}
            {firstHarvest && fruitDate && (
              <div className="mt-2 text-xs bg-amber-50 rounded px-3 py-1.5 border border-amber-200">
                <span className="text-amber-800">
                  📊 Wg normy pierwszy zbiór: <strong>{fmtDate(fruitDate)}</strong> | 
                  Rzeczywisty: <strong>{fmtDate(firstHarvest)}</strong> | 
                  Różnica: <strong>{daysBetween(fruitDate, firstHarvest)} dni</strong>
                  {gdhAtFirstHarvest && fruitGdh ? (' (Δ ' + (gdhAtFirstHarvest - fruitGdh).toLocaleString('pl-PL') + ' GDH)') : ''}
                </span>
              </div>
            )}
          </div>
        )
      })()}

      <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
        <button onClick={() => toggleLayer('harvest')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.harvest ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          <span className="w-3 h-2 bg-orange-400 rounded inline-block" /> Zbiory
        </button>
        {outsideTemps.length > 0 && <button onClick={() => toggleLayer('tempOutside')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.tempOutside ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          <span className="w-4 h-0.5 bg-orange-500 inline-block" /> Temp. zew.
        </button>}
        {insideTemps.length > 0 && <button onClick={() => toggleLayer('tempInside')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.tempInside ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          <span className="w-4 h-0.5 bg-purple-500 inline-block" /> Temp. tunel
        </button>}
        {gdhPoints.length > 0 && <button onClick={() => toggleLayer('gdh')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.gdh ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          <span className="w-4 h-0.5 bg-green-600 inline-block" /> GDH zew.
        </button>}
        {insideTemps.length > 0 && <button onClick={() => toggleLayer('gdhTunnel')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.gdhTunnel ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          <span className="w-4 inline-block" style={{borderTop:'2px dashed #10b981'}} /> GDH tunel
        </button>}
        {(t.variety?.gdhWinteredFlower || t.variety?.gdhLcFlower) && <button onClick={() => toggleLayer('phases')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.phases ? 'bg-pink-50 border-pink-300 text-pink-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          🌸🍒 Fazy
        </button>}
        <button onClick={() => toggleLayer('markers')} className={'flex items-center gap-1 px-2 py-1 rounded-full border transition-all ' + (layers.markers ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
          🌱 Markery
        </button>
        {plantDate && <span className="flex items-center gap-1">🌱 Nasadzenie</span>}
        {firstHarvest && <span className="flex items-center gap-1"><RaspberryIcon size={14} /> Pierwszy zbiór</span>}
      </div>

      <svg ref={svgRef} viewBox={'0 0 ' + W + ' ' + H} className="w-full" style={{ minWidth: '700px' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD.left} x2={W-PAD.right} y1={PAD.top + chartH * (1-f)} y2={PAD.top + chartH * (1-f)} stroke="#f0f0f0" />
        ))}

        {/* Month labels */}
        {months.filter(m => m.date >= viewStartDate && m.date <= viewEndDate).map(m => {
          const x = dateToX(m.date)
          return x > PAD.left && x < W - PAD.right ? (
            <g key={m.date}>
              <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + chartH} stroke="#e5e7eb" strokeDasharray="4" />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{m.label}</text>
            </g>
          ) : null
        })}

        {/* Phase zones on chart */}
        {layers.phases && (() => {
          const flowerGdh = t.winteredInTunnel ? t.variety?.gdhWinteredFlower : (t.plantSource === 'long_canes' ? t.variety?.gdhLcFlower : t.variety?.gdhWinteredFlower)
          const fruitGdh = t.winteredInTunnel ? t.variety?.gdhWinteredFruit : (t.plantSource === 'long_canes' ? t.variety?.gdhLcFruit : t.variety?.gdhWinteredFruit)
          if (!flowerGdh && !fruitGdh) return null
          if (gdhPoints.length === 0) return null
          
          const flowerDate = flowerGdh ? gdhPoints.find(p => p.cumulativeGdh >= flowerGdh)?.date : null
          const fruitDate = fruitGdh ? gdhPoints.find(p => p.cumulativeGdh >= fruitGdh)?.date : null
          
          const pStart = plantDate || gdhPoints[0]?.date || viewStartDate
          const x0 = dateToX(pStart)
          const xF = flowerDate ? dateToX(flowerDate) : null
          const xR = fruitDate ? dateToX(fruitDate) : null
          
          return (
            <>
              {/* Planting to Flowering zone */}
              {xF && x0 < W - PAD.right && xF > PAD.left && (
                <rect x={Math.max(x0, PAD.left)} y={PAD.top} 
                  width={Math.min(xF, W-PAD.right) - Math.max(x0, PAD.left)} height={chartH} 
                  fill="#dcfce7" opacity={0.25} />
              )}
              {/* Flowering to Fruiting zone */}
              {xF && xR && xF < W - PAD.right && xR > PAD.left && (
                <rect x={Math.max(xF, PAD.left)} y={PAD.top}
                  width={Math.min(xR, W-PAD.right) - Math.max(xF, PAD.left)} height={chartH}
                  fill="#fce7f3" opacity={0.25} />
              )}
              {/* Flowering vertical marker */}
              {xF && xF > PAD.left && xF < W - PAD.right && (
                <g>
                  <line x1={xF} x2={xF} y1={PAD.top} y2={PAD.top + chartH} stroke="#ec4899" strokeWidth={1.5} strokeDasharray="4,3" />
                  <text x={xF} y={PAD.top - 5} textAnchor="middle" fontSize="12">🌸</text>
                </g>
              )}
              {/* Fruiting vertical marker */}
              {xR && xR > PAD.left && xR < W - PAD.right && (
                <g>
                  <line x1={xR} x2={xR} y1={PAD.top} y2={PAD.top + chartH} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4,3" />
                  <text x={xR} y={PAD.top - 5} textAnchor="middle" fontSize="12">🍒</text>
                </g>
              )}
            </>
          )
        })()}

        {/* Weekly harvest bars */}
        {layers.harvest && weeklyHarvest.filter(w => w.weekEnd >= viewStartDate && w.weekStart <= viewEndDate).map((w, i) => {
          const x1 = dateToX(w.weekStart), x2 = dateToX(w.weekEnd)
          const bw = Math.max(x2 - x1, 6)
          const bh = harvestToH(w.kg)
          return (
            <g key={i}>
              <rect x={x1} y={PAD.top + chartH - bh} width={bw} height={bh} fill="#fb923c" opacity={0.7} rx={2} />
              <text x={x1 + bw/2} y={PAD.top + chartH + 14} textAnchor="middle" fontSize="8" fill="#9ca3af">T{w.week}</text>
            </g>
          )
        })}

        {/* Outside temp line */}
        {layers.tempOutside && outsideTempPath && <path d={outsideTempPath} fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.8} />}
        
        {/* Inside temp line */}
        {layers.tempInside && insideTempPath && <path d={insideTempPath} fill="none" stroke="#a855f7" strokeWidth={1.5} opacity={0.8} />}

        {/* GDH cumulative line */}
        {layers.gdh && gdhPath && <path d={gdhPath} fill="none" stroke="#16a34a" strokeWidth={2} />}

        {/* GDH tunnel cumulative line */}
        {layers.gdhTunnel && insideTemps.length > 0 && (() => {
          let cumGdh = 0
          const tunnelGdhPoints = insideTemps.map((tp) => {
            const gdh = Math.max(0, (tp.avg - baseTemp)) * 24
            cumGdh += gdh
            return { date: tp.date, cumulativeGdh: cumGdh }
          })
          if (tunnelGdhPoints.length === 0) return null
          const maxTunnelGdh = tunnelGdhPoints[tunnelGdhPoints.length - 1].cumulativeGdh
          const gdhMax2 = Math.max(gdhPoints.length > 0 ? gdhPoints[gdhPoints.length - 1].cumulativeGdh : 0, maxTunnelGdh)
          const path = tunnelGdhPoints.filter(p => p.date >= viewStartDate && p.date <= viewEndDate)
            .map((p, i) => {
              const x = dateToX(p.date)
              const y = PAD.top + chartH - (p.cumulativeGdh / gdhMax2) * chartH
              return (i === 0 ? 'M' : 'L') + x + ',' + y
            }).join(' ')
          return path ? <path d={path} fill="none" stroke="#10b981" strokeWidth={2} strokeDasharray="6,3" opacity={0.9} /> : null
        })()}
        {/* Planting marker */}
        {layers.markers && plantDate && plantDate >= viewStartDate && plantDate <= viewEndDate && dateToX(plantDate) >= PAD.left && (
          <g>
            <line x1={dateToX(plantDate)} x2={dateToX(plantDate)} y1={PAD.top} y2={PAD.top + chartH} stroke="#22c55e" strokeWidth={2} strokeDasharray="6" />
            <text x={dateToX(plantDate)} y={PAD.top - 5} textAnchor="middle" fontSize="16">🌱</text>
            <text x={dateToX(plantDate)} y={PAD.top + chartH + 28} textAnchor="middle" fontSize="8" fill="#16a34a">{fmtDate(plantDate)}</text>
          </g>
        )}

        {/* First harvest marker */}
        {layers.markers && firstHarvest && firstHarvest >= viewStartDate && firstHarvest <= viewEndDate && (
          <g>
            <line x1={dateToX(firstHarvest)} x2={dateToX(firstHarvest)} y1={PAD.top} y2={PAD.top + chartH} stroke="#dc2626" strokeWidth={2} strokeDasharray="6" />
            <text x={dateToX(firstHarvest)} y={PAD.top - 5} textAnchor="middle" fontSize="11" fill="#dc2626" fontWeight="bold">⬤ M</text>
            <text x={dateToX(firstHarvest)} y={PAD.top + chartH + 28} textAnchor="middle" fontSize="8" fill="#dc2626">{fmtDate(firstHarvest)}</text>
          </g>
        )}

        {/* Actual GDH at first harvest */}
        {layers.gdh && gdhAtFirstHarvest && (
          <g>
            <line x1={PAD.left} x2={dateToX(firstHarvest)} y1={gdhToY(gdhAtFirstHarvest)} y2={gdhToY(gdhAtFirstHarvest)} stroke="#16a34a" strokeWidth={1} strokeDasharray="3" opacity={0.5} />
            <text x={W - PAD.right + 4} y={gdhToY(gdhAtFirstHarvest) + 3} fontSize="9" fill="#16a34a" fontWeight="bold">{gdhAtFirstHarvest.toLocaleString('pl-PL')}</text>
          </g>
        )}

        {/* Left axis - Temperature */}
        {(layers.tempOutside || layers.tempInside) && outsideTemps.length > 0 && [0, 10, 20, 30].filter(v => v >= tempMin && v <= tempMax).map(v => (
          <text key={v} x={PAD.left - 6} y={tempToY(v) + 3} textAnchor="end" fontSize="9" fill="#f97316">{v}°</text>
        ))}

        {/* Right axis - GDH */}
        {layers.gdh && gdhPoints.length > 0 && [0, 0.25, 0.5, 0.75, 1].map(f => {
          const v = Math.round(maxGdh * f)
          return <text key={f} x={W - PAD.right + 6} y={gdhToY(v) + 3} fontSize="9" fill="#16a34a">{(v/1000).toFixed(0)}k</text>
        })}

        {/* Axis labels */}
        <text x={8} y={PAD.top + chartH/2} textAnchor="middle" fontSize="9" fill="#f97316" transform={'rotate(-90,' + 8 + ',' + (PAD.top + chartH/2) + ')'}>°C</text>
        <text x={W-6} y={PAD.top + chartH/2} textAnchor="middle" fontSize="9" fill="#16a34a" transform={'rotate(90,' + (W-6) + ',' + (PAD.top + chartH/2) + ')'}>GDH</text>

        {/* Summer/Autumn separator */}
        {layers.markers && summerEndWeek && (() => {
          const sepWeek = weeklyHarvest.find(w => w.week === summerEndWeek)
          if (!sepWeek) return null
          const sx = dateToX(sepWeek.weekEnd)
          if (sx < PAD.left || sx > W - PAD.right) return null
          return (
            <g>
              <line x1={sx} x2={sx} y1={PAD.top} y2={PAD.top + chartH} stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="8,4" />
              <text x={sx - 4} y={PAD.top + 14} textAnchor="end" fontSize="9" fill="#8b5cf6" fontWeight="bold">LATO</text>
              <text x={sx + 4} y={PAD.top + 14} textAnchor="start" fontSize="9" fill="#8b5cf6" fontWeight="bold">JESIEŃ</text>
              <rect x={sx - 8} y={PAD.top + chartH - 20} width={16} height={20} fill="#8b5cf6" opacity={0.2} rx={3}
                style={{ cursor: 'ew-resize' }} />
              <text x={sx} y={PAD.top + chartH - 6} textAnchor="middle" fontSize="10" fill="#8b5cf6" style={{ cursor: 'ew-resize' }}>⋮</text>
            </g>
          )
        })()}

        {/* Tooltip line */}
        {tooltip && <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + chartH} stroke="#6b7280" strokeWidth={1} opacity={0.4} />}
      </svg>

      {tooltip && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-1.5 mt-1 text-center">{tooltip.content}</div>
      )}

      {/* Zoom controls + minimap */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex gap-1">
          <button onClick={panLeft} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center" title="W lewo">◀</button>
          <button onClick={zoomIn} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center font-bold" title="Przybliż">+</button>
          <button onClick={zoomOut} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center font-bold" title="Oddal">−</button>
          <button onClick={panRight} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center justify-center" title="W prawo">▶</button>
          <button onClick={() => setViewRange([0, 1])} className="ml-1 px-2 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs" title="Reset">Cały zakres</button>
        </div>
        <div className="text-xs text-gray-400">
          {fmtDate(viewStartDate)} — {fmtDate(viewEndDate)} ({visibleDays} dni)
        </div>
      </div>

      {/* Minimap */}
      <svg className="w-full h-8 mt-1 cursor-grab" viewBox="0 0 900 30" style={{ minWidth: '700px' }}
        onMouseDown={handleMiniMouseDown} onMouseMove={handleMiniMouseMove} onMouseUp={handleMiniMouseUp} onMouseLeave={handleMiniMouseUp}>
        {/* Background bars - weekly harvest mini */}
        {weeklyHarvest.map((w, i) => {
          const x1 = PAD.left + ((daysBetween(timeStart, w.weekStart)) / totalDays) * chartW
          const x2 = PAD.left + ((daysBetween(timeStart, w.weekEnd)) / totalDays) * chartW
          const bw = Math.max(x2 - x1, 3)
          return <rect key={i} x={x1} y={30 - (w.kg / maxWeekKg) * 25} width={bw} height={(w.kg / maxWeekKg) * 25} fill="#fdba74" rx={1} />
        })}
        {/* View window */}
        <rect x={PAD.left + viewRange[0] * chartW} y={0} width={Math.max((viewRange[1] - viewRange[0]) * chartW, 4)} height={30}
          fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={1.5} rx={3} />
        {/* Markers */}
        {plantDate && <line x1={PAD.left + (daysBetween(timeStart, plantDate) / totalDays) * chartW} x2={PAD.left + (daysBetween(timeStart, plantDate) / totalDays) * chartW} y1={0} y2={30} stroke="#22c55e" strokeWidth={1.5} />}
        {firstHarvest && <line x1={PAD.left + (daysBetween(timeStart, firstHarvest) / totalDays) * chartW} x2={PAD.left + (daysBetween(timeStart, firstHarvest) / totalDays) * chartW} y1={0} y2={30} stroke="#dc2626" strokeWidth={1.5} />}
      </svg>
    </div>
  )
}

// ===== TEMPLATE DETAIL =====
function TemplateDetail({ template: t, varieties, sections, onSave, onDelete }: { template: Template; varieties: Variety[]; sections: PlantationSection[]; onSave: () => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [fetchingTemps, setFetchingTemps] = useState(false)
  const gdhFileRef = useRef<HTMLInputElement>(null)
  const [showCurveTable, setShowCurveTable] = useState(false)

  // Summer/autumn boundary
  const weeklyData = useMemo(() => {
    if (!t.dailyCurve || !t.startDate) return []
    const weekMap: Record<number, { kg: number; days: { date: string; kg: number }[] }> = {}
    t.dailyCurve.forEach((kg, i) => {
      const d = new Date(t.startDate!); d.setDate(d.getDate() + i)
      const ds = d.toISOString().split('T')[0]
      const wk = getWeekNumber(d)
      if (!weekMap[wk]) weekMap[wk] = { kg: 0, days: [] }
      weekMap[wk].kg += kg
      weekMap[wk].days.push({ date: ds, kg })
    })
    return Object.entries(weekMap).sort(([a],[b]) => Number(a) - Number(b))
      .map(([wk, data]) => ({ week: Number(wk), kg: data.kg, days: data.days }))
  }, [t.dailyCurve, t.startDate])

  // Determine summer end week - auto-detect or use saved value
  const defaultSummerEnd = useMemo(() => {
    if (t.summerEndWeek) return t.summerEndWeek
    return detectSummerEnd(weeklyData)
  }, [weeklyData, t.summerEndWeek])

  const [summerEndWeek, setSummerEndWeek] = useState(defaultSummerEnd)

  const summerWeeks = weeklyData.filter(w => w.week <= summerEndWeek)
  const autumnWeeks = weeklyData.filter(w => w.week > summerEndWeek)
  const summerTotalKg = summerWeeks.reduce((s, w) => s + w.kg, 0)
  const autumnTotalKg = autumnWeeks.reduce((s, w) => s + w.kg, 0)
  const summerDays = summerWeeks.flatMap(w => w.days)

  const saveSummerEnd = async (week: number) => {
    setSummerEndWeek(week)
    await fetch('/api/templates/' + t.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summerEndWeek: week })
    })
    onSave()
  }

  const baseTemp = t.variety?.baseTemp || 6.0
  const outsideTemps: TempPoint[] = Array.isArray(t.outsideTemps) ? t.outsideTemps : []
  const insideTemps: TempPoint[] = Array.isArray(t.insideTunnelTemps) ? t.insideTunnelTemps : []
  const gdhPoints: GdhPoint[] = Array.isArray(t.gdhData) ? t.gdhData : []

  // Calculate key metrics
  const daysToHarvest = t.plantingDate && t.startDate ? daysBetween(t.plantingDate, t.startDate) : null
  const gdhAtFirstHarvest = t.startDate && gdhPoints.length > 0
    ? gdhPoints.find(p => p.date >= t.startDate!)?.cumulativeGdh || null : null

  const fetchHistoricalTemps = async () => {
    if (!t.startDate) { alert('Brak daty startu'); return }
    setFetchingTemps(true)
    try {
      const fetchStart = t.plantingDate || (() => { const d = new Date(t.startDate!); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0] })()
      const fetchEnd = t.endDate || (() => { const d = new Date(t.startDate!); d.setDate(d.getDate() + (t.dailyCurve?.length || 60)); return d.toISOString().split('T')[0] })()
      const res = await fetch('/api/weather/fetch-historical?startDate=' + fetchStart + '&endDate=' + fetchEnd)
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      if (data.temperatures && data.temperatures.length > 0) {
        let cumGdh = 0
        const plantDateStr = t.plantingDate || t.startDate || ''
        const gdhCalc = data.temperatures.map((tp: TempPoint) => {
          // GDH liczymy TYLKO od daty nasadzenia
          if (plantDateStr && tp.date < plantDateStr) {
            return { date: tp.date, gdh: 0, cumulativeGdh: 0 }
          }
          const gdh = Math.max(0, (tp.avg - baseTemp)) * 24
          cumGdh += gdh
          return { date: tp.date, gdh: Math.round(gdh), cumulativeGdh: Math.round(cumGdh) }
        })
        await fetch('/api/templates/' + t.id, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outsideTemps: data.temperatures, gdhData: gdhCalc, gdhToFirstFruit: t.startDate ? gdhCalc.find((g: GdhPoint) => g.date >= t.startDate!)?.cumulativeGdh || null : null })
        })
        alert('Pobrano ' + data.temperatures.length + ' dni temp. + GDH (baza: ' + baseTemp + '°C)')
        onSave()
      }
    } catch (e) { alert('Błąd: ' + e) }
    finally { setFetchingTemps(false) }
  }

  const handleGDHUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[]

      // Flexible column name detection
      const getVal = (r: Record<string, unknown>, ...keys: string[]): string | null => {
        for (const k of keys) {
          for (const col of Object.keys(r)) {
            if (col.toLowerCase().includes(k.toLowerCase())) return String(r[col] ?? '')
          }
        }
        return null
      }
      
      // Parse all rows with flexible column matching
      const rawRows = rows.map(r => {
        const timestamp = getVal(r, 'data', 'date', 'timestamp', 'czas', 'time') || ''
        const temp = parseFloat(getVal(r, 'temp', 'temperatura') || '0')
        const gdh = parseFloat(getVal(r, 'gdh', 'GDH', 'godziny') || '0')
        const dateStr = parseExcelDate(String(timestamp))
        return { date: dateStr ? dateStr.slice(0, 10) : '', temp, gdh }
      }).filter(r => r.date)
      
      if (rawRows.length === 0) { alert('Brak danych do zaimportowania'); return }
      
      // Check if sub-daily (multiple rows per day) -> aggregate to daily
      const dailyMap: Record<string, { temps: number[], gdhs: number[] }> = {}
      for (const r of rawRows) {
        if (!dailyMap[r.date]) dailyMap[r.date] = { temps: [], gdhs: [] }
        if (r.temp !== 0) dailyMap[r.date].temps.push(r.temp)
        if (r.gdh !== 0) dailyMap[r.date].gdhs.push(r.gdh)
      }
      
      const isSubDaily = rawRows.length > Object.keys(dailyMap).length * 1.5
      const dailyData = Object.entries(dailyMap).sort(([a],[b]) => a.localeCompare(b)).map(([date, d]) => {
        const avg = d.temps.length > 0 ? d.temps.reduce((s,v) => s+v, 0) / d.temps.length : 0
        const min = d.temps.length > 0 ? Math.min(...d.temps) : avg - 3
        const max = d.temps.length > 0 ? Math.max(...d.temps) : avg + 3
        const gdh = d.gdhs.length > 0 ? d.gdhs.reduce((s,v) => s+v, 0) : Math.max(0, (avg - baseTemp)) * 24
        return { date, avg: Math.round(avg * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, gdh: Math.round(gdh) }
      })
      
      // Build inside temps and GDH data
      const insideData = dailyData.filter(d => d.avg > 0).map(d => ({ date: d.date, avg: d.avg, min: d.min, max: d.max }))
      let cumGdh = 0
      const gdhCalc = dailyData.map(d => {
        const dg = Math.max(0, (d.avg - baseTemp)) * 24
        cumGdh += dg
        return { date: d.date, gdh: Math.round(dg), cumulativeGdh: Math.round(cumGdh) }
      })
      
      const updateData: Record<string, unknown> = {}
      if (insideData.length > 0) updateData.insideTunnelTemps = insideData
      if (gdhCalc.length > 0) updateData.gdhData = gdhCalc
      await fetch('/api/templates/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) })
      const msg = isSubDaily 
        ? 'Załadowano ' + rawRows.length + ' pomiarów → zagregowano do ' + dailyData.length + ' dni'
        : 'Załadowano ' + dailyData.length + ' dni danych'
      alert(msg + '\nGDH skumulowane: ' + cumGdh.toLocaleString('pl-PL'))
      onSave()
    } catch (err) { alert('Błąd importu: ' + err) }
    if (gdhFileRef.current) gdhFileRef.current.value = ''
  }

  const startEdit = () => {
    setEditing(true)
    setEditForm({ name: t.name, description: t.description, productionCycle: t.productionCycle,
      plantingDate: t.plantingDate, winteredInTunnel: t.winteredInTunnel, plantSource: t.plantSource,
      notes: t.notes, gdhToFlowering: t.gdhToFlowering, gdhToFirstFruit: t.gdhToFirstFruit, varietyId: t.variety?.id || '',
      sourceSectionId: t.sourceSectionId || '' })
  }
  const saveEdit = async () => {
    await fetch('/api/templates/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
    setEditing(false); onSave()
  }

  if (editing) return (
    <div className="space-y-4 p-6 bg-gray-50 border-t">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs font-medium text-gray-500">Nazwa</label><input value={String(editForm.name||'')} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,name:e.target.value}))} className="w-full border rounded-lg px-3 py-2 mt-1"/></div>
        <div><label className="text-xs font-medium text-gray-500">Odmiana</label>
          <select value={String(editForm.varietyId||'')} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,varietyId:e.target.value}))} className="w-full border rounded-lg px-3 py-2 mt-1">
            <option value="">—</option>{varieties.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        <div><label className="text-xs font-medium text-gray-500">Sekcja źródłowa</label>
          <select value={String(editForm.sourceSectionId||'')} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,sourceSectionId:e.target.value||null}))} className="w-full border rounded-lg px-3 py-2 mt-1">
            <option value="">— brak —</option>{sections.map(s=><option key={s.id} value={s.id}>{s.blockName}/{s.name} ({s.varietyName})</option>)}
          </select></div>
        <div><label className="text-xs font-medium text-gray-500">Cykl produkcji</label><select value={String(editForm.productionCycle||1)} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,productionCycle:parseInt(e.target.value)}))} className="w-full border rounded-lg px-3 py-2 mt-1"><option value={1}>1. rok</option><option value={2}>2. rok</option><option value={3}>3. rok</option></select></div>
        <div><label className="text-xs font-medium text-gray-500">Data sadzenia</label><input type="date" value={String(editForm.plantingDate||'')} onChange={e=>{
              const val = e.target.value
              if (val) setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p, plantingDate:val, winteredInTunnel:false}))
              else setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p, plantingDate:''}))
            }} className="w-full border rounded-lg px-3 py-2 mt-1" disabled={!!editForm.winteredInTunnel}/>{editForm.winteredInTunnel && <p className="text-xs text-gray-400 mt-1">Wyłączone — rośliny zimowane</p>}</div>
        <div><label className="text-xs font-medium text-gray-500">Źródło sadzonek</label><select value={String(editForm.plantSource||'')} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,plantSource:e.target.value}))} className="w-full border rounded-lg px-3 py-2 mt-1"><option value="">—</option><option value="long_canes">Long canes</option><option value="tray_plants">Tray plants</option><option value="nursery">Szkółka</option></select></div>
        <div className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={!!editForm.winteredInTunnel} onChange={e=>{
              if (e.target.checked) setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p, winteredInTunnel:true, plantingDate:'', plantSource:''}))
              else setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p, winteredInTunnel:false}))
            }} className="w-4 h-4"/>
            <label className="text-sm">Zimowane w tunelu</label>
            {editForm.winteredInTunnel && editForm.plantingDate && <span className="text-xs text-red-500 ml-2">⚠️ Zimowane = brak daty sadzenia</span>}
          </div>
      </div>
      <div><label className="text-xs font-medium text-gray-500">Notatki</label><textarea value={String(editForm.notes||'')} onChange={e=>setEditForm((p: Record<string, string | number | boolean | null | undefined>)=>({...p,notes:e.target.value}))} className="w-full border rounded-lg px-3 py-2 mt-1" rows={2}/></div>
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h4 className="font-medium text-sm text-blue-800 mb-2">Import danych z czujników (temp. wewnętrzna + GDH)</h4>
        <p className="text-xs text-blue-600 mb-2">CSV/XLSX — kolumny z datą i temperaturą (dane co 15 min lub dzienne, automatyczna agregacja)</p>
        <input ref={gdhFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleGDHUpload} className="text-sm"/>
      </div>
      <div className="flex gap-2"><Button onClick={saveEdit} className="bg-green-600 hover:bg-green-700">Zapisz</Button><Button variant="outline" onClick={()=>setEditing(false)}>Anuluj</Button></div>
    </div>
  )

  return (
    <div className="border-t bg-gray-50 p-6 space-y-5">
      {/* METRIC CARDS */}
      <div className="flex gap-3 flex-wrap">
        {t.winteredInTunnel ? (
          <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-200 flex items-center gap-3">
            <Snowflake className="w-5 h-5 text-blue-500"/>
            <div><div className="text-xs text-blue-600">Zimowane w tunelu</div><div className="font-bold text-blue-800">❄️ Bez daty sadzenia</div></div>
          </div>
        ) : t.plantingDate ? (
          <div className="bg-green-50 rounded-lg px-4 py-3 border border-green-200 flex items-center gap-3">
            <Truck className="w-5 h-5 text-green-600"/>
            <div><div className="text-xs text-green-600">Przywiezione i wsadzone</div><div className="font-bold text-green-800">{fmtDate(t.plantingDate)}</div></div>
          </div>
        ) : null}
        <div className="bg-white rounded-lg px-4 py-3 border flex items-center gap-3">
          <RaspberryIcon size={24} />
          <div><div className="text-xs text-gray-400">Pierwszy zbiór</div><div className="font-bold">{t.startDate ? fmtDate(t.startDate) : '—'}</div></div>
        </div>
        {daysToHarvest !== null && (
          <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-200 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-amber-600"/>
            <div><div className="text-xs text-amber-600">Dni do owocowania</div><div className="font-bold text-amber-800">{daysToHarvest} dni</div></div>
          </div>
        )}
        {gdhAtFirstHarvest && (
          <div className="bg-green-50 rounded-lg px-4 py-3 border border-green-200 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-600"/>
            <div>
              <div className="text-xs text-green-600">GDH rzeczywiste do 1. zbioru (baza {baseTemp}°C)</div>
              <div className="font-bold text-green-800">{gdhAtFirstHarvest.toLocaleString('pl-PL')} GDH</div>
            </div>
          </div>
        )}
        <div className="bg-white rounded-lg px-4 py-3 border flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-gray-400"/>
          <div><div className="text-xs text-gray-400">Suma zbiorów</div><div className="font-bold text-green-700">{(t.totalKg/1000).toFixed(1)}t</div></div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border">
          <div className="text-xs text-gray-400">Odmiana</div><div className="font-bold">{t.variety?.name || '—'}</div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border">
          <div className="text-xs text-gray-400">Cykl / Rok</div><div className="font-bold">{t.productionCycle}. rok / {t.productionYear}</div>
        </div>
        {t.plantSource && (
          <div className="bg-white rounded-lg px-4 py-3 border">
            <div className="text-xs text-gray-400">Źródło</div><div className="font-bold">{t.plantSource === 'long_canes' ? '🌿 Long canes' : t.plantSource === 'tray_plants' ? '🌱 Tray plants' : t.plantSource}</div>
          </div>
        )}
        {t.sourceSection && (
          <div className="bg-indigo-50 rounded-lg px-4 py-3 border border-indigo-200">
            <div className="text-xs text-indigo-600">Sekcja źródłowa</div><div className="font-bold text-indigo-800">{t.sourceSection.name}</div>
          </div>
        )}
      </div>

      {/* UNIFIED CHART */}
      <UnifiedChart template={t} outsideTemps={outsideTemps} insideTemps={insideTemps} gdhPoints={gdhPoints} summerEndWeek={summerEndWeek} />

      {/* Season boundary selector + curve table toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-purple-600 font-medium">Granica lato/jesień:</span>
          <select value={summerEndWeek} onChange={e => saveSummerEnd(parseInt(e.target.value))}
            className="border border-purple-300 rounded-lg px-2 py-1 text-sm text-purple-700 bg-purple-50">
            {weeklyData.map(w => <option key={w.week} value={w.week}>Tydzień {w.week}</option>)}
          </select>
          <span className="text-gray-400 text-xs">lub data:</span>
          <input type="date" 
            value={(() => { const sw = weeklyData.find(w => w.week === summerEndWeek); return sw?.days[sw.days.length - 1]?.date || '' })()}
            onChange={e => { if (!e.target.value) return; const wk = getWeekNumber(new Date(e.target.value)); const closest = weeklyData.reduce((prev, curr) => Math.abs(curr.week - wk) < Math.abs(prev.week - wk) ? curr : prev); saveSummerEnd(closest.week) }}
            className="border border-purple-300 rounded-lg px-2 py-1 text-sm text-purple-700 bg-purple-50"
          />
          <span className="text-xs text-gray-400">
            Lato: {(summerTotalKg/1000).toFixed(1)}t ({summerWeeks.length} tyg.) | Jesień: {(autumnTotalKg/1000).toFixed(1)}t ({autumnWeeks.length} tyg.)
          </span>
        </div>
        <Button size="sm" variant={showCurveTable ? "default" : "outline"} onClick={() => setShowCurveTable(!showCurveTable)}
          className={showCurveTable ? "bg-purple-600 hover:bg-purple-700" : ""}>
          <BarChart3 className="w-4 h-4 mr-1" />{showCurveTable ? 'Ukryj tabelę' : 'Pokaż krzywą owocowania'}
        </Button>
      </div>

      {/* Curve percentage table */}
      {showCurveTable && summerTotalKg > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="bg-purple-50 px-4 py-2 border-b flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-600" />
            <h4 className="font-medium text-sm text-purple-800">Krzywa owocowania — Lato {t.productionYear}</h4>
            <span className="text-xs text-purple-500 ml-auto">Suma letnich zbiorów: {(summerTotalKg/1000).toFixed(2)}t ({summerTotalKg.toLocaleString('pl-PL')} kg)</span>
          </div>
          
          {/* Weekly summary */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Tydzień</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Daty</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">kg</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">% tygodnia</th>
                  <th className="py-2 px-3 font-medium text-gray-500 text-left">Rozkład</th>
                </tr>
              </thead>
              <tbody>
                {summerWeeks.map((w) => {
                  const pct = (w.kg / summerTotalKg) * 100
                  return (
                    <tr key={w.week} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">T{w.week}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs">{getWeekDates(w.week, t.productionYear)}</td>
                      <td className="py-2 px-3 text-right font-mono">{w.kg.toLocaleString('pl-PL', {maximumFractionDigits: 0})}</td>
                      <td className="py-2 px-3 text-right font-bold text-orange-700">{pct.toFixed(1)}%</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden" style={{maxWidth: '200px'}}>
                            <div className="h-full bg-orange-400 rounded-full" style={{width: pct + '%'}} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-orange-50 font-bold">
                  <td className="py-2 px-3" colSpan={2}>LATO RAZEM</td>
                  <td className="py-2 px-3 text-right font-mono">{summerTotalKg.toLocaleString('pl-PL', {maximumFractionDigits: 0})}</td>
                  <td className="py-2 px-3 text-right text-orange-700">100%</td>
                  <td className="py-2 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Daily detail (collapsible) */}
          <details className="border-t">
            <summary className="px-4 py-2 text-xs text-purple-600 cursor-pointer hover:bg-purple-50 font-medium">
              📊 Pokaż rozkład dzienny ({summerDays.length} dni)
            </summary>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b">
                    <th className="text-left py-1.5 px-3 font-medium text-gray-500">Data</th>
                    <th className="text-left py-1.5 px-3 font-medium text-gray-500">Dzień tyg.</th>
                    <th className="text-left py-1.5 px-3 font-medium text-gray-500">Tydzień</th>
                    <th className="text-right py-1.5 px-3 font-medium text-gray-500">kg</th>
                    <th className="text-right py-1.5 px-3 font-medium text-gray-500">% dnia</th>
                    <th className="text-right py-1.5 px-3 font-medium text-gray-500">% skumul.</th>
                    <th className="py-1.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cumPct = 0
                    const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
                    return summerDays.map((d, di) => {
                      const pct = (d.kg / summerTotalKg) * 100
                      cumPct += pct
                      const dow = new Date(d.date).getDay()
                      const wk = getWeekNumber(new Date(d.date))
                      return (
                        <tr key={di} className={`border-b hover:bg-gray-50 ${dow === 0 ? 'bg-red-50/30' : ''}`}>
                          <td className="py-1 px-3 font-mono">{fmtDate(d.date)}</td>
                          <td className="py-1 px-3 text-gray-500">{dayNames[dow]}</td>
                          <td className="py-1 px-3 text-gray-400">T{wk}</td>
                          <td className="py-1 px-3 text-right font-mono">{d.kg.toFixed(1)}</td>
                          <td className="py-1 px-3 text-right font-bold text-orange-600">{pct.toFixed(2)}%</td>
                          <td className="py-1 px-3 text-right text-green-700">{cumPct.toFixed(1)}%</td>
                          <td className="py-1 px-3 w-24">
                            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-orange-400 rounded-full" style={{width: Math.min(pct * 10, 100) + '%'}} />
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </details>

          {/* Autumn table if exists */}
          {autumnWeeks.length > 0 && autumnTotalKg > 0 && (
            <div className="border-t">
              <div className="bg-red-50 px-4 py-2 border-b flex items-center gap-2">
                <span className="text-lg">🍂</span>
                <h4 className="font-medium text-sm text-red-800">Krzywa owocowania — Jesień {t.productionYear}</h4>
                <span className="text-xs text-red-500 ml-auto">Suma jesiennych zbiorów: {(autumnTotalKg/1000).toFixed(2)}t ({autumnTotalKg.toLocaleString('pl-PL')} kg)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Tydzień</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Daty</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">kg</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">% tygodnia</th>
                    <th className="py-2 px-3 font-medium text-gray-500 text-left">Rozkład</th>
                  </tr></thead>
                  <tbody>
                    {autumnWeeks.map(w => {
                      const pct = (w.kg / autumnTotalKg) * 100
                      return (
                        <tr key={w.week} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">T{w.week}</td>
                          <td className="py-2 px-3 text-gray-500 text-xs">{getWeekDates(w.week, t.productionYear)}</td>
                          <td className="py-2 px-3 text-right font-mono">{w.kg.toLocaleString('pl-PL', {maximumFractionDigits: 0})}</td>
                          <td className="py-2 px-3 text-right font-bold text-red-700">{pct.toFixed(1)}%</td>
                          <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden" style={{maxWidth:'200px'}}><div className="h-full bg-red-400 rounded-full" style={{width:pct+'%'}}/></div></div></td>
                        </tr>
                      )
                    })}
                    <tr className="bg-red-50 font-bold">
                      <td className="py-2 px-3" colSpan={2}>JESIEŃ RAZEM</td>
                      <td className="py-2 px-3 text-right font-mono">{autumnTotalKg.toLocaleString('pl-PL', {maximumFractionDigits: 0})}</td>
                      <td className="py-2 px-3 text-right text-red-700">100%</td>
                      <td className="py-2 px-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <details className="border-t">
                <summary className="px-4 py-2 text-xs text-red-600 cursor-pointer hover:bg-red-50 font-medium">
                  📊 Pokaż rozkład dzienny jesieni ({autumnWeeks.flatMap(w => w.days).length} dni)
                </summary>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0"><tr className="border-b">
                      <th className="text-left py-1.5 px-3 font-medium text-gray-500">Data</th>
                      <th className="text-left py-1.5 px-3 font-medium text-gray-500">Dzień tyg.</th>
                      <th className="text-left py-1.5 px-3 font-medium text-gray-500">Tydzień</th>
                      <th className="text-right py-1.5 px-3 font-medium text-gray-500">kg</th>
                      <th className="text-right py-1.5 px-3 font-medium text-gray-500">% dnia</th>
                      <th className="text-right py-1.5 px-3 font-medium text-gray-500">% skumul.</th>
                      <th className="py-1.5 px-3"></th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        let cumPct = 0
                        const dayNames = ['Nd','Pn','Wt','Śr','Cz','Pt','So']
                        const autumnDays = autumnWeeks.flatMap(w => w.days)
                        return autumnDays.map((d, di) => {
                          const pct = (d.kg / autumnTotalKg) * 100
                          cumPct += pct
                          const dow = new Date(d.date).getDay()
                          const wk = getWeekNumber(new Date(d.date))
                          return (
                            <tr key={di} className={'border-b hover:bg-gray-50' + (dow === 0 ? ' bg-red-50/30' : '')}>
                              <td className="py-1 px-3 font-mono">{fmtDate(d.date)}</td>
                              <td className="py-1 px-3 text-gray-500">{dayNames[dow]}</td>
                              <td className="py-1 px-3 text-gray-400">T{wk}</td>
                              <td className="py-1 px-3 text-right font-mono">{d.kg.toFixed(1)}</td>
                              <td className="py-1 px-3 text-right font-bold text-red-600">{pct.toFixed(2)}%</td>
                              <td className="py-1 px-3 text-right text-green-700">{cumPct.toFixed(1)}%</td>
                              <td className="py-1 px-3 w-24"><div className="bg-gray-100 rounded-full h-2 overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{width: Math.min(pct * 10, 100) + '%'}}/></div></td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Status indicators */}
      <div className="flex gap-3 flex-wrap text-xs">
        <span className={outsideTemps.length > 0 ? 'text-green-600' : 'text-gray-400'}>
          {outsideTemps.length > 0 ? '✅' : '⚪'} Temp. zewn. (API): {outsideTemps.length} dni
        </span>
        <span className={insideTemps.length > 0 ? 'text-green-600' : 'text-gray-400'}>
          {insideTemps.length > 0 ? '✅' : '⚪'} Temp. wewn. (czujniki): {insideTemps.length} dni
        </span>
        <span className={gdhPoints.length > 0 ? 'text-green-600' : 'text-gray-400'}>
          {gdhPoints.length > 0 ? '✅' : '⚪'} GDH: {gdhPoints.length} dni (baza: {baseTemp}°C)
        </span>
      </div>

      {t.notes && <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700"><strong>Notatki:</strong> {t.notes}</div>}

      {/* Actions */}
      
      {/* Formula section */}
      <details className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-blue-800 hover:bg-blue-100/50 transition-colors flex items-center gap-2">
          <span>📐</span> Wzór na obliczanie temperatury w tunelu na podstawie temp. zew. i na tej podstawie obliczanie bardziej realnego GDH
          <span className="text-xs text-blue-500 ml-auto">kliknij aby rozwinąć</span>
        </summary>
        <div className="px-4 pb-4 text-sm text-gray-700 space-y-3">
          <div className="bg-white rounded-lg p-4 border border-blue-100 font-mono text-center text-base font-bold text-indigo-800">
            T<sub>tunel</sub> = T<sub>zewn</sub> + 2.8 + 0.45 × max(0, 20 − T<sub>zewn</sub>)
          </div>
          
          <p className="text-gray-600">Temperatura w tunelu foliowym jest zawsze wyższa niż na zewnątrz, ale bonus zależy od pogody — im zimniej, tym większy efekt cieplarniany:</p>
          
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-100/50"><th className="text-left py-1.5 px-3 border-b">Temp. zewnętrzna</th><th className="text-center py-1.5 px-3 border-b">Bonus tunelowy</th><th className="text-center py-1.5 px-3 border-b">Temp. w tunelu</th><th className="py-1.5 px-3 border-b">Wizualizacja</th></tr>
            </thead>
            <tbody>
              {[
                {out: 2, label: 'mróz'},
                {out: 5, label: 'chłód'},
                {out: 10, label: 'wiosna'},
                {out: 15, label: 'ciepło'},
                {out: 20, label: 'lato'},
                {out: 25, label: 'upał'},
              ].map(r => {
                const bonus = 2.8 + 0.45 * Math.max(0, 20 - r.out)
                const tunnel = r.out + bonus
                return (
                  <tr key={r.out} className="hover:bg-blue-50/50 border-b">
                    <td className="py-1.5 px-3">{r.out}°C <span className="text-gray-400">({r.label})</span></td>
                    <td className="py-1.5 px-3 text-center font-semibold text-orange-600">+{bonus.toFixed(1)}°C</td>
                    <td className="py-1.5 px-3 text-center font-semibold text-red-600">{tunnel.toFixed(1)}°C</td>
                    <td className="py-1.5 px-3"><div className="flex items-center gap-1"><div className="h-3 bg-blue-300 rounded" style={{width: r.out * 2 + 'px'}} /><div className="h-3 bg-orange-400 rounded" style={{width: bonus * 4 + 'px'}} /></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-xs font-semibold text-green-800 mb-1">📊 GDH (Godzino-Stopnie Wzrostu)</p>
              <div className="font-mono text-sm text-green-900 bg-white rounded px-3 py-2 border">GDH = max(0, (T<sub>śr</sub> − 6°C)) × 24h</div>
              <p className="text-xs text-gray-500 mt-2">6°C to temperatura bazowa — poniżej niej malina nie rośnie. Każdy stopień powyżej bazy × 24 godziny = GDH na dzień.</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 mb-1">🔬 Skąd ten wzór?</p>
              <p className="text-xs text-gray-600">Wzór obliczony metodą optymalizacji na danych z sezonu 2025. Porównano zewnętrzne GDH (API pogodowe) z faktycznymi datami owocowania Diamond Jubilee, wiedząc że odmiana potrzebuje <strong>23 000 GDH</strong> do pierwszego owocu.</p>
              <p className="text-xs text-gray-500 mt-1">Błąd kalibracji: zaledwie 2 GDH (Blok B). Wzór najlepiej działa dla tuneli o podobnej konstrukcji.</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 border mt-2">
            <p className="text-xs font-semibold text-gray-700 mb-2">💡 Przykład zastosowania</p>
            <p className="text-xs text-gray-600">Dzień 15 marca: na zewnątrz średnio 5°C.<br/>
            Bonus tunelowy: 2.8 + 0.45 × (20 − 5) = 2.8 + 6.75 = <strong>+9.55°C</strong><br/>
            Temperatura w tunelu: 5 + 9.55 = <strong>14.55°C</strong><br/>
            GDH tego dnia: (14.55 − 6) × 24 = <strong>205 GDH</strong><br/>
            Na zewnątrz byłoby: max(0, (5 − 6)) × 24 = <strong>0 GDH</strong> (poniżej bazy!)</p>
          </div>
        </div>
      </details>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={startEdit}><Edit className="w-4 h-4 mr-1"/>Edytuj metadane</Button>
        {<Button size="sm" variant="outline" onClick={fetchHistoricalTemps} disabled={fetchingTemps}><Thermometer className="w-4 h-4 mr-1"/>{fetchingTemps ? 'Pobieram...' : (outsideTemps.length > 0 ? 'Przelicz temperatury i GDH' : 'Pobierz temperatury z API')}</Button>}
        
        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={()=>onDelete(t.id)}><Trash2 className="w-4 h-4 mr-1"/>Usuń</Button>
      </div>
    </div>
  )
}

// ===== MAIN PAGE =====
export default function TemplatesPage() {
  const [mainTab, setMainTab] = useState<MainTab>('szablony')
  const [templates, setTemplates] = useState<Template[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [plantationSections, setPlantationSections] = useState<PlantationSection[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ varietyId: '', season: '', cycle: '', tunnel: '', search: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'year'|'name'|'totalKg'>('year')

  useEffect(() => { fetchAll() }, [])
  const fetchAll = async () => {
    try {
      const [tRes, vRes, pRes] = await Promise.all([fetch('/api/templates'), fetch('/api/varieties'), fetch('/api/plantation')])
      const tData = await tRes.json(); const vData = await vRes.json(); const pData = await pRes.json()
      setTemplates((tData.templates || []).map((t: Record<string, unknown>) => ({ ...t, tenantName: (t.tenant as Record<string, unknown> | null)?.name || null })) as Template[]); setVarieties(vData.varieties || [])
      const sections: PlantationSection[] = (pData.blocks || []).flatMap((b: Record<string, unknown>) =>
        ((b.sections as Record<string, unknown>[]) || []).map((s: Record<string, unknown>) => ({
          id: s.id as string, name: (s.name || 'Bez nazwy') as string, blockName: b.name as string,
          varietyName: ((s.variety as Record<string, unknown> | null)?.name || '?') as string,
          winteredInTunnel: s.winteredInTunnel as boolean | undefined,
          plantMaterialType: s.plantMaterialType as string | undefined,
        }))
      )
      setPlantationSections(sections)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }


  const deleteTemplate = async (id: string) => {
    if (!confirm('Usunąć?')) return
    await fetch('/api/templates/'+id, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const filtered = templates.filter(t => {
    if (filter.varietyId && t.variety?.id !== filter.varietyId) return false
    if (filter.season && t.season !== filter.season) return false
    if (filter.cycle && t.productionCycle !== parseInt(filter.cycle)) return false
    if (filter.tunnel && String(t.winteredInTunnel) !== filter.tunnel) return false
    if (filter.search && !t.name.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  }).sort((a,b)=>sortBy==='year'?b.productionYear-a.productionYear:sortBy==='name'?a.name.localeCompare(b.name):b.totalKg-a.totalKg)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="w-7 h-7 text-green-600"/>Krzywe zbiorów</h1>
          <p className="text-gray-500 mt-1">{mainTab === 'szablony' ? `${templates.length} szablonów` : 'Dane historyczne z MaxCrop'}</p>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2 border-b pb-0">
        <button onClick={() => setMainTab('szablony')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${mainTab === 'szablony' ? 'bg-white text-green-700 border-gray-200' : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'}`}>
          <Database className="w-4 h-4 inline mr-2" />Szablony wzorcowe
        </button>
        <button onClick={() => setMainTab('historyczne')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${mainTab === 'historyczne' ? 'bg-white text-green-700 border-gray-200' : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'}`}>
          <BarChart3 className="w-4 h-4 inline mr-2" />Dane historyczne
        </button>
      </div>

      {mainTab === 'historyczne' && (
        <HistoricalDataTab onTemplateCreated={() => { setMainTab('szablony'); fetchAll() }} />
      )}

      {mainTab === 'szablony' && (<>
      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400"/>
            <input placeholder="Szukaj..." value={filter.search} onChange={e=>setFilter(p=>({...p,search:e.target.value}))} className="border rounded-lg pl-9 pr-3 py-2 text-sm w-48"/>
          </div>
          <select value={filter.varietyId} onChange={e=>setFilter(p=>({...p,varietyId:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Wszystkie odmiany</option>{varieties.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={filter.season} onChange={e=>setFilter(p=>({...p,season:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Oba sezony</option><option value="summer">☀️ Lato</option><option value="autumn">🍂 Jesień</option>
          </select>
          <select value={filter.cycle} onChange={e=>setFilter(p=>({...p,cycle:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Cykle</option><option value="1">1.</option><option value="2">2.</option><option value="3">3.</option>
          </select>
          <div className="ml-auto flex gap-1">
            {(['year','name','totalKg'] as const).map(s=>(
              <button key={s} onClick={()=>setSortBy(s)} className={`text-xs px-2 py-1 rounded ${sortBy===s?'bg-green-100 text-green-700 font-medium':'text-gray-500'}`}>
                {s==='year'?'Rok':s==='name'?'Nazwa':'Produkcja'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length===0?(
        <div className="bg-white rounded-xl border p-12 text-center">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-4"/>
          <p className="text-gray-500">{templates.length===0?'Baza pusta — importuj dane w zakładce "Dane historyczne"':'Brak wyników'}</p>
        </div>
      ):(
        <div className="space-y-2">
          {filtered.map(t=>{
            const isExp = expandedId===t.id
            const hasTemps = t.outsideTemps || t.insideTunnelTemps
            const hasGDH = t.gdhData
            return (
              <div key={t.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50" onClick={()=>setExpandedId(isExp?null:t.id)}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg ${t.season==='summer'?'bg-orange-500':'bg-red-500'}`}>
                    {t.season==='summer'?'☀️':'🍂'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate flex items-center gap-2">{t.name}{t.tenantName && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-normal">{t.tenantName}</span>}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                      <span>{t.variety?.name||'—'}</span><span>•</span><span>{t.productionYear}</span>
                      <span>•</span><span>{t.productionCycle}. rok</span>
                      {t.winteredInTunnel && <><span>•</span><Snowflake className="w-3 h-3 text-blue-500 inline"/></>}
                      {t.plantSource && <><span>•</span><span className="text-gray-500">{t.plantSource === 'long_canes' ? 'LC' : t.plantSource === 'tray_plants' ? 'Tray' : t.plantSource}</span></>}
                      {t.plantingDate && !t.winteredInTunnel && <><span>•</span><span className="text-green-600">🌱 {fmtDate(t.plantingDate)}</span></>}
                      {t.sourceSection && <><span>•</span><span className="text-indigo-600">{t.sourceSection.name}</span></>}
                    </div>
                  </div>
                  <div className="flex items-end gap-px h-8 w-28">
                    {(t.weeklyCurve||[]).map((v,i)=>(
                      <div key={i} className="flex-1 rounded-t" style={{height:(v/Math.max(...(t.weeklyCurve||[1])))*28+'px',minHeight:'1px',background:t.season==='summer'?'#fb923c':'#f87171'}}/>
                    ))}
                  </div>
                  <div className="text-right w-20">
                    <div className="font-bold text-green-700">{(t.totalKg/1000).toFixed(1)}t</div>
                    <div className="text-xs text-gray-400">{t.dailyCurve?.length||0}d</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasTemps && <Thermometer className="w-4 h-4 text-blue-400"/>}
                    {hasGDH && <Sprout className="w-4 h-4 text-green-400"/>}
                  </div>
                  {isExp?<ChevronUp className="w-5 h-5 text-gray-400"/>:<ChevronDown className="w-5 h-5 text-gray-400"/>}
                </div>
                {isExp && <TemplateDetail template={t} varieties={varieties} sections={plantationSections} onSave={fetchAll} onDelete={deleteTemplate}/>}
              </div>
            )
          })}
        </div>
      )}
      </>)}
    </div>
  )
}
