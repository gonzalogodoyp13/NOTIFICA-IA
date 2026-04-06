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

type AbogadoFilterOption = OptionItem & {
  bancoIds: string[]
  procuradorIds: string[]
}

type ProcuradorFilterOption = OptionItem & {
  abogadoIds: string[]
  bancoIds: string[]
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

function arraysMatch(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
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
        <div className="absolute z-[80] mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
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
  const [allOptions, setAllOptions] = useState<{
    abogados: AbogadoFilterOption[]
    bancos: OptionItem[]
    procuradores: ProcuradorFilterOption[]
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
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([])
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [isBoletaModalOpen, setIsBoletaModalOpen] = useState(false)
  const [numeroBoletaDraft, setNumeroBoletaDraft] = useState('')
  const selectAllRef = useRef<HTMLInputElement | null>(null)

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

        setAllOptions({
          abogados: (abogadosPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre ?? `Abogado ${item.id}`,
            bancoIds: (item.bancos ?? []).map((bancoLink: any) => String(bancoLink.banco?.id ?? bancoLink.bancoId)),
            procuradorIds: (item.procuradores ?? []).map((procurador: any) => String(procurador.id)),
          })),
          bancos: (bancosPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre,
          })),
          procuradores: (procuradoresPayload.data ?? []).map((item: any) => ({
            id: item.id,
            nombre: item.nombre,
            abogadoIds: (item.abogadoIds ?? []).map(String),
            bancoIds: (item.bancos ?? []).map((bancoLink: any) => String(bancoLink.banco?.id ?? bancoLink.bancoId)),
          })),
        })
        setOptionsLoaded(true)
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

  const availableOptions = useMemo(() => {
    const abogados = allOptions.abogados.filter(abogado => {
      if (
        filters.bancoIds.length > 0 &&
        !abogado.bancoIds.some(bancoId => filters.bancoIds.includes(bancoId))
      ) {
        return false
      }

      if (
        filters.procuradorIds.length > 0 &&
        !abogado.procuradorIds.some(procuradorId => filters.procuradorIds.includes(procuradorId))
      ) {
        return false
      }

      return true
    })

    const procuradores = allOptions.procuradores.filter(procurador => {
      if (
        filters.abogadoIds.length > 0 &&
        !procurador.abogadoIds.some(abogadoId => filters.abogadoIds.includes(abogadoId))
      ) {
        return false
      }

      if (
        filters.bancoIds.length > 0 &&
        !procurador.bancoIds.some(bancoId => filters.bancoIds.includes(bancoId))
      ) {
        return false
      }

      return true
    })

    const bancos = allOptions.bancos.filter(banco => {
      if (filters.abogadoIds.length > 0) {
        const matchesAbogado = allOptions.abogados.some(
          abogado =>
            filters.abogadoIds.includes(String(abogado.id)) &&
            abogado.bancoIds.includes(String(banco.id))
        )

        if (!matchesAbogado) {
          return false
        }
      }

      if (filters.procuradorIds.length > 0) {
        const matchesProcurador = allOptions.procuradores.some(
          procurador =>
            filters.procuradorIds.includes(String(procurador.id)) &&
            procurador.bancoIds.includes(String(banco.id))
        )

        if (!matchesProcurador) {
          return false
        }
      }

      return true
    })

    return { abogados, bancos, procuradores }
  }, [allOptions, filters.abogadoIds, filters.bancoIds, filters.procuradorIds])

  useEffect(() => {
    if (!optionsLoaded) {
      return
    }

    const availableAbogadoIds = new Set(availableOptions.abogados.map(option => String(option.id)))
    const availableBancoIds = new Set(availableOptions.bancos.map(option => String(option.id)))
    const availableProcuradorIds = new Set(availableOptions.procuradores.map(option => String(option.id)))

    setFilters(current => {
      const next = {
        ...current,
        abogadoIds: current.abogadoIds.filter(id => availableAbogadoIds.has(id)),
        bancoIds: current.bancoIds.filter(id => availableBancoIds.has(id)),
        procuradorIds: current.procuradorIds.filter(id => availableProcuradorIds.has(id)),
      }

      if (
        arraysMatch(current.abogadoIds, next.abogadoIds) &&
        arraysMatch(current.bancoIds, next.bancoIds) &&
        arraysMatch(current.procuradorIds, next.procuradorIds)
      ) {
        return current
      }

      setValidationError(validateFilters(next))
      return next
    })
  }, [availableOptions, optionsLoaded])

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

    if (selectedReceiptIds.length === 0) {
      setError('Debes seleccionar al menos un recibo para exportar.')
      return
    }

    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.get('pageSize')) {
        params.set('pageSize', String(PAGE_SIZE))
      }
      selectedReceiptIds.forEach(reciboId => params.append('reciboId', reciboId))

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

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const rowIdsSignature = useMemo(() => rows.map(row => row.reciboId).join('|'), [rows])
  const selectedRowCount = rows.filter(row => selectedReceiptIds.includes(row.reciboId)).length
  const allRowsSelected = rows.length > 0 && selectedRowCount === rows.length
  const someRowsSelected = selectedRowCount > 0 && selectedRowCount < rows.length

  useEffect(() => {
    const nextSelectedIds = rows.map(row => row.reciboId)
    setSelectedReceiptIds(current =>
      arraysMatch(current, nextSelectedIds) ? current : nextSelectedIds
    )
  }, [rowIdsSignature, rows])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someRowsSelected
    }
  }, [someRowsSelected])

  const toggleReceiptSelection = (reciboId: string) => {
    setSelectedReceiptIds(current =>
      current.includes(reciboId)
        ? current.filter(id => id !== reciboId)
        : [...current, reciboId]
    )
  }

  const toggleSelectAll = () => {
    setSelectedReceiptIds(allRowsSelected ? [] : rows.map(row => row.reciboId))
  }

  const applyReceiptUpdates = (updater: (row: ReceiptRow) => ReceiptRow) => {
    setData(current =>
      current
        ? {
            ...current,
            rows: current.rows.map(row =>
              selectedReceiptIds.includes(row.reciboId) ? updater(row) : row
            ),
          }
        : current
    )
  }

  const handleMarkPaid = async () => {
    if (selectedReceiptIds.length === 0) {
      setError('Debes seleccionar al menos un recibo.')
      return
    }

    setBulkUpdating(true)
    setError(null)

    try {
      const response = await fetch('/api/recibos/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'markPaid',
          reciboIds: selectedReceiptIds,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          (payload && typeof payload.error === 'string' && payload.error) ||
            'Error al marcar los recibos como pagados.'
        )
      }

      applyReceiptUpdates(row => ({
        ...row,
        estado: 'Pagado',
      }))
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Error al marcar los recibos como pagados.'
      )
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleAssociateBoleta = async () => {
    if (selectedReceiptIds.length === 0) {
      setError('Debes seleccionar al menos un recibo.')
      return
    }

    const numeroBoleta = numeroBoletaDraft.trim()

    if (!numeroBoleta) {
      setError('Debes ingresar un numero de boleta.')
      return
    }

    setBulkUpdating(true)
    setError(null)

    try {
      const response = await fetch('/api/recibos/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'associateBoleta',
          reciboIds: selectedReceiptIds,
          numeroBoleta,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          (payload && typeof payload.error === 'string' && payload.error) ||
            'Error al asociar el numero de boleta.'
        )
      }

      applyReceiptUpdates(row => ({
        ...row,
        numeroBoleta,
      }))
      setIsBoletaModalOpen(false)
      setNumeroBoletaDraft('')
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Error al asociar el numero de boleta.'
      )
    } finally {
      setBulkUpdating(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="page-stack mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 2xl:px-10">
        <section className="relative z-20 overflow-visible app-section p-6">
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
              <Button onClick={handleExport} disabled={exporting || loading || selectedRowCount === 0}>
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MultiSelectFilter
              label="Abogado"
              options={availableOptions.abogados}
              selectedIds={filters.abogadoIds}
              selectionNoun="abogados seleccionados"
              onToggle={value => handleMultiSelectToggle('abogadoIds', value)}
              onClear={() => handleMultiSelectClear('abogadoIds')}
            />

            <MultiSelectFilter
              label="Procurador"
              options={availableOptions.procuradores}
              selectedIds={filters.procuradorIds}
              selectionNoun="procuradores seleccionados"
              onToggle={value => handleMultiSelectToggle('procuradorIds', value)}
              onClear={() => handleMultiSelectClear('procuradorIds')}
            />

            <MultiSelectFilter
              label="Banco"
              options={availableOptions.bancos}
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

        <section className="relative z-0 mt-6 app-section overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Resultados</h2>
              <p className="text-sm text-slate-500">
                {loading
                  ? 'Cargando recibos...'
                  : `${data?.pagination.totalRows ?? 0} recibos encontrados`}
              </p>
              {!loading && rows.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {selectedRowCount} de {rows.length} recibos seleccionados para exportar.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Button
                variant="outline"
                onClick={handleMarkPaid}
                disabled={loading || bulkUpdating || selectedRowCount === 0}
              >
                {bulkUpdating ? 'Actualizando...' : 'Marcar pagado'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null)
                  setIsBoletaModalOpen(true)
                }}
                disabled={loading || bulkUpdating || selectedRowCount === 0}
              >
                Asociar Nro Boleta
              </Button>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                Total filas mostradas: {data?.summary.totalRowsShown ?? 0}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Total valor mostrado: {formatCurrency(data?.summary.totalValorShown ?? 0)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto divide-y divide-slate-200 text-[13px] leading-5">
              <thead className="bg-slate-50/90 text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allRowsSelected}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos los recibos mostrados"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
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
                    <th key={column} className="px-3 py-3 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading &&
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="animate-pulse">
                      {Array.from({ length: 14 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-3">
                          <div className="h-4 rounded bg-slate-100" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-6 py-12 text-center text-sm text-slate-500">
                      No se encontraron recibos con los filtros seleccionados.
                    </td>
                  </tr>
                )}

                {!loading &&
                  rows.map(row => (
                    <tr key={row.reciboId} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedReceiptIds.includes(row.reciboId)}
                          onChange={() => toggleReceiptSelection(row.reciboId)}
                          aria-label={`Seleccionar recibo ${row.numeroRecibo}`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-3 align-top font-medium text-blue-700">
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
                      <td className="px-3 py-3 align-top text-slate-700 whitespace-nowrap">{row.rol}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.tribunal}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.caratula}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.gestion}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.resultado}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.abogado}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.procurador}</td>
                      <td className="px-3 py-3 align-top text-slate-700">{row.banco}</td>
                      <td className="px-3 py-3 align-top font-medium text-slate-900 whitespace-nowrap">
                        {formatCurrency(row.valor)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700 whitespace-nowrap">
                        {formatDateTime(row.fechaCreacionRecibo)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            row.estado === 'Pagado'
                              ? 'bg-emerald-50 text-emerald-700'
                              : row.estado === 'Sin pagar'
                                ? 'bg-amber-50 text-amber-700'
                                : row.estado === 'Anulado'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-600',
                          ].join(' ')}
                        >
                          {row.estado}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700 whitespace-nowrap">{row.numeroBoleta}</td>
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

        {isBoletaModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/30 px-4">
            <div className="w-full max-w-xl rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="page-kicker">Recibos seleccionados</div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Asociar Nro Boleta</h3>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!bulkUpdating) {
                      setIsBoletaModalOpen(false)
                      setNumeroBoletaDraft('')
                    }
                  }}
                  disabled={bulkUpdating}
                >
                  Cerrar
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-700">
                  Los recibos seleccionados se asociaran a la boleta N°:
                </p>
                <Input
                  value={numeroBoletaDraft}
                  onChange={event => setNumeroBoletaDraft(event.target.value)}
                  placeholder="Ingresa el numero"
                  className="sm:max-w-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!bulkUpdating) {
                      setIsBoletaModalOpen(false)
                      setNumeroBoletaDraft('')
                    }
                  }}
                  disabled={bulkUpdating}
                >
                  Cancelar
                </Button>
                <Button onClick={handleAssociateBoleta} disabled={bulkUpdating}>
                  {bulkUpdating ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
