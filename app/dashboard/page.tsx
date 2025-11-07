// Dashboard page component
// Protected route that requires authentication via requireSession()
import { requireSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Require authentication - redirects to /signin if not logged in
  const session = await requireSession()

  const dashboardCards = [
    {
      id: 'agregar-demanda',
      title: 'Agregar Demanda',
      description: 'Crear una nueva demanda en el sistema',
      icon: '🧾',
      href: '/demandas/nueva',
      disabled: false,
    },
    {
      id: 'gestionar-demandas',
      title: 'Gestionar Demandas',
      description: 'Ver y administrar todas las demandas',
      icon: '⚖️',
      href: '/roles',
      disabled: false,
    },
    {
      id: 'ajustes-oficina',
      title: 'Ajustes de Oficina',
      description: 'Configurar parámetros y datos maestros',
      icon: '🏢',
      href: '/ajustes',
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
              Bienvenido, {session.email}
            </h1>
            <p className="text-gray-600">
              Este es tu panel de control de NOTIFICA IA
            </p>
          </div>

          {/* Dashboard cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardCards.map((card) => {
              if (card.disabled) {
                return (
                  <div
                    key={card.id}
                    className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-center group relative cursor-not-allowed opacity-60"
                  >
                    <div className="text-5xl mb-4">{card.icon}</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {card.title}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {card.description}
                    </p>
                  </div>
                )
              }

              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-gray-200 p-6 text-center group"
                >
                  <div className="text-5xl mb-4">{card.icon}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                    {card.title}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {card.description}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

