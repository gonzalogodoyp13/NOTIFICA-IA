// Dashboard page component
// Protected route - authentication handled by (protected) layout
import { getSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Get session (layout already verified authentication)
  const session = await getSession()
  
  if (!session) {
    return null // Layout will redirect
  }

  // Dashboard action cards
  const dashboardActions = [
    {
      id: 'agregar-demanda',
      title: 'Agregar Demanda',
      description: 'Registra una nueva demanda en el sistema',
      href: '/demandas/nueva',
      icon: '📝',
      disabled: false,
    },
    {
      id: 'gestionar-demandas',
      title: 'Gestionar Demandas',
      description: 'Visualiza y administra todas tus demandas',
      href: '/roles',
      icon: '📋',
      disabled: false,
    },
    {
      id: 'ajustes-oficina',
      title: 'Ajustes de Oficina',
      description: 'Configura los parámetros de tu oficina',
      href: '/ajustes',
      icon: '⚙️',
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
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl mb-4">
              Panel de Control
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Bienvenido, {session.email}. Este es tu panel de control de NOTIFICA IA
            </p>
          </div>

          {/* Dashboard action cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {dashboardActions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-center group hover:shadow-lg transition-shadow"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                  {action.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {action.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  {action.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

