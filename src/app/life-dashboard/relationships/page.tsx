'use client'

import Link from 'next/link'
import { ArrowLeft, Target, Heart, Calendar, CheckCircle2, Circle } from 'lucide-react'

const goals = [
  { text: 'Randka z partnerką', frequency: '2x/miesiąc', done: 1, target: 2 },
  { text: 'Kolacja rodzinna', frequency: '1x/tydzień', done: 3, target: 4 },
  { text: 'Spotkanie z przyjaciółmi', frequency: '2x/miesiąc', done: 1, target: 2 },
  { text: 'Telefon do rodziców', frequency: '1x/tydzień', done: 2, target: 4 },
]

const upcomingDates = [
  { event: 'Randka — kolacja w mieście', date: '2026-03-07', emoji: '🍷' },
  { event: 'Urodziny mamy', date: '2026-03-15', emoji: '🎂' },
  { event: 'Spotkanie z kolegami z branży', date: '2026-03-22', emoji: '🤝' },
]

export default function RelationshipsPage() {
  return (
    <div className="space-y-6">
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
          ❤️ Partnerstwo i Relacje
        </h1>
      </div>

      {/* WIG */}
      <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-4 flex items-center gap-3">
        <Target className="w-5 h-5 text-pink-600" />
        <span className="text-sm font-medium text-gray-800">
          WIG: Regularne randki — minimum 2 razy w miesiącu
        </span>
      </div>

      {/* Relationship goals */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4" />
          Cele relacyjne — marzec
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {goals.map((goal) => {
            const pct = Math.round((goal.done / goal.target) * 100)
            const complete = goal.done >= goal.target
            return (
              <div
                key={goal.text}
                className={`rounded-xl border p-4 transition-colors ${
                  complete
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-gray-100 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  {complete ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <h3
                      className={`text-sm font-medium ${
                        complete ? 'text-emerald-700' : 'text-gray-800'
                      }`}
                    >
                      {goal.text}
                    </h3>
                    <p className="text-[10px] text-gray-400">{goal.frequency}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background: complete
                              ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                              : 'linear-gradient(90deg, #f9a8d4, #ec4899)',
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          complete ? 'text-emerald-600' : 'text-pink-500'
                        }`}
                      >
                        {goal.done}/{goal.target}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming dates */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Nadchodzące wydarzenia
        </h2>
        <div className="space-y-2">
          {upcomingDates.map((item) => (
            <div
              key={item.event}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <span className="text-xl">{item.emoji}</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-800">
                  {item.event}
                </h3>
                <p className="text-xs text-gray-400">{item.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
