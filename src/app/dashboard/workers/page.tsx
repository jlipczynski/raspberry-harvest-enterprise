'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Plus, Users, X, Trash2, Search, Edit, Check, ChevronUp, ChevronDown,
  ChevronsUpDown, Mail, UserPlus, Award, Settings2, ClipboardList
} from 'lucide-react'

interface Worker {
  id: string
  firstName: string
  lastName: string
  passport?: string
  availableFrom?: string
  availableTo?: string
  suggestedArrival?: string
  confirmedArrival?: string
  referredBy?: string
  yearsAtPlantation: number
  status: string
  acceptedToList: boolean
  acceptedToListMsg?: string
  arrivalConfirmed: boolean
  arrivalConfirmMsg?: string
  whatsapp?: string
  viber?: string
  phone?: string
  efficiencyKgH: number
  isActive: boolean
}

type SortKey = 'name' | 'passport' | 'years' | 'referredBy' | 'availableFrom' | 'availableTo' | 'suggestedArrival' | 'confirmedArrival' | 'status' | null

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  confirmed: { label: 'Potwierdzony', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  pending: { label: 'Oczekujący', bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
  new: { label: 'Nowy', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  rejected: { label: 'Odrzucony', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
}

const RECRUITERS = [
  'Nadia Terlecka', 'Oksana Bondar', 'Irina Koval', 'Petro Shevchenko',
  'Andriy Melnyk', 'Vasyl Tkachuk', 'Halyna Savchuk', 'Dmytro Polishchuk'
]

const fmtDate = (d?: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}
const toInput = (d?: string) => d ? d.slice(0, 10) : ''

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function getSortValue(w: Worker, key: SortKey): string | number {
  switch (key) {
    case 'name': return `${w.lastName} ${w.firstName}`.toLowerCase()
    case 'passport': return w.passport || ''
    case 'years': return w.yearsAtPlantation
    case 'referredBy': return (w.referredBy || '').toLowerCase()
    case 'availableFrom': return w.availableFrom || 'z'
    case 'availableTo': return w.availableTo || 'z'
    case 'suggestedArrival': return w.suggestedArrival || 'z'
    case 'confirmedArrival': return w.confirmedArrival || 'z'
    case 'status': return w.status
    default: return ''
  }
}

// ==================== STAFFING CONFIG ====================
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

const STAFF_OPTIONS = Array.from({ length: 16 }, (_, i) => i) // 0-15

function StaffingConfig() {
  const [tiers, setTiers] = useState<StaffingTier[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('staffingTiers')
      if (saved) try { return JSON.parse(saved) } catch {}
    }
    return DEFAULT_TIERS
  })
  const [saved, setSaved] = useState(false)

  const updateTier = (id: string, field: keyof StaffingTier, value: number) => {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
    setSaved(false)
  }

  const addTier = () => {
    const last = tiers[tiers.length - 1]
    setTiers(prev => [...prev, {
      id: Date.now().toString(),
      dailyKgFrom: last ? last.dailyKgTo : 0,
      dailyKgTo: last ? last.dailyKgTo + 1000 : 1000,
      pickersFrom: last ? last.pickersTo : 1,
      pickersTo: last ? last.pickersTo + 20 : 20,
      qualityControl: last ? last.qualityControl + 1 : 1,
      weighingStaff: last ? last.weighingStaff : 1,
      infrastructure: last ? last.infrastructure + 1 : 1,
    }])
    setSaved(false)
  }

  const removeTier = (id: string) => {
    if (tiers.length <= 1) return
    setTiers(prev => prev.filter(t => t.id !== id))
    setSaved(false)
  }

  const saveTiers = () => {
    localStorage.setItem('staffingTiers', JSON.stringify(tiers))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalForTier = (t: StaffingTier) => {
    const avgPickers = Math.round((t.pickersFrom + t.pickersTo) / 2)
    return avgPickers + t.qualityControl + t.weighingStaff + t.infrastructure
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Konfiguracja personelu</h2>
          <p className="text-sm text-gray-500">Zdefiniuj ile osób wsparcia potrzebujesz dla danego przedziału zbioru</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="w-4 h-4 mr-1" /> Dodaj przedział
          </Button>
          <Button size="sm" className={saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} onClick={saveTiers}>
            {saved ? <><Check className="w-4 h-4 mr-1" /> Zapisano</> : 'Zapisz konfigurację'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Szacunkowy zbiór dzienny (kg)</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Zbieracze</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Kontrola jakości</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Praca na wagach</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Obsługa infrastruktury</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-blue-600 uppercase font-bold">Łącznie osób</th>
                  <th className="px-1 py-3" />
                </tr>
                <tr className="border-b bg-gray-50/50">
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">od</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">do</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">od</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">do</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">osób</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">osób</th>
                  <th className="px-3 py-1 text-[10px] text-gray-400 text-center">osób</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="100" value={tier.dailyKgFrom}
                        onChange={e => updateTier(tier.id, 'dailyKgFrom', +e.target.value)}
                        className="w-20 rounded-md border px-2 py-1.5 text-sm text-center bg-white" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="100" value={tier.dailyKgTo}
                        onChange={e => updateTier(tier.id, 'dailyKgTo', +e.target.value)}
                        className="w-20 rounded-md border px-2 py-1.5 text-sm text-center bg-white" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="1" value={tier.pickersFrom}
                        onChange={e => updateTier(tier.id, 'pickersFrom', +e.target.value)}
                        className="w-16 rounded-md border px-2 py-1.5 text-sm text-center bg-white" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="1" value={tier.pickersTo}
                        onChange={e => updateTier(tier.id, 'pickersTo', +e.target.value)}
                        className="w-16 rounded-md border px-2 py-1.5 text-sm text-center bg-white" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <select value={tier.qualityControl} onChange={e => updateTier(tier.id, 'qualityControl', +e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm text-center bg-white min-w-[60px]">
                        {STAFF_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <select value={tier.weighingStaff} onChange={e => updateTier(tier.id, 'weighingStaff', +e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm text-center bg-white min-w-[60px]">
                        {STAFF_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <select value={tier.infrastructure} onChange={e => updateTier(tier.id, 'infrastructure', +e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm text-center bg-white min-w-[60px]">
                        {STAFF_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">
                        {totalForTier(tier)}
                      </span>
                    </td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeTier(tier.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Usuń przedział">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary visualization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Podsumowanie — zapotrzebowanie na personel wg przedziału</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tiers.map(tier => {
              const avgPickers = Math.round((tier.pickersFrom + tier.pickersTo) / 2)
              const total = totalForTier(tier)
              const maxTotal = Math.max(...tiers.map(totalForTier), 1)
              return (
                <div key={tier.id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-gray-600 text-right shrink-0">
                    {tier.dailyKgFrom.toLocaleString('pl-PL')}–{tier.dailyKgTo.toLocaleString('pl-PL')} kg
                  </div>
                  <div className="flex-1 flex h-7 rounded-lg overflow-hidden bg-gray-100">
                    <div className="bg-green-500 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: `${(avgPickers / total) * (total / maxTotal) * 100}%` }} title={`Zbieracze: ~${avgPickers}`}>
                      {avgPickers > 3 ? avgPickers : ''}
                    </div>
                    <div className="bg-amber-500 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: `${(tier.qualityControl / total) * (total / maxTotal) * 100}%` }} title={`Kontrola jakości: ${tier.qualityControl}`}>
                      {tier.qualityControl > 0 ? tier.qualityControl : ''}
                    </div>
                    <div className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: `${(tier.weighingStaff / total) * (total / maxTotal) * 100}%` }} title={`Wagi: ${tier.weighingStaff}`}>
                      {tier.weighingStaff > 0 ? tier.weighingStaff : ''}
                    </div>
                    <div className="bg-purple-500 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: `${(tier.infrastructure / total) * (total / maxTotal) * 100}%` }} title={`Infrastruktura: ${tier.infrastructure}`}>
                      {tier.infrastructure > 0 ? tier.infrastructure : ''}
                    </div>
                  </div>
                  <div className="w-10 text-right text-sm font-bold text-gray-700">{total}</div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-500 justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Zbieracze</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Kontrola jakości</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Praca na wagach</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Infrastruktura</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== MAIN PAGE ====================
type WorkersTab = 'config' | 'recruitment'

export default function WorkersPage() {
  const [activeTab, setActiveTab] = useState<WorkersTab>('config')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<WorkerFormData | null>(null)
  const [detail, setDetail] = useState<Worker | null>(null)
  const [letterModal, setLetterModal] = useState<{ worker: Worker; type: 'list' | 'arrival' } | null>(null)

  useEffect(() => { fetchWorkers() }, [])

  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/workers')
      const data = await res.json()
      setWorkers(data.workers || [])
    } catch (error) { console.error('Error fetching workers:', error) }
    finally { setLoading(false) }
  }

  const saveWorker = async (data: WorkerFormData) => {
    try {
      const url = data.id ? `/api/workers/${data.id}` : '/api/workers'
      const method = data.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (res.ok) { fetchWorkers(); setEditing(null); setDetail(null) }
    } catch (error) { console.error('Error saving worker:', error) }
  }

  const deleteWorker = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego pracownika?')) return
    try {
      const res = await fetch(`/api/workers/${id}`, { method: 'DELETE' })
      if (res.ok) { fetchWorkers(); setDetail(null); setEditing(null) }
    } catch (error) { console.error('Error deleting worker:', error) }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = workers.filter(w => {
      const ms = `${w.firstName} ${w.lastName} ${w.passport || ''} ${w.referredBy || ''}`.toLowerCase().includes(search.toLowerCase())
      const fs = filterStatus === 'all' || w.status === filterStatus
      return ms && fs
    })
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const va = getSortValue(a, sortKey), vb = getSortValue(b, sortKey)
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
      })
    }
    return list
  }, [workers, search, filterStatus, sortKey, sortDir])

  const recruiterStats = useMemo(() => {
    const c: Record<string, number> = {}
    workers.forEach(w => { if (w.referredBy) c[w.referredBy] = (c[w.referredBy] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [workers])

  const stats = useMemo(() => ({
    total: workers.length,
    confirmed: workers.filter(w => w.status === 'confirmed').length,
    pending: workers.filter(w => w.status === 'pending').length,
    newW: workers.filter(w => w.status === 'new').length,
    rejected: workers.filter(w => w.status === 'rejected').length,
    onList: workers.filter(w => w.acceptedToList).length,
  }), [workers])

  const emptyWorker: WorkerFormData = {
    firstName: '', lastName: '', passport: '', availableFrom: '', availableTo: '',
    suggestedArrival: '', confirmedArrival: '', referredBy: '', yearsAtPlantation: 0,
    status: 'new', acceptedToList: false, acceptedToListMsg: '', arrivalConfirmed: false,
    arrivalConfirmMsg: '', whatsapp: '', viber: '', phone: '', efficiencyKgH: 8.0,
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Pracownik' },
    { key: 'passport', label: 'Paszport' },
    { key: 'years', label: 'Lat' },
    { key: 'referredBy', label: 'Polecony przez' },
    { key: 'availableFrom', label: 'Od' },
    { key: 'availableTo', label: 'Do' },
    { key: 'suggestedArrival', label: 'Sug. przyjazd' },
    { key: 'confirmedArrival', label: 'Potw. przyjazd' },
    { key: 'status', label: 'Status' },
    { key: null, label: 'Lista' },
    { key: null, label: 'Potw.' },
    { key: null, label: 'Kontakt' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Ładowanie pracowników...</div></div>

  const tabs: { key: WorkersTab; label: string; icon: typeof Settings2 }[] = [
    { key: 'config', label: 'Konfiguracja', icon: Settings2 },
    { key: 'recruitment', label: 'Rekrutacja', icon: ClipboardList },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pracownicy</h1>
          <p className="text-gray-500">Zarządzanie pracownikami sezonowymi</p>
        </div>
        {activeTab === 'recruitment' && (
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => setEditing({ ...emptyWorker })}>
            <Plus className="w-4 h-4 mr-2" /> Dodaj pracownika
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'config' && <StaffingConfig />}

      {activeTab === 'recruitment' && (<>
      {/* Stats cards — recruitment tab */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Wszyscy', value: stats.total, icon: Users, color: 'bg-gray-100 text-gray-600' },
          { label: 'Potwierdzeni', value: stats.confirmed, icon: Check, color: 'bg-green-100 text-green-600' },
          { label: 'Oczekujący', value: stats.pending, icon: ChevronsUpDown, color: 'bg-amber-100 text-amber-600' },
          { label: 'Nowi', value: stats.newW, icon: UserPlus, color: 'bg-blue-100 text-blue-600' },
          { label: 'Odrzuceni', value: stats.rejected, icon: X, color: 'bg-red-100 text-red-600' },
          { label: 'Na liście', value: stats.onList, icon: Mail, color: 'bg-purple-100 text-purple-600' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Szukaj pracownika, paszportu, rekrutera..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white min-w-[150px]">
          <option value="all">Wszyscy</option>
          <option value="confirmed">Potwierdzeni</option>
          <option value="pending">Oczekujący</option>
          <option value="new">Nowi</option>
          <option value="rejected">Odrzuceni</option>
        </select>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <WorkerForm worker={editing} onSave={saveWorker} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}

      {detail && !editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <WorkerDetail worker={detail}
              onEdit={() => { setEditing(detail); setDetail(null) }}
              onDelete={() => deleteWorker(detail.id)}
              onClose={() => setDetail(null)}
              onShowLetter={(type) => setLetterModal({ worker: detail, type })}
            />
          </div>
        </div>
      )}

      {letterModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setLetterModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {letterModal.type === 'list' ? 'Potwierdzenie przyjęcia na listę' : 'Potwierdzenie przyjazdu'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{letterModal.worker.firstName} {letterModal.worker.lastName}</p>
            {(() => {
              const msg = letterModal.type === 'list' ? letterModal.worker.acceptedToListMsg : letterModal.worker.arrivalConfirmMsg
              return msg
                ? <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed border">{msg}</div>
                : <p className="text-gray-400 text-sm">Brak wiadomości. Dodaj w edycji pracownika.</p>
            })()}
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setLetterModal(null)}>Zamknij</Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {columns.map((col, i) => (
                    <th key={i}
                      onClick={col.key ? () => toggleSort(col.key) : undefined}
                      className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key && (
                          sortKey === col.key
                            ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                            : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(w => (
                  <tr key={w.id} onClick={() => setDetail(w)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${w.status === 'rejected' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700 shrink-0">
                          {w.firstName[0]}{w.lastName[0]}
                        </div>
                        <span className={`font-medium ${w.status === 'rejected' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {w.firstName} {w.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{w.passport || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${w.yearsAtPlantation >= 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {w.yearsAtPlantation}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{w.referredBy || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(w.availableFrom)}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-amber-600 whitespace-nowrap">{fmtDate(w.availableTo)}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-blue-600">{fmtDate(w.suggestedArrival)}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-green-600">{w.confirmedArrival ? fmtDate(w.confirmedArrival) : '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={w.status} /></td>
                    <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); if (w.acceptedToList) setLetterModal({ worker: w, type: 'list' }) }}>
                      <span className={`inline-flex items-center gap-1 ${w.acceptedToList ? 'text-green-600 cursor-pointer hover:text-green-700' : 'text-gray-300'}`}>
                        {w.acceptedToList ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <Mail className="w-3 h-3" />
                      </span>
                    </td>
                    <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); if (w.arrivalConfirmed) setLetterModal({ worker: w, type: 'arrival' }) }}>
                      <span className={`inline-flex items-center gap-1 ${w.arrivalConfirmed ? 'text-green-600 cursor-pointer hover:text-green-700' : 'text-gray-300'}`}>
                        {w.arrivalConfirmed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <Mail className="w-3 h-3" />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2 text-xs font-bold">
                        {w.whatsapp && <span className="text-green-500" title={w.whatsapp}>WA</span>}
                        {w.viber && <span className="text-purple-500" title={w.viber}>VB</span>}
                        {w.phone && <span className="text-gray-400" title={w.phone}>📞</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-8 text-gray-400">Brak pracowników pasujących do filtrów</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t text-xs text-gray-500 flex justify-between">
            <span>{filtered.length} z {workers.length}</span>
            <span>{stats.confirmed} potw. · {stats.rejected} odrz. · {stats.onList} na liście</span>
          </div>
        </CardContent>
      </Card>

      {recruiterStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> Ranking rekruterów
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recruiterStats.slice(0, 5).map(([name, count], i) => {
                const maxCount = recruiterStats[0]?.[1] as number || 1
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-6 text-center">{i < 3 ? medals[i] : <span className="text-xs text-gray-400">{i + 1}</span>}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-sm font-bold text-green-600">{count} os.</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${i === 0 ? 'bg-green-500' : i === 1 ? 'bg-blue-500' : i === 2 ? 'bg-amber-500' : 'bg-gray-300'}`}
                          style={{ width: `${((count as number) / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </>)}
    </div>
  )
}

function WorkerDetail({ worker, onEdit, onDelete, onClose, onShowLetter }: {
  worker: Worker; onEdit: () => void; onDelete: () => void; onClose: () => void
  onShowLetter: (type: 'list' | 'arrival') => void
}) {
  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-lg font-bold text-green-700">
            {worker.firstName[0]}{worker.lastName[0]}
          </div>
          <div>
            <h3 className={`text-xl font-bold ${worker.status === 'rejected' ? 'line-through text-gray-400' : ''}`}>
              {worker.firstName} {worker.lastName}
            </h3>
            <StatusBadge status={worker.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onEdit}><Edit className="w-3 h-3 mr-1" /> Edytuj</Button>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoField label="Nr paszportu" value={worker.passport || '—'} mono />
        <InfoField label="Rok na plantacji" value={worker.yearsAtPlantation === 0 ? 'Pierwszy sezon' : `${worker.yearsAtPlantation}. rok`} />
        <InfoField label="Polecony przez" value={worker.referredBy || '—'} />
        <InfoField label="Dostępny od" value={fmtDate(worker.availableFrom)} />
        <InfoField label="Dostępny do" value={fmtDate(worker.availableTo)} warn />
        <InfoField label="Sugerowany przyjazd" value={fmtDate(worker.suggestedArrival)} highlight="blue" />
        <InfoField label="Potwierdzony przyjazd" value={worker.confirmedArrival ? fmtDate(worker.confirmedArrival) : 'Nie potwierdzono'} highlight={worker.confirmedArrival ? 'green' : undefined} />
        <InfoField label="Wydajność" value={`${worker.efficiencyKgH} kg/h`} />
        <InfoField label="WhatsApp" value={worker.whatsapp || '—'} />
        <InfoField label="Viber" value={worker.viber || '—'} />
        <InfoField label="Telefon" value={worker.phone || '—'} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant={worker.acceptedToList ? 'default' : 'outline'} size="sm"
          className={worker.acceptedToList ? 'bg-green-600 hover:bg-green-700' : ''}
          onClick={() => onShowLetter('list')}>
          <Mail className="w-3 h-3 mr-1" /> {worker.acceptedToList ? '✓ Na liście' : 'Brak — lista'}
        </Button>
        <Button variant={worker.arrivalConfirmed ? 'default' : 'outline'} size="sm"
          className={worker.arrivalConfirmed ? 'bg-green-600 hover:bg-green-700' : ''}
          onClick={() => onShowLetter('arrival')}>
          <Mail className="w-3 h-3 mr-1" /> {worker.arrivalConfirmed ? '✓ Potw. przyjazdu' : 'Brak — przyjazd'}
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} className="ml-auto">
          <Trash2 className="w-3 h-3 mr-1" /> Usuń
        </Button>
      </div>
    </div>
  )
}

function InfoField({ label, value, mono, warn, highlight }: {
  label: string; value: string; mono?: boolean; warn?: boolean; highlight?: 'blue' | 'green'
}) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? 'border-amber-200 bg-amber-50' : 'bg-gray-50'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${warn ? 'text-amber-600' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-sm font-semibold ${mono ? 'font-mono' : ''} ${highlight === 'blue' ? 'text-blue-600' : highlight === 'green' ? 'text-green-600' : warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

interface WorkerFormData {
  id?: string
  firstName: string
  lastName: string
  passport?: string
  availableFrom?: string
  availableTo?: string
  suggestedArrival?: string
  confirmedArrival?: string
  referredBy?: string
  yearsAtPlantation: number
  status: string
  acceptedToList: boolean
  acceptedToListMsg?: string
  arrivalConfirmed: boolean
  arrivalConfirmMsg?: string
  whatsapp?: string
  viber?: string
  phone?: string
  efficiencyKgH: number
}

function WorkerForm({ worker, onSave, onCancel }: {
  worker: WorkerFormData; onSave: (data: WorkerFormData) => void; onCancel: () => void
}) {
  const [f, setF] = useState<WorkerFormData>({ ...worker })
  const u = <K extends keyof WorkerFormData>(k: K, v: WorkerFormData[K]) => setF(p => ({ ...p, [k]: v }))

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">{f.id ? 'Edytuj pracownika' : 'Nowy pracownik'}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div><Label className="text-xs">Imię</Label><Input value={f.firstName} onChange={e => u('firstName', e.target.value)} /></div>
        <div><Label className="text-xs">Nazwisko</Label><Input value={f.lastName} onChange={e => u('lastName', e.target.value)} /></div>
        <div><Label className="text-xs">Nr paszportu</Label><Input value={f.passport || ''} onChange={e => u('passport', e.target.value)} className="font-mono" /></div>
        <div><Label className="text-xs">Rok na plantacji</Label><Input type="number" min="0" value={f.yearsAtPlantation} onChange={e => u('yearsAtPlantation', parseInt(e.target.value) || 0)} /></div>
        <div><Label className="text-xs">Dostępny od</Label><Input type="date" value={toInput(f.availableFrom)} onChange={e => u('availableFrom', e.target.value)} /></div>
        <div><Label className="text-xs">Dostępny do</Label><Input type="date" value={toInput(f.availableTo)} onChange={e => u('availableTo', e.target.value)} /></div>
        <div><Label className="text-xs">Sugerowana data przyjazdu</Label><Input type="date" value={toInput(f.suggestedArrival)} onChange={e => u('suggestedArrival', e.target.value)} /></div>
        <div><Label className="text-xs">Potwierdzona data przyjazdu</Label><Input type="date" value={toInput(f.confirmedArrival)} onChange={e => u('confirmedArrival', e.target.value)} /></div>
        <div>
          <Label className="text-xs">Polecony przez</Label>
          <select value={f.referredBy || ''} onChange={e => u('referredBy', e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
            <option value="">— Wybierz —</option>
            {RECRUITERS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <select value={f.status} onChange={e => u('status', e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
            <option value="new">Nowy</option>
            <option value="pending">Oczekujący</option>
            <option value="confirmed">Potwierdzony</option>
            <option value="rejected">Odrzucony</option>
          </select>
        </div>
        <div><Label className="text-xs">WhatsApp</Label><Input value={f.whatsapp || ''} onChange={e => u('whatsapp', e.target.value)} placeholder="+380..." /></div>
        <div><Label className="text-xs">Viber</Label><Input value={f.viber || ''} onChange={e => u('viber', e.target.value)} placeholder="+380..." /></div>
        <div><Label className="text-xs">Telefon</Label><Input value={f.phone || ''} onChange={e => u('phone', e.target.value)} /></div>
        <div><Label className="text-xs">Wydajność (kg/h)</Label><Input type="number" step="0.1" value={f.efficiencyKgH} onChange={e => u('efficiencyKgH', parseFloat(e.target.value) || 0)} /></div>
      </div>

      <div className="mt-6 space-y-4 border rounded-lg p-4 bg-gray-50">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Wiadomości potwierdzające</p>
        <div className="border rounded-lg p-4 bg-white">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold mb-2">
            <input type="checkbox" checked={f.acceptedToList} onChange={e => u('acceptedToList', e.target.checked)} className="w-4 h-4 accent-green-600 rounded" />
            ✉ Przyjęcie na listę pracowników
          </label>
          {f.acceptedToList && (
            <textarea value={f.acceptedToListMsg || ''} onChange={e => u('acceptedToListMsg', e.target.value)}
              placeholder="Np.: Informujemy, że został/a Pan/Pani przyjęty/a na listę pracowników sezonowych 2026..."
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[70px] resize-y" />
          )}
        </div>
        <div className="border rounded-lg p-4 bg-white">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold mb-2">
            <input type="checkbox" checked={f.arrivalConfirmed} onChange={e => u('arrivalConfirmed', e.target.checked)} className="w-4 h-4 accent-green-600 rounded" />
            ✉ Oficjalne potwierdzenie przyjazdu
            {f.confirmedArrival && <span className="text-xs text-green-600 font-normal ml-2">data: {f.confirmedArrival}</span>}
          </label>
          {f.arrivalConfirmed && (
            <textarea value={f.arrivalConfirmMsg || ''} onChange={e => u('arrivalConfirmMsg', e.target.value)}
              placeholder="Np.: Potwierdzamy przyjazd na dzień DD.MM.RRRR. Prosimy o kontakt tydzień przed..."
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[70px] resize-y" />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onCancel}>Anuluj</Button>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => onSave(f)}>
          <Check className="w-4 h-4 mr-1" /> {f.id ? 'Zapisz' : 'Dodaj'}
        </Button>
      </div>
    </div>
  )
}
