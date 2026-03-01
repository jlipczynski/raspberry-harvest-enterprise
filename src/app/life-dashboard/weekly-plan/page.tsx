'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Filter,
} from 'lucide-react'
import {
  defaultTasks,
  defaultPillars,
  DAYS_OF_WEEK,
} from '@/lib/life-dashboard-data'
import type { TaskItem, DayOfWeek } from '@/lib/life-dashboard-data'

const priorityConfig = {
  frog: { label: '🐸 Żaba', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
  important: { label: '⚡ Ważne', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700' },
  nice: { label: '✨ Miłe', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-600' },
}

const pillarColors: Record<string, string> = {
  health: '#22c55e',
  development: '#8b5cf6',
  relationships: '#ec4899',
  work: '#f59e0b',
}

const pillarNames: Record<string, string> = {
  health: 'Zdrowie',
  development: 'Rozwój',
  relationships: 'Relacje',
  work: 'Praca',
}

type FilterType = 'all' | DayOfWeek | string

export default function WeeklyPlanPage() {
  const [tasks, setTasks] = useState<TaskItem[]>(defaultTasks)
  const [filter, setFilter] = useState<FilterType>('all')

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t))
    )
  }

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true
    if (DAYS_OF_WEEK.includes(filter as DayOfWeek)) return task.day === filter
    return task.pillar === filter
  })

  // Sort: frogs first, then important, then nice; within priority undone first
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const priorityOrder = { frog: 0, important: 1, nice: 2 }
    if (a.done !== b.done) return a.done ? 1 : -1
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  const totalPoints = tasks.reduce((s, t) => s + t.points, 0)
  const earnedPoints = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0)
  const frogsEaten = tasks.filter((t) => t.priority === 'frog' && t.done).length
  const totalFrogs = tasks.filter((t) => t.priority === 'frog').length
  const completedCount = tasks.filter((t) => t.done).length

  return (
    <div className="space-y-6">
      {/* Header */}
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
          🐸 Plan tygodnia — Zjedz tę żabę
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm text-center">
          <div className="text-2xl font-bold text-gray-800">
            {earnedPoints}/{totalPoints}
          </div>
          <div className="text-xs text-gray-500">Punkty</div>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            🐸 {frogsEaten}/{totalFrogs}
          </div>
          <div className="text-xs text-red-500">Żaby zjedzone</div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {completedCount}/{tasks.length}
          </div>
          <div className="text-xs text-emerald-500">Ukończone</div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {Math.round((earnedPoints / totalPoints) * 100) || 0}%
          </div>
          <div className="text-xs text-amber-500">Postęp</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-emerald-500"
          style={{
            width: `${totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Wszystko
        </button>
        {/* Day filters */}
        {DAYS_OF_WEEK.map((day) => (
          <button
            key={day}
            onClick={() => setFilter(day)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === day
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {day.slice(0, 3)}
          </button>
        ))}
        <div className="h-4 w-px bg-gray-200" />
        {/* Pillar filters */}
        {defaultPillars.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === p.id
                ? 'text-white'
                : 'text-gray-500 hover:opacity-80'
            }`}
            style={{
              backgroundColor:
                filter === p.id ? p.color : `${p.color}15`,
              color: filter === p.id ? 'white' : p.color,
            }}
          >
            {p.icon} {p.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {sortedTasks.map((task) => {
          const cfg = priorityConfig[task.priority]
          return (
            <div
              key={task.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                task.done
                  ? 'bg-gray-50 border-gray-100 opacity-60'
                  : `${cfg.bgColor} ${cfg.borderColor}`
              }`}
            >
              <button
                onClick={() => toggleTask(task.id)}
                className="mt-0.5 shrink-0"
              >
                {task.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 hover:text-gray-400" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      task.done
                        ? 'text-gray-400 line-through'
                        : 'text-gray-800'
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.textColor} ${cfg.bgColor}`}
                  >
                    {cfg.label}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: `${pillarColors[task.pillar]}15`,
                      color: pillarColors[task.pillar],
                    }}
                  >
                    {pillarNames[task.pillar]}
                  </span>
                  {task.project && (
                    <span className="text-[10px] text-gray-400">
                      {task.project === 'owoc-malinowi'
                        ? '🍓 Owoc Malinowi'
                        : task.project === 'gr-lipczynski'
                          ? '🌾 GR Lipczyński'
                          : '📋 Inne'}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {task.day}
                  </span>
                  {task.delegatedTo && (
                    <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                      <Users className="w-3 h-3" />
                      {task.delegatedTo}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold text-amber-600">
                  {task.points}
                </span>
                <span className="text-[10px] text-gray-400 block">pkt</span>
              </div>
            </div>
          )
        })}
      </div>

      {sortedTasks.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <p className="text-lg">Brak zadań dla tego filtra</p>
        </div>
      )}

      {/* Motivation */}
      {frogsEaten === totalFrogs && totalFrogs > 0 && (
        <div className="text-center py-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <p className="text-lg">🎉 Wszystkie żaby zjedzone!</p>
          <p className="text-sm text-emerald-600">Świetna robota!</p>
        </div>
      )}
    </div>
  )
}
