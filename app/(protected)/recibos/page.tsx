'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

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
  abogadoIds: string[]
  procuradorIds: string[]
  bancoIds: string[]
  rol: string
  fechaDesde: string
  fechaHasta: string
}

type MultiSelectFilterProps = {
  label: string
  options: OptionItem[]
  selectedIds: string[]
  emptyLabel?: string
  selectionNoun: string
  onToggle: (value: string) => void
  onClear: () => void
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
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-CL')
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
    abogadoIds: searchParams.getAll('abogadoId'),
    procuradorIds: searchParams.getAll('procuradorId'),
    bancoIds: searchParams.getAll('bancoId'),
    rol: searchParams.get('rol') ?? '',
    fechaDesde: searchParams.get('fechaDesde') ?? '',
    fechaHasta: searchParams.get('fechaHasta') ?? '',
  }
}

function validateFilters(filters: FilterState) {
  const needsDateRange =
    filters.abogadoIds.length > 0 ||
    filters.procuradorIds.length > 0 ||
    filters.bancoIds.length > 0

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

  filters.abogadoIds.forEach(value => params.append('abogadoId', value))
  filters.procuradorIds.forEach(value => params.append('procuradorId', value))
  filters.bancoIds.forEach(value => params.append('bancoId', value))
  if (filters.rol.trim()) params.set('rol', filters.rol.trim())
  if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde)
  if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta)
  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))

  return params.toString()
}

function MultiSelectFilter({
  label,
  options,
  selectedIds,
  emptyLabel = 'Todos',
  selectionNoun,
  onToggle,
  onClear,
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const selectedLabels = useMemo(() => {
    const namesById = new Map(options.map(option => [String(option.id), option.nombre]))
    return selectedIds.map(value => namesById.get(value)).filter((value): value is string => Boolean(value))
  }, [options, selectedIds])

  const triggerLabel =
    selectedLabels.length === 0
      ? emptyLabel
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} ${selectionNoun}`

  return (
    <div ref={rootRef} className="relative space-y-2 text-sm text-slate-700">
      <span className="block font-medium">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
            <p className="text-xs text-slate-500">
              {selectedIds.length === 0 ? 'Sin filtros aplicados' : `${selectedIds.length} seleccionados`}
            </p>
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-blue-600 transition hover:text-blue-700"
            >
              Limpiar
            </button>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {options.map(option => {
              const value = String(option.id)
              const checked = selectedIds.includes(value)

              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(value)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="truncate text-sm text-slate-700">{option.nombre}</span>
                </label>
              )
            })}

            {options.length === 0 && (
              <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                No hay opciones disponibles.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
      searchParams.getAll('abogadoId').length > 0 ||
      searchParams.getAll('procuradorId').length > 0 ||
      searchParams.getAll('bancoId').length > 0 ||
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
        searchParams.getAll('abogadoId').length > 0 ||
        searchParams.getAll('procuradorId').length > 0 ||
        searchParams.getAll('bancoId').length > 0 ||
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

  const handleTextFilterChange = (key: 'rol' | 'fechaDesde' | 'fechaHasta', value: string) => {
    const next = {
      ...filters,
      [key]: value,
    }

    setFilters(next)
    setValidationError(validateFilters(next))
  }

  const handleMultiSelectToggle = (key: 'abogadoIds' | 'procuradorIds' | 'bancoIds', value: string) => {
    const currentValues = filters[key]
    const nextValues = currentValues.includes(value)
      ? currentValues.filter(item => item !== value)
      : [...currentValues, value]

    const next = {
      ...filters,
      [key]: nextValues,
    }

    setFilters(next)
    setValidationError(validateFilters(next))
  }

  const handleMultiSelectClear = (key: 'abogadoIds' | 'procuradorIds' | 'bancoIds') => {
    const next = {
      ...filters,
      [key]: [],
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
      abogadoIds: [],
      procuradorIds: [],
      bancoIds: [],
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
    <div className="app-shell">
      <div className="page-frame page-stack">
        <section className="app-section p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="page-kicker">Recibos</div>
              <h1 className="page-title">Gestion de Recibos</h1>
              <p className="page-copy">
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
            <MultiSelectFilter
              label="Abogado"
              options={options.abogados}
              selectedIds={filters.abogadoIds}
              selectionNoun="abogados seleccionados"
              onToggle={value => handleMultiSelectToggle('abogadoIds', value)}
              onClear={() => handleMultiSelectClear('abogadoIds')}
            />

            <MultiSelectFilter
              label="Procurador"
              options={options.procuradores}
              selectedIds={filters.procuradorIds}
              selectionNoun="procuradores seleccionados"
              onToggle={value => handleMultiSelectToggle('procuradorIds', value)}
              onClear={() => handleMultiSelectClear('procuradorIds')}
            />

            <MultiSelectFilter
              label="Banco"
              options={options.bancos}
              selectedIds={filters.bancoIds}
              selectionNoun="bancos seleccionados"
              onToggle={value => handleMultiSelectToggle('bancoIds', value)}
              onClear={() => handleMultiSelectClear('bancoIds')}
            />

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Numero de ROL</span>
              <Input
                value={filters.rol}
                onChange={event => handleTextFilterChange('rol', event.target.value)}
                placeholder="C-1234-2025"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Fecha desde</span>
              <Input
                type="date"
                value={filters.fechaDesde}
                onChange={event => handleTextFilterChange('fechaDesde', event.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Fecha hasta</span>
              <Input
                type="date"
                value={filters.fechaHasta}
                onChange={event => handleTextFilterChange('fechaHasta', event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => applyFilters(1)} disabled={loading}>
              Buscar
            </Button>
            <p className="text-xs text-slate-500">
              Procurador, Banco y Abogado requieren rango de fechas. Numero de ROL puede buscarse solo.
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

        <section className="mt-6 app-section overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-6 py-4">
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
              <thead className="bg-slate-50/90 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  {[
                    'Nro Recibo',
                    'ROL',
                    'Tribunal',
                    'Caratula',
                    'Gestion',
                    'Resultado',
                    'Abogado',
                    'Procurador',
                    'Banco',
                    'Valor',
                    'Fecha creacion recibo',
                    'Estado',
                    'Nro Boleta',
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
                    <tr key={row.reciboId} className="hover:bg-slate-50/80">
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
              Pagina {data?.pagination.page ?? page} de {data?.pagination.totalPages ?? 1}
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
