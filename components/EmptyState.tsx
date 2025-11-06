// EmptyState component
// Displays a centered message when there are no rows to show
interface EmptyStateProps {
  icon?: string
  title?: string
  message?: string
}

export default function EmptyState({
  icon = '📋',
  title = 'No hay registros',
  message = 'No se encontraron registros para mostrar.',
}: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">{icon}</div>
      <p className="text-gray-600 text-lg font-medium mb-2">{title}</p>
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  )
}

