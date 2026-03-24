'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type OptionItem = {
  id: number
  nombre: string
}

type ReceiptRow = {
  reciboId: string
  rolId: string
  documentoId: string | null
  numeroRecibo: string
  rol: string
  tribunal: string
  caratula: string
  gestion: string
  resultado: string
  abogado: string
  procurador: string
  banco: string
  valor: number
  fechaCreacionRecibo: string
  estado: string
  numeroBoleta: string
}

type ReceiptPayload = {
  rows: ReceiptRow[]
  summary: {
    totalRowsShown: number
    totalValorShown: number
  }
  pagination: {
    page: number
    pageSize: number
    totalRows: number
    totalPages: number
  }
}

type FilterState = {
  procuradorId: string
  bancoId: string
  abogadoId: string
  rol: string
  fechaDesde: string
  fechaHasta: string
}

const PAGE_SIZE = 25

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CL')
}

function getDefaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 29)

  return {
    fechaDesde: start.toISOString().slice(0, 10),
    fechaHasta: end.toISOString().slice(0, 10),
  }
}

function parseFilters(searchParams: URLSearchParams): FilterState {
  return {
    procuradorId: searchParams.get('procuradorId') ?? '',
    bancoId: searchParams.get('bancoId') ?? '',
    abogadoId: searchParams.get('abogadoId') ?? '',
    rol: searchParams.get('rol') ?? '',
    fechaDesde: searchParams.get('fechaDesde') ?? '',
    fechaHasta: searchParams.get('fechaHasta') ?? '',
  }
}

function validateFilters(filters: FilterState) {
  const needsDateRange =
    Boolean(filters.procuradorId) || Boolean(filters.bancoId) || Boolean(filters.abogadoId)

  if (needsDateRange && (!filters.fechaDesde || !filters.fechaHasta)) {
    return 'Debes indicar fecha desde y fecha hasta para filtrar por procurador, banco o abogado.'
  }

  if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
    return 'La fecha desde no puede ser mayor que la fecha hasta.'
  }

  return null
}

function buildQueryString(filters: FilterState, page: number) {
  const params = new URLSearchParams()

  if (filters.procuradorId) params.set('procuradorId', filters.procuradorId)
  if (filters.bancoId) params.set('bancoId', filters.bancoId)
  if (filters.abogadoId) params.set('abogadoId', filters.abogadoId)
  if (filters.rol.trim()) params.set('rol', filters.rol.trim())
  if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde)
  if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta)
  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))

  return params.toString()
}

export default function RecibosPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const appliedFilters = useMemo(() => parseFilters(searchParams), [searchParams])
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1

  const [filters, setFilters] = useState<FilterState>(appliedFilters)
  const [options, setOptions] = useState<{
    abogados: OptionItem[]
    bancos: OptionItem[]
    procuradores: OptionItem[]
  }>({
    abogados: [],
    bancos: [],
    procuradores: [],
  })
  const [data, setData] = useState<ReceiptPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setFilters(appliedFilters)
    setValidationError(validateFilters(appliedFilters))
  }, [appliedFilters])

  useEffect(() => {
    const hasAnyFilters =
      searchParams.get('procuradorId') ||
      searchParams.get('bancoId') ||
      searchParams.get('abogadoId') ||
      searchParams.get('rol') ||
      searchParams.get('fechaDesde') ||
      searchParams.get('fechaHasta')

    if (hasAnyFilters) {
      return
    }

    const defaults = getDefaultDateRange()
    const params = new URLSearchParams(searchParams.toString())
    params.set('fechaDesde', defaults.fechaDesde)
    params.set('fechaHasta', defaults.fechaHasta)
    params.set('page', '1')
    params.set('pageSize', String(PAGE_SIZE))

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router, searchParams])

  useEffect(() => {
    let ignore = false

    async function fetchOptions() {
      try {
        const [abogadosResponse, bancosResponse, procuradoresResponse] = await Promise.all([
          fetch('/api/abogados', { credentials: 'include' }),
          fetch('/api/bancos', { credentials: 'include' }),
          fetch('/api/procuradores', { credentials: 'include' }),
        ])

        const [abogadosPayload, bancosPayload, procuradoresPayload] = await Promise.all([
          abogadosResponse.json(),
          bancosResponse.json(),
          procuradoresResponse.json(),
        ])

        if (ignore) return

        setOptions({
          abogados: (abogadosPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre ?? `Abogado ${item.id}`,
          })),
          bancos: (bancosPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre,
          })),
          procuradores: (procuradoresPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre,
          })),
        })
      } catch (fetchError) {
        console.error('Error loading receipt filters:', fetchError)
      }
    }

    fetchOptions()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function fetchRecibos() {
      const hasMeaningfulFilters =
        searchParams.get('procuradorId') ||
        searchParams.get('bancoId') ||
        searchParams.get('abogadoId') ||
        searchParams.get('rol') ||
        searchParams.get('fechaDesde') ||
        searchParams.get('fechaHasta')

      if (!hasMeaningfulFilters) {
        return
      }

      const params = new URLSearchParams(searchParams.toString())

      if (!params.get('pageSize')) {
        params.set('pageSize', String(PAGE_SIZE))
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/recibos?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => null)

        if (!response.ok || payload?.ok !== true) {
          throw new Error(
            (payload && typeof payload.error === 'string' && payload.error) ||
              'Error al cargar los recibos.'
          )
        }

        if (!ignore) {
          setData(payload.data as ReceiptPayload)
        }
      } catch (fetchError) {
        if (!ignore) {
          setError(fetchError instanceof Error ? fetchError.message : 'Error al cargar los recibos.')
          setData(null)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchRecibos()

    return () => {
      ignore = true
    }
  }, [searchParams])

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    const next = {
      ...filters,
      [key]: value,
    }

    setFilters(next)
    setValidationError(validateFilters(next))
  }

  const applyFilters = (nextPage = 1) => {
    const message = validateFilters(filters)
    setValidationError(message)

    if (message) {
      return
    }

    const queryString = buildQueryString(filters, nextPage)
    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname)
    })
  }

  const clearFilters = () => {
    const defaults = getDefaultDateRange()
    const next = {
      procuradorId: '',
      bancoId: '',
      abogadoId: '',
      rol: '',
      fechaDesde: defaults.fechaDesde,
      fechaHasta: defaults.fechaHasta,
    }

    setFilters(next)
    setValidationError(null)
    startTransition(() => {
      router.replace(`${pathname}?${buildQueryString(next, 1)}`)
    })
  }

  const handleExport = async () => {
    const currentValidation = validateFilters(appliedFilters)
    setValidationError(currentValidation)

    if (currentValidation) {
      return
    }

    setExporting(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.get('pageSize')) {
        params.set('pageSize', String(PAGE_SIZE))
      }

      const response = await fetch(`/api/recibos/export?${params.toString()}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          (payload && typeof payload.error === 'string' && payload.error) ||
            'Error al exportar los recibos.'
        )
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'gestion-recibos.xlsx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Error al exportar los recibos.')
    } finally {
      setExporting(false)
    }
  }

  const rows = data?.rows ?? []

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Gestión de Recibos
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Revisa recibos generados, filtra por responsables y exporta el resultado actual a Excel.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
              <Button onClick={handleExport} disabled={exporting || loading}>
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Procurador</span>
              <select
                value={filters.procuradorId}
                onChange={event => handleFilterChange('procuradorId', event.target.value)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Todos</option>
                {options.procuradores.map(option => (
                  <option key={option.id} value={String(option.id)}>
                    {option.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Banco</span>
              <select
                value={filters.bancoId}
                onChange={event => handleFilterChange('bancoId', event.target.value)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Todos</option>
                {options.bancos.map(option => (
                  <option key={option.id} value={String(option.id)}>
                    {option.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Abogado</span>
              <select
                value={filters.abogadoId}
                onChange={event => handleFilterChange('abogadoId', event.target.value)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Todos</option>
                {options.abogados.map(option => (
                  <option key={option.id} value={String(option.id)}>
                    {option.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Número de ROL</span>
              <Input
                value={filters.rol}
                onChange={event => handleFilterChange('rol', event.target.value)}
                placeholder="C-1234-2025"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Fecha desde</span>
              <Input
                type="date"
                value={filters.fechaDesde}
                onChange={event => handleFilterChange('fechaDesde', event.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Fecha hasta</span>
              <Input
                type="date"
                value={filters.fechaHasta}
                onChange={event => handleFilterChange('fechaHasta', event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => applyFilters(1)} disabled={loading}>
              Buscar
            </Button>
            <p className="text-xs text-slate-500">
              Procurador, Banco y Abogado requieren rango de fechas. Número de ROL puede buscarse solo.
            </p>
          </div>

          {validationError && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {validationError}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Resultados</h2>
              <p className="text-sm text-slate-500">
                {loading
                  ? 'Cargando recibos...'
                  : `${data?.pagination.totalRows ?? 0} recibos encontrados`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                Total filas mostradas: {data?.summary.totalRowsShown ?? 0}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Total valor mostrado: {formatCurrency(data?.summary.totalValorShown ?? 0)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    'Nº Recibo',
                    'ROL',
                    'Tribunal',
                    'Carátula',
                    'Gestión',
                    'Resultado',
                    'Abogado',
                    'Procurador',
                    'Banco',
                    'Valor',
                    'Fecha creación recibo',
                    'Estado',
                    'Nº Boleta',
                  ].map(column => (
                    <th key={column} className="px-4 py-3 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading &&
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="animate-pulse">
                      {Array.from({ length: 13 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-4">
                          <div className="h-4 rounded bg-slate-100" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-6 py-12 text-center text-sm text-slate-500">
                      No se encontraron recibos con los filtros seleccionados.
                    </td>
                  </tr>
                )}

                {!loading &&
                  rows.map(row => (
                    <tr key={row.reciboId} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-blue-700">
                        {row.documentoId ? (
                          <a
                            href={`/api/documentos/${row.documentoId}/download?mode=inline`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {row.numeroRecibo}
                          </a>
                        ) : (
                          row.numeroRecibo
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{row.rol}</td>
                      <td className="px-4 py-4 text-slate-700">{row.tribunal}</td>
                      <td className="px-4 py-4 text-slate-700">{row.caratula}</td>
                      <td className="px-4 py-4 text-slate-700">{row.gestion}</td>
                      <td className="px-4 py-4 text-slate-700">{row.resultado}</td>
                      <td className="px-4 py-4 text-slate-700">{row.abogado}</td>
                      <td className="px-4 py-4 text-slate-700">{row.procurador}</td>
                      <td className="px-4 py-4 text-slate-700">{row.banco}</td>
                      <td className="px-4 py-4 font-medium text-slate-900">
                        {formatCurrency(row.valor)}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {formatDateTime(row.fechaCreacionRecibo)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            row.estado === 'Pagado'
                              ? 'bg-emerald-50 text-emerald-700'
                              : row.estado === 'No pagado'
                                ? 'bg-amber-50 text-amber-700'
                                : row.estado === 'Anulado'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-600',
                          ].join(' ')}
                        >
                          {row.estado}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{row.numeroBoleta}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
            <div>
              Página {data?.pagination.page ?? page} de {data?.pagination.totalPages ?? 1}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => applyFilters(Math.max(page - 1, 1))}
                disabled={loading || page <= 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  applyFilters(
                    Math.min(page + 1, data?.pagination.totalPages ?? page + 1)
                  )
                }
                disabled={loading || page >= (data?.pagination.totalPages ?? 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
