'use client'

interface LogDiffModalProps {
  isOpen: boolean
  onClose: () => void
  diff: any
  tabla: string
  accion: string
}

export default function LogDiffModal({
  isOpen,
  onClose,
  diff,
  tabla,
  accion,
}: LogDiffModalProps) {
  if (!isOpen) return null

  const formatJSON = (obj: any): string => {
    try {
      return JSON.stringify(obj, null, 2)
    } catch {
      return String(obj)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Detalle de Cambios
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {tabla} - {accion}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 overflow-auto flex-1">
          {diff ? (
            <div className="space-y-4">
              {diff.input && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Input (Datos Enviados):
                  </h3>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-x-auto">
                    <code>{formatJSON(diff.input)}</code>
                  </pre>
                </div>
              )}
              {diff.result && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Result (Resultado):
                  </h3>
                  <pre className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs overflow-x-auto">
                    <code>{formatJSON(diff.result)}</code>
                  </pre>
                </div>
              )}
              {!diff.input && !diff.result && (
                <div className="text-center py-8 text-gray-500">
                  <p>No hay datos de diferencia disponibles</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No hay información de diferencia disponible</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

