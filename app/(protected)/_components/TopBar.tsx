'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, FileText, Settings, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function TopBar() {
  const router = useRouter()
  const [searchValue, setSearchValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchValue.trim()) {
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(`/api/roles/search?rol=${encodeURIComponent(searchValue.trim())}`, {
        credentials: 'include',
      })

      const data = await response.json()

      if (data.ok && data.data) {
        // Redirect to the role page
        router.push(`/roles/${data.data.id}`)
        setSearchValue('') // Clear search after successful redirect
      } else if (data.error === 'NOT_FOUND') {
        const searchedRol = searchValue.trim()
        router.push(`/roles/no-encontrado?rol=${encodeURIComponent(searchedRol)}`)
      } else {
        // Show error message
        setError(data.message || 'Error al buscar el rol')
      }
    } catch (err) {
      console.error('Error searching for rol:', err)
      setError('Error al buscar el rol. Intenta nuevamente.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex h-16 min-w-0 items-center justify-between gap-4">
            {/* Left side: Navigation links with icons */}
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 md:flex-none md:justify-start md:gap-4 lg:gap-6">
              <Link
                href="/dashboard"
                aria-label="Inicio"
                className="flex shrink-0 items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                <Home className="h-5 w-5" />
                <span className="hidden lg:inline">Inicio</span>
              </Link>
              <Link
                href="/roles"
                aria-label="Gestionar Demandas"
                className="flex shrink-0 items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                <FileText className="h-5 w-5" />
                <span className="hidden lg:inline">Gestionar Demandas</span>
              </Link>
              <Link
                href="/recibos"
                aria-label="Gestión de Recibos"
                className="flex shrink-0 items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                <FileText className="h-5 w-5" />
                <span className="hidden lg:inline">Gestión de Recibos</span>
              </Link>
              <Link
                href="/ajustes"
                aria-label="Ajustes de oficina"
                className="flex shrink-0 items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                <Settings className="h-5 w-5" />
                <span className="hidden lg:inline">Ajustes de oficina</span>
              </Link>
            </div>

            {/* Right side: Search bar */}
            <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex md:max-w-md">
              <Input
                type="text"
                aria-label="Buscar ROL exacto"
                placeholder="C-1234-2025"
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value)
                  setError(null) // Clear error when typing
                }}
                onKeyDown={handleKeyDown}
                className="flex-1"
                disabled={isSearching}
              />
              <Button
                aria-label="Buscar ROL"
                onClick={handleSearch}
                disabled={isSearching || !searchValue.trim()}
                size="default"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error message below the bar */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 py-2">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}
    </>
  )
}

