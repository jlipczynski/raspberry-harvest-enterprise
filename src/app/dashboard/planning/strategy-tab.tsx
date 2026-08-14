'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Loader2, Plus, Copy, Trash2, Save, ChevronDown, ChevronUp, AlertTriangle, Check } from 'lucide-react'
import {
  DEFAULT_PLANTING_METHODS,
  methodByCode,
  computeScenario,
  computeSectionCost,
  computeSectionVolume,
  computePlugCoverage,
  computeCashflow,
  readPaymentShares,
  plugUnitCost,
  sectionPots,
  sectionShoots,
  type PlantingMethod,
  type PlantingMethodDef,
  type StrategySection,
  type ScenarioItemInput,
} from '@/lib/strategy'
import CostBookPanel, { buildBookForYear, type CostItemRow } from './cost-book-panel'

// ==================== TYPES ====================
interface ScenarioItemRow {
  sectionId: string
  year: number
  method: string
  producesSummer: boolean
  producesAutumn: boolean
  note: string | null
}

interface PlugPlanRow {
  varietyId: string
  year: number
  quantity: number
}

interface Scenario {
  id: string
  name: string
  description: string | null
  startYear: number
  endYear: number
  items: ScenarioItemRow[]
  plugPlans: PlugPlanRow[]
}

/** definicja sposobu obsadzania wraz z polami porządkowymi z bazy */
interface MethodRow extends PlantingMethodDef {
  sortOrder: number
  isActive: boolean
}

// ==================== HELPERS ====================
/** kwoty zawsze z dokładnością do grosza */
const fmtPln = (n: number) =>
  n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
const fmtKg = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' kg'
/** liczby sztuk — doniczki, cany, plagi — bez części dziesiętnych */
const fmtNum = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
/** stawka jednostkowa — do 4 miejsc, bo grosz to za mało przy cenach za sztukę */
const fmtRate = (n: number) =>
  n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const itemKey = (year: number, sectionId: string) => `${year}:${sectionId}`

// ==================== COMPONENT ====================
export default function StrategyTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sections, setSections] = useState<StrategySection[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  const [allItems, setAllItems] = useState<CostItemRow[]>([])

  /** rok, dla którego edytujemy cennik. 0 = cennik bazowy (obowiązuje wszędzie, gdzie brak roku) */
  const [costYear, setCostYear] = useState<number>(0)

  const [methods, setMethods] = useState<MethodRow[]>([])
  const [methodDraft, setMethodDraft] = useState<MethodRow[]>([])
  const [showMethods, setShowMethods] = useState(false)
  const [savingMethods, setSavingMethods] = useState(false)


  const [draftItems, setDraftItems] = useState<Record<string, ScenarioItemRow>>({})
  const [draftPlugs, setDraftPlugs] = useState<Record<string, number>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartYear, setNewStartYear] = useState(new Date().getFullYear() + 1)
  const [newEndYear, setNewEndYear] = useState(new Date().getFullYear() + 3)

  // ==================== LOAD ====================
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sRes, cRes, scRes, mRes] = await Promise.all([
        fetch('/api/strategy/sections'),
        fetch('/api/strategy/cost-book'),
        fetch('/api/strategy/scenarios'),
        fetch('/api/strategy/methods'),
      ])
      for (const res of [sRes, cRes, scRes, mRes]) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
      }
      const [sData, cData, scData, mData] = await Promise.all([sRes.json(), cRes.json(), scRes.json(), mRes.json()])
      setMethods(mData.methods || [])
      setMethodDraft(mData.methods || [])
      setSections(sData.sections || [])
      setAllItems(cData.items || [])
      setScenarios(scData.scenarios || [])
      setActiveId(prev => prev ?? (scData.scenarios?.[0]?.id ?? null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać danych strategii')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  /** cennik obowiązujący w danym roku — pozycja roku, a gdy brak, bazowa */
  const bookForYear = useCallback((year: number) => buildBookForYear(allItems, year), [allItems])

  const active = useMemo(() => scenarios.find(s => s.id === activeId) ?? null, [scenarios, activeId])
  const years = useMemo(() => {
    if (!active) return []
    const out: number[] = []
    for (let y = active.startYear; y <= active.endYear; y++) out.push(y)
    return out
  }, [active])

  // wczytanie scenariusza do edytowalnego szkicu
  useEffect(() => {
    if (!active) { setDraftItems({}); setDraftPlugs({}); return }
    const items: Record<string, ScenarioItemRow> = {}
    for (const it of active.items) items[itemKey(it.year, it.sectionId)] = it
    const plugs: Record<string, number> = {}
    for (const p of active.plugPlans) plugs[`${p.year}:${p.varietyId}`] = p.quantity
    setDraftItems(items)
    setDraftPlugs(plugs)
    setDirty(false)
    setActiveYear(prev => (prev != null && prev >= active.startYear && prev <= active.endYear ? prev : active.startYear))
  }, [active])

  // ==================== COST BOOK ====================
  const varieties = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sections) if (s.varietyId) map.set(s.varietyId, s.varietyName ?? s.varietyId)
    return [...map].map(([id, name]) => ({ id, name }))
  }, [sections])

  const addMethod = () => {
    setMethodDraft(prev => [...prev, {
      code: '', label: '', hint: null,
      buysLongCane: false, growsFromOwnPlug: false, usesCoco: false, hasPlantingLabour: false,
      defaultSummer: false, defaultAutumn: false,
      sortOrder: prev.length * 10, isActive: true,
    }])
  }

  const saveMethods = async () => {
    setSavingMethods(true)
    setError(null)
    try {
      const res = await fetch('/api/strategy/methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods: methodDraft.map((m, i) => ({ ...m, sortOrder: i * 10 })) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setMethods(data.methods || [])
      setMethodDraft(data.methods || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać sposobów obsadzania')
    } finally {
      setSavingMethods(false)
    }
  }

  // ==================== SCENARIO CRUD ====================
  const createScenario = async (cloneFromId?: string) => {
    const name = cloneFromId
      ? `${scenarios.find(s => s.id === cloneFromId)?.name ?? 'Scenariusz'} — kopia`
      : newName.trim()
    if (!name) { setError('Podaj nazwę scenariusza'); return }
    const source = cloneFromId ? scenarios.find(s => s.id === cloneFromId) : null
    try {
      const res = await fetch('/api/strategy/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startYear: source ? source.startYear : newStartYear,
          endYear: source ? source.endYear : newEndYear,
          cloneFromId: cloneFromId ?? undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setScenarios(prev => [...prev, data.scenario])
      setActiveId(data.scenario.id)
      setShowNewForm(false)
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się utworzyć scenariusza')
    }
  }

  const deleteScenario = async (id: string) => {
    const sc = scenarios.find(s => s.id === id)
    if (!confirm(`Usunąć scenariusz „${sc?.name ?? ''}"? Tej operacji nie można cofnąć.`)) return
    try {
      const res = await fetch(`/api/strategy/scenarios/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setScenarios(prev => prev.filter(s => s.id !== id))
      setActiveId(prev => (prev === id ? null : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć scenariusza')
    }
  }

  const saveScenario = async () => {
    if (!active) return
    setSaving(true)
    setError(null)
    try {
      const items = Object.values(draftItems).filter(i => years.includes(i.year))
      const itemsRes = await fetch(`/api/strategy/scenarios/${active.id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!itemsRes.ok) {
        const err = await itemsRes.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${itemsRes.status}`)
      }

      const plugPlans = years.flatMap(y =>
        varieties.map(v => ({ year: y, varietyId: v.id, quantity: draftPlugs[`${y}:${v.id}`] ?? 0 }))
      )
      const plugsRes = await fetch(`/api/strategy/scenarios/${active.id}/plugs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugPlans }),
      })
      if (!plugsRes.ok) {
        const err = await plugsRes.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${plugsRes.status}`)
      }
      const data = await plugsRes.json()
      setScenarios(prev => prev.map(s => (s.id === active.id ? data.scenario : s)))
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać scenariusza')
    } finally {
      setSaving(false)
    }
  }

  // ==================== EDYCJA DECYZJI ====================
  const setMethod = (year: number, sectionId: string, method: PlantingMethod) => {
    const def = methodByCode(methods, method)
    setDraftItems(prev => ({
      ...prev,
      [itemKey(year, sectionId)]: {
        sectionId, year, method,
        producesSummer: def?.defaultSummer ?? false,
        producesAutumn: def?.defaultAutumn ?? false,
        note: prev[itemKey(year, sectionId)]?.note ?? null,
      },
    }))
    setDirty(true)
  }

  const toggleSeason = (year: number, sectionId: string, season: 'summer' | 'autumn') => {
    setDraftItems(prev => {
      const cur = prev[itemKey(year, sectionId)]
      if (!cur) return prev
      return {
        ...prev,
        [itemKey(year, sectionId)]: {
          ...cur,
          producesSummer: season === 'summer' ? !cur.producesSummer : cur.producesSummer,
          producesAutumn: season === 'autumn' ? !cur.producesAutumn : cur.producesAutumn,
        },
      }
    })
    setDirty(true)
  }

  // ==================== WYLICZENIA ====================
  const itemInputs: ScenarioItemInput[] = useMemo(
    () => Object.values(draftItems).map(i => ({
      sectionId: i.sectionId, year: i.year,
      method: i.method as PlantingMethod,
      producesSummer: i.producesSummer, producesAutumn: i.producesAutumn,
    })),
    [draftItems]
  )

  const plugInputs = useMemo(
    () => Object.entries(draftPlugs).map(([k, quantity]) => {
      const [year, varietyId] = k.split(':')
      return { year: Number(year), varietyId, quantity }
    }),
    [draftPlugs]
  )

  const summary = useMemo(
    () => computeScenario(sections, itemInputs, plugInputs, bookForYear, years, methods),
    [sections, itemInputs, plugInputs, bookForYear, years, methods]
  )

  const coverage = useMemo(
    () => computePlugCoverage(sections, itemInputs, plugInputs, years, methods),
    [sections, itemInputs, plugInputs, years, methods]
  )

  const plugUnit = useMemo(() => plugUnitCost(bookForYear(activeYear ?? 0)), [bookForYear, activeYear])

  /** lata, dla których można prowadzić osobny cennik — z zakresów wszystkich scenariuszy */
  const costYears = useMemo(() => {
    const set = new Set<number>()
    for (const sc of scenarios) for (let y = sc.startYear; y <= sc.endYear; y++) set.add(y)
    for (const i of allItems) if (i.year !== 0) set.add(i.year)
    return [...set].sort((a, b) => a - b)
  }, [scenarios, allItems])

  const paymentShares = useMemo(() => readPaymentShares(bookForYear(activeYear ?? 0)), [bookForYear, activeYear])
  const cashflow = useMemo(
    () => computeCashflow(summary.years, paymentShares.shares),
    [summary.years, paymentShares]
  )

  /** Porównanie A/B/C — liczone dla wszystkich scenariuszy z ich zapisanych danych. */
  const comparison = useMemo(() => scenarios.map(sc => {
    const scYears: number[] = []
    for (let y = sc.startYear; y <= sc.endYear; y++) scYears.push(y)
    const isActive = sc.id === activeId
    const items = isActive ? itemInputs : sc.items.map(i => ({
      sectionId: i.sectionId, year: i.year, method: i.method as PlantingMethod,
      producesSummer: i.producesSummer, producesAutumn: i.producesAutumn,
    }))
    const plugs = isActive ? plugInputs : sc.plugPlans.map(p => ({ year: p.year, varietyId: p.varietyId, quantity: p.quantity }))
    const r = computeScenario(sections, items, plugs, bookForYear, scYears, methods)
    return { scenario: sc, result: r, isActive }
  }), [scenarios, sections, bookForYear, activeId, itemInputs, plugInputs, methods])

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytywanie strategii…
      </div>
    )
  }

  const yearSummary = summary.years.find(y => y.year === activeYear)

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------- SCENARIUSZE ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {scenarios.length === 0 && (
              <span className="text-sm text-gray-500">Brak scenariuszy — utwórz pierwszy, żeby zacząć modelowanie.</span>
            )}
            {scenarios.map(sc => (
              <button
                key={sc.id}
                onClick={() => setActiveId(sc.id)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  sc.id === activeId
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {sc.name}
                <span className="ml-2 text-xs text-gray-400">{sc.startYear}–{sc.endYear}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewForm(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
            >
              <Plus className="w-3.5 h-3.5" /> Nowy
            </button>
            {active && (
              <>
                <button
                  onClick={() => createScenario(active.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  <Copy className="w-3.5 h-3.5" /> Klonuj
                </button>
                <button
                  onClick={() => deleteScenario(active.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Usuń
                </button>
              </>
            )}
          </div>
        </div>

        {showNewForm && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nazwa scenariusza</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="np. Scenariusz A — long cane na B"
                className="h-9 w-72 border border-gray-200 rounded-lg px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rok od</label>
              <input type="number" value={newStartYear} onChange={e => setNewStartYear(parseInt(e.target.value) || newStartYear)}
                className="h-9 w-24 border border-gray-200 rounded-lg px-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rok do</label>
              <input type="number" value={newEndYear} onChange={e => setNewEndYear(parseInt(e.target.value) || newEndYear)}
                className="h-9 w-24 border border-gray-200 rounded-lg px-3 text-sm" />
            </div>
            <button onClick={() => createScenario()}
              className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
              Utwórz
            </button>
          </div>
        )}
      </div>

      {/* ---------- SPOSOBY OBSADZANIA ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
          <button onClick={() => setShowMethods(v => !v)} className="flex items-center gap-2 text-left">
            {showMethods ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            <span className="font-medium text-gray-900">Sposoby obsadzania</span>
            <span className="text-xs text-gray-500">
              {methods.length === 0 ? 'brak — dodaj, żeby móc planować' : `${methods.filter(m => m.isActive).length} aktywnych`}
            </span>
          </button>
          {showMethods && (
            <div className="flex items-center gap-2">
              {methodDraft.length === 0 && (
                <button onClick={() => setMethodDraft(DEFAULT_PLANTING_METHODS.map((m, i) => ({ ...m, sortOrder: i * 10, isActive: true })))}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-100">
                  Wstaw domyślne
                </button>
              )}
              <button onClick={addMethod}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-100">
                <Plus className="w-3.5 h-3.5" /> Dodaj sposób
              </button>
              <button onClick={saveMethods} disabled={savingMethods}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">
                {savingMethods ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Zapisz listę
              </button>
            </div>
          )}
        </div>

        {showMethods && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50">
                  <th className="text-left font-medium px-3 py-1.5 border-b border-gray-200">Nazwa</th>
                  <th className="text-left font-medium px-2 py-1.5 border-b border-gray-200 w-40">Kod</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200" title="cena long cane odmiany + transport">Zakup LC</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200" title="koszt wyhodowania long cane z własnej plagi">Z plagi</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200" title="kokos + doniczka docelowa">Kokos</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200">Robocizna</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200">Lato</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200">Jesień</th>
                  <th className="text-center font-medium px-2 py-1.5 border-b border-gray-200">Aktywny</th>
                  <th className="border-b border-gray-200 w-8" />
                </tr>
              </thead>
              <tbody>
                {methodDraft.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                      Lista jest pusta. Kliknij „Wstaw domyślne”, żeby zacząć od sposobów z Twojego arkusza.
                    </td>
                  </tr>
                )}
                {methodDraft.map((md, idx) => {
                  const upd = (patch: Partial<MethodRow>) =>
                    setMethodDraft(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                  const inUse = scenarios.some(sc => sc.items.some(it => it.method === md.code))
                  const flags: { field: keyof MethodRow; title: string }[] = [
                    { field: 'buysLongCane', title: 'dolicza cenę long cane odmiany i transport' },
                    { field: 'growsFromOwnPlug', title: 'dolicza koszt wyhodowania long cane z plagi' },
                    { field: 'usesCoco', title: 'dolicza kokos i doniczkę docelową' },
                    { field: 'hasPlantingLabour', title: 'dolicza robociznę sadzenia' },
                    { field: 'defaultSummer', title: 'domyślnie zaznacza zbiór letni' },
                    { field: 'defaultAutumn', title: 'domyślnie zaznacza zbiór jesienny' },
                    { field: 'isActive', title: 'nieaktywne znikają z listy wyboru, ale nie kasują historii' },
                  ]
                  return (
                    <tr key={idx} className="odd:bg-white even:bg-gray-50/40">
                      <td className="px-3 py-1 border-b border-gray-100">
                        <input
                          value={md.label}
                          onChange={e => upd({ label: e.target.value })}
                          placeholder="np. Zakup LC"
                          className="h-7 w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 outline-none"
                        />
                        <input
                          value={md.hint ?? ''}
                          onChange={e => upd({ hint: e.target.value })}
                          placeholder="opis (opcjonalnie)"
                          className="h-6 w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 text-[11px] text-gray-500 outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 border-b border-gray-100">
                        <input
                          value={md.code}
                          onChange={e => upd({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                          disabled={inUse}
                          title={inUse ? 'kod jest używany w scenariuszu — nie można go zmienić' : undefined}
                          className="h-7 w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 font-mono text-xs outline-none disabled:text-gray-400"
                        />
                      </td>
                      {flags.map(f => (
                        <td key={String(f.field)} className="px-2 py-1 border-b border-gray-100 text-center">
                          <input
                            type="checkbox"
                            title={f.title}
                            checked={Boolean(md[f.field])}
                            onChange={e => upd({ [f.field]: e.target.checked } as Partial<MethodRow>)}
                            className="w-4 h-4 accent-indigo-600"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 border-b border-gray-100 text-center">
                        <button
                          onClick={() => {
                            if (inUse) { setError(`„${md.label}" jest używany w scenariuszu — odznacz „aktywny" zamiast kasować.`); return }
                            setMethodDraft(prev => prev.filter((_, i) => i !== idx))
                          }}
                          className="text-gray-300 hover:text-red-600"
                          title={inUse ? 'używany w scenariuszu' : 'usuń'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              Zaznaczone składniki decydują, z czego liczony jest koszt: zakup LC bierze cenę odmiany i transport,
              „z plagi” — koszt wyhodowania, kokos — kokos i doniczkę docelową. Sposób bez żadnego zaznaczenia nie generuje kosztu.
            </div>
          </div>
        )}
      </div>

      <CostBookPanel
        allItems={allItems}
        onSaved={setAllItems}
        varieties={varieties}
        years={costYears}
        costYear={costYear}
        setCostYear={setCostYear}
      />

      {!active ? null : (
        <>
          {/* ---------- LATA + ZAPIS ---------- */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => setActiveYear(y)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    y === activeYear
                      ? 'bg-gray-900 border-gray-900 text-white font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs text-amber-600">niezapisane zmiany</span>}
              <button
                onClick={saveScenario}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Zapisz scenariusz
              </button>
            </div>
          </div>

          {/* ---------- PODSUMOWANIE ROKU ---------- */}
          {yearSummary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Koszt sadzenia', value: fmtPln(yearSummary.plantingCostPln) },
                { label: 'Koszt plag', value: fmtPln(yearSummary.plugCostPln) },
                { label: 'Koszt razem', value: fmtPln(yearSummary.totalCostPln), strong: true },
                { label: 'Wolumen netto', value: fmtKg(yearSummary.kgNet) },
                { label: 'Koszt / kg', value: yearSummary.costPerKgNet != null ? fmtPln(yearSummary.costPerKgNet) : '—', strong: true },
              ].map(tile => (
                <div key={tile.label} className={`rounded-xl border p-3 ${tile.strong ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <div className="text-xs text-gray-500">{tile.label}</div>
                  <div className={`text-lg font-semibold ${tile.strong ? 'text-indigo-800' : 'text-gray-900'}`}>{tile.value}</div>
                </div>
              ))}
            </div>
          )}

          {yearSummary && yearSummary.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-amber-900 text-sm font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> Braki danych — te pozycje nie są wliczone
              </div>
              <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                {yearSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* ---------- DECYZJE PER SEKCJA ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-900">Czym obsadzam — {activeYear}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Blok / sekcja</th>
                    <th className="text-left font-medium px-3 py-2">Odmiana</th>
                    <th className="text-right font-medium px-3 py-2">Doniczki</th>
                    <th className="text-right font-medium px-3 py-2">Cany</th>
                    <th className="text-left font-medium px-3 py-2 w-44">Sposób</th>
                    <th className="text-center font-medium px-3 py-2">Lato</th>
                    <th className="text-center font-medium px-3 py-2">Jesień</th>
                    <th className="text-right font-medium px-3 py-2">Koszt</th>
                    <th className="text-right font-medium px-3 py-2">Plon netto</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(sec => {
                    const key = itemKey(activeYear ?? 0, sec.id)
                    const draft = draftItems[key]
                    const method = (draft?.method ?? methods[0]?.code ?? '') as PlantingMethod
                    const input: ScenarioItemInput = {
                      sectionId: sec.id, year: activeYear ?? 0, method,
                      producesSummer: draft?.producesSummer ?? false,
                      producesAutumn: draft?.producesAutumn ?? false,
                    }
                    const cost = computeSectionCost(sec, input, bookForYear(activeYear ?? 0), methodByCode(methods, method))
                    const vol = computeSectionVolume(sec, input)
                    const hasIssue = cost.missing.length > 0 || vol.missing.length > 0
                    return (
                      <tr key={sec.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2">
                          <div className="text-gray-900">{sec.name ?? '—'}</div>
                          <div className="text-xs text-gray-400">{sec.blockName ?? ''}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{sec.varietyName ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtNum(sectionPots(sec))}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtNum(sectionShoots(sec))}</td>
                        <td className="px-3 py-2">
                          <select
                            value={method}
                            onChange={e => setMethod(activeYear ?? 0, sec.id, e.target.value as PlantingMethod)}
                            className="h-8 w-full border border-gray-200 rounded px-2 text-sm bg-white"
                          >
                            {methods.filter(md => md.isActive || md.code === method)
                              .map(md => <option key={md.code} value={md.code}>{md.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={input.producesSummer}
                            onChange={() => toggleSeason(activeYear ?? 0, sec.id, 'summer')}
                            disabled={!draft} className="w-4 h-4 accent-indigo-600 disabled:opacity-30" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={input.producesAutumn}
                            onChange={() => toggleSeason(activeYear ?? 0, sec.id, 'autumn')}
                            disabled={!draft} className="w-4 h-4 accent-indigo-600 disabled:opacity-30" />
                        </td>
                        <td className={`px-3 py-2 text-right ${hasIssue ? 'text-amber-600' : 'text-gray-900'}`}>
                          {cost.missing.length > 0 ? 'brak ceny' : cost.totalPln > 0 ? fmtPln(cost.totalPln) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right ${vol.missing.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                          {vol.missing.length > 0 ? 'brak normy' : vol.kgNet > 0 ? fmtKg(vol.kgNet) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------- PLAGI ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900">Produkcja plag — {activeYear}</span>
              <span className="text-xs text-gray-500">
                koszt jednej plagi:{' '}
                {plugUnit.unitPln != null
                  ? `${fmtRate(plugUnit.unitPln)} zł`
                  : <span className="text-amber-600">uzupełnij cennik ({plugUnit.missing.join(', ')})</span>}
              </span>
            </div>
            <div className="flex flex-wrap gap-4">
              {varieties.map(v => {
                const qty = draftPlugs[`${activeYear}:${v.id}`] ?? 0
                return (
                  <div key={v.id}>
                    <label className="block text-xs text-gray-500 mb-1">{v.name}</label>
                    <input
                      type="number"
                      value={qty || ''}
                      placeholder="0"
                      onChange={e => {
                        setDraftPlugs(prev => ({ ...prev, [`${activeYear}:${v.id}`]: Math.max(0, parseInt(e.target.value) || 0) }))
                        setDirty(true)
                      }}
                      className="h-9 w-32 border border-gray-200 rounded-lg px-3 text-sm text-right"
                    />
                    {qty > 0 && plugUnit.unitPln != null && (
                      <div className="text-xs text-gray-400 mt-1">{fmtPln(qty * plugUnit.unitPln)}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {coverage.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kontrola pokrycia plag</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left font-medium py-1.5">Rok / odmiana</th>
                      <th className="text-right font-medium py-1.5">Potrzeba canów</th>
                      <th className="text-right font-medium py-1.5">Plagi z roku −1</th>
                      <th className="text-right font-medium py-1.5">Bilans</th>
                      <th className="text-center font-medium py-1.5 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 text-gray-800">{row.year} — {row.varietyName ?? row.varietyId}</td>
                        <td className="py-1.5 text-right text-gray-600">{fmtNum(row.needed)}</td>
                        <td className="py-1.5 text-right text-gray-600">{fmtNum(row.available)}</td>
                        <td className={`py-1.5 text-right font-medium ${row.ok ? 'text-gray-900' : 'text-red-600'}`}>{fmtNum(row.balance)}</td>
                        <td className="py-1.5 text-center">
                          {row.ok
                            ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><Check className="w-3.5 h-3.5" />OK</span>
                            : <span className="text-xs text-red-600 font-medium">NIEDOBÓR</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---------- PORÓWNANIE SCENARIUSZY ---------- */}
          {comparison.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="font-medium text-gray-900">Porównanie scenariuszy</span>
                <span className="ml-2 text-xs text-gray-500">cały zakres lat, suma</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Scenariusz</th>
                      <th className="text-left font-medium px-3 py-2">Lata</th>
                      <th className="text-right font-medium px-3 py-2">Koszt razem</th>
                      <th className="text-right font-medium px-3 py-2">Wolumen netto</th>
                      <th className="text-right font-medium px-3 py-2">Koszt / kg</th>
                      <th className="text-right font-medium px-3 py-2">Braki</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map(({ scenario, result, isActive }) => (
                      <tr key={scenario.id} className={`border-b border-gray-50 ${isActive ? 'bg-indigo-50/40' : ''}`}>
                        <td className="px-3 py-2 text-gray-900">
                          {scenario.name}
                          {isActive && <span className="ml-2 text-xs text-indigo-600">(edytowany)</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{scenario.startYear}–{scenario.endYear}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtPln(result.totalCostPln)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtKg(result.totalKgNet)}</td>
                        <td className="px-3 py-2 text-right font-medium text-indigo-800">
                          {result.costPerKgNet != null ? fmtPln(result.costPerKgNet) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-amber-600">
                          {result.warnings.length > 0 ? result.warnings.length : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------- ROZBICIE PO LATACH ---------- */}
          {summary.years.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="font-medium text-gray-900">{active.name} — rozbicie po latach</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Rok</th>
                      <th className="text-right font-medium px-3 py-2">Sadzenie</th>
                      <th className="text-right font-medium px-3 py-2">Plagi</th>
                      <th className="text-right font-medium px-3 py-2">Razem</th>
                      <th className="text-right font-medium px-3 py-2">Wolumen brutto</th>
                      <th className="text-right font-medium px-3 py-2">Wolumen netto</th>
                      <th className="text-right font-medium px-3 py-2">Koszt / kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.years.map(y => (
                      <tr key={y.year} className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-900">{y.year}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtPln(y.plantingCostPln)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtPln(y.plugCostPln)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtPln(y.totalCostPln)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmtKg(y.kgGross)}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{fmtKg(y.kgNet)}</td>
                        <td className="px-3 py-2 text-right text-indigo-800">
                          {y.costPerKgNet != null ? fmtPln(y.costPerKgNet) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-gray-900">RAZEM</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-gray-900">{fmtPln(summary.totalCostPln)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-gray-900">{fmtKg(summary.totalKgNet)}</td>
                      <td className="px-3 py-2 text-right text-indigo-800">
                        {summary.costPerKgNet != null ? fmtPln(summary.costPerKgNet) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------- CASHFLOW ---------- */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-medium text-gray-900">Cashflow — kiedy płacisz za rośliny</span>
                <span className="ml-2 text-xs text-gray-500">koszt roku rozbity na lata wydatku</span>
              </div>
              {paymentShares.shares.length > 0 && (
                <span className="text-xs text-gray-500">
                  {paymentShares.shares.map(s => `${s.percent}% ${s.label.toLowerCase()} (${s.yearOffset > 0 ? '+' : ''}${s.yearOffset})`).join('  ·  ')}
                </span>
              )}
            </div>

            {paymentShares.missing.length > 0 ? (
              <div className="px-4 py-4 text-sm text-amber-700 bg-amber-50 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Uzupełnij warunki płatności w cenniku (sekcja „Warunki płatności za rośliny”) — brakuje:{' '}
                  {paymentShares.missing.join(', ')}
                </span>
              </div>
            ) : (
              <>
                {cashflow.warnings.length > 0 && (
                  <div className="px-4 py-2 text-xs text-amber-800 bg-amber-50">{cashflow.warnings.join(' · ')}</div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Rok wydatku</th>
                        <th className="text-right font-medium px-3 py-2">Kwota</th>
                        <th className="text-left font-medium px-3 py-2">Z czego</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflow.rows.map(row => (
                        <tr key={row.paymentYear} className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-900 font-medium">{row.paymentYear}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtPln(row.amountPln)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {row.parts.map(p => `${p.label.toLowerCase()} za ${p.costYear}: ${fmtPln(p.amountPln)}`).join('  ·  ')}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2 text-gray-900">RAZEM</td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {fmtPln(cashflow.rows.reduce((s, r) => s + r.amountPln, 0))}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {Math.abs(cashflow.unallocatedPln) > 0.5
                            ? `nieprzypisane: ${fmtPln(cashflow.unallocatedPln)}`
                            : 'pokrywa cały koszt scenariusza'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
