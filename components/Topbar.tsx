// Topbar component for NOTIFICA IA Dashboard
// Fixed top navigation bar with branding, user info, and logout
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InstallAppButton from '@/components/InstallAppButton'

interface UserData {
  email: string
}

export default function Topbar() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch user data from /api/user/me
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data = await response.json()
          setUser({ email: data.email })
        } else {
          // If unauthorized, redirect to login
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Inicio button */}
          <Link
            href="/dashboard"
            className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Inicio
          </Link>

          {/* Center: App logo/title */}
          <div className="flex-1 flex justify-center">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">NOTIFICA IA</h1>
          </div>

          {/* Right: User email, install button, and logout button */}
          <div className="flex items-center gap-2 sm:gap-4">
            {loading ? (
              <span className="text-xs sm:text-sm text-gray-500">Cargando...</span>
            ) : user ? (
              <>
                <span className="text-xs sm:text-sm text-gray-700 hidden sm:inline truncate max-w-[150px] lg:max-w-none">
                  {user.email}
                </span>
                <InstallAppButton />
                <button
                  onClick={handleLogout}
                  className="text-xs sm:text-sm text-gray-700 hover:text-gray-900 font-medium transition-colors px-2 sm:px-3 py-1.5 rounded-md hover:bg-gray-100 whitespace-nowrap"
                >
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <span className="text-xs sm:text-sm text-gray-500">No autenticado</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

