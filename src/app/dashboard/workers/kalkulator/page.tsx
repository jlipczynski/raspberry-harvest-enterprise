'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Upload, Calculator, ArrowLeft, Trash2, Save, AlertTriangle, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown, Users, Coffee, X,
} from 'lucide-react'
import {
  computePieceRate,
  DEFAULT_BAND_TOLERANCE,
  type PieceRateInputRow,
  type HourlyBand,
} from '@/lib/piece-rate'

// Wartości startowe formularza — użytkownik je nadpisuje, nic nie jest
// zapisywane bez jego decyzji.
const DEFAULT_TARGET_HOURLY = 25
const DEFAULT_MEDIAN_COUNT = 5
const ROUNDING_STEP_COARSE = 0.05
const ROUNDING_STEP_FINE = 0.01

// Kolorystyka pasm zarobku względem docelowej stawki godzinowej
const BAND_STYLE: Record<HourlyBand, { row: string; text: string; label: string }> = {
  above: { row: 'bg-green-50', text: 'text-green-700', label: 'powyżej celu' },
  near: { row: 'bg-blue-50', text: 'text-blue-700', label: 'w okolicy celu' },
  below: { row: 'bg-red-50', text: 'text-red-700', label: 'poniżej celu' },
  unknown: { row: '', text: 'text-gray-400', label: 'brak danych' },
}

interface ParsedRow {
  externalId: string | null
  workerName: string
  kg: number
  hours: number
  workTypes: string[]
  isHarvestWorker: boolean
  currentAmount: number | null
}

interface SessionSummary {
  id: string
  harvestDate: string
  fileName: string
  mode: 'MANUAL' | 'AUTO_MEDIAN'
  targetHourly: number
  breakMinutes: number
  computedRate: number
  workerCount: number
  note: string | null
}

type SortKey = 'name' | 'kg' | 'hours' | 'kgPerHour' | 'earnings' | 'effectiveHourly'

const zl = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)} zł`
const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : value.toFixed(digits)

const fmtDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

export default function PieceRateCalculatorPage() {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileNames, setFileNames] = useState<string[]>([])
  const [harvestDate, setHarvestDate] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const [mode, setMode] = useState<'MANUAL' | 'AUTO_MEDIAN'>('AUTO_MEDIAN')
  const [medianCount, setMedianCount] = useState(DEFAULT_MEDIAN_COUNT)
  const [targetHourly, setTargetHourly] = useState<number>(DEFAULT_TARGET_HOURLY)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [coarseRounding, setCoarseRounding] = useState(true)
  const [rateOverride, setRateOverride] = useState<string>('')
  const [bandTolerance, setBandTolerance] = useState(DEFAULT_BAND_TOLERANCE * 100)
  const [onlyHarvestWorkers, setOnlyHarvestWorkers] = useState(true)
  const [hoursStrategy, setHoursStrategy] = useState<'max' | 'sum'>('max')
  const [manualRefs, setManualRefs] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('kgPerHour')
  const [sortAsc, setSortAsc] = useState(true)
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  const rowKey = (row: ParsedRow) => row.externalId || row.workerName

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/piece-rate/sessions')
      if (!response.ok) return
      const data = await response.json()
      setSessions(data.sessions || [])
    } catch {
      // Historia jest dodatkiem — jej brak nie blokuje liczenia stawki.
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  // ==================== UPLOAD ====================
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

      setRows(data.rows || [])
      setWarnings(data.warnings || [])
      setFileNames((data.files || []).map((f: { fileName: string }) => f.fileName))
      if (data.reportDate) setHarvestDate(data.reportDate)
      setManualRefs(new Set())
    } catch {
      setError('Błąd połączenia przy wysyłaniu pliku')
    } finally {
      setUploading(false)
    }
  }

  // ==================== WYLICZENIE ====================
  const activeRows = useMemo(
    () => (onlyHarvestWorkers ? rows.filter((row) => row.isHarvestWorker) : rows),
    [rows, onlyHarvestWorkers]
  )

  const result = useMemo(() => {
    const input: PieceRateInputRow[] = activeRows.map((row) => ({
      workerName: row.workerName,
      externalId: row.externalId,
      kg: row.kg,
      hours: row.hours,
      isReference: manualRefs.has(rowKey(row)),
      isHarvestWorker: row.isHarvestWorker,
      currentAmount: row.currentAmount,
    }))

    const parsedOverride = rateOverride.trim() === ''
      ? null
      : parseFloat(rateOverride.replace(',', '.'))

    return computePieceRate(input, {
      mode,
      targetHourly,
      medianCount,
      roundingStep: coarseRounding ? ROUNDING_STEP_COARSE : ROUNDING_STEP_FINE,
      breakHours: breakMinutes / 60,
      rateOverride: parsedOverride !== null && Number.isFinite(parsedOverride) ? parsedOverride : null,
      bandTolerance: bandTolerance / 100,
      // Próg alarmowy = docelowa stawka godzinowa; pasma pokazują resztę obrazu.
      hourlyThreshold: targetHourly,
    })
  }, [activeRows, manualRefs, mode, targetHourly, medianCount, coarseRounding, breakMinutes, rateOverride, bandTolerance])

  // Suma kwot z MaxCropa — punkt odniesienia dla nowej stawki
  const currentTotal = useMemo(() => {
    const amounts = activeRows.map((row) => row.currentAmount).filter((a): a is number => a !== null)
    return amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null
  }, [activeRows])

  const sortedRows = useMemo(() => {
    const copy = [...result.rows]
    copy.sort((a, b) => {
      const pick = (row: typeof a): number | string => {
        switch (sortKey) {
          case 'name': return row.workerName.toLowerCase()
          case 'kg': return row.kg
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

  /** Przepisuje automatyczny wybór środka na ręczne zaznaczenia. */
  const applyMedianSelection = () => {
    const keys = new Set(
      result.referenceRows.map((row) => row.externalId || row.workerName)
    )
    setManualRefs(keys)
    setMode('MANUAL')
  }

  // ==================== ZAPIS ====================
  const handleSave = async () => {
    if (result.rate === null || !harvestDate) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/piece-rate/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          harvestDate,
          fileName: fileNames.join(', '),
          mode,
          targetHourly,
          medianCount,
          breakMinutes,
          roundingStep: coarseRounding ? ROUNDING_STEP_COARSE : ROUNDING_STEP_FINE,
          rateOverride: result.isSimulated ? result.rate : null,
          note: note.trim() || null,
          rows: activeRows.map((row) => ({
            workerName: row.workerName,
            externalId: row.externalId,
            kg: row.kg,
            hours: row.hours,
            isReference: manualRefs.has(rowKey(row)),
            isHarvestWorker: row.isHarvestWorker,
            currentAmount: row.currentAmount,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Nie udało się zapisać sesji')
        return
      }

      setSavedMessage(`Zapisano sesję z ${fmtDate(harvestDate)} — stawka ${data.session.computedRate.toFixed(2)} zł/kg`)
      fetchSessions()
    } catch {
      setError('Błąd połączenia przy zapisie')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć tę sesję? Tej operacji nie da się cofnąć.')) return
    try {
      const response = await fetch(`/api/piece-rate/sessions/${id}`, { method: 'DELETE' })
      if (response.ok) fetchSessions()
    } catch {
      setError('Nie udało się usunąć sesji')
    }
  }

  const nonHarvestCount = rows.length - rows.filter((r) => r.isHarvestWorker).length

  return (
    <div className="space-y-5">
      {/* Nagłówek */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/workers" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Pracownicy
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6 text-green-600" />
            Kalkulator wynagrodzeń
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stawka akordowa zł/kg na podstawie raportu pracy z MaxCrop
          </p>
        </div>
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

      {/* Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Wgraj raport(y) z dnia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2 border-2 border-dashed border-gray-300 rounded-lg p-5 cursor-pointer hover:border-green-500 hover:bg-green-50/50 transition-colors block text-center">
              <input
                type="file"
                multiple
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {uploading ? (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję…
                </span>
              ) : (
                <span className="inline-flex flex-col items-center text-sm text-gray-600">
                  <Upload className="w-5 h-5 mb-1" />
                  {fileNames.length > 0 ? fileNames.join(', ') : 'Kliknij lub przeciągnij pliki XLS/XLSX'}
                  <span className="text-xs text-gray-400 mt-1">
                    Można wgrać kilka raportów z tego samego dnia — scalę je po kodzie kreskowym
                  </span>
                </span>
              )}
            </label>

            <div className="space-y-3">
              <div>
                <Label htmlFor="harvestDate" className="text-xs">Data zbioru</Label>
                <Input id="harvestDate" type="date" value={harvestDate}
                  onChange={(e) => setHarvestDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Godziny przy kilku plikach</Label>
                <div className="flex gap-1 mt-1">
                  <button onClick={() => setHoursStrategy('max')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs border ${hoursStrategy === 'max' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                    Najdłuższa
                  </button>
                  <button onClick={() => setHoursStrategy('sum')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs border ${hoursStrategy === 'sum' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                    Suma
                  </button>
                </div>
              </div>
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

      {rows.length > 0 && (
        <>
          {/* Panel sterowania */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Ustaw parametry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <Label className="text-xs">Tryb wyboru wzorca</Label>
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => setMode('AUTO_MEDIAN')}
                        className={`flex-1 px-2 py-2 rounded text-xs border ${mode === 'AUTO_MEDIAN' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                        Auto — środek stawki
                      </button>
                      <button onClick={() => setMode('MANUAL')}
                        className={`flex-1 px-2 py-2 rounded text-xs border ${mode === 'MANUAL' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                        Ręczny
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="medianCount" className="text-xs">Ile osób w środku</Label>
                    <div className="flex gap-2 mt-1">
                      <Input id="medianCount" type="number" min={1} value={medianCount}
                        disabled={mode !== 'AUTO_MEDIAN'}
                        onChange={(e) => setMedianCount(Math.max(1, parseInt(e.target.value) || 1))} />
                      <Button variant="outline" size="sm" onClick={applyMedianSelection}
                        disabled={mode !== 'AUTO_MEDIAN' || result.referenceRows.length === 0}
                        title="Przepisz automatyczny wybór na zaznaczenia i przejdź w tryb ręczny">
                        Przypnij
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="targetHourly" className="text-xs">
                      Ile ma zarobić osoba z mediany (zł/h)
                    </Label>
                    <Input id="targetHourly" type="number" step="0.5" min={0} value={targetHourly} className="mt-1"
                      onChange={(e) => setTargetHourly(parseFloat(e.target.value) || 0)} />
                  </div>

                  <div>
                    <Label htmlFor="breakMinutes" className="text-xs flex items-center gap-1">
                      <Coffee className="w-3 h-3" /> Przerwy (min/os.)
                    </Label>
                    <Input id="breakMinutes" type="number" min={0} step={5} value={breakMinutes} className="mt-1"
                      onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))} />
                  </div>

                  <div>
                    <Label htmlFor="rateOverride" className="text-xs">
                      Symuluj stawkę (zł/kg)
                    </Label>
                    <div className="flex gap-1 mt-1">
                      <Input id="rateOverride" type="number" step="0.05" min={0} value={rateOverride}
                        placeholder={result.derivedRate === null ? 'np. 6,00' : result.derivedRate.toFixed(2)}
                        onChange={(e) => setRateOverride(e.target.value)} />
                      {rateOverride.trim() !== '' && (
                        <Button variant="outline" size="sm" onClick={() => setRateOverride('')}
                          title="Wróć do stawki wyliczonej z celu">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Wpisz, żeby zobaczyć kto ile by zarobił przy tej stawce
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="bandTolerance" className="text-xs">
                      Szerokość pasma „w okolicy" (%)
                    </Label>
                    <Input id="bandTolerance" type="number" step={1} min={0} value={bandTolerance} className="mt-1"
                      onChange={(e) => setBandTolerance(Math.max(0, parseFloat(e.target.value) || 0))} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Opcje</Label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={coarseRounding}
                        onChange={(e) => setCoarseRounding(e.target.checked)} />
                      Zaokrąglaj do 0,05 zł
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={onlyHarvestWorkers}
                        onChange={(e) => setOnlyHarvestWorkers(e.target.checked)} />
                      Tylko zbierający{nonHarvestCount > 0 && ` (ukryj ${nonHarvestCount})`}
                    </label>
                  </div>
                </div>

                {/* Wynik */}
                <div className={`text-white rounded-xl p-5 min-w-[230px] flex flex-col justify-center bg-gradient-to-br ${
                  result.isSimulated ? 'from-amber-500 to-amber-600' : 'from-green-600 to-green-700'
                }`}>
                  <p className="text-white/80 text-xs uppercase tracking-wide">
                    {result.isSimulated ? 'Stawka symulowana' : 'Stawka akordowa'}
                  </p>
                  <p className="text-4xl font-bold mt-1">
                    {result.rate === null ? '—' : result.rate.toFixed(2)}
                    <span className="text-lg font-normal ml-1">zł/kg</span>
                  </p>
                  {result.rate === null && (
                    <p className="text-white/80 text-xs mt-2">
                      {mode === 'MANUAL'
                        ? 'Zaznacz osoby wzorcowe w tabeli'
                        : 'Brak danych do wyliczenia'}
                    </p>
                  )}
                  {result.isSimulated && result.derivedRate !== null && (
                    <p className="text-white/80 text-xs mt-2">
                      z celu {targetHourly.toFixed(2)} zł/h wyszłoby {result.derivedRate.toFixed(2)} zł/kg
                    </p>
                  )}
                  {!result.isSimulated && result.rawRate !== null && result.rate !== null && (
                    <p className="text-white/70 text-xs mt-2">
                      bez zaokrąglenia: {result.rawRate.toFixed(4)} zł/kg
                    </p>
                  )}
                </div>
              </div>

              {/* Statystyki */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4 pt-4 border-t">
                <Stat label="Wydajność wzorca" value={`${num(result.avgKgPerHour)} kg/h`}
                  hint={`${result.referenceRows.length} os. wzorcowych`} />
                <Stat label="Zebrano / godziny" value={`${num(result.totalKg, 1)} kg`}
                  hint={`${num(result.totalHours, 1)} h${breakMinutes > 0 ? ` (po odjęciu przerw)` : ''}`} />
                <Stat label="Koszt dnia" value={zl(result.totalCost, 0)}
                  hint={currentTotal !== null
                    ? `MaxCrop: ${currentTotal.toFixed(0)} zł${result.totalCost !== null ? ` (${result.totalCost >= currentTotal ? '+' : ''}${(result.totalCost - currentTotal).toFixed(0)} zł)` : ''}`
                    : 'brak danych porównawczych'} />
                <Stat label={`Rozkład vs ${targetHourly.toFixed(0)} zł/h`}
                  value={`${result.bands.above} / ${result.bands.near} / ${result.bands.below}`}
                  hint="powyżej / w okolicy / poniżej" />
              </div>

              {/* Legenda pasm */}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-600">
                <span className="font-medium text-gray-500">Kolory wierszy:</span>
                <BandChip band="above" count={result.bands.above}
                  desc={`> ${(targetHourly * (1 + bandTolerance / 100)).toFixed(2)} zł/h`} />
                <BandChip band="near" count={result.bands.near}
                  desc={`±${bandTolerance}% od ${targetHourly.toFixed(2)} zł/h`} />
                <BandChip band="below" count={result.bands.below}
                  desc={`< ${(targetHourly * (1 - bandTolerance / 100)).toFixed(2)} zł/h`} />
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> 3. Pracownicy ({result.rows.length})
              </CardTitle>
              {mode === 'MANUAL' && (
                <span className="text-xs text-gray-500">Zaznacz osoby wzorcowe klikając w checkbox</span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <tr>
                      <th className="p-2 w-10 text-center">Wz.</th>
                      <Th onClick={() => toggleSort('name')}>Pracownik <SortIcon column="name" /></Th>
                      <Th onClick={() => toggleSort('kg')} right>kg <SortIcon column="kg" /></Th>
                      <Th onClick={() => toggleSort('hours')} right>godz. <SortIcon column="hours" /></Th>
                      <Th onClick={() => toggleSort('kgPerHour')} right>kg/h <SortIcon column="kgPerHour" /></Th>
                      <Th onClick={() => toggleSort('earnings')} right>Zarobek <SortIcon column="earnings" /></Th>
                      <Th onClick={() => toggleSort('effectiveHourly')} right>zł/h <SortIcon column="effectiveHourly" /></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const source = activeRows.find(
                        (r) => (r.externalId || r.workerName) === (row.externalId || row.workerName)
                      )
                      const style = BAND_STYLE[row.band]

                      return (
                        <tr key={row.externalId || row.workerName}
                          className={`border-t ${style.row} ${row.isReference ? 'ring-1 ring-inset ring-gray-400' : ''}`}>
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={row.isReference}
                              disabled={mode !== 'MANUAL'}
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
                          <td className="p-2 text-right tabular-nums text-gray-600">{num(row.effectiveHours, 2)}</td>
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

          {/* Zapis */}
          <Card>
            <CardContent className="pt-5 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <Label htmlFor="note" className="text-xs">Notatka (opcjonalnie)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="np. deszcz od 14:00" className="mt-1" />
              </div>
              <Button onClick={handleSave} disabled={saving || result.rate === null || !harvestDate}
                className="bg-green-600 hover:bg-green-700">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Zapisz sesję
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Historia */}
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
                    <th className="p-2 text-right">Stawka</th>
                    <th className="p-2 text-right">Cel zł/h</th>
                    <th className="p-2 text-right">Przerwy</th>
                    <th className="p-2 text-right">Osób</th>
                    <th className="p-2 text-left">Notatka</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-t hover:bg-gray-50">
                      <td className="p-2">{fmtDate(session.harvestDate)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{session.computedRate.toFixed(2)} zł/kg</td>
                      <td className="p-2 text-right tabular-nums text-gray-600">{session.targetHourly.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-600">{session.breakMinutes} min</td>
                      <td className="p-2 text-right tabular-nums">{session.workerCount}</td>
                      <td className="p-2 text-gray-500 text-xs">{session.note || '—'}</td>
                      <td className="p-2">
                        <button onClick={() => handleDelete(session.id)}
                          className="text-gray-400 hover:text-red-600" title="Usuń sesję">
                          <Trash2 className="w-4 h-4" />
                        </button>
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

function Th({ children, onClick, right }: { children: React.ReactNode; onClick: () => void; right?: boolean }) {
  return (
    <th onClick={onClick}
      className={`p-2 cursor-pointer select-none hover:text-gray-900 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function BandChip({ band, count, desc }: { band: HourlyBand; count: number; desc: string }) {
  const style = BAND_STYLE[band]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded border border-gray-300 ${style.row}`} />
      <span className={style.text}>{style.label}</span>
      <span className="text-gray-400">— {count} os., {desc}</span>
    </span>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}
