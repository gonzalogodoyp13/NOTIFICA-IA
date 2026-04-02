import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { FileText, NotebookPen, Receipt, Scale, TimerReset } from 'lucide-react'
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
  icon: typeof Scale
}> = [
  { label: 'Diligencias totales', getValue: kpis => kpis.diligenciasTotal, icon: Scale },
  { label: 'Diligencias pendientes', getValue: kpis => kpis.diligenciasPendientes, icon: TimerReset },
  { label: 'Diligencias completadas', getValue: kpis => kpis.diligenciasCompletadas, icon: TimerReset },
  { label: 'Documentos', getValue: kpis => kpis.documentosTotal, icon: FileText },
  { label: 'Notas registradas', getValue: kpis => kpis.notasTotal, icon: NotebookPen },
  { label: 'Recibos', getValue: kpis => kpis.recibosTotal, icon: Receipt },
]

export default function RolOverview({ rolData, isRolLoading, isRolError, rolId }: RolOverviewProps) {
  const bancoLabel =
    rolData?.demanda?.caratula
      ? rolData.demanda.caratula
      : rolData?.abogado?.bancos && rolData.abogado.bancos.length > 0
      ? rolData.abogado.bancos[0].banco.nombre
      : 'Sin dato'

  const kpis = rolData?.kpis
  const hasActivity =
    !!rolData &&
    (rolData.resumen.diligencias.length > 0 ||
      rolData.resumen.documentos.length > 0 ||
      rolData.resumen.notas.length > 0 ||
      rolData.resumen.recibos.length > 0)

  return (
    <section className="app-panel p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="page-kicker">Resumen operativo</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Resumen del ROL
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!isRolLoading && rolData?.demanda && (
            <Link
              href={`/roles/${rolId}/editar`}
              className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_36px_-20px_rgba(29,78,216,0.75)] hover:bg-blue-800"
            >
              Editar Demanda
            </Link>
          )}
          {isRolLoading && (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
              Cargando...
            </span>
          )}
        </div>
      </header>

      {isRolError && (
        <p className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          No fue posible obtener el resumen. Intenta recargar la pagina.
        </p>
      )}

      {!isRolLoading && !isRolError && rolData?.demanda && (
        <div className="mt-6 app-panel-muted p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ficha del ROL
          </h3>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetaBlock label="Caratula / Demandante" value={rolData.demanda.caratula ?? 'Sin dato'} />
            <MetaBlock label="Tribunal" value={rolData.tribunal?.nombre ?? 'Sin dato'} />
            <MetaBlock label="Materia" value={rolData.demanda.materia?.nombre ?? 'Sin dato'} />
            <MetaBlock
              label="Cuantia"
              value={
                rolData.demanda.cuantia
                  ? new Intl.NumberFormat('es-CL', {
                      style: 'currency',
                      currency: 'CLP',
                    }).format(rolData.demanda.cuantia)
                  : 'Sin dato'
              }
            />
            <MetaBlock label="Abogado" value={rolData.abogado?.nombre ?? 'Sin dato'} />
            <MetaBlock label="Banco" value={bancoLabel} />
            <MetaBlock label="Procurador" value={rolData.demanda?.procurador?.nombre ?? 'Sin dato'} />
          </div>

          {rolData.demanda.ejecutados && rolData.demanda.ejecutados.length > 0 && (
            <div className="mt-6 rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <EjecutadoSelector ejecutados={rolData.demanda.ejecutados} />
            </div>
          )}
        </div>
      )}

      {!isRolLoading && !isRolError && kpis && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className="app-panel-muted p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {card.label}
                  </div>
                  <div className="rounded-2xl bg-slate-900 p-2 text-white">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                  {card.getValue(kpis)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isRolLoading && !isRolError && !hasActivity && (
        <p className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Sin actividades registradas todavia. Las diligencias, documentos, notas y recibos
          apareceran aqui a medida que se avanza con el caso.
        </p>
      )}

      {!isRolLoading && !isRolError && hasActivity && rolData && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TimelinePreview title="Ultimas diligencias" items={rolData.resumen.diligencias}>
            {item => (
              <div key={item.id} className="flex flex-col gap-1 text-sm text-slate-600">
                <div className="font-medium text-slate-900">{item.tipo.nombre}</div>
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
                <div className="font-medium text-slate-900">{doc.nombre}</div>
                <div className="text-xs text-slate-500">
                  Tipo: {doc.tipo} - v{doc.version}
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

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
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
    <div className="app-panel-muted p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      {sample.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin registros todavia.</p>
      ) : (
        <div className="mt-4 space-y-3 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
          {sample.map((item, index) => (
            <Fragment key={resolveKey(item, index)}>{children(item)}</Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
