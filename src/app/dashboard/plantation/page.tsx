'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Map, ChevronRight, ChevronDown, Layers, Ruler, Leaf, Sprout, X, Loader2, Pencil, Trash2 } from 'lucide-react'

interface Section {
  id: string
  name: string
  variety: string
  tunnels: number
  meters: number
  pots: number
  shootsPerPot: number
}

interface Block {
  id: string
  name: string
  sections: Section[]
}

const defaultBlocks: Block[] = [
  {
    id: 'block-A',
    name: 'Blok A',
    sections: [
      { id: 'section-A1-9', name: 'Blok A1-9', variety: 'Diamond Jubilee', tunnels: 9, meters: 2642, pots: 5284, shootsPerPot: 2 },
      { id: 'section-A10-19', name: 'Blok A10-19', variety: 'Diamond Jubilee', tunnels: 10, meters: 2336, pots: 4672, shootsPerPot: 2 },
    ]
  },
  {
    id: 'block-B',
    name: 'Blok B',
    sections: [
      { id: 'section-B01-07', name: 'B 01-07', variety: 'Ruby', tunnels: 7, meters: 2100, pots: 4200, shootsPerPot: 2 },
      { id: 'section-B08-13', name: 'Blok B 08-13', variety: 'Ruby', tunnels: 6, meters: 1800, pots: 3600, shootsPerPot: 2 },
    ]
  },
  {
    id: 'block-C',
    name: 'Blok C',
    sections: [
      { id: 'section-C01-05', name: 'Blok C 01-05', variety: 'Diamond Jubilee', tunnels: 5, meters: 1500, pots: 3000, shootsPerPot: 2 },
      { id: 'section-C06-11', name: 'Blok C 06-11', variety: 'Diamond Jubilee', tunnels: 6, meters: 1800, pots: 3600, shootsPerPot: 2 },
    ]
  },
  {
    id: 'block-D',
    name: 'Blok D',
    sections: [
      { id: 'section-D01-09', name: 'Blok D 01-09', variety: 'Diamond Jubilee', tunnels: 9, meters: 2700, pots: 5400, shootsPerPot: 2 },
      { id: 'section-D10-18', name: 'Blok D 10-18', variety: 'Diamond Jubilee', tunnels: 9, meters: 2700, pots: 5400, shootsPerPot: 2 },
    ]
  },
]

export default function PlantationPage() {
  const [blocks, setBlocks] = useState<Block[]>(defaultBlocks)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [showSectionForm, setShowSectionForm] = useState<string | null>(null)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set(['block-A', 'block-B', 'block-C', 'block-D']))
  const [newBlockName, setNewBlockName] = useState('')
  const [sectionForm, setSectionForm] = useState({
    name: '',
    variety: 'Diamond Jubilee',
    tunnels: '',
    meters: '',
    pots: '',
    shootsPerPot: '2'
  })

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('plantationBlocks')
    if (saved) {
      setBlocks(JSON.parse(saved))
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('plantationBlocks', JSON.stringify(blocks))
  }, [blocks])

  // Obliczenia
  const totalTunnels = blocks.reduce((sum, b) => sum + b.sections.reduce((s, sec) => s + sec.tunnels, 0), 0)
  const totalMeters = blocks.reduce((sum, b) => sum + b.sections.reduce((s, sec) => s + sec.meters, 0), 0)
  const totalPots = blocks.reduce((sum, b) => sum + b.sections.reduce((s, sec) => s + sec.pots, 0), 0)
  const totalShoots = blocks.reduce((sum, b) => sum + b.sections.reduce((s, sec) => s + (sec.pots * sec.shootsPerPot), 0), 0)
  const tunnelAreaHa = 0.03
  const totalHectares = (totalTunnels * tunnelAreaHa).toFixed(2)

  // Policz odmiany
  const varietyCounts = blocks.reduce((acc, block) => {
    block.sections.forEach(section => {
      acc[section.variety] = (acc[section.variety] || 0) + section.pots * section.shootsPerPot
    })
    return acc
  }, {} as Record<string, number>)

  const toggleBlock = (blockId: string) => {
    const newExpanded = new Set(expandedBlocks)
    if (newExpanded.has(blockId)) {
      newExpanded.delete(blockId)
    } else {
      newExpanded.add(blockId)
    }
    setExpandedBlocks(newExpanded)
  }

  const addBlock = () => {
    if (!newBlockName.trim()) return
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      name: newBlockName,
      sections: []
    }
    setBlocks([...blocks, newBlock])
    setNewBlockName('')
    setShowBlockForm(false)
    setExpandedBlocks(new Set([...expandedBlocks, newBlock.id]))
  }

  const deleteBlock = (blockId: string) => {
    if (confirm('Czy na pewno chcesz usunąć ten blok i wszystkie jego sekcje?')) {
      setBlocks(blocks.filter(b => b.id !== blockId))
    }
  }

  const addSection = (blockId: string) => {
    if (!sectionForm.name.trim()) return
    const newSection: Section = {
      id: `section-${Date.now()}`,
      name: sectionForm.name,
      variety: sectionForm.variety,
      tunnels: parseInt(sectionForm.tunnels) || 0,
      meters: parseInt(sectionForm.meters) || 0,
      pots: parseInt(sectionForm.pots) || 0,
      shootsPerPot: parseInt(sectionForm.shootsPerPot) || 2
    }
    setBlocks(blocks.map(b => 
      b.id === blockId 
        ? { ...b, sections: [...b.sections, newSection] }
        : b
    ))
    setSectionForm({ name: '', variety: 'Diamond Jubilee', tunnels: '', meters: '', pots: '', shootsPerPot: '2' })
    setShowSectionForm(null)
  }

  const updateSection = (blockId: string) => {
    if (!editingSection) return
    setBlocks(blocks.map(b => 
      b.id === blockId 
        ? { ...b, sections: b.sections.map(s => s.id === editingSection.id ? editingSection : s) }
        : b
    ))
    setEditingSection(null)
  }

  const deleteSection = (blockId: string, sectionId: string) => {
    if (confirm('Czy na pewno chcesz usunąć tę sekcję?')) {
      setBlocks(blocks.map(b => 
        b.id === blockId 
          ? { ...b, sections: b.sections.filter(s => s.id !== sectionId) }
          : b
      ))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plantacja</h1>
          <p className="text-gray-500">Zarządzaj blokami i sekcjami plantacji</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowBlockForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj blok
        </Button>
      </div>

      {/* Formularz dodawania bloku */}
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
                <Label htmlFor="blockName">Nazwa bloku</Label>
                <Input
                  id="blockName"
                  placeholder="np. Blok E"
                  value={newBlockName}
                  onChange={(e) => setNewBlockName(e.target.value)}
                />
              </div>
              <Button onClick={addBlock} className="mt-6 bg-green-600 hover:bg-green-700">
                Dodaj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Główne podsumowanie */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4 text-center">
            <Layers className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-green-700">{blocks.length}</div>
            <div className="text-sm text-green-600">Bloków</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4 text-center">
            <Map className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-blue-700">{totalTunnels}</div>
            <div className="text-sm text-blue-600">Tuneli</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4 text-center">
            <Ruler className="w-6 h-6 text-purple-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-purple-700">{totalHectares}</div>
            <div className="text-sm text-purple-600">Hektarów</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4 text-center">
            <Ruler className="w-6 h-6 text-orange-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-orange-700">{totalMeters.toLocaleString()}</div>
            <div className="text-sm text-orange-600">Metrów bieżących</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4 text-center">
            <Leaf className="w-6 h-6 text-amber-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-amber-700">{totalPots.toLocaleString()}</div>
            <div className="text-sm text-amber-600">Doniczek</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4 text-center">
            <Sprout className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-red-700">{totalShoots.toLocaleString()}</div>
            <div className="text-sm text-red-600">Pędów</div>
          </CardContent>
        </Card>
      </div>

      {/* Podział według odmian */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Podział według odmian</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(varietyCounts).map(([variety, shoots]) => {
              const percentage = totalShoots > 0 ? ((shoots / totalShoots) * 100).toFixed(1) : '0'
              return (
                <div key={variety} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${
                      variety === 'Diamond Jubilee' ? 'bg-purple-500' : 'bg-red-500'
                    }`} />
                    <div>
                      <div className="font-semibold">{variety}</div>
                      <div className="text-sm text-gray-500">{shoots.toLocaleString()} pędów</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-700">{percentage}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bloki */}
      <div className="space-y-4">
        {blocks.map((block) => {
          const blockTunnels = block.sections.reduce((s, sec) => s + sec.tunnels, 0)
          const blockPots = block.sections.reduce((s, sec) => s + sec.pots, 0)
          const blockShoots = block.sections.reduce((s, sec) => s + sec.pots * sec.shootsPerPot, 0)
          const blockMeters = block.sections.reduce((s, sec) => s + sec.meters, 0)
          const isExpanded = expandedBlocks.has(block.id)
          
          return (
            <Card key={block.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => toggleBlock(block.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    <Map className="w-5 h-5 text-green-600" />
                    {block.name}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-normal text-gray-500 hidden md:flex gap-4">
                      <span>{blockTunnels} tuneli</span>
                      <span>{blockMeters.toLocaleString()} m.b.</span>
                      <span>{blockPots.toLocaleString()} doniczek</span>
                      <span className="font-semibold text-green-600">{blockShoots.toLocaleString()} pędów</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowSectionForm(block.id)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Sekcja
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
              
              {isExpanded && (
                <CardContent>
                  {/* Formularz dodawania sekcji */}
                  {showSectionForm === block.id && (
                    <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">Nowa sekcja</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowSectionForm(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                          <Label>Nazwa</Label>
                          <Input
                            placeholder="np. A1-5"
                            value={sectionForm.name}
                            onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Odmiana</Label>
                          <select
                            className="w-full h-10 px-3 border rounded-md"
                            value={sectionForm.variety}
                            onChange={(e) => setSectionForm({...sectionForm, variety: e.target.value})}
                          >
                            <option value="Diamond Jubilee">Diamond Jubilee</option>
                            <option value="Ruby">Ruby</option>
                          </select>
                        </div>
                        <div>
                          <Label>Tunele</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={sectionForm.tunnels}
                            onChange={(e) => setSectionForm({...sectionForm, tunnels: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Metry b.</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={sectionForm.meters}
                            onChange={(e) => setSectionForm({...sectionForm, meters: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Doniczki</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={sectionForm.pots}
                            onChange={(e) => setSectionForm({...sectionForm, pots: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Pędy/don.</Label>
                          <Input
                            type="number"
                            placeholder="2"
                            value={sectionForm.shootsPerPot}
                            onChange={(e) => setSectionForm({...sectionForm, shootsPerPot: e.target.value})}
                          />
                        </div>
                      </div>
                      <Button onClick={() => addSection(block.id)} className="mt-3 bg-green-600 hover:bg-green-700">
                        Dodaj sekcję
                      </Button>
                    </div>
                  )}

                  {/* Lista sekcji */}
                  {block.sections.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>Brak sekcji w tym bloku</p>
                      <p className="text-sm">Kliknij "Sekcja" aby dodać pierwszą sekcję</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {block.sections.map((section) => (
                        <div key={section.id}>
                          {editingSection?.id === section.id ? (
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                <div>
                                  <Label>Nazwa</Label>
                                  <Input
                                    value={editingSection.name}
                                    onChange={(e) => setEditingSection({...editingSection, name: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <Label>Odmiana</Label>
                                  <select
                                    className="w-full h-10 px-3 border rounded-md"
                                    value={editingSection.variety}
                                    onChange={(e) => setEditingSection({...editingSection, variety: e.target.value})}
                                  >
                                    <option value="Diamond Jubilee">Diamond Jubilee</option>
                                    <option value="Ruby">Ruby</option>
                                  </select>
                                </div>
                                <div>
                                  <Label>Tunele</Label>
                                  <Input
                                    type="number"
                                    value={editingSection.tunnels}
                                    onChange={(e) => setEditingSection({...editingSection, tunnels: parseInt(e.target.value) || 0})}
                                  />
                                </div>
                                <div>
                                  <Label>Metry b.</Label>
                                  <Input
                                    type="number"
                                    value={editingSection.meters}
                                    onChange={(e) => setEditingSection({...editingSection, meters: parseInt(e.target.value) || 0})}
                                  />
                                </div>
                                <div>
                                  <Label>Doniczki</Label>
                                  <Input
                                    type="number"
                                    value={editingSection.pots}
                                    onChange={(e) => setEditingSection({...editingSection, pots: parseInt(e.target.value) || 0})}
                                  />
                                </div>
                                <div>
                                  <Label>Pędy/don.</Label>
                                  <Input
                                    type="number"
                                    value={editingSection.shootsPerPot}
                                    onChange={(e) => setEditingSection({...editingSection, shootsPerPot: parseInt(e.target.value) || 2})}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <Button onClick={() => updateSection(block.id)} className="bg-blue-600 hover:bg-blue-700">
                                  Zapisz
                                </Button>
                                <Button variant="outline" onClick={() => setEditingSection(null)}>
                                  Anuluj
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                              <div className="flex-1">
                                <div className="font-medium">{section.name}</div>
                                <div className="text-sm text-gray-500">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                                    section.variety === 'Diamond Jubilee' 
                                      ? 'bg-purple-100 text-purple-700' 
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {section.variety}
                                  </span>
                                  {section.tunnels} tuneli • {section.meters.toLocaleString()} m.b. • {section.pots.toLocaleString()} doniczek
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="font-semibold text-green-600">
                                    {(section.pots * section.shootsPerPot).toLocaleString()} pędów
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => setEditingSection(section)}
                                >
                                  <Pencil className="w-4 h-4 text-gray-500" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => deleteSection(block.id, section.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
