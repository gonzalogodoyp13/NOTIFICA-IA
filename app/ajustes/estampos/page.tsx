// Gestionar Estampos page
// Placeholder page for managing stamps (Phase 5)
import { requireSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function EstamposPage() {
  // Require authentication - redirects to /login if not logged in
  const session = await requireSession()

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      {/* Main content area with padding for fixed topbar */}
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestionar Estampos
              </h1>
              <p className="text-gray-600">
                Configura los estampos para documentos PDF (Fase 5)
              </p>
            </div>
            <button
              disabled
              className="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed font-medium"
            >
              + Agregar
            </button>
          </div>

          {/* Placeholder table/empty state */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🖨️</div>
              <p className="text-gray-600 text-lg mb-2">
                Funcionalidad no disponible aún.
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Esta funcionalidad estará disponible en <strong>Fase 5 – PDF y Estampos</strong>.
              </p>
            </div>
          </div>

          {/* Back links */}
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/ajustes"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver a Ajustes
            </Link>
            <span className="text-gray-400">•</span>
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

