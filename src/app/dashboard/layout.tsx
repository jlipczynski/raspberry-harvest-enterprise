'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from "@/components/ui/button"
import { 
  LayoutDashboard, 
  Calendar,
  Map, 
  Leaf, 
  Cloud, 
  Users, 
  BarChart3,
  Settings,
  Menu,
  X,
  Database,
  LogOut,
  Shield,
  ChevronDown
} from 'lucide-react'

const menuItems = [
  { title: 'Panel główny', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Planowanie', href: '/dashboard/planning', icon: Calendar },
  { title: 'Plantacja', href: '/dashboard/plantation', icon: Map },
  { title: 'Odmiany', href: '/dashboard/varieties', icon: Leaf },
  { title: 'Pogoda & GDH', href: '/dashboard/weather', icon: Cloud },
  { title: 'Baza krzywych', href: '/dashboard/templates', icon: Database },
  { title: 'Pracownicy', href: '/dashboard/workers', icon: Users },
  { title: 'Raporty', href: '/dashboard/reports', icon: BarChart3 },
  { title: 'Ustawienia', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const tenantName = (session?.user as any)?.tenantName

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-gradient-to-b from-green-600 to-green-700 hidden lg:flex lg:flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-green-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Leaf className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white">Planer Zbiorów</h1>
              <p className="text-xs text-green-200">Maliny</p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="p-3 space-y-1 flex-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-white text-green-700 font-medium shadow-sm' 
                    : 'text-green-100 hover:bg-white/10'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-green-600' : ''}`} />
                <span>{item.title}</span>
              </Link>
            )
          })}
          
          {/* Admin panel link - only for SUPER_ADMIN */}
          {role === 'SUPER_ADMIN' && (
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mt-4 border-t border-green-500 pt-4 ${
                pathname.startsWith('/dashboard/admin')
                  ? 'bg-amber-400 text-amber-900 font-medium shadow-sm'
                  : 'text-amber-200 hover:bg-white/10'
              }`}
            >
              <Shield className={`w-5 h-5 ${pathname.startsWith('/dashboard/admin') ? 'text-amber-700' : ''}`} />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t border-green-500">
          {session?.user && (
            <div className="px-3 py-2">
              <p className="text-white text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-green-200 text-xs truncate">{tenantName || session.user.email}</p>
              <p className="text-green-300/60 text-[10px] mt-0.5">{role === 'SUPER_ADMIN' ? 'Super Admin' : 'Zarządca'}</p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-green-200 hover:bg-white/10 w-full transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Wyloguj</span>
          </button>
          <p className="text-green-400/40 text-[9px] text-center mt-2">Enterprise Beta</p>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gradient-to-r from-green-600 to-green-700 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white">Planer Zbiorów</span>
        </div>
        <div className="flex items-center gap-2">
          {session?.user && <span className="text-green-200 text-xs">{(session.user.name || '').split(' ')[0]}</span>}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-64 bg-gradient-to-b from-green-600 to-green-700 lg:hidden flex flex-col">
            <nav className="p-3 space-y-1 flex-1">
              {menuItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-white text-green-700 font-medium' 
                        : 'text-green-100 hover:bg-white/10'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-green-600' : ''}`} />
                    <span>{item.title}</span>
                  </Link>
                )
              })}
              {role === 'SUPER_ADMIN' && (
                <Link href="/dashboard/admin" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-200 hover:bg-white/10 mt-4 border-t border-green-500 pt-4">
                  <Shield className="w-5 h-5" /><span>Admin Panel</span>
                </Link>
              )}
            </nav>
            <div className="p-3 border-t border-green-500">
              <button onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-green-200 hover:bg-white/10 w-full text-sm">
                <LogOut className="w-4 h-4" /><span>Wyloguj</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="lg:ml-64 pt-14 lg:pt-0">
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
