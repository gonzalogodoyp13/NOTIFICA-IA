import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { Fragment } from 'react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { listarGastosPorCausa, listarPagos, registrosPorPagina, totalPagos } from '@/lib/encargos/listados'
import { Busqueda, botonFiltro, dia, PaginasListado, pesos, RolTribunal, SinResultados, TablaListado, TituloListado } from '../_components/Listado'
import { filtrosHref, paginacion, textoFiltro, type ParametrosListado } from '../_components/listado-filtros'
import RefreshButton from '../_components/RefreshButton'

export const metadata: Metadata = { title: 'Mis pagos | NOTIFICA IA' }
const ruta = '/abogados/pagos'
const vistas = [{ value: '', label: 'Por causa' }, { value: 'pago', label: 'Por pago' }] as const

export default async function PagosPage({ searchParams }: { searchParams: Promise<ParametrosListado> }) {
  const [account, params] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const q = textoFiltro(params, 'q')
  const vista = textoFiltro(params, 'vista') === 'pago' ? 'pago' : ''
  const filtros = { q, vista }
  const pagina = paginacion(params)
  const ventana = { skip: pagina.skip, take: pagina.take }
  const [total, gastos, pagos] = await Promise.all([
    totalPagos(account.authUserId, q),
    vista ? [] : listarGastosPorCausa(account.authUserId, q, ventana),
    vista ? listarPagos(account.authUserId, q, ventana) : [],
  ])
  const filas = vista ? pagos.slice(0, registrosPorPagina).map(pago => ({
    id: pago.id, celdas: [<RolTribunal key="causa" {...pago.asignacion.encargo} />, pago.asignacion.receptor.nombre, dia(pago.pagadoAt),
      <Fragment key="medio"><span className="block">{pago.medio}</span>{pago.referencia && <span className="mt-0.5 block text-slate-600">{pago.referencia}</span>}</Fragment>,
      <span key="monto" className="font-bold tabular-nums">{pesos(pago.montoClp)}</span>],
  })) : gastos.slice(0, registrosPorPagina).map(gasto => ({
    id: JSON.stringify([gasto.rol, gasto.tribunal, gasto.corte]), celdas: [<RolTribunal key="causa" rol={gasto.rol} tribunal={gasto.tribunal} />,
      gasto.pagos, dia(gasto.ultimo), <span key="total" className="font-bold tabular-nums">{pesos(gasto.total)}</span>],
  }))

  return (
    <>
      <TituloListado titulo="Mis pagos" descripcion="Consulta tus pagos realizados y cuánto llevas gastado en cada causa."><RefreshButton /></TituloListado>
      <form key={q} action={ruta} className="app-panel mb-5 flex flex-col gap-2 p-3 sm:flex-row">
        {vista && <input type="hidden" name="vista" value={vista} />}
        <Busqueda label="Buscar por ROL o tribunal" value={q} />
        <button className={botonFiltro}>Buscar</button>
        {q && <Link href={filtrosHref(ruta, { vista })} className={botonFiltro}>Limpiar</Link>}
      </form>

      <section className="app-panel overflow-hidden" aria-labelledby="pagos-resultados">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="pagos-resultados" className="text-base font-bold text-slate-950">{vista ? 'Pagos realizados' : 'Gastos por causa'}</h2>
            <nav aria-label="Vista de pagos" className="flex gap-1.5">
              {vistas.map(({ value, label }) => (
                <Link key={label} href={filtrosHref(ruta, { q, vista: value })} aria-current={vista === value ? 'page' : undefined}
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold ${vista === value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <p className="rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-900">{q ? 'Total filtrado' : 'Total pagado'} <strong className="ml-1 tabular-nums">{pesos(total._sum.montoClp ?? 0)}</strong></p>
        </div>
        {filas.length ? <TablaListado etiqueta="Resultados de pagos" filas={filas} columnas={vista
          ? ['ROL / Tribunal', 'Receptor', 'Fecha de pago', 'Medio / Referencia', 'Monto']
          : ['ROL / Tribunal', 'Pagos', 'Último pago', 'Total gastado']} /> : (
          <SinResultados icon={CreditCard} titulo={q ? 'No se encontraron pagos' : 'Todavía no tienes pagos registrados'}
            descripcion={q ? 'Prueba con otro ROL o tribunal.' : 'Los pagos realizados en tus encargos aparecerán aquí.'} />
        )}
      </section>
      <PaginasListado ruta={ruta} filtros={filtros} pagina={pagina.pagina} siguiente={(vista ? pagos : gastos).length > registrosPorPagina} />
    </>
  )
}
