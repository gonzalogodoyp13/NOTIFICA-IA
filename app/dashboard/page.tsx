// Dashboard page component
// Protected route that requires authentication via requireSession()
import { requireSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Require authentication - redirects to /login if not logged in
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      {/* Main content area with padding for fixed topbar */}
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Greeting */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-gray-900 mb-2">
              Hola, {session.email} 👋
            </h2>
            <p className="text-gray-600">
              Bienvenido a tu panel de control
            </p>
          </div>

          {/* Main action cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Card 1: Agregar Demanda */}
            <Link
              href="/dashboard/agregar"
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-gray-200 p-8 text-center group"
            >
              <div className="text-5xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                Agregar Demanda
              </h3>
              <p className="text-gray-600 text-sm">
                Crear una nueva demanda
              </p>
            </Link>

            {/* Card 2: Gestionar Demandas */}
            <Link
              href="/dashboard/gestionar"
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-gray-200 p-8 text-center group"
            >
              <div className="text-5xl mb-4">📂</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                Gestionar Demandas
              </h3>
              <p className="text-gray-600 text-sm">
                Ver y administrar tus demandas
              </p>
            </Link>

            {/* Card 3: Ajustes de Oficina */}
            <Link
              href="/dashboard/ajustes"
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer border border-gray-200 p-8 text-center group"
            >
              <div className="text-5xl mb-4">⚙️</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                Ajustes de Oficina
              </h3>
              <p className="text-gray-600 text-sm">
                Configurar tu oficina
              </p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

