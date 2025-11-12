'use client'

interface LogRowProps {
  log: {
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
  }
  onViewDetail: (log: any) => void
}

export default function LogRow({ log, onViewDetail }: LogRowProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getActionBadgeColor = (accion: string) => {
    switch (accion.toUpperCase()) {
      case 'CREATE':
        return 'bg-green-100 text-green-800'
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800'
      case 'DELETE':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-200">
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatDate(log.createdAt)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {log.user?.email || log.userId || 'SYSTEM'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
        {log.tabla}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(
            log.accion
          )}`}
        >
          {log.accion}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {log.office?.nombre || `Oficina #${log.officeId}`}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onViewDetail(log)}
          className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
        >
          Ver detalle
        </button>
      </td>
    </tr>
  )
}

