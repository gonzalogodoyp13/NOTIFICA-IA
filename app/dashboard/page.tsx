// Dashboard page component
// Protected route that requires authentication via requireSession()
import { requireSession } from '@/lib/auth-server'

export default async function DashboardPage() {
  // Require authentication - redirects to /signin if not logged in
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
            Bienvenido, {session.email}
          </h1>
          <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Este es tu panel de control de NOTIFICA IA
          </p>

          {/* Dashboard content placeholder */}
          <div className="mt-12 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Dashboard
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Aquí irá el contenido del dashboard en futuras versiones.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

