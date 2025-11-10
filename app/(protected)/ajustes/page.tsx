// Ajustes de Oficina - Hub page
// Main configuration hub with cards for each configuration area
// Protected route - authentication handled by (protected) layout
import { getSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  // Get session (layout already verified authentication)
  const session = await getSession()
  
  if (!session) {
    return null // Layout will redirect
  }

  const configAreas = [
    {
      id: 'materias',
      title: 'Gestionar Materias',
      description: 'Configurar materias legales',
      icon: '📚',
      href: '/ajustes/materias',
      disabled: false,
    },
    {
      id: 'abogados',
      title: 'Gestionar Abogados',
      description: 'Administrar abogados asociados',
      icon: '👨‍⚖️',
      href: '/ajustes/abogados',
      disabled: false,
    },
    {
      id: 'tribunales',
      title: 'Gestionar Tribunales',
      description: 'Gestionar tribunales del sistema',
      icon: '⚖️',
      href: '/ajustes/tribunales',
      disabled: false,
    },
    {
      id: 'diligencias',
      title: 'Gestionar Diligencias',
      description: 'Configurar tipos de diligencias',
      icon: '📋',
      href: '/ajustes/diligencias',
      disabled: false,
    },
    {
      id: 'comunas',
      title: 'Gestionar Comunas',
      description: 'Administrar comunas disponibles',
      icon: '🗺️',
      href: '/ajustes/comunas',
      disabled: false,
    },
    {
      id: 'bancos',
      title: 'Gestionar Bancos',
      description: 'Configurar bancos del sistema',
      icon: '🏦',
      href: '/ajustes/bancos',
      disabled: false,
    },
    {
      id: 'estampos',
      title: 'Gestionar Estampos',
      description: 'Configurar estampos (Fase 5)',
      icon: '🖨️',
      href: '/ajustes/estampos',
      disabled: false,
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      {/* Main content area with padding for fixed topbar */}
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Ajustes de Oficina
            </h1>
            <p className="text-gray-600">
              Configura los parámetros y datos maestros de tu oficina
            </p>
          </div>

          {/* Configuration cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {configAreas.map((area) => (
              <Link
                key={area.id}
                href={area.href}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-gray-200 p-6 text-center group"
              >
                <div className="text-5xl mb-4">{area.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                  {area.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  {area.description}
                </p>
              </Link>
            ))}
          </div>

          {/* Back to dashboard link */}
          <div className="mt-8 text-center">
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver al Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

