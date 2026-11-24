'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { causaSchema, datosEncargoSchema, guardarEncargoSchema, type DatosEncargo, type ReceptorDisponible } from '@/lib/encargos/schema'
import BoletaFields from './BoletaFields'
import CausaFields, { type CausaForm } from './CausaFields'
import { EjecutadosFields, personaVacia, PlazosFields, ReceptoresField } from './ReceptorFields'

const pasos = ['Causa', 'Receptor', 'Boleta'] as const
const causaVacia: CausaForm = { competencia: '', corte: '', tribunal: '', rol: '', cantidad: '1', tipo: '', detalle: '', notas: '' }
const plazosVacios = { limite: '', audiencia: '', hora: '' }
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-blue-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-blue-600 focus-visible:outline-offset-2 disabled:opacity-50'

export default function EncargoForm({ boletaInicial, borrador, preseleccion }: {
  boletaInicial: DatosEncargo['boleta']; borrador?: { id: string; datos: DatosEncargo }
  preseleccion?: { id: string; nombre: string; corte: string; tribunal: string }
}) {
  const datos = borrador?.datos
  const router = useRouter()
  const encargoId = useRef(borrador?.id)
  const heading = useRef<HTMLHeadingElement>(null)
  const [paso, setPaso] = useState(0)
  const [avance, setAvance] = useState(0)
  const [causa, setCausa] = useState<CausaForm>(datos ? { ...datos.causa, cantidad: String(datos.causa.cantidad) }
    : { ...causaVacia, corte: preseleccion?.corte ?? '', tribunal: preseleccion?.tribunal ?? '' })
  const [seleccion, setSeleccion] = useState(datos?.receptorIds ?? (preseleccion ? [preseleccion.id] : []))
  const [personas, setPersonas] = useState(datos?.personas ?? [])
  const [plazos, setPlazos] = useState(datos?.plazos ?? plazosVacios)
  const [boleta, setBoleta] = useState<DatosEncargo['boleta']>(datos?.boleta ?? boletaInicial)
  const [estadoReceptores, setEstadoReceptores] = useState<{ corte: string; status: 'listo' | 'error'; data: ReceptorDisponible[] }>()
  const [intento, setIntento] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const corte = causa.corte
  const estadoActual = estadoReceptores?.corte === corte ? estadoReceptores : undefined
  const receptores = estadoActual?.data ?? []
  const seleccionDisponible = seleccion.filter(id => receptores.some(receptor => receptor.id === id))

  useEffect(() => {
    if (!corte) return
    const controller = new AbortController()
    async function cargar() {
      try {
        const response = await fetch(`/api/abogados/encargos?corte=${encodeURIComponent(corte)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Receptores no disponibles')
        const result = await response.json()
        if (!controller.signal.aborted) setEstadoReceptores({ corte, status: 'listo', data: result.receptores })
      } catch {
        if (!controller.signal.aborted) setEstadoReceptores({ corte, status: 'error', data: [] })
      }
    }
    void cargar()
    return () => controller.abort()
  }, [corte, intento])

  function editarCausa(value: CausaForm) {
    if (value.corte !== corte) {
      setSeleccion([])
      setEstadoReceptores(undefined)
    }
    setCausa(value)
    setAvance(0)
    setError('')
    setMensaje('')
  }

  function irA(index: number) {
    setPaso(index)
    setError('')
    setAvance(current => Math.max(current, index))
    window.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }

  function validarCausa() {
    const parsed = causaSchema.safeParse({ ...causa, cantidad: Number(causa.cantidad) })
    if (!parsed.success) setError(parsed.error.issues[0]?.message || 'Revisa los datos de la causa.')
    return parsed
  }

  async function persistir(accion: 'guardar' | 'enviar') {
    if (busy) return
    setError('')
    setMensaje('')
    const causaValida = validarCausa()
    if (!causaValida.success) return
    encargoId.current ??= crypto.randomUUID()
    const payload = guardarEncargoSchema.safeParse({ id: encargoId.current, accion, datos: {
      causa: causaValida.data, receptorIds: estadoActual ? seleccionDisponible : seleccion,
      personas: personas.slice(0, causaValida.data.cantidad), plazos, boleta,
    } })
    if (!payload.success) {
      setError(payload.error.issues[0]?.message || 'Revisa los datos del encargo.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/abogados/encargos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload.data),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'No pudimos guardar el encargo.')
        return
      }
      if (result.estado === 'enviado') {
        router.push(`/abogados/mis-causas?enviado=${result.id}`)
        router.refresh()
        return
      }
      window.history.replaceState(null, '', `?borrador=${result.id}`)
      setMensaje('Borrador guardado. Puedes retomarlo desde Mis causas.')
    } catch {
      setError('No pudimos guardar el encargo. Vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  function continuar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (paso === 2) {
      void persistir('enviar')
      return
    }
    if (paso === 0 && !validarCausa().success) return
    if (paso === 1) {
      const fechas = datosEncargoSchema.shape.plazos.safeParse(plazos)
      const notificados = datosEncargoSchema.shape.personas.safeParse(personas.slice(0, Number(causa.cantidad)))
      if (!fechas.success || !notificados.success) {
        setError(fechas.error?.issues[0]?.message || notificados.error?.issues[0]?.message || 'Revisa los datos opcionales.')
        return
      }
    }
    irA(paso + 1)
  }

  const sinReceptores = !seleccionDisponible.length
  return (
    <div className="max-w-6xl">
      <header className="mb-5">
        <h1 ref={heading} tabIndex={-1} className="page-title focus:outline-none">Nuevo encargo</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">Completa la causa, selecciona receptores y revisa los datos de la boleta.</p>
        {preseleccion && seleccion.includes(preseleccion.id) && (
          <p className="mt-2 text-sm font-semibold text-blue-800">Receptor seleccionado: {preseleccion.nombre}</p>
        )}
      </header>

      <nav aria-label="Pasos de Nuevo encargo" className="app-panel mb-5 px-2 py-2.5 sm:px-4">
        <ol className="grid grid-cols-3 gap-1 sm:gap-3">
          {pasos.map((label, index) => (
            <li key={label}>
              <button type="button" aria-current={paso === index ? 'step' : undefined} disabled={busy || index > avance}
                onClick={() => irA(index)} className={`flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold focus-visible:outline-blue-600 sm:justify-start sm:gap-2.5 sm:px-3 sm:text-sm ${paso === index ? 'bg-blue-50 text-blue-900' : 'text-slate-600 enabled:hover:bg-slate-100'}`}>
                <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full ${paso === index ? 'bg-blue-700 text-white' : index < paso ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {index < paso ? <Check className="size-3.5" /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <form method="post" noValidate onSubmit={continuar} aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <legend className="sr-only">{pasos[paso]}</legend>
          {paso === 0 && <CausaFields causa={causa} onChange={editarCausa} />}
          {paso === 1 && (
            <>
              <ReceptoresField corte={corte} receptores={receptores} seleccion={seleccionDisponible} status={estadoActual?.status ?? 'cargando'}
                onToggle={id => setSeleccion(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])}
                onRetry={() => { setEstadoReceptores(undefined); setIntento(current => current + 1) }} />
              <EjecutadosFields cantidad={Number(causa.cantidad)} personas={personas}
                onChange={(index, value) => setPersonas(current => Array.from({ length: Math.max(index + 1, current.length) }, (_, i) => i === index ? value : current[i] ?? personaVacia))} />
              <PlazosFields plazos={plazos} onChange={setPlazos} />
            </>
          )}
          {paso === 2 && <BoletaFields boleta={boleta} onChange={setBoleta} />}

          <div className="app-panel space-y-3 p-4 sm:p-5">
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">{error}</p>}
            {mensaje && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{mensaje}</p>}
            {paso === 2 && sinReceptores && <p id="encargo-falta-receptor" className="text-sm text-amber-900">Selecciona al menos un receptor disponible para enviar el encargo.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap gap-2">
                {paso > 0 && <button type="button" onClick={() => irA(paso - 1)} className={secondary}><ChevronLeft className="size-4" aria-hidden="true" />Atrás</button>}
                <button type="button" onClick={() => void persistir('guardar')} className={secondary}><Save className="size-4" aria-hidden="true" />Guardar borrador</button>
              </div>
              <button type="submit" className={primary} disabled={paso === 2 && sinReceptores}
                aria-describedby={paso === 2 && sinReceptores ? 'encargo-falta-receptor' : undefined}>
                {paso === 2 ? 'Enviar encargo' : 'Continuar'}
                {paso < 2 && <ChevronRight className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
