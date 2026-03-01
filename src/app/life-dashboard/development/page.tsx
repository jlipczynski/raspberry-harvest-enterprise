'use client'

import Link from 'next/link'
import { ArrowLeft, Target, BookOpen, Clock, CheckCircle2, Circle } from 'lucide-react'

const books = [
  { title: 'Atomic Habits', author: 'James Clear', progress: 100, done: true },
  { title: '4 Dyscypliny Realizacji', author: 'McChesney, Covey, Huling', progress: 65, done: false },
  { title: 'Deep Work', author: 'Cal Newport', progress: 20, done: false },
  { title: 'Zjedz tę żabę', author: 'Brian Tracy', progress: 0, done: false },
]

const habits = [
  { name: 'Czytanie 30 min rano', frequency: 'Codziennie', thisWeek: 4, target: 7 },
  { name: 'Journaling wieczorny', frequency: 'Codziennie', thisWeek: 3, target: 7 },
  { name: 'Podcast biznesowy', frequency: '3x/tydzień', thisWeek: 2, target: 3 },
  { name: 'Kurs online', frequency: '2x/tydzień', thisWeek: 1, target: 2 },
]

export default function DevelopmentPage() {
  const booksRead = books.filter((b) => b.done).length
  const booksTarget = 4

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
        <h1 className="text-xl font-bold text-gray-900">📚 Rozwój Osobisty</h1>
      </div>

      {/* WIG */}
      <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 flex items-center gap-3">
        <Target className="w-5 h-5 text-purple-600" />
        <div>
          <span className="text-sm font-medium text-gray-800">
            WIG: Przeczytać {booksTarget} książki biznesowe w Q1
          </span>
          <span className="text-xs text-purple-500 ml-2">
            {booksRead}/{booksTarget} ukończone
          </span>
        </div>
      </div>

      {/* Book shelf */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Lista lektur Q1
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {books.map((book) => (
            <div
              key={book.title}
              className={`rounded-xl border p-4 transition-colors ${
                book.done
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-white border-gray-100 shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {book.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-sm font-medium ${
                      book.done ? 'text-emerald-700' : 'text-gray-800'
                    }`}
                  >
                    {book.title}
                  </h3>
                  <p className="text-xs text-gray-400">{book.author}</p>
                  {!book.done && book.progress > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-400"
                          style={{ width: `${book.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 mt-0.5 inline-block">
                        {book.progress}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Habits */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Nawyki rozwojowe — ten tydzień
        </h2>
        <div className="space-y-3">
          {habits.map((habit) => {
            const pct = Math.round((habit.thisWeek / habit.target) * 100)
            return (
              <div
                key={habit.name}
                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-gray-800">
                      {habit.name}
                    </h3>
                    <span className="text-[10px] text-gray-400">
                      {habit.frequency}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-purple-600">
                    {habit.thisWeek}/{habit.target}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: pct >= 100
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : 'linear-gradient(90deg, #c084fc, #8b5cf6)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
