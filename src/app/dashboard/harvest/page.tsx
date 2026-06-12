'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Target, Upload, Loader2, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'

interface HarvestEntry {
  id: string
  date: string
  areaName: string
  productClass: string
  weightKg: number
  quantity: number | null
  blockId: string | null
  block: { id: string; name: string } | null
  sourceFile: string | null
}

interface BlockPlan {
  blockId: string
  blockName: string
  plannedKg: number
}

interface BlockSummary {
  blockName: string
  harvestedKg: number
  plannedKg: number
  percentage: number
  dailyData: Array<{ date: string; kg: number; cumulative: number }>
}

export default function HarvestPage() {
  const [entries, setEntries] = useState<HarvestEntry[]>([])
  const [blockPlans, setBlockPlans] = useState<BlockPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [harvestRes, planRes] = await Promise.all([
        fetch('/api/plantation/harvest'),
        fetch('/api/plantation/harvest/plan'),
      ])

      if (harvestRes.ok) {
        const data = await harvestRes.json()
        setEntries(data.entries || [])
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setBlockPlans(data.blocks || [])
      }
    } catch (e) {
      console.error('Error fetching harvest data:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/plantation/harvest', { method: 'POST', body: fd })
      const data = await res.json()

      if (res.ok && data.success) {
        const msg = `Zaimportowano ${data.totalRows} wierszy (${data.dateRange?.from} — ${data.dateRange?.to})${data.unmapped > 0 ? `. ${data.unmapped} niezmapowanych: ${data.unmappedAreas?.join(', ')}` : ''}`
        setUploadResult(msg)
        fetchData()
      } else {
        setUploadResult(`Błąd: ${data.error}`)
      }
    } catch {
      setUploadResult('Błąd połączenia')
    }

    setUploading(false)
    e.target.value = ''
  }

  // Build block summaries
  const blockSummaries: BlockSummary[] = (() => {
    const blockGroups = new Map<string, { kg: number; daily: Map<string, number> }>()

    for (const entry of entries) {
      const name = entry.block?.name || entry.areaName
      if (!blockGroups.has(name)) {
        blockGroups.set(name, { kg: 0, daily: new Map() })
      }
      const group = blockGroups.get(name)!
      group.kg += entry.weightKg
      const dateKey = entry.date.slice(0, 10)
      group.daily.set(dateKey, (group.daily.get(dateKey) || 0) + entry.weightKg)
    }

    // Merge entries by block name from plans
    const planMap = new Map<string, number>()
    for (const bp of blockPlans) {
      planMap.set(bp.blockName, (planMap.get(bp.blockName) || 0) + bp.plannedKg)
    }

    const summaries: BlockSummary[] = []
    const allBlockNames = new Set([...blockGroups.keys(), ...planMap.keys()])

    for (const name of allBlockNames) {
      const group = blockGroups.get(name)
      const harvestedKg = group?.kg || 0
      const plannedKg = planMap.get(name) || 0

      // Build daily cumulative
      const dailyData: Array<{ date: string; kg: number; cumulative: number }> = []
      if (group) {
        const sortedDays = Array.from(group.daily.entries()).sort(([a], [b]) => a.localeCompare(b))
        let cumulative = 0
        for (const [date, kg] of sortedDays) {
          cumulative += kg
          dailyData.push({ date, kg: Math.round(kg * 100) / 100, cumulative: Math.round(cumulative * 100) / 100 })
        }
      }

      summaries.push({
        blockName: name,
        harvestedKg: Math.round(harvestedKg * 100) / 100,
        plannedKg: Math.round(plannedKg * 100) / 100,
        percentage: plannedKg > 0 ? Math.round((harvestedKg / plannedKg) * 1000) / 10 : 0,
        dailyData,
      })
    }

    return summaries.sort((a, b) => a.blockName.localeCompare(b.blockName))
  })()

  const totalHarvested = blockSummaries.reduce((s, b) => s + b.harvestedKg, 0)
  const totalPlanned = blockSummaries.reduce((s, b) => s + b.plannedKg, 0)
  const totalPercentage = totalPlanned > 0 ? Math.round((totalHarvested / totalPlanned) * 1000) / 10 : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Zbiory</h1>
          <p className="text-gray-500">Realizacja zbiorów vs plan</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button asChild variant="outline" size="sm" disabled={uploading}>
              <span>
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Importowanie...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-1" />Import z MaxCrop (XLS)</>
                )}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {uploadResult && (
        <div className={`p-3 rounded-lg text-sm ${uploadResult.startsWith('Błąd') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {uploadResult}
        </div>
      )}

      {/* Sumaryczne karty */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Zebrano łącznie</div>
            <div className="text-3xl font-bold text-green-700">{totalHarvested.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Plan łącznie</div>
            <div className="text-3xl font-bold text-gray-700">{totalPlanned.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} kg</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 mb-1">Realizacja</div>
            <div className={`text-3xl font-bold ${totalPercentage >= 100 ? 'text-green-700' : totalPercentage >= 50 ? 'text-amber-600' : 'text-gray-700'}`}>
              {totalPercentage}%
            </div>
            <div className="mt-2 bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${totalPercentage >= 100 ? 'bg-green-500' : totalPercentage >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(totalPercentage, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-block breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-green-600" />
            Realizacja per blok
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockSummaries.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Brak danych. Zaimportuj plik XLS z MaxCrop.</p>
          ) : (
            <div className="space-y-4">
              {blockSummaries.map(block => (
                <div key={block.blockName} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-900">{block.blockName}</div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-700 font-semibold">{block.harvestedKg.toLocaleString('pl-PL')} kg</span>
                      <span className="text-gray-400">/</span>
                      <span className="text-gray-600">{block.plannedKg > 0 ? `${block.plannedKg.toLocaleString('pl-PL')} kg` : 'brak planu'}</span>
                      {block.plannedKg > 0 && (
                        <span className={`font-semibold px-2 py-0.5 rounded text-xs ${block.percentage >= 100 ? 'bg-green-100 text-green-700' : block.percentage >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {block.percentage}%
                        </span>
                      )}
                      {block.percentage > 120 && <TrendingUp className="w-4 h-4 text-green-600" />}
                      {block.plannedKg > 0 && block.percentage < 30 && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      {block.percentage >= 95 && block.percentage <= 105 && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>

                  {block.plannedKg > 0 && (
                    <div className="bg-gray-100 rounded-full h-2.5 mb-3">
                      <div
                        className={`h-2.5 rounded-full transition-all ${block.percentage >= 100 ? 'bg-green-500' : block.percentage >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(block.percentage, 100)}%` }}
                      />
                    </div>
                  )}

                  {/* Daily breakdown */}
                  {block.dailyData.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            {block.dailyData.map(d => (
                              <th key={d.date} className="px-2 py-1 text-center font-normal">
                                {new Date(d.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {block.dailyData.map(d => (
                              <td key={d.date} className="px-2 py-1 text-center font-medium text-green-700">
                                {d.kg > 0 ? d.kg.toLocaleString('pl-PL') : '—'}
                              </td>
                            ))}
                          </tr>
                          <tr className="text-gray-400">
                            {block.dailyData.map(d => (
                              <td key={d.date} className="px-2 py-1 text-center">
                                Σ {d.cumulative.toLocaleString('pl-PL')}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
