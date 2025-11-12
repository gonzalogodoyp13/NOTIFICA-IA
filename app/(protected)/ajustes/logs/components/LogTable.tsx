'use client'

import LogRow from './LogRow'

interface LogTableProps {
  logs: Array<{
    id: number
    userId: string
    officeId: number
    tabla: string
    accion: string
    diff: any
    createdAt: string
    user: {
      id: string
      email: string
    } | null
    office: {
      id: number
      nombre: string
    } | null
  }>
  loading?: boolean
  onViewDetail: (log: any) => void
}

export default function LogTable({
  logs,
  loading,
  onViewDetail,
}: LogTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
        <div className="text-center py-12">
          <p className="text-gray-600">Cargando registros de auditoría...</p>
        </div>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-600 text-lg">
            Sin registros encontrados.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Los registros aparecerán aquí cuando se realicen cambios en el sistema.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Módulo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acción
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Oficina
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} onViewDetail={onViewDetail} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-gray-200">
        {logs.map((log) => (
          <div key={log.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{log.tabla}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {new Date(log.createdAt).toLocaleString('es-CL')}
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  log.accion === 'CREATE'
                    ? 'bg-green-100 text-green-800'
                    : log.accion === 'UPDATE'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {log.accion}
              </span>
            </div>
            <div className="text-xs text-gray-600 space-y-1 mb-3">
              <p>
                <span className="font-medium">Usuario:</span>{' '}
                {log.user?.email || log.userId || 'SYSTEM'}
              </p>
              <p>
                <span className="font-medium">Oficina:</span>{' '}
                {log.office?.nombre || `Oficina #${log.officeId}`}
              </p>
            </div>
            <button
              onClick={() => onViewDetail(log)}
              className="w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              Ver detalle
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

