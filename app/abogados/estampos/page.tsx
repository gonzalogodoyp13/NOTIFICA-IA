import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Stamp } from 'lucide-react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { listarEstampos, registrosPorPagina } from '@/lib/encargos/listados'
import { Busqueda, botonFiltro, controlFiltro, dia, PaginasListado, RolTribunal, SinResultados, TablaListado, TituloListado } from '../_components/Listado'
import { fechaFiltro, paginacion, textoFiltro, type ParametrosListado } from '../_components/listado-filtros'
import RefreshButton from '../_components/RefreshButton'

export const metadata: Metadata = { title: 'Mis estampos | NOTIFICA IA' }
const ruta = '/abogados/estampos'
const columnas = ['Receptor', 'ROL / Tribunal', 'Notificado', 'Resultado', 'Firmado el']

export default async function EstamposPage({ searchParams }: { searchParams: Promise<ParametrosListado> }) {
  const [account, params] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const [q, receptor, desde, hasta] = [textoFiltro(params, 'q'), textoFiltro(params, 'receptor'), fechaFiltro(params, 'desde'), fechaFiltro(params, 'hasta')]
  const filtros = { q, receptor, desde, hasta }
  const pagina = paginacion(params)
  const rangoInvertido = Boolean(desde && hasta && desde > hasta)
  const [estampos, total, receptores] = await listarEstampos(account.authUserId,
    { rol: q, receptorId: receptor, desde, hasta }, { skip: pagina.skip, take: pagina.take })
  const receptorAusente = receptor && !receptores.some(item => item.userId === receptor)

  return (
    <>
      <TituloListado titulo="Mis estampos" descripcion="Consulta los resultados firmados de tus diligencias."><RefreshButton /></TituloListado>
      <form key={JSON.stringify(filtros)} action={ruta} className="app-panel mb-5 grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1fr)_minmax(11rem,0.8fr)_auto_auto_auto]">
        <Busqueda label="Buscar por ROL o RIT" value={q} />
        <div className="min-w-0"><label htmlFor="estampos-receptor" className="sr-only">Receptor</label>
          <select id="estampos-receptor" name="receptor" defaultValue={receptor} className={controlFiltro}>
            <option value="">Todos los receptores</option>
            {receptorAusente && <option value={receptor}>Receptor sin estampos</option>}
            {receptores.map(item => <option key={item.userId} value={item.userId}>{item.nombre}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 pl-3 text-sm font-semibold text-slate-700">
          Desde<input type="date" name="desde" defaultValue={desde} aria-label="Desde" className={`${controlFiltro} border-transparent bg-transparent`} />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 pl-3 text-sm font-semibold text-slate-700">
          Hasta<input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className={`${controlFiltro} border-transparent bg-transparent`} />
        </label>
        <div className="flex gap-2"><button className={botonFiltro}>Buscar</button>
          {(q || receptor || desde || hasta) && <Link href={ruta} className={botonFiltro}>Limpiar</Link>}
        </div>
      </form>
      {rangoInvertido && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">La fecha Desde debe ser anterior o igual a Hasta.</p>}

      <section className="app-panel overflow-hidden" aria-labelledby="estampos-resultados">
        <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
          <h2 id="estampos-resultados" className="text-base font-bold text-slate-950">Estampos firmados</h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">{total} {total === 1 ? 'estampo' : 'estampos'}</span>
        </div>
        <TablaListado etiqueta="Resultados de estampos" columnas={columnas} filas={estampos.slice(0, registrosPorPagina).map(estampo => ({
          id: estampo.id,
          celdas: [estampo.asignacion.receptor.nombre, <RolTribunal {...estampo.asignacion.encargo} />,
            estampo.notificado, estampo.resultado, dia(estampo.firmadoAt)],
        }))} />
        {!estampos.length && <SinResultados icon={Stamp} titulo="No se encontraron estampos" descripcion={q || receptor || desde || hasta
          ? 'Prueba con otro ROL, receptor o rango de fechas.' : 'Aquí aparecerán los estampos firmados de tus encargos.'} />}
      </section>
      <PaginasListado ruta={ruta} filtros={filtros} pagina={pagina.pagina} siguiente={estampos.length > registrosPorPagina} />
    </>
  )
}
