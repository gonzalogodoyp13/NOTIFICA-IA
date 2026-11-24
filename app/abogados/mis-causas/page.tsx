import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderOpen, Plus } from 'lucide-react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { estadoDeCausa, filtrosEstado, type EstadoCausa } from '@/lib/encargos/estados'
import { listarCausas, registrosPorPagina } from '@/lib/encargos/listados'
import { cortesDeApelaciones } from '@/lib/encargos/tribunales'
import { prisma } from '@/lib/prisma'
import { Busqueda, botonFiltro, botonPrimario, controlFiltro, dia, PaginasListado, SinResultados, TituloListado } from '../_components/Listado'
import { filtrosHref, paginacion, textoFiltro, type ParametrosListado } from '../_components/listado-filtros'
import { z } from 'zod'

export const metadata: Metadata = { title: 'Mis causas | NOTIFICA IA' }
const ruta = '/abogados/mis-causas'
const tonos: Record<EstadoCausa, string> = {
  borrador: 'bg-slate-100 text-slate-700', 'esperando-respuesta': 'bg-blue-50 text-blue-900',
  'por-pagar': 'bg-amber-50 text-amber-900', 'en-curso': 'bg-indigo-50 text-indigo-900',
  finalizadas: 'bg-emerald-50 text-emerald-900', 'no-aceptadas': 'bg-rose-50 text-rose-900',
}

function detalleDeCausa(datos: unknown) {
  const causa = z.object({ causa: z.object({ detalle: z.string() }) }).safeParse(datos)
  return causa.data?.causa.detalle
}

export default async function MisCausas({ searchParams }: { searchParams: Promise<ParametrosListado> }) {
  const [account, params] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const solicitado = textoFiltro(params, 'estado')
  const estado = filtrosEstado.find(filtro => filtro.value === solicitado)?.value ?? 'todas'
  const q = textoFiltro(params, 'q')
  const corteSolicitada = textoFiltro(params, 'corte')
  const corte = cortesDeApelaciones.includes(corteSolicitada) ? corteSolicitada : ''
  const filtros = { estado: estado === 'todas' ? '' : estado, q, corte }
  const pagina = paginacion(params)
  const idEnviado = z.uuid().safeParse(textoFiltro(params, 'enviado'))
  const [encargos, enviado] = await Promise.all([
    listarCausas(account.authUserId, estado, q, corte, { skip: pagina.skip, take: pagina.take }),
    idEnviado.success ? prisma.abogadoEncargo.findFirst({
      where: { id: idEnviado.data, abogadoId: account.authUserId, enviadoAt: { not: null } }, select: { id: true },
    }) : null,
  ])
  const filtrando = Boolean(q || corte || filtros.estado)

  return (
    <>
      <TituloListado titulo="Mis causas" descripcion="Revisa tus encargos y el estado de cada diligencia.">
        <Link href="/abogados/nuevo-encargo" className={botonPrimario}><Plus className="size-4" aria-hidden="true" />Nuevo encargo</Link>
      </TituloListado>

      {enviado && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Encargo registrado con los receptores seleccionados.</p>}

      <nav aria-label="Estado de las causas" className="mb-4 flex flex-wrap gap-1.5">
        {filtrosEstado.map(({ value, label }) => (
          <Link key={value} href={filtrosHref(ruta, { ...filtros, estado: value === 'todas' ? '' : value })}
            aria-current={estado === value ? 'page' : undefined} className={`rounded-full border px-3.5 py-2 text-sm font-bold focus-visible:outline-blue-600 ${estado === value ? 'border-blue-200 bg-white text-blue-900 shadow-sm' : 'border-transparent text-slate-700 hover:bg-slate-100'}`}>
            {label}
          </Link>
        ))}
      </nav>

      <form key={`${q}:${corte}`} action={ruta} className="app-panel mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap">
        {filtros.estado && <input type="hidden" name="estado" value={filtros.estado} />}
        <Busqueda label="Buscar por ROL o RIT" value={q} />
        <label className="sm:w-56"><span className="sr-only">Corte de Apelaciones</span>
          <select name="corte" defaultValue={corte} className={controlFiltro}>
            <option value="">Todas las cortes</option>
            {cortesDeApelaciones.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className={botonFiltro}>Buscar</button>
        {(q || corte) && <Link href={filtrosHref(ruta, { estado: filtros.estado })} className={botonFiltro}>Limpiar</Link>}
      </form>

      <section aria-label="Tus encargos" className="app-panel overflow-hidden">
        {encargos.length ? (
          <ul className="divide-y divide-slate-200">
            {encargos.slice(0, registrosPorPagina).map(encargo => {
              const estadoCausa = estadoDeCausa(encargo)
              const etiqueta = filtrosEstado.find(filtro => filtro.value === estadoCausa)?.label ?? 'Borrador'
              const detalle = detalleDeCausa(encargo.datos)
              const receptores = encargo.receptores.filter(r => r.respuesta === 'ACEPTADA')
              const asignado = receptores.find(r => r._count.pagos > 0)
              const nombres = (asignado ? [asignado] : receptores).map(r => r.receptor.nombre).join(', ')
              return (
                <li key={encargo.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-slate-950">{encargo.rol}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{encargo.tribunal} · {encargo.corte}</p>
                    {detalle && <p className="mt-2 text-sm font-semibold text-slate-800">{detalle}</p>}
                    {encargo.enviadoAt && <p className="mt-1 text-sm text-slate-600">
                      {nombres || `${encargo.receptores.length} ${encargo.receptores.length === 1 ? 'receptor seleccionado' : 'receptores seleccionados'}`} · {dia(encargo.enviadoAt)}
                    </p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:justify-center">
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tonos[estadoCausa]}`}>{etiqueta}</span>
                    {estadoCausa === 'borrador' && <Link href={`/abogados/nuevo-encargo?borrador=${encargo.id}`} className="rounded-lg px-2 py-1.5 text-sm font-bold text-blue-800 hover:bg-blue-50">Continuar borrador<span className="sr-only"> {encargo.rol}</span></Link>}
                    {estadoCausa === 'finalizadas' && <Link href={filtrosHref('/abogados/estampos', { q: encargo.rol })} className="rounded-lg px-2 py-1.5 text-sm font-bold text-blue-800 hover:bg-blue-50">Ver estampos</Link>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <SinResultados icon={FolderOpen} titulo={filtrando ? 'No hay causas para estos filtros' : 'Todavía no tienes causas'}
            descripcion={filtrando ? 'Puedes cambiar el estado, el ROL o la corte.' : 'Crea tu primer encargo y selecciona los receptores de tu corte.'}>
            {!filtrando && <Link href="/abogados/nuevo-encargo" className={botonPrimario}>Nuevo encargo</Link>}
          </SinResultados>
        )}
      </section>
      <PaginasListado ruta={ruta} filtros={filtros} pagina={pagina.pagina} siguiente={encargos.length > registrosPorPagina} />
    </>
  )
}
