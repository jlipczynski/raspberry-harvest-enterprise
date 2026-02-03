'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, MapPin, Layers, X, Pencil, Trash2, Save } from 'lucide-react'

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
  
  // Forms state
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [blockName, setBlockName] = useState('')
  
  const [showSectionForm, setShowSectionForm] = useState<string | null>(null)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
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

  // ============ BLOCK OPERATIONS ============
  
  const resetBlockForm = () => {
    setBlockName('')
    setEditingBlock(null)
    setShowBlockForm(false)
  }

  const startEditBlock = (block: Block) => {
    setEditingBlock(block)
    setBlockName(block.name)
    setShowBlockForm(true)
  }

  const saveBlock = async () => {
    if (!blockName.trim() || !farm) return
    
    try {
      if (editingBlock) {
        // Update existing block
        await fetch(`/api/plantation/block/${editingBlock.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: blockName })
        })
      } else {
        // Create new block
        await fetch('/api/plantation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block: { name: blockName }, farmId: farm.id })
        })
      }
      
      resetBlockForm()
      fetchData()
    } catch (error) {
      console.error('Error saving block:', error)
    }
  }

  const deleteBlock = async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (block && block.sections.length > 0) {
      if (!confirm(`Blok "${block.name}" zawiera ${block.sections.length} sekcji. Czy na pewno chcesz usunąć blok wraz ze wszystkimi sekcjami?`)) {
        return
      }
    } else {
      if (!confirm('Czy na pewno chcesz usunąć ten blok?')) return
    }
    
    try {
      await fetch(`/api/plantation/block/${blockId}`, {
        method: 'DELETE'
      })
      fetchData()
    } catch (error) {
      console.error('Error deleting block:', error)
    }
  }

  // ============ SECTION OPERATIONS ============
  
  const resetSectionForm = () => {
    setSectionForm({
      name: '',
      rowsCount: 10,
      rowLengthM: 100,
      plantSpacing: 0.5,
      varietyId: ''
    })
    setEditingSection(null)
    setShowSectionForm(null)
  }

  const startAddSection = (blockId: string) => {
    resetSectionForm()
    setShowSectionForm(blockId)
  }

  const startEditSection = (blockId: string, section: Section) => {
    setEditingSection(section)
    setSectionForm({
      name: section.name || '',
      rowsCount: section.rowsCount,
      rowLengthM: section.rowLengthM,
      plantSpacing: section.plantSpacing,
      varietyId: section.varietyId
    })
    setShowSectionForm(blockId)
  }

  const saveSection = async (blockId: string) => {
    if (!sectionForm.name.trim() || !sectionForm.varietyId) return
    
    const plantsCount = Math.round(
      sectionForm.rowsCount * sectionForm.rowLengthM / sectionForm.plantSpacing
    )
    
    try {
      if (editingSection) {
        // Update existing section
        await fetch(`/api/plantation/section/${editingSection.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sectionForm,
            plantsCount
          })
        })
      } else {
        // Create new section
        await fetch('/api/plantation/section', {
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
      }
      
      resetSectionForm()
      fetchData()
    } catch (error) {
      console.error('Error saving section:', error)
    }
  }

  const deleteSection = async (sectionId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę sekcję?')) return
    
    try {
      await fetch(`/api/plantation/section/${sectionId}`, {
        method: 'DELETE'
      })
      fetchData()
    } catch (error) {
      console.error('Error deleting section:', error)
    }
  }

  // ============ STATS ============
  
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

      {/* Formularz bloku */}
      {showBlockForm && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>{editingBlock ? 'Edytuj blok' : 'Nowy blok'}</span>
              <Button variant="ghost" size="icon" onClick={resetBlockForm}>
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
              <div className="flex items-end gap-2">
                <Button onClick={saveBlock} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  {editingBlock ? 'Zapisz' : 'Dodaj'}
                </Button>
                <Button variant="outline" onClick={resetBlockForm}>
                  Anuluj
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
                  <span className="text-sm font-normal text-gray-500">
                    ({block.sections.length} sekcji, {block.sections.reduce((s, sec) => s + sec.plantsCount, 0).toLocaleString('pl-PL')} roślin)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => startAddSection(block.id)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Sekcja
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => startEditBlock(block)}
                  >
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => deleteBlock(block.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Formularz sekcji */}
              {showSectionForm === block.id && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium mb-3">{editingSection ? 'Edytuj sekcję' : 'Nowa sekcja'}</h4>
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
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Liczba roślin: <strong>{Math.round(sectionForm.rowsCount * sectionForm.rowLengthM / sectionForm.plantSpacing).toLocaleString('pl-PL')}</strong>
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => saveSection(block.id)} className="bg-green-600 hover:bg-green-700">
                        <Save className="w-4 h-4 mr-2" />
                        {editingSection ? 'Zapisz' : 'Dodaj'}
                      </Button>
                      <Button variant="outline" onClick={resetSectionForm}>
                        Anuluj
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista sekcji */}
              {block.sections.length > 0 ? (
                <div className="space-y-2">
                  {block.sections.map((section) => (
                    <div key={section.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{section.name}</span>
                        <span className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded">
                          {section.variety?.name || 'Brak odmiany'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500 flex gap-4">
                          <span>{section.rowsCount} rzędów</span>
                          <span>{section.rowLengthM}m</span>
                          <span className="font-medium text-green-600">
                            {section.plantsCount.toLocaleString('pl-PL')} roślin
                          </span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => startEditSection(block.id, section)}
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteSection(section.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
