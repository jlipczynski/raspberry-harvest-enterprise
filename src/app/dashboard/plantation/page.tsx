'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, MapPin, Layers, X, Pencil, Trash2 } from 'lucide-react'

interface Section {
  id: string
  name: string
  rowsCount: number
  rowLengthM: number
  plantSpacing: number
  plantsCount: number
  varietyId: string
  variety?: {
    id: string
    name: string
  }
}

interface Block {
  id: string
  name: string
  areaHa?: number
  sections: Section[]
}

interface Variety {
  id: string
  name: string
}

interface Farm {
  id: string
  name: string
  location?: string
}

export default function PlantationPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [farm, setFarm] = useState<Farm | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [showSectionForm, setShowSectionForm] = useState<string | null>(null)
  const [blockName, setBlockName] = useState('')
  const [sectionForm, setSectionForm] = useState({
    name: '',
    rowsCount: 10,
    rowLengthM: 100,
    plantSpacing: 0.5,
    varietyId: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/plantation')
      const data = await res.json()
      setBlocks(data.blocks || [])
      setVarieties(data.varieties || [])
      setFarm(data.farm)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const addBlock = async () => {
    if (!blockName.trim() || !farm) return
    
    try {
      const res = await fetch('/api/plantation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: { name: blockName }, farmId: farm.id })
      })
      
      if (res.ok) {
        setBlockName('')
        setShowBlockForm(false)
        fetchData()
      }
    } catch (error) {
      console.error('Error adding block:', error)
    }
  }

  const addSection = async (blockId: string) => {
    if (!sectionForm.name.trim() || !sectionForm.varietyId) return
    
    const plantsCount = Math.round(
      sectionForm.rowsCount * sectionForm.rowLengthM / sectionForm.plantSpacing
    )
    
    try {
      const res = await fetch('/api/plantation/section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: {
            ...sectionForm,
            plantsCount,
            blockId
          }
        })
      })
      
      if (res.ok) {
        setSectionForm({
          name: '',
          rowsCount: 10,
          rowLengthM: 100,
          plantSpacing: 0.5,
          varietyId: ''
        })
        setShowSectionForm(null)
        fetchData()
      }
    } catch (error) {
      console.error('Error adding section:', error)
    }
  }

  const totalPlants = blocks.reduce((sum, block) => 
    sum + block.sections.reduce((s, section) => s + section.plantsCount, 0), 0
  )

  const totalSections = blocks.reduce((sum, block) => sum + block.sections.length, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Ładowanie danych...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plantacja</h1>
          <p className="text-gray-500">{farm?.name || 'Zarządzaj blokami i sekcjami'}</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowBlockForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj blok
        </Button>
      </div>

      {/* Statystyki */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Layers className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Bloki</p>
                <p className="text-2xl font-bold">{blocks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Sekcje</p>
                <p className="text-2xl font-bold">{totalSections}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Layers className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rośliny</p>
                <p className="text-2xl font-bold">{totalPlants.toLocaleString('pl-PL')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formularz nowego bloku */}
      {showBlockForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Nowy blok</span>
              <Button variant="ghost" size="icon" onClick={() => setShowBlockForm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>Nazwa bloku</Label>
                <Input
                  placeholder="np. Blok E"
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addBlock} className="bg-green-600 hover:bg-green-700">
                  Dodaj
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista bloków */}
      <div className="space-y-4">
        {blocks.map((block) => (
          <Card key={block.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-green-600" />
                  {block.name}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowSectionForm(block.id)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Dodaj sekcję
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Formularz nowej sekcji */}
              {showSectionForm === block.id && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div>
                      <Label>Nazwa</Label>
                      <Input
                        placeholder="np. E01-05"
                        value={sectionForm.name}
                        onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Rzędy</Label>
                      <Input
                        type="number"
                        value={sectionForm.rowsCount}
                        onChange={(e) => setSectionForm({...sectionForm, rowsCount: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <Label>Długość (m)</Label>
                      <Input
                        type="number"
                        value={sectionForm.rowLengthM}
                        onChange={(e) => setSectionForm({...sectionForm, rowLengthM: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <Label>Rozstaw (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={sectionForm.plantSpacing}
                        onChange={(e) => setSectionForm({...sectionForm, plantSpacing: parseFloat(e.target.value) || 0.5})}
                      />
                    </div>
                    <div>
                      <Label>Odmiana</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md"
                        value={sectionForm.varietyId}
                        onChange={(e) => setSectionForm({...sectionForm, varietyId: e.target.value})}
                      >
                        <option value="">Wybierz...</option>
                        {varieties.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => addSection(block.id)} className="bg-green-600 hover:bg-green-700">
                      Dodaj sekcję
                    </Button>
                    <Button variant="outline" onClick={() => setShowSectionForm(null)}>
                      Anuluj
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista sekcji */}
              {block.sections.length > 0 ? (
                <div className="space-y-2">
                  {block.sections.map((section) => (
                    <div key={section.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{section.name}</span>
                        <span className="text-sm text-gray-500">
                          {section.variety?.name || 'Brak odmiany'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{section.rowsCount} rzędów</span>
                        <span>{section.rowLengthM}m</span>
                        <span className="font-medium text-green-600">
                          {section.plantsCount.toLocaleString('pl-PL')} roślin
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">Brak sekcji w tym bloku</p>
              )}
            </CardContent>
          </Card>
        ))}

        {blocks.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                Brak bloków. Kliknij "Dodaj blok" żeby rozpocząć.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
