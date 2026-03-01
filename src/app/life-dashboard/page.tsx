'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Heart,
  BookOpen,
  Users,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from 'lucide-react'
import { defaultPillars, defaultWorkProjects } from '@/lib/life-dashboard-data'
import type { PillarData } from '@/lib/life-dashboard-data'

const pillarIcons = {
  health: Heart,
  development: BookOpen,
  relationships: Users,
  work: Briefcase,
} as const

const pillarLinks = {
  health: '/life-dashboard/health',
  development: '/life-dashboard/development',
  relationships: '/life-dashboard/relationships',
  work: '/life-dashboard/work',
} as const

const trendLabels = {
  rising: 'W górę',
  steady: 'Stabilnie',
  declining: 'Wymaga uwagi',
}

function TrendIcon({ trend }: { trend: PillarData['trend'] }) {
  if (trend === 'rising') return <TrendingUp className="w-3.5 h-3.5" />
  if (trend === 'declining') return <TrendingDown className="w-3.5 h-3.5" />
  return <Minus className="w-3.5 h-3.5" />
}

function trendColor(trend: PillarData['trend']) {
  if (trend === 'rising') return 'text-emerald-600 bg-emerald-50'
  if (trend === 'declining') return 'text-red-500 bg-red-50'
  return 'text-amber-600 bg-amber-50'
}

// Wizualizacja: Pulsujące pierścienie (Zdrowie)
function PulseRings({ score, color }: { score: number; color: string }) {
  const rings = 4
  return (
    <div className="relative w-32 h-32 mx-auto">
      {Array.from({ length: rings }).map((_, i) => {
        const ringScore = Math.min(100, score + (rings - 1 - i) * 10)
        const opacity = 0.15 + (i / rings) * 0.6
        const size = 100 - i * 18
        return (
          <div
            key={i}
            className="absolute rounded-full transition-all duration-1000"
            style={{
              width: `${size}%`,
              height: `${size}%`,
              top: `${(100 - size) / 2}%`,
              left: `${(100 - size) / 2}%`,
              border: `3px solid ${color}`,
              opacity: ringScore > 0 ? opacity : 0.05,
              animation: `pulse-ring ${2 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        )
      })}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full animate-pulse"
        style={{ backgroundColor: color }}
      />
      <style jsx>{`
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

// Wizualizacja: Rosnące książki (Rozwój)
function BookShelf({ score, color }: { score: number; color: string }) {
  const books = 7
  const filledBooks = Math.round((score / 100) * books)
  return (
    <div className="flex items-end justify-center gap-1.5 h-32">
      {Array.from({ length: books }).map((_, i) => {
        const filled = i < filledBooks
        const height = 40 + Math.random() * 40 + (filled ? 20 : 0)
        return (
          <div
            key={i}
            className="rounded-t-sm transition-all duration-700"
            style={{
              width: 14,
              height: filled ? height : 20,
              backgroundColor: filled ? color : '#e5e7eb',
              opacity: filled ? 0.7 + (i / books) * 0.3 : 0.3,
              animationDelay: `${i * 100}ms`,
            }}
          />
        )
      })}
      {score >= 80 && (
        <span className="absolute -top-1 -right-1 text-lg">✨</span>
      )}
    </div>
  )
}

// Wizualizacja: Orbitujące kropki (Relacje)
function OrbitDots({ score, color }: { score: number; color: string }) {
  const dots = 6
  const orbitRadius = score > 50 ? 30 + (100 - score) * 0.2 : 50
  return (
    <div className="relative w-32 h-32 mx-auto">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl"
      >
        ❤️
      </div>
      {Array.from({ length: dots }).map((_, i) => {
        const angle = (i / dots) * Math.PI * 2
        const x = 50 + Math.cos(angle) * orbitRadius
        const y = 50 + Math.sin(angle) * orbitRadius
        return (
          <div
            key={i}
            className="absolute w-3 h-3 rounded-full transition-all duration-1000"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: color,
              opacity: 0.4 + (i / dots) * 0.6,
              animation: `orbit ${8 + i}s linear infinite`,
            }}
          />
        )
      })}
      {/* Linie łączące */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {Array.from({ length: dots }).map((_, i) => {
          const angle = (i / dots) * Math.PI * 2
          const x = 50 + Math.cos(angle) * orbitRadius
          const y = 50 + Math.sin(angle) * orbitRadius
          return (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke={color}
              strokeWidth="0.5"
              opacity="0.2"
            />
          )
        })}
      </svg>
      <style jsx>{`
        @keyframes orbit {
          from { transform: translate(-50%, -50%) rotate(0deg) translateX(3px) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg) translateX(3px) rotate(-360deg); }
        }
      `}</style>
    </div>
  )
}

// Wizualizacja: Słupki poziome (Praca)
function StackedBars({
  score,
  color,
  projects,
}: {
  score: number
  color: string
  projects: typeof defaultWorkProjects
}) {
  return (
    <div className="space-y-3 px-2">
      {projects.map((project) => (
        <div key={project.id}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600">
              {project.emoji} {project.name}
            </span>
            <span className="font-medium" style={{ color }}>
              {project.score}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${project.score}%`,
                background: `linear-gradient(90deg, ${color}80, ${color})`,
              }}
            />
          </div>
        </div>
      ))}
      <div className="pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 font-medium">Łącznie</span>
          <span className="font-bold" style={{ color }}>
            {score}%
          </span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${score}%`,
              background: `linear-gradient(90deg, ${color}60, ${color})`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function PillarVisualization({
  pillar,
  projects,
}: {
  pillar: PillarData
  projects: typeof defaultWorkProjects
}) {
  switch (pillar.id) {
    case 'health':
      return <PulseRings score={pillar.score} color={pillar.color} />
    case 'development':
      return <BookShelf score={pillar.score} color={pillar.color} />
    case 'relationships':
      return <OrbitDots score={pillar.score} color={pillar.color} />
    case 'work':
      return (
        <StackedBars
          score={pillar.score}
          color={pillar.color}
          projects={projects}
        />
      )
    default:
      return null
  }
}

export default function LifeDashboardPage() {
  const [pillars] = useState(defaultPillars)
  const [projects] = useState(defaultWorkProjects)

  const overallScore = Math.round(
    pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length
  )

  const onTrack = pillars.filter((p) => p.score >= 70).length
  const atRisk = pillars.filter((p) => p.score >= 40 && p.score < 70).length
  const offTrack = pillars.filter((p) => p.score < 40).length

  return (
    <div className="space-y-6">
      {/* Header + overall score */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Life Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Marzec 2026 — 4 Dyscypliny Realizacji
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            Na dobrej drodze: {onTrack}
          </div>
          {atRisk > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Wymaga uwagi: {atRisk}
            </div>
          )}
          {offTrack > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Alarm: {offTrack}
            </div>
          )}
          <div className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-bold">
            {overallScore}%
          </div>
        </div>
      </div>

      {/* Pillar cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {pillars.map((pillar) => {
          const Icon = pillarIcons[pillar.id as keyof typeof pillarIcons]
          const link = pillarLinks[pillar.id as keyof typeof pillarLinks]
          return (
            <Link
              key={pillar.id}
              href={link}
              className="group block"
            >
              <div
                className="rounded-2xl border-2 p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 relative overflow-hidden"
                style={{
                  backgroundColor: pillar.bgColor,
                  borderColor: pillar.borderColor,
                }}
              >
                {/* Background glyph */}
                <div
                  className="absolute -right-4 -bottom-4 text-8xl opacity-[0.06] select-none pointer-events-none"
                >
                  {pillar.icon}
                </div>

                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${pillar.color}20` }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: pillar.color }}
                      />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-800">
                        {pillar.name}
                      </h2>
                      <div
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${trendColor(pillar.trend)}`}
                      >
                        <TrendIcon trend={pillar.trend} />
                        {trendLabels[pillar.trend]}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400 group-hover:text-gray-600 transition-colors">
                    <span className="text-xs">Szczegóły</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* WIG */}
                <p className="text-xs text-gray-500 mb-4 line-clamp-1">
                  🎯 WIG: {pillar.wig}
                </p>

                {/* Visualization */}
                <div className="relative">
                  <PillarVisualization pillar={pillar} projects={projects} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link
          href="/life-dashboard/weekly-plan"
          className="px-4 py-2 rounded-xl bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors"
        >
          🐸 Plan tygodnia
        </Link>
      </div>

      {/* Encouragement */}
      <p className="text-center text-gray-400 text-xs pt-4">
        {overallScore >= 70
          ? '🔥 Świetna robota — tak trzymaj!'
          : overallScore >= 50
            ? '💪 Dobry kierunek — skup się na żabach!'
            : '🎯 Każdy krok się liczy — zacznij od jednej rzeczy.'}
      </p>
    </div>
  )
}
