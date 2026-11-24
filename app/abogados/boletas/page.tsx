import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ReceiptText } from 'lucide-react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { listarBoletas, registrosPorPagina } from '@/lib/encargos/listados'
import { Busqueda, botonFiltro, dia, PaginasListado, pesos, RolTribunal, SinResultados, TablaListado, TituloListado } from '../_components/Listado'
import { paginacion, textoFiltro, type ParametrosListado } from '../_components/listado-filtros'
import RefreshButton from '../_components/RefreshButton'

export const metadata: Metadata = { title: 'Mis boletas | NOTIFICA IA' }
const ruta = '/abogados/boletas'
const columnas = ['N° de boleta', 'N° de recibo', 'ROL / Tribunal', 'Receptor', 'Emisión', 'Monto']

export default async function BoletasPage({ searchParams }: { searchParams: Promise<ParametrosListado> }) {
  const [account, params] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const q = textoFiltro(params, 'q')
  const pagina = paginacion(params)
  const [boletas, total] = await listarBoletas(account.authUserId, q, { skip: pagina.skip, take: pagina.take })

  return (
    <>
      <TituloListado titulo="Mis boletas" descripcion="Consulta las boletas de honorarios emitidas para tus encargos."><RefreshButton /></TituloListado>
      <form key={q} action={ruta} className="app-panel mb-5 flex flex-col gap-2 p-3 sm:flex-row">
        <Busqueda label="Buscar por ROL, tribunal, N° de boleta o de recibo" value={q} />
        <button className={botonFiltro}>Buscar</button>
        {q && <Link href={ruta} className={botonFiltro}>Limpiar</Link>}
      </form>
      <section className="app-panel overflow-hidden" aria-labelledby="boletas-resultados">
        <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
          <h2 id="boletas-resultados" className="text-base font-bold text-slate-950">Boletas emitidas</h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">{total} {total === 1 ? 'boleta' : 'boletas'}</span>
        </div>
        {boletas.length ? <TablaListado etiqueta="Resultados de boletas" columnas={columnas} filas={boletas.slice(0, registrosPorPagina).map(boleta => ({
          id: boleta.id, celdas: [<strong key="numero">{boleta.numero}</strong>, boleta.numeroRecibo || '—', <RolTribunal key="causa" {...boleta.asignacion.encargo} />,
            boleta.asignacion.receptor.nombre, dia(boleta.emitidoAt), <span key="monto" className="font-bold tabular-nums">{pesos(boleta.montoClp)}</span>],
        }))} /> : <SinResultados icon={ReceiptText} titulo="No se encontraron boletas" descripcion={q
          ? 'Prueba con otro ROL, tribunal o número de documento.' : 'Aquí aparecerán las boletas emitidas para tus encargos.'} />}
      </section>
      <PaginasListado ruta={ruta} filtros={{ q }} pagina={pagina.pagina} siguiente={boletas.length > registrosPorPagina} />
    </>
  )
}
