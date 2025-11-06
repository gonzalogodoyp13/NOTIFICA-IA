// GenericTable component
// Reusable table with search, pagination, and CRUD actions
'use client'

import { useState, useMemo, useEffect } from 'react'

export interface Column<T> {
  key: keyof T | string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
}

interface GenericTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  isLoading?: boolean
  emptyMessage?: string
  searchPlaceholder?: string
}

const ITEMS_PER_PAGE = 10

function GenericTable<T extends { id: number }>({
  columns,
  rows,
  onEdit,
  onDelete,
  isLoading = false,
  emptyMessage = 'No hay registros para mostrar',
  searchPlaceholder = 'Buscar...',
}: GenericTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Filter rows based on search term
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows

    const term = searchTerm.toLowerCase()
    return rows.filter((row) => {
      return columns.some((col) => {
        const value = col.key as keyof T
        const cellValue = row[value]
        if (cellValue === null || cellValue === undefined) return false
        return String(cellValue).toLowerCase().includes(term)
      })
    })
  }, [rows, searchTerm, columns])

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedRows = filteredRows.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  )

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
        <div className="text-center py-12">
          <div className="text-gray-500">Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Search bar */}
      {rows.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete) && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onEdit || onDelete ? 1 : 0)}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {columns.map((col, idx) => {
                    const cellValue = row[col.key as keyof T]
                    return (
                      <td
                        key={idx}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                      >
                        {col.render
                          ? col.render(cellValue as unknown, row)
                          : String(cellValue ?? '')}
                      </td>
                    )
                  })}
                  {(onEdit || onDelete) && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="text-blue-600 hover:text-blue-900 font-medium transition-colors"
                          >
                            Editar
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  '¿Estás seguro de que deseas eliminar este registro?'
                                )
                              ) {
                                onDelete(row)
                              }
                            }}
                            className="text-red-600 hover:text-red-900 font-medium transition-colors"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Mostrando {startIndex + 1} a{' '}
            {Math.min(startIndex + ITEMS_PER_PAGE, filteredRows.length)} de{' '}
            {filteredRows.length} registros
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GenericTable
