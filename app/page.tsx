// Homepage component
// Landing page for NOTIFICA IA
export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
            Bienvenido a NOTIFICA IA
          </h1>
          <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Sistema de gestión para Oficinas Receptoras
          </p>
          
          {/* Status Card */}
          <div className="mt-12 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Estado del Sistema
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">API:</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Conectado
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Base de Datos:</span>
                <span className="text-gray-500 dark:text-gray-500 font-medium">
                  Configurar
                </span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">
            <p>Phase 0 - Esqueleto inicial listo para desarrollo</p>
          </div>
        </div>
      </div>
    </div>
  )
}

