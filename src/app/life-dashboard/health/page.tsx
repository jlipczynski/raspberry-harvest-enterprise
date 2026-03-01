'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Bike,
  Dumbbell,
  Flame,
  PersonStanding,
  Trophy,
  Target,
} from 'lucide-react'
import {
  defaultHealthGoals,
  defaultSportWeek,
} from '@/lib/life-dashboard-data'
import type { HealthGoals, SportWeek } from '@/lib/life-dashboard-data'

function ProgressRing({
  current,
  target,
  color,
  size = 80,
  label,
}: {
  current: number
  target: number
  color: string
  size?: number
  label: string
}) {
  const pct = Math.min(100, (current / target) * 100)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

function MonthlyGoalCard({
  icon: Icon,
  label,
  current,
  target,
  unit,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  current: number
  target: number
  unit: string
  color: string
}) {
  const pct = Math.min(100, (current / target) * 100)
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-gray-900">{current}</span>
        <span className="text-sm text-gray-400">/ {target} {unit}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
          }}
        />
      </div>
      <span className="text-xs text-gray-400 mt-1 inline-block">
        {Math.round(pct)}% celu
      </span>
    </div>
  )
}

function GymGrid({ week }: { week: SportWeek[] }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Dumbbell className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold text-gray-800">Siłownia</h3>
      </div>
      <div className="grid grid-cols-7 gap-2 mb-3">
        {week.map((day) => (
          <div key={day.short} className="text-center">
            <span className="text-[10px] text-gray-400 block mb-1">
              {day.short}
            </span>
            <div
              className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-sm transition-colors ${
                day.gym
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-300'
              }`}
            >
              {day.gym ? '✓' : '–'}
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500">
        Ten tydzień:{' '}
        <span className="font-medium text-emerald-600">
          {week.filter((d) => d.gym).length}x
        </span>{' '}
        (cel: 3x/tydzień)
      </div>
    </div>
  )
}

function RunningBars({ week }: { week: SportWeek[] }) {
  const maxKm = Math.max(...week.map((d) => d.runningKm), 1)
  const totalKm = week.reduce((s, d) => s + d.runningKm, 0)
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <PersonStanding className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-800">Bieganie</h3>
      </div>
      <div className="flex items-end gap-2 h-24 mb-3">
        {week.map((day) => (
          <div key={day.short} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center" style={{ height: 72 }}>
              <div
                className="w-full max-w-5 rounded-t-md transition-all duration-700"
                style={{
                  height: `${day.runningKm > 0 ? (day.runningKm / maxKm) * 100 : 4}%`,
                  backgroundColor:
                    day.runningKm > 0 ? '#3b82f6' : '#e5e7eb',
                }}
              />
            </div>
            <span className="text-[10px] text-gray-400">{day.short}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500">
        Tydzień: <span className="font-medium text-blue-600">{totalKm} km</span>
      </div>
    </div>
  )
}

function CyclingBars({ week }: { week: SportWeek[] }) {
  const [showHours, setShowHours] = useState(false)
  const maxVal = Math.max(
    ...week.map((d) => (showHours ? d.cyclingHours : d.cyclingKm)),
    1
  )
  const total = week.reduce(
    (s, d) => s + (showHours ? d.cyclingHours : d.cyclingKm),
    0
  )
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bike className="w-5 h-5 text-orange-600" />
          <h3 className="font-semibold text-gray-800">Rower</h3>
        </div>
        <button
          onClick={() => setShowHours(!showHours)}
          className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
        >
          {showHours ? 'godz → km' : 'km → godz'}
        </button>
      </div>
      <div className="flex items-end gap-2 h-24 mb-3">
        {week.map((day) => {
          const val = showHours ? day.cyclingHours : day.cyclingKm
          return (
            <div key={day.short} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full flex items-end justify-center"
                style={{ height: 72 }}
              >
                <div
                  className="w-full max-w-5 rounded-t-md transition-all duration-700"
                  style={{
                    height: `${val > 0 ? (val / maxVal) * 100 : 4}%`,
                    backgroundColor: val > 0 ? '#f97316' : '#e5e7eb',
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{day.short}</span>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-gray-500">
        Tydzień:{' '}
        <span className="font-medium text-orange-600">
          {showHours ? `${total.toFixed(1)} godz` : `${total} km`}
        </span>
      </div>
    </div>
  )
}

function CalorieBudget({ week }: { week: SportWeek[] }) {
  const maxAbs = Math.max(...week.map((d) => Math.abs(d.calorieBalance)), 1)
  const weekTotal = week.reduce((s, d) => s + d.calorieBalance, 0)
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-red-500" />
        <h3 className="font-semibold text-gray-800">
          Bilans kaloryczny (aktywne kalorie)
        </h3>
      </div>
      <div className="space-y-2 mb-4">
        {week.map((day) => {
          const isDeficit = day.calorieBalance <= 0
          const width = (Math.abs(day.calorieBalance) / maxAbs) * 50
          return (
            <div key={day.short} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-8">{day.short}</span>
              <div className="flex-1 relative h-4">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200" />
                {/* Bar */}
                <div
                  className="absolute top-0.5 h-3 rounded-sm transition-all duration-700"
                  style={{
                    width: `${width}%`,
                    backgroundColor: isDeficit ? '#22c55e' : '#f97316',
                    ...(isDeficit
                      ? { right: '50%' }
                      : { left: '50%' }),
                  }}
                />
              </div>
              <span
                className={`text-[10px] w-12 text-right font-medium ${
                  isDeficit ? 'text-emerald-600' : 'text-orange-500'
                }`}
              >
                {day.calorieBalance > 0 ? '+' : ''}
                {day.calorieBalance}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-3">
        <span className="text-gray-500">Tydzień łącznie</span>
        <span
          className={`font-bold ${
            weekTotal <= 0 ? 'text-emerald-600' : 'text-orange-500'
          }`}
        >
          {weekTotal > 0 ? '+' : ''}
          {weekTotal} kcal
        </span>
      </div>
      <p className="text-[10px] text-gray-300 mt-2">
        Dane: MyFitnessPal / Garmin · zawsze aktywne kalorie
      </p>
    </div>
  )
}

export default function HealthPage() {
  const [goals] = useState<HealthGoals>(defaultHealthGoals)
  const [week] = useState<SportWeek[]>(defaultSportWeek)

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link
          href="/life-dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrót
        </Link>
        <div className="h-5 w-px bg-gray-200" />
        <h1 className="text-xl font-bold text-gray-900">
          💪 Zdrowie i Fitness
        </h1>
      </div>

      {/* Monthly goals */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Cele na marzec 2026
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MonthlyGoalCard
            icon={Flame}
            label="Aktywne kalorie"
            current={goals.activeCalories.current}
            target={goals.activeCalories.target}
            unit="kcal"
            color="#ef4444"
          />
          <MonthlyGoalCard
            icon={Bike}
            label="Rower (km)"
            current={goals.cyclingKm.current}
            target={goals.cyclingKm.target}
            unit="km"
            color="#f97316"
          />
          <MonthlyGoalCard
            icon={PersonStanding}
            label="Bieganie"
            current={goals.runningKm.current}
            target={goals.runningKm.target}
            unit="km"
            color="#3b82f6"
          />
          <MonthlyGoalCard
            icon={Dumbbell}
            label="Siłownia"
            current={goals.gymSessions.current}
            target={goals.gymSessions.targetPerMonth}
            unit="sesji"
            color="#22c55e"
          />
        </div>
      </div>

      {/* Competition */}
      {goals.competition && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-600" />
          <div>
            <span className="text-sm font-medium text-gray-800">
              {goals.competition.name}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {goals.competition.date}
            </span>
          </div>
        </div>
      )}

      {/* Sport areas */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3">
          Ten tydzień
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GymGrid week={week} />
          <RunningBars week={week} />
          <CyclingBars week={week} />
        </div>
      </div>

      {/* Calorie budget */}
      <CalorieBudget week={week} />

      {/* Progress rings summary */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-600 mb-4">
          Postęp celów miesięcznych
        </h2>
        <div className="flex items-center justify-around">
          <ProgressRing
            current={goals.activeCalories.current}
            target={goals.activeCalories.target}
            color="#ef4444"
            label="Kalorie"
          />
          <ProgressRing
            current={goals.cyclingKm.current}
            target={goals.cyclingKm.target}
            color="#f97316"
            label="Rower"
          />
          <ProgressRing
            current={goals.runningKm.current}
            target={goals.runningKm.target}
            color="#3b82f6"
            label="Bieganie"
          />
          <ProgressRing
            current={goals.gymSessions.current}
            target={goals.gymSessions.targetPerMonth}
            color="#22c55e"
            label="Siłownia"
          />
        </div>
      </div>
    </div>
  )
}
