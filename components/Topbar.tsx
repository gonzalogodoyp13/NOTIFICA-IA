// Topbar component for NOTIFICA IA Dashboard
// Fixed top navigation bar with branding, user info, and logout
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileText, Home, Landmark, LogOut, Receipt, UserCircle2 } from 'lucide-react'
import InstallAppButton from '@/components/InstallAppButton'
import { Button } from '@/components/ui/button'

interface UserData {
  email: string
}

const links = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/roles', label: 'Demandas', icon: FileText },
  { href: '/recibos', label: 'Recibos', icon: Receipt },
]

export default function Topbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data = await response.json()
          setUser({ email: data.email })
        } else {
          router.push('/login')
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [router])

  const handleLogout = async () => {
    try {
      await fetch('/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Error during logout:', error)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/80 bg-white/72 backdrop-blur-xl">
      <div className="page-frame">
        <div className="flex min-h-[5rem] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.8)]">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Gestion Judicial
              </div>
              <div className="truncate text-lg font-semibold tracking-tight text-slate-950">
                NOTIFICA IA
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm md:flex">
            {links.map(link => {
              const Icon = link.icon
              const isActive =
                pathname === link.href ||
                (link.href !== '/dashboard' && pathname.startsWith(link.href))

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {loading ? (
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm">
                Cargando...
              </span>
            ) : user ? (
              <>
                <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 shadow-sm lg:flex">
                  <UserCircle2 className="h-4 w-4 text-slate-500" />
                  <span className="max-w-[220px] truncate text-sm font-medium text-slate-700">
                    {user.email}
                  </span>
                </div>
                <InstallAppButton />
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="gap-2 rounded-full px-3 py-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar Sesion
                </Button>
              </>
            ) : (
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm">
                No autenticado
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
