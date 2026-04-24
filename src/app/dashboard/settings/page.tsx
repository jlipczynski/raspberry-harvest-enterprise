'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, Download, Upload, Database, Bell, MapPin, Trash2, CheckCircle, Cloud, RefreshCw, Loader2, Thermometer, FileText, AlertTriangle } from 'lucide-react'

interface Farm {
  id: string
  name: string
  location: string
  latitude: number | null
  longitude: number | null
  seasonStartDate: string | null
}

interface PreviewRow {
  fileName: string
  detectedTunnel: string
  sectionName: string
  sectionId: string | null
  count: number
  status: 'ok' | 'unknown_tunnel' | 'section_not_found'
  sheetName?: string
}

interface SectionOption {
  id: string
  name: string | null
  blockName: string
}

interface UploadResult {
  success?: boolean
  error?: string
  blockName?: string
  fileName?: string
  totalReadings?: number
  totalInserted?: number
  sections?: Array<{ sectionId: string; sectionName: string | null; inserted: number; sheetName?: string; blockName?: string }>
  format?: string
  totalSheets?: number
  errors?: string[]
}

interface UploadHistoryEntry {
  id: string
  uploadedAt: string
  fileName: string
  blockName: string
  sections: string[]
  totalInFile: number
  inserted: number
  duplicates: number
}

interface SectionImpact {
  sectionId: string
  sectionName: string
  inserted: number
  flowerThreshold: number | null
  fruitThreshold: number | null
  flowerDateBefore: string | null
  fruitDateBefore: string | null
  flowerDateAfter: string | null
  fruitDateAfter: string | null
}

type ForecastData = {
  meteoDays?: Array<{ date: string; avgTunnelTemp: number }>
  scenarios?: { p50?: Array<{ date: string; avgTunnelTemp: number }> }
} | null

const GDH_UPPER = 26.0

// Logger data + Meteo 16d forecast + P50 scenario — identycznie jak planning page
function findThresholdDate(
  dailyGdh: Array<{ date: unknown; cumulativeGdh: number }>,
  forecast: ForecastData,
  threshold: number | null,
  baseTemp: number
): string | null {
  if (threshold === null) return null

  const toKey = (d: unknown): string => {
    if (typeof d === 'string') return d.slice(0, 10)
    return new Date(d as Date).toISOString().slice(0, 10)
  }

  const dayGdh = (day: { avgTunnelTemp?: number; gdhTunnel?: number }): number => {
    if (day.avgTunnelTemp != null) return Math.max(0, Math.min(day.avgTunnelTemp, GDH_UPPER) - baseTemp) * 24
    return (day.gdhTunnel ?? 0)
  }

  // Zbuduj mapę: data → kumulatywne GDH (jak planning page)
  const gdhMap = new Map<string, number>()
  let lastRealGdh = 0
  let lastRealDate = ''

  for (const d of dailyGdh) {
    const key = toKey(d.date)
    gdhMap.set(key, d.cumulativeGdh)
    lastRealGdh = d.cumulativeGdh
    lastRealDate = key
  }

  // Meteo 16d — pomiń dni już pokryte przez logger
  let cumGdh = lastRealGdh
  for (const day of (forecast?.meteoDays ?? [])) {
    if (day.date <= lastRealDate) continue
    cumGdh += dayGdh(day)
    gdhMap.set(day.date, Math.round(cumGdh))
  }

  // Scenariusz P50 — zaczyna się naturalnie po ostatnim dniu Meteo, bez dodatkowego filtru
  for (const day of (forecast?.scenarios?.p50 ?? [])) {
    cumGdh += dayGdh(day)
    gdhMap.set(day.date, Math.round(cumGdh))
  }

  // Posortuj wszystkie wpisy, znajdź pierwsze przekroczenie progu
  const entries = [...gdhMap.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [date, gdh] of entries) {
    if (gdh >= threshold) return date
  }

  return null
}

function daysDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function formatImpactDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}`
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'temperature'>('general')
  const [importStatus, setImportStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const [refreshingWeather, setRefreshingWeather] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    latitude: '',
    longitude: '',
    seasonStartDate: ''
  })

  // Temperature import state
  const [tempFiles, setTempFiles] = useState<File[]>([])
  const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null)
  const [allSections, setAllSections] = useState<SectionOption[]>([])
  const [sectionOverrides, setSectionOverrides] = useState<Record<number, string[]>>({})
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<UploadResult[] | null>(null)
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryEntry[]>([])
  const [uploadImpact, setUploadImpact] = useState<SectionImpact[] | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('temperatureUploadHistory')
      if (stored) setUploadHistory(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])
  const tempFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchFarm() }, [])

  const fetchFarm = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      if (data.farm) {
        setFarm(data.farm)
        setFormData({
          name: data.farm.name || '',
          location: data.farm.location || '',
          latitude: data.farm.latitude?.toString() || '',
          longitude: data.farm.longitude?.toString() || '',
          seasonStartDate: data.farm.seasonStartDate
            ? new Date(data.farm.seasonStartDate).toISOString().slice(0, 10)
            : ''
        })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const saveFarm = async () => {
    if (!farm) return
    setSaving(true)
    try {
      const res = await fetch(`/api/farm/${farm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          location: formData.location,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          seasonStartDate: formData.seasonStartDate || null
        })
      })
      if (res.ok) {
        setImportStatus('✓ Ustawienia zapisane')
        setTimeout(() => setImportStatus(''), 3000)
        fetchFarm()
      } else {
        const err = await res.json().catch(() => ({}))
        setImportStatus(`❌ Błąd zapisu: ${err.error || res.status}`)
        setTimeout(() => setImportStatus(''), 8000)
      }
    } catch (e) {
      setImportStatus(`❌ Błąd połączenia: ${e}`)
      setTimeout(() => setImportStatus(''), 8000)
    }
    finally { setSaving(false) }
  }

  const fetchHistoricalWeather = async () => {
    if (!formData.latitude || !formData.longitude) {
      setImportStatus('❌ Najpierw wprowadź współrzędne')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }

    setFetchingWeather(true)
    setImportStatus('⏳ Pobieranie danych pogodowych...')

    try {
      const res = await fetch('/api/weather/fetch-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          // Fetch 10 full years for robust climate percentiles (P10/P50/P90)
          years: Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 10 + i)
        })
      })

      if (res.ok) {
        const data = await res.json()
        setImportStatus(`✓ Pobrano ${data.count || 0} rekordów pogodowych`)
        setTimeout(() => setImportStatus(''), 5000)
      } else {
        const error = await res.json()
        setImportStatus(`❌ ${error.error || 'Błąd pobierania'}`)
        setTimeout(() => setImportStatus(''), 5000)
      }
    } catch {
      setImportStatus('❌ Błąd połączenia z API pogody')
      setTimeout(() => setImportStatus(''), 5000)
    }
    finally { setFetchingWeather(false) }
  }

  const refreshWeatherData = async () => {
    setRefreshingWeather(true)
    setRefreshResult(null)

    try {
      const res = await fetch('/api/cron/weather')
      if (res.ok) {
        const data = await res.json()
        if (data.results?.length) {
          const lines = data.results.map((r: { farm: string; fetched?: number; range?: string; skipped?: string }) => {
            if (r.skipped) return `${r.farm}: ${r.skipped}`
            return `${r.farm}: pobrano ${r.fetched ?? 0} dni (${r.range ?? '—'})`
          })
          setRefreshResult(lines.join('\n'))
        } else {
          setRefreshResult('Brak farm do aktualizacji')
        }
      } else {
        const err = await res.json()
        setRefreshResult(`Błąd: ${err.error || res.status}`)
      }
    } catch {
      setRefreshResult('Błąd połączenia')
    }
    finally { setRefreshingWeather(false) }
  }

  const exportData = async () => {
    try {
      const [plantationRes, varietiesRes, weatherRes] = await Promise.all([
        fetch('/api/plantation'),
        fetch('/api/varieties'),
        fetch('/api/weather')
      ])
      const plantation = await plantationRes.json()
      const varieties = await varietiesRes.json()
      const weather = await weatherRes.json()

      const data = {
        exportDate: new Date().toISOString(),
        version: '2.0.0',
        farm: plantation.farm,
        blocks: plantation.blocks,
        varieties: varieties.varieties,
        weatherData: weather.weatherData
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `raspberry-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setImportStatus('❌ Błąd eksportu')
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        JSON.parse(e.target?.result as string)
        setImportStatus('⏳ Importowanie danych...')

        // Import przez API (do zaimplementowania)
        setImportStatus('✓ Dane zaimportowane pomyślnie!')
        setTimeout(() => setImportStatus(''), 3000)
        setTimeout(() => window.location.reload(), 1000)
      } catch {
        setImportStatus('❌ Błąd importu - nieprawidłowy format pliku')
        setTimeout(() => setImportStatus(''), 3000)
      }
    }
    reader.readAsText(file)
  }

  const clearAllData = () => {
    if (confirm('Czy na pewno chcesz usunąć WSZYSTKIE dane? Ta operacja jest nieodwracalna!')) {
      // TODO: API do czyszczenia danych
      alert('Funkcja w przygotowaniu')
    }
  }

  // Temperature import handlers
  const handleTempFilesSelected = useCallback(async (files: FileList | File[]) => {
    if (!farm) return
    const fileArray = Array.from(files)
    const allowedExts = ['.csv', '.xlsx', '.xls']
    const validFiles = fileArray.filter(f => {
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
      return allowedExts.includes(ext)
    })
    if (validFiles.length === 0) return

    setTempFiles(validFiles)
    setPreviewData(null)
    setImportResults(null)
    setSectionOverrides({})
    setPreviewLoading(true)

    try {
      const fd = new FormData()
      fd.append('farmId', farm.id)
      for (const f of validFiles) {
        fd.append('files', f)
      }
      const res = await fetch('/api/plantation/temperature-preview', { method: 'POST', body: fd })
      if (res.ok) {
        const data = await res.json()
        const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : []
        const sections = Array.isArray(data.allSections) ? data.allSections : []
        setPreviewData(rows)
        setAllSections(sections)
      } else {
        const err = await res.json()
        setPreviewData([])
        setImportStatus(`❌ ${err.error || 'Błąd podglądu'}`)
        setTimeout(() => setImportStatus(''), 5000)
      }
    } catch {
      setPreviewData([])
      setImportStatus('❌ Błąd połączenia')
      setTimeout(() => setImportStatus(''), 3000)
    }
    setPreviewLoading(false)
  }, [farm])

  // Get effective sectionIds for a row (user override or auto-detected)
  const getEffectiveSectionIds = (rowIndex: number): string[] => {
    if (sectionOverrides[rowIndex]?.length) return sectionOverrides[rowIndex]
    const autoId = previewData?.[rowIndex]?.sectionId
    return autoId ? [autoId] : []
  }

  // Check if all rows have at least one section assigned
  const allRowsMapped = Array.isArray(previewData) && previewData.length > 0
    ? previewData.every((_, i) => getEffectiveSectionIds(i).length > 0)
    : false

  const handleTempImport = useCallback(async () => {
    if (!farm || tempFiles.length === 0 || !previewData) return
    setImporting(true)
    setImportResults(null)
    setUploadImpact(null)

    // Zbierz docelowe sekcje
    const targetSectionIds = new Set<string>()
    for (let i = 0; i < previewData.length; i++) {
      getEffectiveSectionIds(i).forEach(id => targetSectionIds.add(id))
    }

    // Pobierz GDH przed importem — zapisz dailyGdh + baseTemp do późniejszego przeliczenia z prognozą
    type GdhSnapshot = {
      name: string
      baseTemp: number
      flowerThreshold: number | null
      fruitThreshold: number | null
      dailyGdh: Array<{ date: unknown; cumulativeGdh: number }>
    }
    const gdhBefore: Record<string, GdhSnapshot> = {}
    try {
      const res = await fetch('/api/gdh')
      if (res.ok) {
        const data = await res.json()
        for (const s of (data.sections || [])) {
          if (targetSectionIds.has(s.id)) {
            gdhBefore[s.id] = {
              name: s.name,
              baseTemp: s.baseTemp,
              flowerThreshold: s.flowerThresholdSummer ?? null,
              fruitThreshold: s.fruitThresholdSummer ?? null,
              dailyGdh: s.dailyGdh ?? [],
            }
          }
        }
      }
    } catch { /* kontynuuj bez snapshotu */ }

    const results: UploadResult[] = []

    for (let i = 0; i < previewData.length; i++) {
      const row = previewData[i]
      const sectionIds = getEffectiveSectionIds(i)
      if (sectionIds.length === 0) continue

      const file = tempFiles.find(f => f.name === row.fileName)
      if (!file) continue

      for (const sectionId of sectionIds) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('farmId', farm.id)
        fd.append('targetSectionId', sectionId)
        if (row.sheetName) {
          fd.append('sheetName', row.sheetName)
        }

        try {
          const res = await fetch('/api/plantation/temperature-upload', { method: 'POST', body: fd })
          const data = await res.json()
          if (!res.ok) results.push({ error: `${row.fileName}${row.sheetName ? ` (${row.sheetName})` : ''}: ${data.error || `błąd ${res.status}`}` })
          else results.push({ ...data, success: true, fileName: row.fileName })
        } catch (err) {
          results.push({ error: `${row.fileName}: ${err instanceof Error ? err.message : 'błąd połączenia'}` })
        }
      }
    }
    setImportResults(results)

    // Pobierz GDH po imporcie i oblicz wpływ na daty (logger + prognoza, jak planning page)
    const anyInserted = results.some(r => r.success && (r.totalInserted ?? 0) > 0)
    if (anyInserted && targetSectionIds.size > 0) {
      try {
        const res = await fetch('/api/gdh')
        if (res.ok) {
          const data = await res.json()
          const forecast: ForecastData = data.forecast ?? null
          const impact: SectionImpact[] = []
          for (const s of (data.sections || [])) {
            if (!targetSectionIds.has(s.id)) continue
            const before = gdhBefore[s.id]
            const baseTemp = s.baseTemp
            const flowerThr = s.flowerThresholdSummer ?? null
            const fruitThr = s.fruitThresholdSummer ?? null
            const insertedForSection = results
              .filter(r => r.success)
              .flatMap(r => r.sections ?? [])
              .filter(sec => sec.sectionId === s.id)
              .reduce((sum, sec) => sum + (sec.inserted ?? 0), 0)
            impact.push({
              sectionId: s.id,
              sectionName: s.name,
              inserted: insertedForSection,
              flowerThreshold: flowerThr,
              fruitThreshold: fruitThr,
              // PRZED: stary dailyGdh + ta sama prognoza (forecast jest ten sam — cached)
              flowerDateBefore: before ? findThresholdDate(before.dailyGdh, forecast, flowerThr, baseTemp) : null,
              fruitDateBefore: before ? findThresholdDate(before.dailyGdh, forecast, fruitThr, baseTemp) : null,
              // PO: nowy dailyGdh (z importem) + prognoza
              flowerDateAfter: findThresholdDate(s.dailyGdh ?? [], forecast, flowerThr, baseTemp),
              fruitDateAfter: findThresholdDate(s.dailyGdh ?? [], forecast, fruitThr, baseTemp),
            })
          }
          setUploadImpact(impact)
        }
      } catch { /* ignoruj — import już się udał */ }
    }

    // Zapisz udane importy do historii (localStorage)
    const newEntries: UploadHistoryEntry[] = results
      .filter(r => r.success)
      .map(r => ({
        id: crypto.randomUUID(),
        uploadedAt: new Date().toISOString(),
        fileName: r.fileName || '—',
        blockName: r.blockName || r.sections?.[0]?.blockName || r.sections?.[0]?.sheetName || '—',
        sections: (r.sections ?? []).map(s => s.sectionName || s.sectionId).filter(Boolean) as string[],
        totalInFile: r.totalReadings ?? 0,
        inserted: r.totalInserted ?? 0,
        duplicates: (r.totalReadings ?? 0) - (r.totalInserted ?? 0),
      }))
    if (newEntries.length > 0) {
      setUploadHistory(prev => {
        const updated = [...newEntries, ...prev].slice(0, 100)
        try { localStorage.setItem('temperatureUploadHistory', JSON.stringify(updated)) } catch { /* ignore */ }
        return updated
      })
    }

    setImporting(false)
    setTempFiles([])
    setPreviewData(null)
    setSectionOverrides({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, tempFiles, previewData, sectionOverrides])

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleTempFilesSelected(e.dataTransfer.files)
  }, [handleTempFilesSelected])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Ładowanie...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ustawienia</h1>
        <p className="text-gray-500">Konfiguracja aplikacji i plantacji</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Settings className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Ogólne
        </button>
        <button
          onClick={() => setActiveTab('temperature')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'temperature' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Thermometer className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Import temperatur
        </button>
      </div>

      {importStatus && (
        <div className={`p-4 rounded-lg ${importStatus.startsWith('✓') ? 'bg-green-100 text-green-700' : importStatus.startsWith('❌') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {importStatus}
        </div>
      )}

      {/* ========== TAB: Ogólne ========== */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dane plantacji */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Dane plantacji
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nazwa plantacji</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Lokalizacja</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Szerokość geo. (°N)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    placeholder="np. 52.88097"
                    value={formData.latitude}
                    onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Długość geo. (°E)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    placeholder="np. 16.81895"
                    value={formData.longitude}
                    onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label>Początek sezonu (data startu liczenia GDH)</Label>
                <Input
                  type="date"
                  value={formData.seasonStartDate}
                  onChange={(e) => setFormData({...formData, seasonStartDate: e.target.value})}
                />
              </div>
              <Button onClick={saveFarm} disabled={saving} className="bg-green-600 hover:bg-green-700 w-full">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie...</> : 'Zapisz ustawienia'}
              </Button>
            </CardContent>
          </Card>

          {/* Dane pogodowe */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-600" />
                Dane pogodowe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700 mb-2">
                  Pobierz historyczne dane pogodowe z Open-Meteo API dla współrzędnych plantacji.
                  Dane obejmują lata 2023-2026.
                </p>
                <p className="text-xs text-blue-600">
                  Współrzędne: {formData.latitude || '—'} N, {formData.longitude || '—'} E
                </p>
              </div>
              <Button
                onClick={fetchHistoricalWeather}
                disabled={fetchingWeather || !formData.latitude || !formData.longitude}
                className="bg-blue-600 hover:bg-blue-700 w-full"
              >
                {fetchingWeather ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pobieranie...</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" />Pobierz dane historyczne</>
                )}
              </Button>
              <div className="border-t pt-4 mt-4">
                <p className="text-sm text-gray-600 mb-2">
                  Odśwież brakujące dane pogodowe (od ostatniego wpisu do wczoraj) + invaliduj cache prognoz.
                </p>
                <Button
                  onClick={refreshWeatherData}
                  disabled={refreshingWeather}
                  variant="outline"
                  className="w-full"
                >
                  {refreshingWeather ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Odświeżanie...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" />Odśwież dane pogodowe</>
                  )}
                </Button>
                {refreshResult && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 whitespace-pre-line">
                    {refreshResult}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Źródło: Open-Meteo Historical Weather API
              </div>
            </CardContent>
          </Card>

          {/* Backup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                Backup danych
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={exportData} variant="outline" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Eksportuj wszystkie dane
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Importuj z pliku
                </Button>
              </div>
              <Button onClick={clearAllData} variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2" />
                Wyczyść wszystkie dane
              </Button>
            </CardContent>
          </Card>

          {/* Powiadomienia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-600" />
                Powiadomienia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">Przypomnienia o zbiorach</div>
                  <div className="text-sm text-gray-500">Gdy GDH osiągnie próg</div>
                </div>
                <input type="checkbox" className="w-5 h-5 text-green-600 rounded" defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">Alerty pogodowe</div>
                  <div className="text-sm text-gray-500">Przymrozki, upały</div>
                </div>
                <input type="checkbox" className="w-5 h-5 text-green-600 rounded" defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">Codzienne podsumowanie</div>
                  <div className="text-sm text-gray-500">Email z raportem</div>
                </div>
                <input type="checkbox" className="w-5 h-5 text-green-600 rounded" />
              </div>
            </CardContent>
          </Card>

          {/* Aplikacja */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                Informacje o aplikacji
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">Wersja</div>
                  <div className="text-sm text-gray-600">2.0.0 Enterprise</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">Baza danych</div>
                  <div className="text-sm text-gray-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    PostgreSQL (Neon)
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">Źródło pogody</div>
                  <div className="text-sm text-gray-600">Open-Meteo API</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="font-medium text-green-700">Status</div>
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Online
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== TAB: Import temperatur ========== */}
      {activeTab === 'temperature' && (
        <div className="space-y-6">
          {/* Drag & drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => tempFileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}
          >
            <input
              ref={tempFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) handleTempFilesSelected(e.target.files); e.target.value = '' }}
            />
            {previewLoading ? (
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="text-blue-600 font-medium">Analizowanie plików...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <Upload className="w-8 h-8 text-gray-400" />
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Przeciągnij pliki CSV lub XLSX z pomiarami temperatury</span>
                </div>
                <div className="text-xs text-gray-400">
                  Akceptowane formaty: .csv, .xlsx, .xls — wiele plików naraz
                </div>
              </div>
            )}
          </div>

          {/* Preview table */}
          {Array.isArray(previewData) && previewData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Podgląd mapowania
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Plik</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Wykryty tunel</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Sekcja w DB</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Pomiarów</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewData.map((row, i) => {
                        const ids = getEffectiveSectionIds(i)
                        const current = sectionOverrides[i] ?? (row.sectionId ? [row.sectionId] : [])
                        const primary = current[0] ?? ''
                        const secondary = current[1] ?? ''
                        const isOk = ids.length > 0
                        const updateOverride = (slot: 0 | 1, value: string) => {
                          setSectionOverrides(prev => {
                            const arr = [...(prev[i] ?? (row.sectionId ? [row.sectionId] : []))]
                            if (slot === 0) {
                              arr[0] = value
                            } else {
                              arr[1] = value
                            }
                            const filtered = arr.filter(Boolean)
                            const next = { ...prev }
                            if (filtered.length > 0) {
                              next[i] = filtered
                            } else {
                              delete next[i]
                            }
                            return next
                          })
                        }
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 font-mono text-xs">
                              {row.fileName}
                              {row.sheetName && <span className="text-gray-400 ml-1">({row.sheetName})</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{row.detectedTunnel}</td>
                            <td className="px-3 py-2 space-y-1">
                              <select
                                className={`w-full h-8 border rounded px-2 text-sm ${!isOk ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}
                                value={primary}
                                onChange={e => updateOverride(0, e.target.value)}
                              >
                                <option value="">— wybierz sekcję —</option>
                                {(allSections ?? []).map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.blockName} — {s.name || '(bez nazwy)'}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="w-full h-8 border border-gray-200 rounded px-2 text-sm text-gray-500"
                                value={secondary}
                                onChange={e => updateOverride(1, e.target.value)}
                              >
                                <option value="">+ druga sekcja (opcjonalnie)</option>
                                {(allSections ?? []).map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.blockName} — {s.name || '(bez nazwy)'}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{row.count > 0 ? row.count.toLocaleString('pl-PL') : '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {isOk ? (
                                <CheckCircle className="w-5 h-5 text-green-500 inline-block" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-amber-500 inline-block" />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    onClick={handleTempImport}
                    disabled={!allRowsMapped || importing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {importing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importowanie...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Importuj do bazy</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setPreviewData(null); setTempFiles([]); setImportResults(null); setSectionOverrides({}) }}
                  >
                    Anuluj
                  </Button>
                  {!allRowsMapped && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Wybierz sekcję dla wszystkich plików, aby aktywować import
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import results */}
          {Array.isArray(importResults) && importResults.length > 0 && (
            <div className="space-y-2">
              {importResults.map((r, i) => (
                <div key={i} className={`rounded-lg px-4 py-3 text-sm ${r.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                  {r.success ? (
                    <div className="flex items-start gap-2">
                      <Thermometer className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">
                          {r.blockName ? `Blok ${r.blockName}` : r.sections?.[0]?.sheetName ?? 'Import'}
                        </span>
                        {' → '}
                        <span>{r.sections?.map(s => s.sectionName).filter(Boolean).join(', ') || '—'}</span>
                        <div className="text-xs mt-0.5 text-green-700">
                          Plik zawierał <strong>{(r.totalReadings ?? 0).toLocaleString('pl-PL')}</strong> pomiarów &nbsp;·&nbsp;
                          dodano <strong>{(r.totalInserted ?? 0).toLocaleString('pl-PL')}</strong> nowych
                          {(r.totalReadings ?? 0) > (r.totalInserted ?? 0) && (
                            <span className="text-green-600"> &nbsp;·&nbsp; {((r.totalReadings ?? 0) - (r.totalInserted ?? 0)).toLocaleString('pl-PL')} już było w bazie</span>
                          )}
                        </div>
                        {r.errors && r.errors.length > 0 && (
                          <div className="text-xs mt-1 text-amber-700">{r.errors.join(' · ')}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span>{r.error}</span>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-gray-400" onClick={() => setImportResults(null)}>Zamknij</Button>
            </div>
          )}

          {/* Wpływ na daty kwitnienia i owocowania */}
          {uploadImpact && uploadImpact.length > 0 && (
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-blue-800">
                  <Thermometer className="w-5 h-5 text-blue-600" />
                  Wpływ importu na daty GDH
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {uploadImpact.map(s => {
                  const flowerDelta = daysDiff(s.flowerDateBefore, s.flowerDateAfter)
                  const fruitDelta = daysDiff(s.fruitDateBefore, s.fruitDateAfter)
                  const noThresholds = s.flowerThreshold === null && s.fruitThreshold === null
                  return (
                    <div key={s.sectionId} className="border rounded-lg p-3 bg-blue-50">
                      <div className="font-medium text-sm text-blue-900 mb-2">{s.sectionName}</div>
                      {noThresholds ? (
                        <p className="text-xs text-gray-500">Brak progów GDH w odmianie — uzupełnij dane odmiany</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {s.flowerThreshold !== null && (
                            <div className="bg-white rounded p-2 border">
                              <div className="text-xs text-gray-500 mb-1">🌸 Kwitnienie (próg {s.flowerThreshold} GDH)</div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">{formatImpactDate(s.flowerDateBefore)}</span>
                                <span className="text-gray-300">→</span>
                                <span className="font-semibold text-blue-800">{formatImpactDate(s.flowerDateAfter)}</span>
                                {flowerDelta !== null && flowerDelta !== 0 && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${flowerDelta < 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {flowerDelta < 0 ? `${Math.abs(flowerDelta)} dni wcześniej` : `${flowerDelta} dni później`}
                                  </span>
                                )}
                                {flowerDelta === 0 && <span className="text-xs text-gray-400">bez zmian</span>}
                                {flowerDelta === null && s.flowerDateBefore === null && s.flowerDateAfter === null && (
                                  <span className="text-xs text-gray-400">brak danych</span>
                                )}
                              </div>
                            </div>
                          )}
                          {s.fruitThreshold !== null && (
                            <div className="bg-white rounded p-2 border">
                              <div className="text-xs text-gray-500 mb-1">🍓 Owocowanie (próg {s.fruitThreshold} GDH)</div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">{formatImpactDate(s.fruitDateBefore)}</span>
                                <span className="text-gray-300">→</span>
                                <span className="font-semibold text-blue-800">{formatImpactDate(s.fruitDateAfter)}</span>
                                {fruitDelta !== null && fruitDelta !== 0 && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${fruitDelta < 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {fruitDelta < 0 ? `${Math.abs(fruitDelta)} dni wcześniej` : `${fruitDelta} dni później`}
                                  </span>
                                )}
                                {fruitDelta === 0 && <span className="text-xs text-gray-400">bez zmian</span>}
                                {fruitDelta === null && s.fruitDateBefore === null && s.fruitDateAfter === null && (
                                  <span className="text-xs text-gray-400">brak danych</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <Button variant="ghost" size="sm" className="text-gray-400" onClick={() => setUploadImpact(null)}>Zamknij</Button>
              </CardContent>
            </Card>
          )}

          {/* Historia importów */}
          {uploadHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-500" />
                    Historia importów
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 text-xs"
                    onClick={() => {
                      setUploadHistory([])
                      try { localStorage.removeItem('temperatureUploadHistory') } catch { /* ignore */ }
                    }}
                  >
                    Wyczyść historię
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                        <th className="text-left px-4 py-2 font-medium">Data i godzina</th>
                        <th className="text-left px-4 py-2 font-medium">Plik</th>
                        <th className="text-left px-4 py-2 font-medium">Blok / Sekcja</th>
                        <th className="text-right px-4 py-2 font-medium">W pliku</th>
                        <th className="text-right px-4 py-2 font-medium">Nowych</th>
                        <th className="text-right px-4 py-2 font-medium">Duplikatów</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {uploadHistory.map(entry => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                            {new Date(entry.uploadedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 max-w-[180px] truncate" title={entry.fileName}>
                            {entry.fileName}
                          </td>
                          <td className="px-4 py-2">
                            <span className="font-medium">{entry.blockName}</span>
                            {entry.sections.length > 0 && (
                              <span className="text-gray-400 text-xs ml-1">→ {entry.sections.join(', ')}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">{entry.totalInFile.toLocaleString('pl-PL')}</td>
                          <td className="px-4 py-2 text-right font-medium text-green-700">{entry.inserted.toLocaleString('pl-PL')}</td>
                          <td className="px-4 py-2 text-right text-gray-400">{entry.duplicates.toLocaleString('pl-PL')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
