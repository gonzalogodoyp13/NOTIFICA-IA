'use client'

import { useState } from 'react'

interface LogFilterBarProps {
  onFilter: (filters: {
    userId?: string
    tabla?: string
    accion?: string
    from?: string
    to?: string
  }) => void
  loading?: boolean
}

export default function LogFilterBar({ onFilter, loading }: LogFilterBarProps) {
  const [filters, setFilters] = useState({
    userId: '',
    tabla: '',
    accion: '',
    from: '',
    to: '',
  })

  const handleChange = (field: string, value: string) => {
    const newFilters = { ...filters, [field]: value }
    setFilters(newFilters)
  }

  const handleApply = () => {
    const cleanFilters: any = {}
    if (filters.userId) cleanFilters.userId = filters.userId
    if (filters.tabla) cleanFilters.tabla = filters.tabla
    if (filters.accion) cleanFilters.accion = filters.accion
    if (filters.from) cleanFilters.from = filters.from
    if (filters.to) cleanFilters.to = filters.to
    onFilter(cleanFilters)
  }

  const handleClear = () => {
    const emptyFilters = {
      userId: '',
      tabla: '',
      accion: '',
      from: '',
      to: '',
    }
    setFilters(emptyFilters)
    onFilter({})
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Usuario ID
          </label>
          <input
            type="text"
            value={filters.userId}
            onChange={(e) => handleChange('userId', e.target.value)}
            placeholder="Filtrar por usuario"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Módulo
          </label>
          <input
            type="text"
            value={filters.tabla}
            onChange={(e) => handleChange('tabla', e.target.value)}
            placeholder="Ej: Comuna, Abogado..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Acción
          </label>
          <select
            value={filters.accion}
            onChange={(e) => handleChange('accion', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={loading}
          >
            <option value="">Todas</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Desde
          </label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => handleChange('from', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => handleChange('to', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={loading}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleApply}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
        >
          {loading ? 'Aplicando...' : 'Aplicar Filtros'}
        </button>
        <button
          onClick={handleClear}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm disabled:opacity-50"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}

