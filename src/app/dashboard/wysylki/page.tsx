'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Truck, Printer, Plus, Trash2, Save, X, Loader2 } from 'lucide-react'
import LabelSheet, { type LabelData } from './label-sheet'
import {
  DEFAULT_PACKAGING,
  totalNetKg,
  formatKg,
  formatBatchNumber,
  packagingLabelWithWeight,
  type Packaging,
} from '@/lib/shipping'

const toISODate = (d: Date) => {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

interface Recipient {
  id: string
  name: string
  address: string | null
}

interface CustomFormat {
  id: string
  unitsPerCarton: number
  gramsPerUnit: number
}

export default function WysylkiPage() {
  const today = useMemo(() => toISODate(new Date()), [])

  const [harvestDate, setHarvestDate] = useState(today)
  const [prepDate, setPrepDate] = useState(today)
  const [recipient, setRecipient] = useState('')
  const [cartons, setCartons] = useState('')
  const [packagingId, setPackagingId] = useState(DEFAULT_PACKAGING[0].id)
  const [batchNumber, setBatchNumber] = useState(formatBatchNumber(today))
  const [batchEdited, setBatchEdited] = useState(false)
  const [palletNumber, setPalletNumber] = useState('')

  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [customFormats, setCustomFormats] = useState<CustomFormat[]>([])
  const [savingRecipient, setSavingRecipient] = useState(false)

  const [showAddFormat, setShowAddFormat] = useState(false)
  const [newUnits, setNewUnits] = useState('')
  const [newGrams, setNewGrams] = useState('')

  // ==================== DANE Z API ====================
  const fetchRecipients = useCallback(async () => {
    try {
      const res = await fetch('/api/shipping/recipients', { cache: 'no-store' })
      if (res.ok) setRecipients((await res.json()).recipients || [])
    } catch { /* lista odbiorców jest pomocnicza */ }
  }, [])

  const fetchFormats = useCallback(async () => {
    try {
      const res = await fetch('/api/shipping/packaging', { cache: 'no-store' })
      if (res.ok) setCustomFormats((await res.json()).formats || [])
    } catch { /* własne konfekcje są opcjonalne */ }
  }, [])

  useEffect(() => { fetchRecipients(); fetchFormats() }, [fetchRecipients, fetchFormats])

  // Numer partii podąża za datą zbioru, dopóki użytkownik nie wpisze własnego.
  useEffect(() => {
    if (!batchEdited) setBatchNumber(formatBatchNumber(harvestDate))
  }, [harvestDate, batchEdited])

  // Presety + własne konfekcje, bez duplikatów.
  const allPackaging: Packaging[] = useMemo(() => {
    const custom = customFormats.map((f) => ({
      id: f.id,
      unitsPerCarton: f.unitsPerCarton,
      gramsPerUnit: f.gramsPerUnit,
    }))
    const seen = new Set(DEFAULT_PACKAGING.map((p) => `${p.unitsPerCarton}x${p.gramsPerUnit}`))
    const extra = custom.filter((p) => !seen.has(`${p.unitsPerCarton}x${p.gramsPerUnit}`))
    return [...DEFAULT_PACKAGING, ...extra]
  }, [customFormats])

  const packaging = allPackaging.find((p) => p.id === packagingId) ?? null
  const cartonsNum = cartons.trim() === '' ? null : parseInt(cartons, 10)
  const mass = totalNetKg(cartonsNum ?? 0, packaging)

  const labelData: LabelData = {
    recipient,
    cartons: cartonsNum,
    packaging,
    batchNumber,
    harvestDate,
    prepDate,
    palletNumber,
  }

  // ==================== AKCJE ====================
  const saveRecipient = async () => {
    const name = recipient.trim()
    if (!name) return
    setSavingRecipient(true)
    try {
      const res = await fetch('/api/shipping/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) fetchRecipients()
    } finally {
      setSavingRecipient(false)
    }
  }

  const deleteRecipient = async (id: string) => {
    const res = await fetch(`/api/shipping/recipients/${id}`, { method: 'DELETE' })
    if (res.ok) fetchRecipients()
  }

  const addFormat = async () => {
    const units = parseInt(newUnits, 10)
    const grams = parseInt(newGrams, 10)
    if (!(units > 0) || !(grams > 0)) return
    const res = await fetch('/api/shipping/packaging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitsPerCarton: units, gramsPerUnit: grams }),
    })
    if (res.ok) {
      const { format } = await res.json()
      await fetchFormats()
      setPackagingId(format.id)
      setShowAddFormat(false)
      setNewUnits('')
      setNewGrams('')
    }
  }

  const deleteFormat = async (id: string) => {
    const res = await fetch(`/api/shipping/packaging/${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (packagingId === id) setPackagingId(DEFAULT_PACKAGING[0].id)
      fetchFormats()
    }
  }

  const savedIds = new Set(recipients.map((r) => r.name))
  const isPreset = (id: string) => id.startsWith('preset-')

  return (
    <div className="space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6 text-green-600" />
          Wysyłki — etykiety paletowe
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Wypełnij dane, sprawdź podgląd i wydrukuj lub zapisz jako PDF — dwie etykiety na stronie.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* ===== FORMULARZ ===== */}
        <Card className="no-print">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dane etykiety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="harvestDate" className="text-xs">Data zbioru</Label>
                <Input id="harvestDate" type="date" value={harvestDate} className="mt-1"
                  onChange={(e) => setHarvestDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="prepDate" className="text-xs">Data przygotowania (wydania)</Label>
                <Input id="prepDate" type="date" value={prepDate} className="mt-1"
                  onChange={(e) => setPrepDate(e.target.value)} />
              </div>
            </div>

            {/* Odbiorca */}
            <div>
              <Label htmlFor="recipient" className="text-xs">Odbiorca / klient</Label>
              <div className="flex gap-2 mt-1">
                <Input id="recipient" list="recipients-list" value={recipient}
                  placeholder="wpisz lub wybierz z zapisanych"
                  onChange={(e) => setRecipient(e.target.value)} />
                <datalist id="recipients-list">
                  {recipients.map((r) => <option key={r.id} value={r.name} />)}
                </datalist>
                <Button variant="outline" size="sm" onClick={saveRecipient}
                  disabled={savingRecipient || !recipient.trim() || savedIds.has(recipient.trim())}
                  title="Zapisz odbiorcę do listy">
                  {savingRecipient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recipients.map((r) => (
                    <span key={r.id}
                      className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs border cursor-pointer ${
                        recipient === r.name ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 hover:border-green-400'
                      }`}
                      onClick={() => setRecipient(r.name)}>
                      {r.name}
                      <button onClick={(e) => { e.stopPropagation(); deleteRecipient(r.id) }}
                        className="opacity-60 hover:opacity-100" title="Usuń odbiorcę">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cartons" className="text-xs">Liczba kartonów zbiorczych</Label>
                <Input id="cartons" type="number" min={0} value={cartons} className="mt-1"
                  placeholder="np. 100"
                  onChange={(e) => setCartons(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="batch" className="text-xs">Numer partii</Label>
                <div className="flex gap-2 mt-1">
                  <Input id="batch" value={batchNumber}
                    onChange={(e) => { setBatchNumber(e.target.value); setBatchEdited(true) }} />
                  {batchEdited && (
                    <Button variant="outline" size="sm"
                      onClick={() => { setBatchEdited(false); setBatchNumber(formatBatchNumber(harvestDate)) }}
                      title="Wróć do domyślnego DD.MM/JL">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Konfekcja */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="packaging" className="text-xs">Konfekcja</Label>
                <button onClick={() => setShowAddFormat((v) => !v)}
                  className="text-xs text-green-700 hover:underline inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> dodaj konfekcję
                </button>
              </div>
              <div className="flex gap-2 mt-1 items-center">
                <select id="packaging" value={packagingId}
                  onChange={(e) => setPackagingId(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
                  {allPackaging.map((p) => (
                    <option key={p.id} value={p.id}>{packagingLabelWithWeight(p)}</option>
                  ))}
                </select>
                {packaging && !isPreset(packaging.id) && (
                  <Button variant="outline" size="sm" onClick={() => deleteFormat(packaging.id)}
                    title="Usuń tę własną konfekcję">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {showAddFormat && (
                <div className="flex flex-wrap items-end gap-2 mt-2 p-2.5 rounded-lg bg-gray-50 border">
                  <div>
                    <Label className="text-[11px]">Opakowań w kartonie</Label>
                    <Input type="number" min={1} value={newUnits} className="mt-0.5 w-28"
                      placeholder="np. 8" onChange={(e) => setNewUnits(e.target.value)} />
                  </div>
                  <span className="pb-2 text-gray-400">×</span>
                  <div>
                    <Label className="text-[11px]">Gramów / opak.</Label>
                    <Input type="number" min={1} value={newGrams} className="mt-0.5 w-28"
                      placeholder="np. 300" onChange={(e) => setNewGrams(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={addFormat} disabled={!(parseInt(newUnits) > 0 && parseInt(newGrams) > 0)}
                    className="bg-green-600 hover:bg-green-700">
                    Dodaj
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Masa łączna netto</Label>
                <div className="mt-1 h-9 flex items-center px-3 rounded-md bg-gray-50 border text-sm font-semibold">
                  {mass != null ? `${formatKg(mass)} kg` : '— podaj kartony i konfekcję'}
                </div>
              </div>
              <div>
                <Label htmlFor="pallet" className="text-xs">Numer palety (opcjonalnie)</Label>
                <Input id="pallet" value={palletNumber} className="mt-1"
                  placeholder="zostaw puste, jeśli wpisujesz ręcznie"
                  onChange={(e) => setPalletNumber(e.target.value)} />
              </div>
            </div>

            <Button onClick={() => window.print()} className="w-full bg-green-600 hover:bg-green-700">
              <Printer className="w-4 h-4 mr-1.5" />
              Drukuj / zapisz PDF (2 etykiety)
            </Button>
          </CardContent>
        </Card>

        {/* ===== PODGLĄD ===== */}
        <div>
          <p className="text-xs text-gray-500 mb-2 no-print">Podgląd — tak wyjdzie na wydruku:</p>
          <div id="pallet-print" className="bg-white shadow-sm border rounded-lg p-4 overflow-auto">
            <LabelSheet data={labelData} />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          #pallet-print, #pallet-print * { visibility: visible !important; }
          #pallet-print {
            position: fixed; inset: 0; margin: 0; padding: 0;
            border: none; box-shadow: none; border-radius: 0; overflow: visible;
          }
          .no-print { display: none !important; }
        }
      ` }} />
    </div>
  )
}
