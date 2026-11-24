import type { ReactNode } from 'react'
import Link from 'next/link'
import { Search, type LucideIcon } from 'lucide-react'
import { filtrosHref } from './listado-filtros'

export const controlFiltro = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
export const botonPrimario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-blue-600 focus-visible:outline-offset-2'
export const botonFiltro = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-blue-600'

const formatoDia = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' })
const formatoClp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
export const dia = (fecha: Date) => formatoDia.format(fecha)
export const pesos = (monto: number | bigint) => formatoClp.format(monto)

export function TituloListado({ titulo, descripcion, children }: { titulo: string; descripcion: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">{titulo}</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{descripcion}</p>
      </div>
      {children}
    </header>
  )
}

export function Busqueda({ name = 'q', label, value }: { name?: string; label: string; value: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-blue-800" aria-hidden="true" />
      <input name={name} type="search" defaultValue={value} placeholder={label} maxLength={180} className={`${controlFiltro} pl-9`} />
    </label>
  )
}

export function SinResultados({ icon: Icon, titulo, descripcion, children }: { icon: LucideIcon; titulo: string; descripcion: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-9 text-center sm:py-11">
      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon className="size-5" aria-hidden="true" /></span>
      <p className="font-bold text-slate-950">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{descripcion}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function TablaListado({ etiqueta, columnas, filas }: { etiqueta: string; columnas: string[]; filas: { id: string; celdas: ReactNode[] }[] }) {
  return (
    <>
      {filas.length > 0 && <p className="px-4 pb-2 text-xs text-slate-600 sm:hidden">Desliza para ver todas las columnas.</p>}
      <div role="region" aria-label={etiqueta} tabIndex={0} className="overflow-x-auto focus-visible:outline-blue-600">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wide text-slate-600">
            <tr>{columnas.map(columna => <th key={columna} scope="col" className="px-4 py-3.5 sm:px-5">{columna}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filas.map(({ id, celdas }) => (
              <tr key={id} className="align-top text-slate-800 hover:bg-slate-50/70">
                {celdas.map((cell, index) => <td key={columnas[index]} className="px-4 py-4 sm:px-5">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function RolTribunal({ rol, tribunal }: { rol: string; tribunal: string }) {
  return <><span className="block font-bold text-slate-950">{rol}</span><span className="mt-0.5 block text-sm text-slate-600">{tribunal}</span></>
}

export function PaginasListado({ ruta, filtros, pagina, siguiente }: {
  ruta: string; filtros: Record<string, string>; pagina: number; siguiente: boolean
}) {
  if (pagina === 1 && !siguiente) return null
  return (
    <nav aria-label="Páginas de resultados" className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {pagina > 1 && <Link href={filtrosHref(ruta, { ...filtros, pagina: pagina > 2 ? pagina - 1 : undefined })} className={botonFiltro}>Anterior</Link>}
      <span className="px-2 text-sm font-semibold text-slate-600">Página {pagina}</span>
      {siguiente && <Link href={filtrosHref(ruta, { ...filtros, pagina: pagina + 1 })} className={botonFiltro}>Siguiente</Link>}
    </nav>
  )
}
