import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { type RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'
import EjecutadoSelector from './EjecutadoSelector'

interface RolOverviewProps {
  rolData?: RolWorkspaceData
  isRolLoading: boolean
  isRolError: boolean
  rolId: string
}

const cards: Array<{
  label: string
  getValue: (data: RolWorkspaceData['kpis']) => number
}> = [
  { label: 'Diligencias totales', getValue: kpis => kpis.diligenciasTotal },
  { label: 'Diligencias pendientes', getValue: kpis => kpis.diligenciasPendientes },
  { label: 'Diligencias completadas', getValue: kpis => kpis.diligenciasCompletadas },
  { label: 'Documentos', getValue: kpis => kpis.documentosTotal },
  { label: 'Notas registradas', getValue: kpis => kpis.notasTotal },
  { label: 'Recibos', getValue: kpis => kpis.recibosTotal },
]

export default function RolOverview({ rolData, isRolLoading, isRolError, rolId }: RolOverviewProps) {
  const kpis = rolData?.kpis
  const hasActivity =
    !!rolData &&
    (rolData.resumen.diligencias.length > 0 ||
      rolData.resumen.documentos.length > 0 ||
      rolData.resumen.notas.length > 0 ||
      rolData.resumen.recibos.length > 0)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Resumen del ROL</h2>
        <div className="flex items-center gap-2">
          {!isRolLoading && rolData?.demanda && (
            <Link
              href={`/roles/${rolId}/editar`}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Editar Demanda
            </Link>
          )}
          {isRolLoading && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
              Cargando...
            </span>
          )}
        </div>
      </header>

      {isRolError && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No fue posible obtener el resumen. Intenta recargar la página.
        </p>
      )}

      {/* Ficha del ROL */}
      {!isRolLoading && !isRolError && rolData?.demanda && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Ficha del ROL</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Carátula / Demandante */}
            <div>
              <p className="text-xs text-slate-500">Carátula / Demandante</p>
              <p className="font-medium text-slate-900">
                {rolData.demanda.caratula ?? '—'}
              </p>
            </div>

            {/* Tribunal */}
            <div>
              <p className="text-xs text-slate-500">Tribunal</p>
              <p className="font-medium text-slate-900">
                {rolData.tribunal?.nombre ?? '—'}
              </p>
            </div>

            {/* Materia */}
            <div>
              <p className="text-xs text-slate-500">Materia</p>
              <p className="font-medium text-slate-900">
                {rolData.demanda.materia?.nombre ?? '—'}
              </p>
            </div>

            {/* Cuantía */}
            <div>
              <p className="text-xs text-slate-500">Cuantía</p>
              <p className="font-medium text-slate-900">
                {rolData.demanda.cuantia
                  ? new Intl.NumberFormat('es-CL', {
                      style: 'currency',
                      currency: 'CLP',
                    }).format(rolData.demanda.cuantia)
                  : '—'}
              </p>
            </div>

            {/* Abogado */}
            <div>
              <p className="text-xs text-slate-500">Abogado</p>
              <p className="font-medium text-slate-900">
                {rolData.abogado?.nombre ?? '—'}
              </p>
            </div>

            {/* Banco del abogado */}
            <div>
              <p className="text-xs text-slate-500">Banco</p>
              <p className="font-medium text-slate-900">
                {rolData.abogado?.banco?.nombre ?? '—'}
              </p>
            </div>
          </div>

          {/* Ejecutados */}
          {rolData.demanda.ejecutados && rolData.demanda.ejecutados.length > 0 && (
            <EjecutadoSelector ejecutados={rolData.demanda.ejecutados} />
          )}
        </div>
      )}

      {!isRolLoading && !isRolError && kpis && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-100 bg-slate-50 p-4 shadow-inner"
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {card.getValue(kpis)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isRolLoading && !isRolError && !hasActivity && (
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Sin actividades registradas todavía. Las diligencias, documentos, notas y recibos
          aparecerán aquí a medida que se avanza con el caso.
        </p>
      )}

      {!isRolLoading && !isRolError && hasActivity && rolData && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TimelinePreview title="Últimas diligencias" items={rolData.resumen.diligencias}>
            {item => (
              <div key={item.id} className="flex flex-col gap-1 text-sm text-slate-600">
                <div className="font-medium text-slate-800">{item.tipo.nombre}</div>
                <div className="text-xs text-slate-500">
                  Fecha: {new Date(item.fecha).toLocaleDateString('es-CL')}
                </div>
                <div className="text-xs capitalize text-slate-500">Estado: {item.estado}</div>
              </div>
            )}
          </TimelinePreview>

          <TimelinePreview title="Documentos recientes" items={rolData.resumen.documentos}>
            {doc => (
              <div key={doc.id} className="flex flex-col gap-1 text-sm text-slate-600">
                <div className="font-medium text-slate-800">{doc.nombre}</div>
                <div className="text-xs text-slate-500">
                  Tipo: {doc.tipo} · v{doc.version}
                </div>
                <div className="text-xs text-slate-500">
                  Creado: {new Date(doc.createdAt).toLocaleString('es-CL')}
                </div>
              </div>
            )}
          </TimelinePreview>
        </div>
      )}
    </section>
  )
}

interface TimelinePreviewProps<T> {
  title: string
  items: T[]
  children: (item: T) => ReactNode
}

function TimelinePreview<T>({ title, items, children }: TimelinePreviewProps<T>) {
  const sample = items.slice(0, 3)
  const resolveKey = (item: T, index: number) => {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const maybeId = record.id
      if (typeof maybeId === 'string' || typeof maybeId === 'number') {
        return String(maybeId)
      }
    }

    return `item-${index}`
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {sample.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Sin registros todavía.</p>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          {sample.map((item, index) => (
            <Fragment key={resolveKey(item, index)}>{children(item)}</Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

