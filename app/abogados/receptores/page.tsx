import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Landmark, Plus, Scale, UsersRound } from 'lucide-react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { listarReceptores, registrosPorPagina } from '@/lib/encargos/listados'
import { cortesDeApelaciones, tribunalesDeCorte } from '@/lib/encargos/tribunales'
import { Busqueda, botonFiltro, botonPrimario, controlFiltro, PaginasListado, SinResultados, TituloListado } from '../_components/Listado'
import { filtrosHref, paginacion, textoFiltro, type ParametrosListado } from '../_components/listado-filtros'
import JurisdiccionFields from './JurisdiccionFields'

export const metadata: Metadata = { title: 'Receptores | NOTIFICA IA' }
const ruta = '/abogados/receptores'

export default async function ReceptoresPage({ searchParams }: { searchParams: Promise<ParametrosListado> }) {
  const [account, params] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const q = textoFiltro(params, 'q')
  const corteSolicitada = textoFiltro(params, 'corte')
  const corte = cortesDeApelaciones.includes(corteSolicitada) ? corteSolicitada : ''
  const tribunalSolicitado = textoFiltro(params, 'tribunal')
  const cortes = corte ? [corte] : cortesDeApelaciones
  const tribunal = cortes.some(item => tribunalesDeCorte(item).includes(tribunalSolicitado)) ? tribunalSolicitado : ''
  const filtros = { q, corte, tribunal }
  const pagina = paginacion(params)
  const [receptores, total] = await listarReceptores(q, corte, tribunal, { skip: pagina.skip, take: pagina.take })

  return (
    <>
      <TituloListado titulo="Receptores" descripcion="Busca receptores disponibles por nombre o por el tribunal de tu causa." />
      <form key={JSON.stringify(filtros)} action={ruta} className="app-panel mb-5 grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(13rem,1fr)_minmax(10rem,0.65fr)_minmax(11rem,0.8fr)_auto]">
        <Busqueda label="Buscar por nombre" value={q} />
        <JurisdiccionFields corteInicial={corte} tribunalInicial={tribunal} controlClassName={controlFiltro} />
        <div className="flex items-center gap-2">
          <button className={botonFiltro}>Buscar</button>
          {(q || corte || tribunal) && <Link href={ruta} className={botonFiltro}>Limpiar</Link>}
        </div>
      </form>

      <p className="mb-3 text-sm font-semibold text-slate-600">{total} {total === 1 ? 'receptor encontrado' : 'receptores encontrados'}</p>
      {receptores.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {receptores.slice(0, registrosPorPagina).map(receptor => {
            const jurisdiccion = receptor.cortes.find(item => cortes.includes(item) && (!tribunal || tribunalesDeCorte(item).includes(tribunal)))
            const tribunales = receptor.tribunales.filter(item => !corte || tribunalesDeCorte(corte).includes(item))
            const iniciales = receptor.nombre.trim().split(/\s+/).slice(0, 2).map(nombre => Array.from(nombre)[0]).join('').toLocaleUpperCase('es-CL')
            return (
              <li key={receptor.userId} className="app-panel flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-bold text-blue-800">{iniciales}</span>
                  <h2 className="break-words text-sm font-bold text-slate-950 sm:text-base">{receptor.nombre}</h2>
                </div>
                <p className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                  <Scale className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden="true" />
                  {receptor.cortes.join(' · ') || 'Corte por confirmar'}
                </p>
                {tribunales.length > 1 ? <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer break-words">{tribunales[0]} y {tribunales.length - 1} más</summary>
                  <ul className="mt-2 space-y-1 pl-4">{tribunales.slice(1).map(item => <li key={item}>{item}</li>)}</ul>
                </details> : <p className="flex items-start gap-2 text-sm text-slate-600"><Landmark className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden="true" />{tribunales[0] || 'Tribunales por confirmar'}</p>}
                {jurisdiccion && (
                  <Link href={filtrosHref('/abogados/nuevo-encargo', { corte: jurisdiccion, tribunal, receptor: receptor.userId })}
                    aria-label={`Seleccionar a ${receptor.nombre}`} className={`${botonPrimario} mt-auto w-full`}>
                    <Plus className="size-4" aria-hidden="true" />Seleccionar
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      ) : <section className="app-panel"><SinResultados icon={UsersRound} titulo="No se encontraron receptores" descripcion="Cambia el nombre, la corte o el tribunal para ampliar la búsqueda." /></section>}
      <PaginasListado ruta={ruta} filtros={filtros} pagina={pagina.pagina} siguiente={receptores.length > registrosPorPagina} />
    </>
  )
}
