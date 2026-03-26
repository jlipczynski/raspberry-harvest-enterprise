'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Target } from 'lucide-react'

interface Section {
  id: string
  name: string
  winteredInTunnel: boolean
  plantingDate: string | null
  autumnShootDate: string | null
  variety?: { name: string }
}

interface GDHProgressProps {
  sections: Section[]
  currentGDH: number
  gdhByDate: { [date: string]: number }
}

export default function GDHProgress({ sections, currentGDH, gdhByDate }: GDHProgressProps) {
  const getGDHForSection = (section: Section) => {
    if (section.winteredInTunnel) {
      return currentGDH
    }
    if (section.plantingDate) {
      const plantDate = section.plantingDate.split('T')[0]
      return gdhByDate[plantDate] || 0
    }
    return 0
  }

  const getGDHThreshold = (_section: Section) => {
    return 20000 // TODO: pobierać z GDH API per sekcja (fruitThresholdSummer)
  }

  const estimateFruitingDate = (section: Section, currentSectionGDH: number) => {
    const threshold = getGDHThreshold(section)
    const remaining = threshold - currentSectionGDH
    if (remaining <= 0) return 'Teraz!'
    
    const avgDailyGDH = 150
    const daysRemaining = Math.ceil(remaining / avgDailyGDH)
    const fruitingDate = new Date()
    fruitingDate.setDate(fruitingDate.getDate() + daysRemaining)
    return fruitingDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  }

  if (sections.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-green-600" />
          Postęp GDH do owocowania
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GDH w tunelu */}
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-700">🌡️ GDH w tunelu (od 1.01)</span>
            <span className="font-bold text-green-700">{currentGDH.toLocaleString()} / 20,000</span>
          </div>
          <div className="w-full h-4 bg-green-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, (currentGDH / 20000) * 100)}%` }}
            />
          </div>
        </div>

        {/* Sekcje */}
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 px-2">
            <span>Sekcja</span>
            <span>Typ</span>
            <span>Start</span>
            <span>GDH</span>
            <span>Owocowanie</span>
          </div>
          
          {sections.map(section => {
            const sectionGDH = getGDHForSection(section)
            const threshold = getGDHThreshold(section)
            const progress = (sectionGDH / threshold) * 100
            const fruitingDate = estimateFruitingDate(section, sectionGDH)
            
            return (
              <div key={section.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-5 gap-2 items-center text-sm mb-2">
                  <span className="font-medium truncate">{section.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${section.winteredInTunnel ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {section.winteredInTunnel ? '🏠 Zimowana' : '📦 Chłodnia'}
                  </span>
                  <span className="text-gray-600">
                    {section.winteredInTunnel ? '01.01' : section.plantingDate ? new Date(section.plantingDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                  <span className="font-medium">{sectionGDH.toLocaleString()}</span>
                  <span className="text-green-600 font-medium">{fruitingDate}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="text-right text-xs text-gray-500 mt-1">{progress.toFixed(0)}%</div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
