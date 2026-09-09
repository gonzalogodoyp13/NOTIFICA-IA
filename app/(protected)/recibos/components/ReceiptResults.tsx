'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { ChevronDown } from 'lucide-react'

export type ReceiptRow = {
  reciboId: string
  rolId: string
  documentoId: string | null
  numeroRecibo: string
  rol: string
  tribunal: string
  caratula: string
  gestion: string
  estampoTemplate: string
  estampoTemplateKey: string | null
  resultado: string
  abogado: string
  procurador: string
  banco: string
  valor: number
  fechaRecibo: string
  fechaEjecucion: string | null
  fechaPago: string | null
  estado: 'Pagado' | 'Sin pagar'
  numeroBoleta: string
}

type Props = {
  rows: ReceiptRow[]
  loading: boolean
  allPageSelected: boolean
  somePageSelected: boolean
  selectAllRef: RefObject<HTMLInputElement>
  onTogglePage: () => void
  isSelected: (id: string) => boolean
  onToggleRow: (id: string) => void
}

const formatCurrency = (value: number) => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(value)

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
  : '-'

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value || '-'}</dd></div>
}

export default function ReceiptResults({ rows, loading, allPageSelected, somePageSelected, selectAllRef, onTogglePage, isSelected, onToggleRow }: Props) {
  const mobileSelectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (mobileSelectAllRef.current) mobileSelectAllRef.current.indeterminate = somePageSelected
    if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected
  }, [selectAllRef, somePageSelected])

  return <>
    <div className="lg:hidden" data-testid="receipt-card-results">
      <label className="my-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
        <input ref={mobileSelectAllRef} type="checkbox" checked={allPageSelected} onChange={onTogglePage} className="h-5 w-5 rounded border-slate-300" />
        Seleccionar esta página
      </label>
      {!loading && rows.length === 0 && <div className="py-16 text-center text-sm text-slate-500">No se encontraron recibos con estos filtros.</div>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {rows.map(row => {
          const selected = isSelected(row.reciboId)
          return <article key={row.reciboId} className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition ${selected ? 'border-blue-500 ring-1 ring-blue-100' : 'border-slate-200'}`}>
            <div className="flex min-w-0 items-start gap-3">
              <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-slate-50" aria-label={`Seleccionar recibo ${row.numeroRecibo}`}>
                <input type="checkbox" checked={selected} onChange={() => onToggleRow(row.reciboId)} className="h-5 w-5 rounded border-slate-300" />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><div className="break-words text-base font-semibold text-blue-900">{row.numeroRecibo}</div><div className="mt-0.5 break-words text-xs font-medium text-slate-500">ROL {row.rol}</div></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${row.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{row.estado}</span>
                </div>
                <div className="mt-3 break-words text-sm font-semibold text-slate-950">{formatCurrency(row.valor)}</div>
              </div>
            </div>

            <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-3 gap-y-4">
              <Detail label="Carátula" value={row.caratula} />
              <Detail label="Gestión" value={row.gestion} />
              <Detail label="N° de boleta" value={row.numeroBoleta} />
              <Detail label="Fecha de ejecución" value={formatDate(row.fechaEjecucion)} />
            </dl>

            <details className="group mt-4 border-t border-slate-100 pt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-1 text-sm font-semibold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                Ver detalles
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-4 rounded-xl bg-slate-50 p-3">
                <Detail label="Tribunal" value={row.tribunal} />
                <Detail label="Estampo" value={row.estampoTemplate} />
                <Detail label="Resultado" value={row.resultado} />
                <Detail label="Abogado" value={row.abogado} />
                <Detail label="Procurador" value={row.procurador} />
                <Detail label="Banco" value={row.banco} />
                <Detail label="Fecha del recibo" value={formatDate(row.fechaRecibo)} />
                <Detail label="Fecha de pago" value={formatDate(row.fechaPago)} />
              </dl>
            </details>
          </article>
        })}
      </div>
    </div>

    <div className="hidden overflow-x-auto lg:block" data-testid="receipt-table-results"><table className="min-w-[2100px] w-full text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
      <th className="px-3 py-3"><input ref={selectAllRef} type="checkbox" checked={allPageSelected} onChange={onTogglePage} aria-label="Seleccionar página" /></th>
      {['N° Recibo', 'ROL', 'Tribunal', 'Carátula', 'Gestión', 'Estampo', 'Resultado', 'Abogado', 'Procurador', 'Banco', 'Monto', 'Estado', 'N° Boleta', 'Fecha ejecución', 'Fecha recibo', 'Fecha pago'].map(title => <th key={title} className="px-3 py-3">{title}</th>)}
    </tr></thead><tbody className="divide-y divide-slate-100">
      {!loading && rows.length === 0 && <tr><td colSpan={17} className="px-4 py-16 text-center text-slate-500">No se encontraron recibos con estos filtros.</td></tr>}
      {rows.map(row => <tr key={row.reciboId} className="hover:bg-slate-50/80"><td className="px-3 py-3"><input type="checkbox" checked={isSelected(row.reciboId)} onChange={() => onToggleRow(row.reciboId)} aria-label={`Seleccionar recibo ${row.numeroRecibo}`} /></td>
        <td className="px-3 py-3 font-semibold text-blue-800">{row.numeroRecibo}</td><td className="px-3 py-3">{row.rol}</td><td className="px-3 py-3">{row.tribunal}</td><td className="px-3 py-3">{row.caratula}</td>
        <td className="px-3 py-3">{row.gestion}</td><td className="px-3 py-3">{row.estampoTemplate}</td><td className="px-3 py-3">{row.resultado}</td><td className="px-3 py-3">{row.abogado}</td>
        <td className="px-3 py-3">{row.procurador}</td><td className="px-3 py-3">{row.banco}</td><td className="px-3 py-3 font-semibold">{formatCurrency(row.valor)}</td>
        <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{row.estado}</span></td>
        <td className="px-3 py-3">{row.numeroBoleta}</td><td className="px-3 py-3">{formatDate(row.fechaEjecucion)}</td><td className="px-3 py-3">{formatDate(row.fechaRecibo)}</td><td className="px-3 py-3">{formatDate(row.fechaPago)}</td>
      </tr>)}
    </tbody></table></div>
  </>
}
