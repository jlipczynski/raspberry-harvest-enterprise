'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Target,
  CheckCircle2,
  Circle,
  Clock,
  Users,
} from 'lucide-react'
import {
  defaultWorkProjects,
  defaultTasks,
} from '@/lib/life-dashboard-data'
import type { WorkProject, TaskItem } from '@/lib/life-dashboard-data'

function ProjectCard({ project, tasks }: { project: WorkProject; tasks: TaskItem[] }) {
  const projectTasks = tasks.filter((t) => t.project === project.id)
  const doneTasks = projectTasks.filter((t) => t.done)
  const totalPoints = projectTasks.reduce((s, t) => s + t.points, 0)
  const earnedPoints = doneTasks.reduce((s, t) => s + t.points, 0)
  const pct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{project.emoji}</span>
          <h3 className="font-semibold text-gray-800">{project.name}</h3>
        </div>
        <span className="text-sm font-bold text-amber-600">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #fbbf2480, #f59e0b)',
          }}
        />
      </div>

      {/* WIG */}
      <div className="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5 text-amber-500" />
        WIG: {project.id === 'owoc-malinowi'
          ? 'Zwiększyć marżę o 15% w Q2'
          : project.id === 'gr-lipczynski'
            ? 'Rozliczyć cele z zespołem farmy'
            : 'Projekty bieżące'}
      </div>

      {/* Tasks */}
      <div className="space-y-2">
        {projectTasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
              task.done ? 'bg-gray-50' : 'hover:bg-gray-50'
            }`}
          >
            {task.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${
                  task.done
                    ? 'text-gray-400 line-through'
                    : 'text-gray-700'
                }`}
              >
                {task.priority === 'frog' && '🐸 '}
                {task.priority === 'important' && '⚡ '}
                {task.title}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {task.day}
                </span>
                {task.delegatedTo && (
                  <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                    <Users className="w-3 h-3" />
                    {task.delegatedTo}
                  </span>
                )}
                <span className="text-[10px] text-amber-500 font-medium">
                  {task.points} pkt
                </span>
              </div>
            </div>
          </div>
        ))}
        {projectTasks.length === 0 && (
          <p className="text-xs text-gray-300 text-center py-4">
            Brak zadań — dodaj z planu tygodnia
          </p>
        )}
      </div>

      {/* Summary */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>
          {doneTasks.length}/{projectTasks.length} zadań
        </span>
        <span>
          {earnedPoints}/{totalPoints} pkt
        </span>
      </div>
    </div>
  )
}

export default function WorkPage() {
  const [projects] = useState<WorkProject[]>(defaultWorkProjects)
  const [tasks] = useState<TaskItem[]>(
    defaultTasks.filter((t) => t.pillar === 'work')
  )

  const totalPoints = tasks.reduce((s, t) => s + t.points, 0)
  const earnedPoints = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0)
  const overallPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
  const frogsEaten = tasks.filter(
    (t) => t.priority === 'frog' && t.done
  ).length
  const totalFrogs = tasks.filter((t) => t.priority === 'frog').length

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
        <h1 className="text-xl font-bold text-gray-900">🏢 Praca</h1>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{overallPct}%</div>
          <div className="text-xs text-amber-600">Postęp ogólny</div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-700">
            {earnedPoints}/{totalPoints}
          </div>
          <div className="text-xs text-emerald-600">Punkty</div>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            🐸 {frogsEaten}/{totalFrogs}
          </div>
          <div className="text-xs text-red-500">Żaby zjedzone</div>
        </div>
      </div>

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} tasks={tasks} />
        ))}
      </div>

      {/* Link to weekly plan */}
      <div className="text-center pt-2">
        <Link
          href="/life-dashboard/weekly-plan"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors"
        >
          🐸 Zarządzaj zadaniami w planie tygodnia
        </Link>
      </div>
    </div>
  )
}
