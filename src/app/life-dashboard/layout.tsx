'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarCheck,
  Heart,
  Briefcase,
  BookOpen,
  Users,
  Leaf,
  ArrowLeft,
} from 'lucide-react'

const navItems = [
  { title: 'Przegląd', href: '/life-dashboard', icon: LayoutDashboard },
  { title: 'Zdrowie', href: '/life-dashboard/health', icon: Heart },
  { title: 'Praca', href: '/life-dashboard/work', icon: Briefcase },
  { title: 'Rozwój', href: '/life-dashboard/development', icon: BookOpen },
  { title: 'Relacje', href: '/life-dashboard/relationships', icon: Users },
  { title: 'Plan tygodnia', href: '/life-dashboard/weekly-plan', icon: CalendarCheck },
]

export default function LifeDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#FBF8F4]">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-amber-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center justify-between">
            {/* Logo and back link */}
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <Leaf className="w-3.5 h-3.5" />
                Farma
              </Link>
              <div className="h-5 w-px bg-gray-200" />
              <h1 className="font-semibold text-gray-800 text-sm">
                Life Dashboard
              </h1>
            </div>

            {/* Nav items */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/life-dashboard' &&
                    pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-amber-50 text-amber-800 font-medium'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Mobile nav */}
            <nav className="flex md:hidden items-center gap-0.5 overflow-x-auto">
              {navItems.slice(0, 4).map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/life-dashboard' &&
                    pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`p-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-amber-50 text-amber-800'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
