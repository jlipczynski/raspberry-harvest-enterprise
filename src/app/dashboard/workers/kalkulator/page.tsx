'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Upload, Calculator, ArrowLeft, Trash2, Save, AlertTriangle, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown, Coffee, X, Scissors, Factory,
  ChevronLeft, ChevronRight, MapPin, Pencil, FolderOpen, Copy, Trophy,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  computePieceRate,
  DEFAULT_BAND_TOLERANCE,
  type PieceRateInputRow,
  type HourlyBand,
} from '@/lib/piece-rate'
import { topAndBottom, type WorkerRanking } from '@/lib/piece-rate-ranking'

// Wartości startowe formularza — użytkownik je nadpisuje, nic nie jest
// zapisywane bez jego decyzji.
const DEFAULT_TARGET_HOURLY = 25
const DEFAULT_MEDIAN_COUNT = 5
const DEFAULT_INDUSTRIAL_RATE = 2
const ROUNDING_STEP_COARSE = 0.05
const ROUNDING_STEP_FINE = 0.01

// Paleta przeszła walidację CVD (protan ΔE 24.7, tritan 32.7) — nie dobieraj
// kolorów na oko, przepuść przez validate_palette.js ze skilla dataviz.
const SERIES_DESSERT = '#2a78d6'
const SERIES_INDUSTRIAL = '#eb6834'
const AXIS_INK = '#6b7280'
const GRID_INK = '#e5e7eb'

const BAND_STYLE: Record<HourlyBand, { row: string; text: string; dot: string; label: string }> = {
  above: { row: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', label: 'powyżej celu' },
  near: { row: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'w okolicy celu' },
  below: { row: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'poniżej celu' },
  unknown: { row: '', text: 'text-gray-400', dot: 'bg-gray-300', label: 'brak danych' },
}

interface ParsedRow {
  externalId: string | null
  workerName: string
  kg: number
  industrialKg: number
  dessertKg: number
  hours: number
  startTime: string | null
  endTime: string | null
  workTypes: string[]
  isHarvestWorker: boolean
  currentAmount: number | null
}

interface ParsedBlock {
  areaName: string
  blockName: string | null
  dessertKg: number
  industrialKg: number
  totalKg: number
  currentAmount: number
}

interface ParsedDay {
  date: string
  rows: ParsedRow[]
  blocks: ParsedBlock[]
}

interface SessionSummary {
  id: string
  harvestDate: string
  fileName: string
  targetHourly: number
  breakMinutes: number
  industrialRate: number | null
  computedRate: number
  workerCount: number
  note: string | null
  medianCount: number
  mode: 'MANUAL' | 'AUTO_MEDIAN'
  roundingStep: number
  cutoffKgPerHour: number | null
}

type SortKey =
  | 'name' | 'kg' | 'industrialKg' | 'dessertKg' | 'industrialShare' | 'hours'
  | 'kgPerHour' | 'earnings' | 'effectiveHourly'

const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : value.toFixed(digits)
const zl = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)} zł`

/** 13.65 → "13:39" — godziny czyta się lepiej niż ułamek dziesiętny. */
const fmtDuration = (hours: number | null | undefined) => {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  const total = Math.round(hours * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Tooltip Rechartsa potrafi podać undefined — formatujemy odpornie. */
const fmtChart = (value: unknown, digits: number, unit: string) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)} ${unit}`
    : '—'

const fmtDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

export default function PieceRateCalculatorPage() {
  const [days, setDays] = useState<ParsedDay[]>([])
  const [dayIndex, setDayIndex] = useState(0)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [harvestDate, setHarvestDate] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Główny sterownik: stawka zł/kg wpisywana ręcznie.
  const [rateInput, setRateInput] = useState('')
  const [industrialRate, setIndustrialRate] = useState<string>(String(DEFAULT_INDUSTRIAL_RATE))
  const [targetHourly, setTargetHourly] = useState(DEFAULT_TARGET_HOURLY)
  const [cutoff, setCutoff] = useState('')

  const [mode, setMode] = useState<'MANUAL' | 'AUTO_MEDIAN'>('AUTO_MEDIAN')
  const [medianCount, setMedianCount] = useState(DEFAULT_MEDIAN_COUNT)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [coarseRounding, setCoarseRounding] = useState(true)
  const [bandTolerance, setBandTolerance] = useState(DEFAULT_BAND_TOLERANCE * 100)
  const [hoursStrategy, setHoursStrategy] = useState<'max' | 'sum'>('max')
  const [manualRefs, setManualRefs] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('kgPerHour')
  const [sortAsc, setSortAsc] = useState(true)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [ranking, setRanking] = useState<WorkerRanking[]>([])
  const [topCount, setTopCount] = useState(10)
  const [minDays, setMinDays] = useState(1)
  const [rankFrom, setRankFrom] = useState('')
  const [rankTo, setRankTo] = useState('')

  const rowKey = (row: ParsedRow) => row.externalId || row.workerName

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/piece-rate/sessions', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setSessions(data.sessions || [])
    } catch {
      // Historia jest dodatkiem — jej brak nie blokuje liczenia stawki.
    }
  }, [])

  const fetchRanking = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (rankFrom) params.set('from', rankFrom)
      if (rankTo) params.set('to', rankTo)
      const qs = params.toString()
      const response = await fetch(`/api/piece-rate/ranking${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setRanking(data.ranking || [])
    } catch {
      // Ranking jest dodatkiem — jego brak nie blokuje liczenia stawki.
    }
  }, [rankFrom, rankTo])

  useEffect(() => { fetchSessions(); fetchRanking() }, [fetchSessions, fetchRanking])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    setSavedMessage(null)

    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => formData.append('files', file))
      formData.append('hoursStrategy', hoursStrategy)

      const response = await fetch('/api/piece-rate/parse', { method: 'POST', body: formData })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Nie udało się odczytać pliku')
        return
      }

      // Nowy plik to nowa wycena — nie chcemy nadpisać wcześniej otwartej sesji.
      setEditingSessionId(null)

      const parsedDays: ParsedDay[] = data.days || []
      setDays(parsedDays)
      setDayIndex(0)
      setWarnings(data.warnings || [])
      setFileNames((data.files || []).map((f: { fileName: string }) => f.fileName))
      if (parsedDays.length > 0) setHarvestDate(parsedDays[0].date)
      setManualRefs(new Set())
    } catch {
      setError('Błąd połączenia przy wysyłaniu pliku')
    } finally {
      setUploading(false)
    }
  }

  // ==================== PODZIAŁ NA LICZONYCH I ODCIĘTYCH ====================
  const parsedIndustrialRate = useMemo(() => {
    const value = parseFloat(industrialRate.replace(',', '.'))
    return Number.isFinite(value) && value > 0 ? value : null
  }, [industrialRate])

  const parsedCutoff = useMemo(() => {
    if (cutoff.trim() === '') return null
    const value = parseFloat(cutoff.replace(',', '.'))
    return Number.isFinite(value) && value > 0 ? value : null
  }, [cutoff])

  const breakHours = breakMinutes / 60

  /** Wydajność użyta do odcięcia — ta sama definicja co w wyliczeniu. */
  const kphOf = useCallback((row: ParsedRow) => {
    const hours = Math.max(0, row.hours - breakHours)
    return hours > 0 ? row.kg / hours : null
  }, [breakHours])

  const activeDay = days.length > 0 ? days[Math.min(dayIndex, days.length - 1)] : null
  const rows = useMemo(() => (activeDay ? activeDay.rows : []), [activeDay])

  // Do wyceny wchodzą wyłącznie zbieracze. Pakowaczki, kontrola jakości
  // i prace ogólne mają 0 kg i własne rozliczenie — nie mają czego wnieść
  // do stawki za kilogram.
  const eligibleRows = useMemo(
    () => rows.filter((row) => row.isHarvestWorker),
    [rows]
  )

  const { keptRows, cutRows } = useMemo(() => {
    if (parsedCutoff === null) return { keptRows: eligibleRows, cutRows: [] as ParsedRow[] }
    const kept: ParsedRow[] = []
    const cut: ParsedRow[] = []
    for (const row of eligibleRows) {
      const kph = kphOf(row)
      if (kph !== null && kph < parsedCutoff) cut.push(row)
      else kept.push(row)
    }
    return { keptRows: kept, cutRows: cut }
  }, [eligibleRows, parsedCutoff, kphOf])

  const result = useMemo(() => {
    const input: PieceRateInputRow[] = keptRows.map((row) => ({
      workerName: row.workerName,
      externalId: row.externalId,
      kg: row.kg,
      industrialKg: row.industrialKg,
      hours: row.hours,
      isReference: manualRefs.has(rowKey(row)),
      isHarvestWorker: row.isHarvestWorker,
      currentAmount: row.currentAmount,
    }))

    const parsedRate = rateInput.trim() === '' ? null : parseFloat(rateInput.replace(',', '.'))

    return computePieceRate(input, {
      mode,
      targetHourly,
      medianCount,
      roundingStep: coarseRounding ? ROUNDING_STEP_COARSE : ROUNDING_STEP_FINE,
      breakHours,
      rateOverride: parsedRate !== null && Number.isFinite(parsedRate) ? parsedRate : null,
      bandTolerance: bandTolerance / 100,
      industrialRate: parsedIndustrialRate,
    })
  }, [keptRows, manualRefs, mode, targetHourly, medianCount, coarseRounding, breakHours,
      rateInput, bandTolerance, parsedIndustrialRate])

  useEffect(() => {
    if (activeDay) setHarvestDate(activeDay.date)
  }, [activeDay])

  const currentTotal = useMemo(() => {
    const amounts = keptRows.map((row) => row.currentAmount).filter((a): a is number => a !== null)
    return amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null
  }, [keptRows])

  /**
   * Przebieg dzień po dniu — te same parametry (cel zł/h, przemysł, przerwy,
   * odcięcie) zastosowane do każdego dnia osobno.
   *
   * Na wykresie pokazujemy stawkę WYLICZONĄ z celu, nie ręcznie wpisaną —
   * ręczna byłaby płaską linią przez wszystkie dni i nic by nie mówiła.
   */
  const dailySeries = useMemo(() => {
    return days.map((day) => {
      const eligible = day.rows.filter((r) => r.isHarvestWorker)
      const kept = parsedCutoff === null
        ? eligible
        : eligible.filter((r) => {
            const hours = Math.max(0, r.hours - breakHours)
            return hours <= 0 || r.kg / hours >= parsedCutoff
          })

      const dayResult = computePieceRate(
        kept.map((r) => ({
          workerName: r.workerName,
          externalId: r.externalId,
          kg: r.kg,
          industrialKg: r.industrialKg,
          hours: r.hours,
        })),
        {
          mode: 'AUTO_MEDIAN',
          targetHourly,
          medianCount,
          roundingStep: coarseRounding ? ROUNDING_STEP_COARSE : ROUNDING_STEP_FINE,
          breakHours,
          industrialRate: parsedIndustrialRate,
        }
      )

      return {
        date: day.date,
        label: day.date.slice(5).replace('-', '.'),
        rate: dayResult.derivedRate,
        kgPerHour: dayResult.avgKgPerHour,
        dessertKg: Math.round(dayResult.totalDessertKg * 10) / 10,
        industrialKg: Math.round(dayResult.totalIndustrialKg * 10) / 10,
        workers: kept.length,
        cost: dayResult.totalCost,
      }
    })
  }, [days, parsedCutoff, breakHours, targetHourly, medianCount,
      coarseRounding, parsedIndustrialRate])

  /** Udział przemysłu w całym dniu — punkt odniesienia dla kolumny procentowej. */
  const dayIndustrialShare = result.totalKg > 0 ? result.totalIndustrialKg / result.totalKg : 0

  const sortedRows = useMemo(() => {
    const copy = [...result.rows]
    copy.sort((a, b) => {
      const pick = (row: typeof a): number | string => {
        switch (sortKey) {
          case 'name': return row.workerName.toLowerCase()
          case 'kg': return row.kg
          case 'industrialKg': return row.industrialKg
          case 'dessertKg': return row.dessertKg
          case 'industrialShare': return row.kg > 0 ? row.industrialKg / row.kg : -1
          case 'hours': return row.effectiveHours
          case 'kgPerHour': return row.kgPerHour === null ? -1 : row.kgPerHour
          case 'earnings': return row.earnings === null ? -1 : row.earnings
          case 'effectiveHourly': return row.effectiveHourly === null ? -1 : row.effectiveHourly
        }
      }
      const va = pick(a)
      const vb = pick(b)
      const cmp = typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'pl')
        : (va as number) - (vb as number)
      return sortAsc ? cmp : -cmp
    })
    return copy
  }, [result.rows, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronsUpDown className="w-3 h-3 inline opacity-40" />
    return sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
  }

  const toggleReference = (row: ParsedRow) => {
    if (mode !== 'MANUAL') return
    const key = rowKey(row)
    setManualRefs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Wstawia w pole stawki wartość wyliczoną z celu zł/h. */
  const useDerivedRate = () => {
    if (result.derivedRate !== null) setRateInput(result.derivedRate.toFixed(2))
  }

  /** Jedno ciało żądania dla zapisu nowej sesji i dla edycji istniejącej. */
  const buildSessionPayload = () => ({
    harvestDate,
    fileName: fileNames.join(', ') || 'sesja ręczna',
    mode,
    targetHourly,
    medianCount,
    breakMinutes,
    roundingStep: coarseRounding ? ROUNDING_STEP_COARSE : ROUNDING_STEP_FINE,
    rateOverride: result.isSimulated ? result.rate : null,
    industrialRate: parsedIndustrialRate,
    cutoffKgPerHour: parsedCutoff,
    note: note.trim() || null,
    blocks: activeDay ? activeDay.blocks : [],
    rows: keptRows.map((row) => ({
      workerName: row.workerName,
      externalId: row.externalId,
      kg: row.kg,
      industrialKg: row.industrialKg,
      hours: row.hours,
      isReference: manualRefs.has(rowKey(row)),
      isHarvestWorker: row.isHarvestWorker,
      currentAmount: row.currentAmount,
    })),
  })

  const handleSave = async () => {
    if (result.rate === null || !harvestDate) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/piece-rate/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSessionPayload()),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Nie udało się zapisać sesji')
        return
      }

      setSavedMessage(`Zapisano ${fmtDate(harvestDate)} — ${data.session.computedRate.toFixed(2)} zł/kg`)
      setEditingSessionId(data.session.id)
      fetchSessions()
      fetchRanking()
    } catch {
      setError('Błąd połączenia przy zapisie')
    } finally {
      setSaving(false)
    }
  }

  /** Wczytuje zapisaną sesję z powrotem do kalkulatora. */
  const handleOpenSession = async (id: string) => {
    setLoadingSession(true)
    setError(null)
    setSavedMessage(null)

    try {
      const response = await fetch(`/api/piece-rate/sessions/${id}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Nie udało się wczytać sesji')
        return
      }

      const session = data.session
      const loadedRows: ParsedRow[] = (session.rows || []).map(
        (row: Record<string, unknown>) => ({
          externalId: (row.externalId as string) || null,
          workerName: row.workerName as string,
          kg: row.kg as number,
          industrialKg: (row.industrialKg as number) || 0,
          dessertKg: (row.dessertKg as number) || 0,
          hours: row.hours as number,
          // Godziny wejścia/wyjścia nie są zapisywane — to dane z raportu,
          // nie wynik wyceny. Po wczytaniu kolumna pokaże samą długość.
          startTime: null,
          endTime: null,
          workTypes: [],
          isHarvestWorker: row.isHarvestWorker !== false,
          currentAmount: (row.currentAmount as number) ?? null,
        })
      )

      const date = String(session.harvestDate).slice(0, 10)
      setDays([{ date, rows: loadedRows, blocks: session.blocks || [] }])
      setDayIndex(0)
      setHarvestDate(date)

      setTargetHourly(session.targetHourly)
      setMedianCount(session.medianCount)
      setBreakMinutes(session.breakMinutes)
      setMode(session.mode)
      setCoarseRounding(session.roundingStep >= ROUNDING_STEP_COARSE)
      setIndustrialRate(session.industrialRate === null ? '' : String(session.industrialRate))
      setCutoff(session.cutoffKgPerHour === null ? '' : String(session.cutoffKgPerHour))
      setNote(session.note || '')
      setFileNames(session.fileName ? [session.fileName] : [])

      // Stawka zapisana wprost — tak, żeby podgląd pokazał dokładnie to,
      // co zostało zapisane, a nie przeliczenie z bieżących parametrów.
      setRateInput(session.computedRate.toFixed(2))
      setManualRefs(
        new Set(
          (session.rows || [])
            .filter((row: Record<string, unknown>) => row.isReference)
            .map((row: Record<string, unknown>) => (row.externalId as string) || (row.workerName as string))
        )
      )

      setEditingSessionId(id)
      setWarnings([])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('Błąd połączenia przy wczytywaniu sesji')
    } finally {
      setLoadingSession(false)
    }
  }

  /** Zapisuje zmiany w otwartej sesji (PATCH) zamiast tworzyć nową. */
  const handleUpdate = async () => {
    if (!editingSessionId || result.rate === null || !harvestDate) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/piece-rate/sessions/${editingSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSessionPayload()),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Nie udało się zapisać zmian')
        return
      }

      setSavedMessage(
        `Zaktualizowano sesję z ${fmtDate(harvestDate)} — ${data.session.computedRate.toFixed(2)} zł/kg`
      )
      fetchSessions()
      fetchRanking()
    } catch {
      setError('Błąd połączenia przy zapisie zmian')
    } finally {
      setSaving(false)
    }
  }

  const exitEditing = () => {
    setEditingSessionId(null)
    setSavedMessage(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć tę sesję? Tej operacji nie da się cofnąć.')) return
    try {
      const response = await fetch(`/api/piece-rate/sessions/${id}`, { method: 'DELETE' })
      if (response.ok) { fetchSessions(); fetchRanking() }
    } catch {
      setError('Nie udało się usunąć sesji')
    }
  }

  const nonHarvestCount = rows.length - rows.filter((r) => r.isHarvestWorker).length
  const hasData = rows.length > 0

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/workers" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Pracownicy
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-green-600" />
          Kalkulator wynagrodzeń
        </h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {savedMessage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          <Save className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{savedMessage}</span>
          <button onClick={() => setSavedMessage(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {editingSessionId && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <Pencil className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            Edytujesz zapisaną sesję z <strong>{fmtDate(harvestDate)}</strong> —{' '}
            {/* Liczby wprost w banerze: od razu widać, czy wczytała się ta sesja,
                o którą chodziło, bez porównywania tabel. */}
            <strong>{result.rows.length} os., {num(result.totalKg, 1)} kg</strong>.
            Zmiany parametrów nadpiszą ją po kliknięciu „Zapisz zmiany”.
          </span>
          <Button variant="outline" size="sm" onClick={exitEditing}>Zakończ edycję</Button>
        </div>
      )}

      {/* ========== PRZEWIJAK DNI ========== */}
      {days.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="shrink-0"
                disabled={dayIndex === 0} onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
                title="Poprzedni dzień">
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-1 min-w-min">
                  {days.map((day, index) => {
                    const active = index === Math.min(dayIndex, days.length - 1)
                    const series = dailySeries[index]
                    return (
                      <button key={day.date} onClick={() => setDayIndex(index)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-colors ${
                          active
                            ? 'bg-green-600 text-white border-green-600 font-semibold'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                        }`}>
                        <span className="block">{day.date.slice(5).replace('-', '.')}</span>
                        <span className={`block text-[10px] ${active ? 'text-green-100' : 'text-gray-400'}`}>
                          {series?.rate === null || series?.rate === undefined
                            ? '—'
                            : `${series.rate.toFixed(2)} zł`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button variant="outline" size="icon" className="shrink-0"
                disabled={dayIndex >= days.length - 1}
                onClick={() => setDayIndex((i) => Math.min(days.length - 1, i + 1))}
                title="Następny dzień">
                <ChevronRight className="w-4 h-4" />
              </Button>

              <span className="text-xs text-gray-500 shrink-0 hidden sm:block">
                {Math.min(dayIndex, days.length - 1) + 1} / {days.length} dni
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== PASEK STEROWANIA — stawka na górze ========== */}
      {hasData && (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 space-y-3">
            {/* Wejścia */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 items-start">
              <div>
                <Label htmlFor="rateInput" className="text-xs font-semibold text-gray-700">
                  Stawka za kg deseru
                </Label>
                <div className="flex gap-1 mt-1">
                  <Input id="rateInput" type="number" step="0.05" min={0} value={rateInput}
                    placeholder={result.derivedRate === null ? 'wpisz zł/kg' : result.derivedRate.toFixed(2)}
                    className="text-lg font-semibold h-11"
                    onChange={(e) => setRateInput(e.target.value)} />
                  {rateInput.trim() !== '' && (
                    <Button variant="outline" className="h-11" onClick={() => setRateInput('')}
                      title="Wyczyść — wróć do stawki liczonej z celu zł/h">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {result.derivedRate !== null && (
                  <button onClick={useDerivedRate}
                    className="text-[11px] text-green-700 hover:underline mt-1">
                    wstaw {result.derivedRate.toFixed(2)} — tyle wychodzi z celu {targetHourly} zł/h
                  </button>
                )}
              </div>

              <div>
                <Label htmlFor="industrialRate" className="text-xs flex items-center gap-1">
                  <Factory className="w-3 h-3" /> Stawka za kg przemysłu
                </Label>
                <Input id="industrialRate" type="number" step="0.1" min={0} value={industrialRate}
                  className="mt-1 h-11" onChange={(e) => setIndustrialRate(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">
                  {result.totalIndustrialKg > 0
                    ? `${result.totalIndustrialKg.toFixed(1)} kg przemysłu = ${zl(result.industrialCost, 0)}`
                    : 'brak przemysłu w danych'}
                </p>
              </div>

              <div>
                <Label htmlFor="targetHourly" className="text-xs">Cel zł/h (do kolorów)</Label>
                <Input id="targetHourly" type="number" step="0.5" min={0} value={targetHourly}
                  className="mt-1 h-11" onChange={(e) => setTargetHourly(parseFloat(e.target.value) || 0)} />
                <p className="text-[11px] text-gray-400 mt-1">pasmo ±{bandTolerance}%</p>
              </div>

              <div>
                <Label htmlFor="cutoff" className="text-xs flex items-center gap-1">
                  <Scissors className="w-3 h-3" /> Odetnij poniżej (kg/h)
                </Label>
                <Input id="cutoff" type="number" step="0.1" min={0} value={cutoff}
                  placeholder="bez odcięcia" className="mt-1 h-11"
                  onChange={(e) => setCutoff(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">
                  {cutRows.length > 0 ? `odcięto ${cutRows.length} os.` : 'nikt nie odcięty'}
                </p>
              </div>
            </div>

            {/* Podsumowanie */}
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 pt-3 border-t">
              <BandTile band="above" count={result.bands.above} total={result.rows.length}
                desc={`> ${(targetHourly * (1 + bandTolerance / 100)).toFixed(2)} zł/h`} />
              <BandTile band="near" count={result.bands.near} total={result.rows.length}
                desc={`±${bandTolerance}% od ${targetHourly.toFixed(2)} zł/h`} />
              <BandTile band="below" count={result.bands.below} total={result.rows.length}
                desc={`< ${(targetHourly * (1 - bandTolerance / 100)).toFixed(2)} zł/h`} />
              <div className="rounded-lg p-2.5 bg-gray-900 text-white min-w-0">
                <p className="text-[11px] text-gray-300">Koszt dnia</p>
                <p className="text-xl font-bold whitespace-nowrap">{zl(result.totalCost, 0)}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {currentTotal !== null && result.totalCost !== null
                    ? `MaxCrop ${currentTotal.toFixed(0)} zł (${result.totalCost >= currentTotal ? '+' : ''}${(result.totalCost - currentTotal).toFixed(0)})`
                    : `${result.rows.length} os.`}
                </p>
              </div>
            </div>
          </div>

          {/* Ustawienia zaawansowane */}
          <div className="border-t px-4 py-2">
            <button onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Ustawienia zaawansowane
            </button>

            {showSettings && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 py-3">
                <div>
                  <Label className="text-xs">Tryb wyboru wzorca</Label>
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => setMode('AUTO_MEDIAN')}
                      className={`flex-1 px-2 py-1.5 rounded text-xs border ${mode === 'AUTO_MEDIAN' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                      Auto — środek
                    </button>
                    <button onClick={() => setMode('MANUAL')}
                      className={`flex-1 px-2 py-1.5 rounded text-xs border ${mode === 'MANUAL' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                      Ręczny
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="medianCount" className="text-xs">Ile osób w środku</Label>
                  <Input id="medianCount" type="number" min={1} value={medianCount} className="mt-1"
                    disabled={mode !== 'AUTO_MEDIAN'}
                    onChange={(e) => setMedianCount(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
                <div>
                  <Label htmlFor="breakMinutes" className="text-xs flex items-center gap-1">
                    <Coffee className="w-3 h-3" /> Przerwy (min/os.)
                  </Label>
                  <Input id="breakMinutes" type="number" min={0} step={5} value={breakMinutes} className="mt-1"
                    onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))} />
                </div>
                <div>
                  <Label htmlFor="bandTolerance" className="text-xs">Szerokość pasma (%)</Label>
                  <Input id="bandTolerance" type="number" step={1} min={0} value={bandTolerance} className="mt-1"
                    onChange={(e) => setBandTolerance(Math.max(0, parseFloat(e.target.value) || 0))} />
                </div>
                <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={coarseRounding}
                      onChange={(e) => setCoarseRounding(e.target.checked)} />
                    Zaokrąglaj wyliczoną stawkę do 0,05 zł
                  </label>
                  <span className="text-xs text-gray-500">
                    Liczeni tylko zbieracze
                    {nonHarvestCount > 0 && ` — pominięto ${nonHarvestCount} os. na innych stanowiskach`}
                  </span>
                  <span className="text-xs text-gray-500">
                    Wydajność wzorca: <strong>{num(result.avgKgPerHour)} kg/h</strong> z {result.referenceRows.length} os.
                    {' · '}Zebrano <strong>{num(result.totalKg, 1)} kg</strong> w {num(result.totalHours, 1)} h
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== UPLOAD ========== */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-green-500 hover:bg-green-50/50 transition-colors block text-center">
              <input type="file" multiple
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              {uploading ? (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję…
                </span>
              ) : (
                <span className="inline-flex flex-col items-center text-sm text-gray-600">
                  <Upload className="w-5 h-5 mb-1" />
                  {fileNames.length > 0 ? fileNames.join(', ') : 'Wgraj raport pracy z MaxCrop'}
                  <span className="text-xs text-gray-400 mt-0.5">
                    można wgrać kilka plików z jednego dnia — scalę je po kodzie kreskowym
                  </span>
                </span>
              )}
            </label>
            <div className="space-y-2">
              <div>
                <Label htmlFor="harvestDate" className="text-xs">Data zbioru</Label>
                <Input id="harvestDate" type="date" value={harvestDate}
                  onChange={(e) => setHarvestDate(e.target.value)} className="mt-1" />
              </div>
              {/* Przy jednym pliku nie ma czego scalać — przełącznik tylko zaśmiecałby widok. */}
              {fileNames.length > 1 && (
                <div>
                  <Label className="text-xs">Godziny przy kilku plikach</Label>
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => setHoursStrategy('max')}
                      className={`flex-1 px-2 py-1 rounded text-xs border ${hoursStrategy === 'max' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                      Najdłuższa
                    </button>
                    <button onClick={() => setHoursStrategy('sum')}
                      className={`flex-1 px-2 py-1 rounded text-xs border ${hoursStrategy === 'sum' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                      Suma
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Wgrałeś {fileNames.length} pliki — wybierz, jak liczyć czas pracy
                  </p>
                </div>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              {warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== ZBIÓR DNIA: DESER vs PRZEMYSŁ ========== */}
      {hasData && result.totalKg > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Zbiór {activeDay ? fmtDate(activeDay.date) : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <HarvestTile
                label="Deser"
                color={SERIES_DESSERT}
                kg={result.totalDessertKg}
                share={result.totalKg > 0 ? result.totalDessertKg / result.totalKg : 0}
                cost={result.rate === null ? null : result.totalDessertKg * result.rate}
                rate={result.rate}
              />
              <HarvestTile
                label="Przemysł"
                color={SERIES_INDUSTRIAL}
                kg={result.totalIndustrialKg}
                share={result.totalKg > 0 ? result.totalIndustrialKg / result.totalKg : 0}
                cost={result.industrialCost}
                rate={result.industrialRate}
              />
              <div className="rounded-lg border p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Razem</p>
                <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">
                  {num(result.totalKg, 1)}<span className="text-sm font-normal ml-1">kg</span>
                </p>
                <p className="text-xs text-gray-600 mt-1">{zl(result.totalCost, 0)}</p>
                <p className="text-[11px] text-gray-400">
                  {/* Średnia mieszana — im więcej przemysłu, tym niżej */}
                  śr. {result.totalCost !== null && result.totalKg > 0
                    ? `${(result.totalCost / result.totalKg).toFixed(2)} zł/kg`
                    : '—'}
                </p>
              </div>
            </div>

            {/* Pasek udziału — ten sam podział, tylko widziany proporcjonalnie */}
            <div className="mt-3">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                <div style={{
                  width: `${(result.totalDessertKg / result.totalKg) * 100}%`,
                  backgroundColor: SERIES_DESSERT,
                }} />
                <div style={{
                  width: `${(result.totalIndustrialKg / result.totalKg) * 100}%`,
                  backgroundColor: SERIES_INDUSTRIAL,
                  marginLeft: 2,
                }} />
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-2">
              Liczone z {result.rows.length} os.
              {nonHarvestCount > 0 && ` (bez ${nonHarvestCount} os. na innych stanowiskach)`}
              {cutRows.length > 0 && `, po odcięciu ${cutRows.length} os.`}
              {result.industrialRate === null && ' · przemysł nie jest wydzielany — wpisz jego stawkę'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ========== PODSUMOWANIE DNIA — BLOKI ========== */}
      {activeDay && activeDay.blocks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Zbiór {fmtDate(activeDay.date)} wg obszarów
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="p-2 text-left">Obszar</th>
                    <th className="p-2 text-right">Deser</th>
                    <th className="p-2 text-right">Przemysł</th>
                    <th className="p-2 text-right">Razem</th>
                    <th className="p-2 text-right">Koszt</th>
                    <th className="p-2 text-right">Śr. zł/kg</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDay.blocks.map((block) => {
                    const cost = result.rate === null ? null
                      : block.dessertKg * result.rate +
                        block.industrialKg * (parsedIndustrialRate === null ? 0 : parsedIndustrialRate)
                    // Średnia mieszana: bloki z większym udziałem przemysłu
                    // wychodzą taniej za kilogram.
                    const avgPerKg = cost === null || block.totalKg <= 0 ? null : cost / block.totalKg
                    return (
                      <tr key={block.areaName} className="border-t hover:bg-gray-50">
                        <td className="p-2">
                          {block.areaName}
                          {block.blockName && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {block.blockName}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">{num(block.dessertKg, 1)}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">
                          {block.industrialKg > 0 ? num(block.industrialKg, 1) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums font-medium">{num(block.totalKg, 1)}</td>
                        <td className="p-2 text-right tabular-nums">{zl(cost, 0)}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">{num(avgPerKg)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr className="border-t">
                    <td className="p-2">Razem</td>
                    <td className="p-2 text-right tabular-nums">
                      {num(activeDay.blocks.reduce((s, b) => s + b.dessertKg, 0), 1)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {num(activeDay.blocks.reduce((s, b) => s + b.industrialKg, 0), 1)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {num(activeDay.blocks.reduce((s, b) => s + b.totalKg, 0), 1)}
                    </td>
                    <td className="p-2 text-right tabular-nums" colSpan={2}>
                      MaxCrop: {num(activeDay.blocks.reduce((s, b) => s + b.currentAmount, 0), 0)} zł
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 px-4 py-2 border-t">
              Liczone z pozycji szczegółowych raportu. Pozycje bez obszaru (zbiorcze) nie wchodzą —
              MaxCrop też ich nie wlicza do sumy pracownika.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ========== WYKRESY DZIEŃ PO DNIU ========== */}
      {days.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DayChart title="Stawka za kg deseru" unit="zł/kg">
            <LineChart data={dailySeries} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid stroke={GRID_INK} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_INK }}
                axisLine={{ stroke: GRID_INK }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false}
                width={44} tickFormatter={(v: number) => v.toFixed(0)} />
              <RechartsTooltip
                formatter={(value) => [fmtChart(value, 2, 'zł/kg'), 'Stawka']}
                labelFormatter={(label) => `Dzień ${String(label)}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {result.isSimulated && result.rate !== null && (
                <ReferenceLine y={result.rate} stroke={SERIES_INDUSTRIAL} strokeDasharray="4 4"
                  label={{ value: `wpisana ${result.rate.toFixed(2)}`, fontSize: 10, fill: SERIES_INDUSTRIAL, position: 'insideTopRight' }} />
              )}
              <Line type="monotone" dataKey="rate" stroke={SERIES_DESSERT} strokeWidth={2}
                dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </DayChart>

          {/* Osobny wykres, nie druga oś Y — dwie skale na jednym polu
              to najczęstszy błąd w wykresach i nie da się ich uczciwie porównać. */}
          <DayChart title="Wydajność wzorca" unit="kg/h">
            <LineChart data={dailySeries} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid stroke={GRID_INK} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_INK }}
                axisLine={{ stroke: GRID_INK }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false}
                width={44} tickFormatter={(v: number) => v.toFixed(1)} />
              <RechartsTooltip
                formatter={(value) => [fmtChart(value, 2, 'kg/h'), 'Wydajność']}
                labelFormatter={(label) => `Dzień ${String(label)}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="kgPerHour" stroke={SERIES_DESSERT} strokeWidth={2}
                dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </DayChart>

          <div className="lg:col-span-2">
            <DayChart title="Zebrano dziennie" unit="kg">
              <BarChart data={dailySeries} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid stroke={GRID_INK} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_INK }}
                  axisLine={{ stroke: GRID_INK }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false}
                  width={52} tickFormatter={(v: number) => v.toFixed(0)} />
                <RechartsTooltip
                  formatter={(value, name) => [fmtChart(value, 1, 'kg'), String(name)]}
                  labelFormatter={(label) => `Dzień ${String(label)}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="dessertKg" name="Deser" stackId="kg" fill={SERIES_DESSERT}
                  stroke="#fff" strokeWidth={2} />
                <Bar dataKey="industrialKg" name="Przemysł" stackId="kg" fill={SERIES_INDUSTRIAL}
                  stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </DayChart>
          </div>
        </div>
      )}

      {/* ========== TABELA ========== */}
      {hasData && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Kto ile zarobi ({result.rows.length})</CardTitle>
            {mode === 'MANUAL' && (
              <span className="text-xs text-gray-500">Zaznacz osoby wzorcowe</span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="p-2 w-10 text-center">Wz.</th>
                    <Th onClick={() => toggleSort('name')}>Pracownik <SortIcon column="name" /></Th>
                    <Th onClick={() => toggleSort('kg')} right>razem kg <SortIcon column="kg" /></Th>
                    <Th onClick={() => toggleSort('dessertKg')} right>
                      deser <SortIcon column="dessertKg" />
                    </Th>
                    <Th onClick={() => toggleSort('industrialKg')} right>
                      przemysł <SortIcon column="industrialKg" />
                    </Th>
                    <Th onClick={() => toggleSort('industrialShare')} right>
                      % przem. <SortIcon column="industrialShare" />
                    </Th>
                    <Th onClick={() => toggleSort('hours')} right>Czas pracy <SortIcon column="hours" /></Th>
                    <Th onClick={() => toggleSort('kgPerHour')} right>kg/h <SortIcon column="kgPerHour" /></Th>
                    <Th onClick={() => toggleSort('earnings')} right>Zarobek <SortIcon column="earnings" /></Th>
                    <Th onClick={() => toggleSort('effectiveHourly')} right>zł/h <SortIcon column="effectiveHourly" /></Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const source = keptRows.find((r) => (r.externalId || r.workerName) === (row.externalId || row.workerName))
                    const style = BAND_STYLE[row.band]
                    return (
                      <tr key={row.externalId || row.workerName}
                        className={`border-t ${style.row} ${row.isReference ? 'ring-1 ring-inset ring-gray-400' : ''}`}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={row.isReference} disabled={mode !== 'MANUAL'}
                            onChange={() => source && toggleReference(source)} />
                        </td>
                        <td className="p-2">
                          <span className={row.isReference ? 'font-semibold' : ''}>{row.workerName}</span>
                          {row.externalId && <span className="text-gray-400 text-xs ml-1.5">{row.externalId}</span>}
                          {source && !source.isHarvestWorker && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {source.workTypes[0] || 'inna praca'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">{num(row.kg, 1)}</td>
                        <td className="p-2 text-right tabular-nums text-gray-600">
                          {num(row.dessertKg, 1)}
                        </td>
                        <td className="p-2 text-right tabular-nums text-gray-600">
                          {row.industrialKg > 0 ? num(row.industrialKg, 1) : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {row.kg > 0 ? (
                            <span
                              // Powyżej średniej dnia na pomarańczowo — próg jest
                              // liczony z danych, nie wpisany na sztywno.
                              className={
                                row.industrialKg / row.kg > dayIndustrialShare
                                  ? 'font-semibold'
                                  : 'text-gray-500'
                              }
                              style={
                                row.industrialKg / row.kg > dayIndustrialShare
                                  ? { color: SERIES_INDUSTRIAL }
                                  : undefined
                              }
                              title={`średnia dnia: ${(dayIndustrialShare * 100).toFixed(1)}%`}
                            >
                              {((row.industrialKg / row.kg) * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums text-gray-600">
                          <span className="font-medium">{fmtDuration(row.effectiveHours)}</span>
                          {source?.startTime && source?.endTime && (
                            <span className="block text-[10px] text-gray-400">
                              {source.startTime.slice(0, 5)}–{source.endTime.slice(0, 5)}
                            </span>
                          )}
                          {breakMinutes > 0 && (
                            <span className="block text-[10px] text-gray-400">
                              brutto {fmtDuration(row.hours)}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums font-medium">{num(row.kgPerHour)}</td>
                        <td className="p-2 text-right tabular-nums">{zl(row.earnings)}</td>
                        <td className={`p-2 text-right tabular-nums font-semibold ${style.text}`}>
                          {num(row.effectiveHourly)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== ODCIĘCI ========== */}
      {cutRows.length > 0 && (
        <Card className="border-gray-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Odcięci — poniżej {parsedCutoff} kg/h ({cutRows.length} os.)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-500">
                <tbody>
                  {[...cutRows]
                    .sort((a, b) => (kphOf(a) || 0) - (kphOf(b) || 0))
                    .map((row) => {
                      const kph = kphOf(row)
                      const dessert = row.kg - row.industrialKg
                      const earnings = result.rate === null ? null
                        : dessert * result.rate + row.industrialKg * (parsedIndustrialRate || 0)
                      const hours = Math.max(0, row.hours - breakHours)
                      return (
                        <tr key={row.externalId || row.workerName} className="border-t bg-gray-50/60">
                          <td className="p-2">
                            {row.workerName}
                            {row.externalId && <span className="text-gray-400 text-xs ml-1.5">{row.externalId}</span>}
                          </td>
                          <td className="p-2 text-right tabular-nums">{num(row.kg, 1)} kg</td>
                          <td className="p-2 text-right tabular-nums">{num(hours, 2)} h</td>
                          <td className="p-2 text-right tabular-nums font-medium">{num(kph)} kg/h</td>
                          <td className="p-2 text-right tabular-nums">{zl(earnings)}</td>
                          <td className="p-2 text-right tabular-nums">
                            {hours > 0 && earnings !== null ? `${(earnings / hours).toFixed(2)} zł/h` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 px-4 py-2 border-t">
              Odcięci nie wchodzą do stawki, statystyk ani zapisu sesji. Kwoty policzone wg tej samej stawki — informacyjnie.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ========== ZAPIS ========== */}
      {hasData && (
        <Card>
          <CardContent className="pt-5 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor="note" className="text-xs">Notatka (opcjonalnie)</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="np. deszcz od 14:00" className="mt-1" />
            </div>
            {editingSessionId ? (
              <>
                <Button onClick={handleUpdate} disabled={saving || result.rate === null || !harvestDate}
                  className="bg-amber-600 hover:bg-amber-700">
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Zapisz zmiany
                </Button>
                <Button variant="outline" onClick={handleSave}
                  disabled={saving || result.rate === null || !harvestDate}
                  title="Zapisz jako nową sesję, zostawiając poprzednią bez zmian">
                  <Copy className="w-4 h-4 mr-1.5" />
                  Zapisz jako nową
                </Button>
              </>
            ) : (
              <Button onClick={handleSave} disabled={saving || result.rate === null || !harvestDate}
                className="bg-green-600 hover:bg-green-700">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Zapisz sesję
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== RANKING PRACOWNIKÓW (cały sezon) ========== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Najlepsi i najsłabsi pracownicy — wszystkie zapisane wyceny
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            (rankFrom || rankTo) ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-500">Brak zapisanych wycen w wybranym zakresie dat.</p>
                <Button variant="outline" size="sm" onClick={() => { setRankFrom(''); setRankTo('') }}>
                  <X className="w-3.5 h-3.5 mr-1" /> cały sezon
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Brak danych — zapisz przynajmniej jedną wycenę, żeby zobaczyć ranking.
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <Label className="text-xs">Ilu najlepszych / najsłabszych</Label>
                  <div className="flex gap-1 mt-1">
                    {[5, 10, 15].map((n) => (
                      <button key={n} onClick={() => setTopCount(n)}
                        className={`px-3 py-1.5 rounded text-xs border ${
                          topCount === n ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="minDays" className="text-xs">Min. dni pracy</Label>
                  <Input id="minDays" type="number" min={1} value={minDays} className="mt-1 w-24"
                    onChange={(e) => setMinDays(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
                <div>
                  <Label htmlFor="rankFrom" className="text-xs">Od (data zbioru)</Label>
                  <Input id="rankFrom" type="date" value={rankFrom} className="mt-1"
                    max={rankTo || undefined}
                    onChange={(e) => setRankFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="rankTo" className="text-xs">Do</Label>
                  <Input id="rankTo" type="date" value={rankTo} className="mt-1"
                    min={rankFrom || undefined}
                    onChange={(e) => setRankTo(e.target.value)} />
                </div>
                {(rankFrom || rankTo) && (
                  <Button variant="outline" size="sm" onClick={() => { setRankFrom(''); setRankTo('') }}
                    title="Pokaż cały sezon">
                    <X className="w-3.5 h-3.5 mr-1" /> cały sezon
                  </Button>
                )}
                <p className="text-xs text-gray-400">
                  Wydajność ważona (suma kg / suma godzin){rankFrom || rankTo ? ' w wybranym zakresie' : ' ze wszystkich dni'}. Tylko zbieracze.
                </p>
              </div>

              {(() => {
                const { top, bottom, eligible } = topAndBottom(ranking, topCount, topCount, minDays)
                if (eligible === 0) {
                  return <p className="text-sm text-gray-500">Nikt nie pracował co najmniej {minDays} dni.</p>
                }
                return (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <RankingList title={`Najlepsi (${top.length})`} tone="top" workers={top} startRank={1} />
                    <RankingList title={`Najsłabsi (${bottom.length})`} tone="bottom" workers={bottom}
                      startRank={eligible - bottom.length + 1} descendingRank />
                  </div>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* ========== HISTORIA ========== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historia wycen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 pb-5">Brak zapisanych sesji.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-right">Deser</th>
                    <th className="p-2 text-right">Przemysł</th>
                    <th className="p-2 text-right">Cel zł/h</th>
                    <th className="p-2 text-right">Przerwy</th>
                    <th className="p-2 text-right">Osób</th>
                    <th className="p-2 text-left">Notatka</th>
                    <th className="p-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}
                      className={`border-t hover:bg-gray-50 ${session.id === editingSessionId ? 'bg-amber-50' : ''}`}>
                      <td className="p-2">{fmtDate(session.harvestDate)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{session.computedRate.toFixed(2)} zł/kg</td>
                      <td className="p-2 text-right tabular-nums text-gray-600">
                        {session.industrialRate === null ? '—' : `${session.industrialRate.toFixed(2)} zł/kg`}
                      </td>
                      <td className="p-2 text-right tabular-nums text-gray-600">{session.targetHourly.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-600">{session.breakMinutes} min</td>
                      <td className="p-2 text-right tabular-nums">{session.workerCount}</td>
                      <td className="p-2 text-gray-500 text-xs">{session.note || '—'}</td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleOpenSession(session.id)}
                            disabled={loadingSession}
                            className="text-gray-400 hover:text-green-700 disabled:opacity-40"
                            title="Otwórz w kalkulatorze">
                            {loadingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDelete(session.id)}
                            className="text-gray-400 hover:text-red-600" title="Usuń sesję">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RankingList({ title, tone, workers, startRank, descendingRank }: {
  title: string
  tone: 'top' | 'bottom'
  workers: WorkerRanking[]
  startRank: number
  descendingRank?: boolean
}) {
  const accent = tone === 'top' ? 'text-green-700' : 'text-red-600'
  const head = tone === 'top' ? 'bg-green-50' : 'bg-red-50'
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className={`px-3 py-2 text-sm font-semibold ${accent} ${head}`}>{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="p-2 w-8 text-right">#</th>
            <th className="p-2 text-left">Pracownik</th>
            <th className="p-2 text-right">kg/h</th>
            <th className="p-2 text-right">kg/dzień</th>
            <th className="p-2 text-right">kg razem</th>
            <th className="p-2 text-right">dni</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((w, i) => (
            <tr key={w.key} className="border-t">
              <td className="p-2 text-right text-gray-400 tabular-nums">
                {descendingRank ? startRank + (workers.length - 1 - i) : startRank + i}
              </td>
              <td className="p-2">
                {w.workerName}
                {w.externalId && <span className="text-gray-400 text-xs ml-1.5">{w.externalId}</span>}
              </td>
              <td className={`p-2 text-right tabular-nums font-semibold ${accent}`}>
                {w.avgKgPerHour.toFixed(2)}
              </td>
              <td className="p-2 text-right tabular-nums text-gray-700">
                {w.days > 0 ? (w.totalKg / w.days).toFixed(1) : '—'}
              </td>
              <td className="p-2 text-right tabular-nums text-gray-600">{w.totalKg.toFixed(1)}</td>
              <td className="p-2 text-right tabular-nums text-gray-500">{w.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick: () => void; right?: boolean }) {
  return (
    <th onClick={onClick}
      className={`p-2 cursor-pointer select-none hover:text-gray-900 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function HarvestTile({ label, color, kg, share, cost, rate }: {
  label: string
  color: string
  kg: number
  share: number
  cost: number | null
  rate: number | null
}) {
  return (
    <div className="rounded-lg border p-3 min-w-0">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        {label}
        <span className="text-gray-400">· {(share * 100).toFixed(1)}%</span>
      </p>
      <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">
        {kg.toFixed(1)}<span className="text-sm font-normal ml-1">kg</span>
      </p>
      <p className="text-xs text-gray-600 mt-1">
        {cost === null ? '—' : `${cost.toFixed(0)} zł`}
      </p>
      <p className="text-[11px] text-gray-400">
        {rate === null ? 'brak stawki' : `po ${rate.toFixed(2)} zł/kg`}
      </p>
    </div>
  )
}

/** Ramka wykresu — tytuł nazywa serię, więc pojedyncza seria nie potrzebuje legendy. */
function DayChart({ title, unit, children }: {
  title: string; unit: string; children: React.ReactElement
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-gray-700">
          {title} <span className="text-gray-400 font-normal">({unit})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function BandTile({ band, count, total, desc }: {
  band: HourlyBand; count: number; total: number; desc: string
}) {
  const style = BAND_STYLE[band]
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={`rounded-lg p-2.5 ${style.row} border border-black/5 min-w-0`}>
      <p className="text-[11px] text-gray-600 flex items-center gap-1.5 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
        <span className="truncate">{style.label}</span>
      </p>
      <p className={`text-xl font-bold whitespace-nowrap ${style.text}`}>
        {count}
        <span className="text-xs font-normal ml-1">os. · {pct}%</span>
      </p>
      <p className="text-[11px] text-gray-400 truncate" title={desc}>{desc}</p>
    </div>
  )
}
