'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Copy, Info, ReceiptText, Settings2, UserRound } from 'lucide-react'
import { ajusteAbogadoSchema, type BoletaAbogado, type ContactoAbogado } from '@/lib/encargos/ajustes'
import { comunasDeChile } from '@/lib/encargos/comunas'
import { controlClassName, InputField } from '../nuevo-encargo/Fields'

const secciones = [
  { id: 'contacto', label: 'Tus datos', Icon: UserRound },
  { id: 'boleta', label: 'Boleta', Icon: ReceiptText },
  { id: 'cuenta', label: 'Cuenta', Icon: Settings2 },
] as const

type Seccion = typeof secciones[number]['id']
type Aviso = { tipo: 'error' | 'ok'; texto: string; seccion: Seccion }

const botonPrincipal = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-blue-600 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const botonSecundario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-blue-600 disabled:opacity-50'

export default function AjustesForm({ contactoInicial, boletaInicial }: { contactoInicial: ContactoAbogado; boletaInicial: BoletaAbogado }) {
  const router = useRouter()
  const [seccion, setSeccion] = useState<Seccion>('contacto')
  const [contacto, setContacto] = useState(contactoInicial)
  const [contactoGuardado, setContactoGuardado] = useState(contactoInicial)
  const [boleta, setBoleta] = useState(boletaInicial)
  const [boletaGuardada, setBoletaGuardada] = useState(boletaInicial)
  const [motivo, setMotivo] = useState('')
  const [confirma, setConfirma] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState<Aviso>()

  function editarContacto(field: keyof ContactoAbogado, value: string) {
    setContacto(current => ({ ...current, [field]: value }))
    setAviso(undefined)
  }

  function editarBoleta(field: keyof BoletaAbogado, value: string) {
    setBoleta(current => ({ ...current, [field]: value }))
    setAviso(undefined)
  }

  function usarMisDatos() {
    const { nombre, rut, correo, comuna, direccion } = contacto
    setBoleta(current => ({ ...current, nombre, rut, correo, comuna, direccion }))
    setAviso({ tipo: 'ok', texto: 'Datos copiados. Guarda para usar estos datos de boleta en tus nuevos encargos.', seccion: 'boleta' })
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const destino = event.key === 'ArrowRight' ? (index + 1) % secciones.length
      : event.key === 'ArrowLeft' ? (index + secciones.length - 1) % secciones.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? secciones.length - 1 : null
    if (destino === null) return
    event.preventDefault()
    const id = secciones[destino].id
    setSeccion(id)
    document.getElementById(`ajustes-tab-${id}`)?.focus()
  }

  async function guardar(event: FormEvent<HTMLFormElement>, accion: 'contacto' | 'boleta' | 'baja') {
    event.preventDefault()
    if (busy) return
    const tab = accion === 'baja' ? 'cuenta' : accion
    setAviso(undefined)
    const ajuste = ajusteAbogadoSchema.safeParse(accion === 'baja' ? { accion, confirma, motivo }
      : { accion, datos: accion === 'contacto' ? contacto : boleta })
    if (!ajuste.success) {
      setAviso({ seccion: tab, tipo: 'error', texto: ajuste.error.issues[0]?.message ?? 'Revisa los datos.' })
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/abogados/ajustes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ajuste.data),
      })
      const result = await response.json()
      if (!response.ok) {
        setAviso({ seccion: tab, tipo: 'error', texto: result.error ?? 'No pudimos guardar el cambio.' })
        return
      }
      if (ajuste.data.accion === 'baja') {
        window.location.replace('/login?error=abogado_disabled')
        return
      }
      if (ajuste.data.accion === 'contacto') {
        setContacto(ajuste.data.datos)
        setContactoGuardado(ajuste.data.datos)
      } else {
        setBoleta(ajuste.data.datos)
        setBoletaGuardada(ajuste.data.datos)
      }
      setAviso({ seccion: tab, tipo: 'ok', texto: 'Cambios guardados.' })
      router.refresh()
    } catch {
      setAviso({ seccion: tab, tipo: 'error', texto: 'No pudimos guardar el cambio. Intenta nuevamente.' })
    } finally {
      setBusy(false)
    }
  }

  const avisoActual = aviso?.seccion === seccion ? aviso : undefined
  const initials = contactoGuardado.nombre.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('es-CL')
  const contactoCompleto = Object.values(contacto).filter(value => value.trim()).length
  const boletaCompleta = Object.values(boleta).filter(value => value.trim()).length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-900 text-sm font-bold text-white">{initials}</span>
          <p className="break-words text-base font-bold text-slate-950">{contactoGuardado.nombre}</p>
        </div>
        <div role="tablist" aria-label="Secciones de ajustes" className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:w-auto">
          {secciones.map(({ id, label, Icon }, index) => (
            <button type="button" key={id} id={`ajustes-tab-${id}`} role="tab" aria-selected={seccion === id}
              aria-controls={`ajustes-panel-${id}`} tabIndex={seccion === id ? 0 : -1} disabled={busy}
              onClick={() => setSeccion(id)} onKeyDown={event => onTabKey(event, index)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold focus-visible:outline-blue-600 sm:px-3 ${seccion === id ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>

      <datalist id="ajustes-comunas">{comunasDeChile.map(comuna => <option key={comuna} value={comuna} />)}</datalist>

      <div role="tabpanel" id={`ajustes-panel-${seccion}`} aria-labelledby={`ajustes-tab-${seccion}`}>
        {seccion === 'contacto' && (
          <PanelDatos titulo="Tus datos" descripcion="Usamos estos datos para tus encargos y para contactarte."
            completo={contactoCompleto} busy={busy} cambios={JSON.stringify(contacto) !== JSON.stringify(contactoGuardado)} aviso={avisoActual}
            onSubmit={event => void guardar(event, 'contacto')}>
            <div className="sm:col-span-2"><InputField id="contacto-nombre" label="Nombre completo" value={contacto.nombre} autoComplete="name" maxLength={200} required
              onChange={event => editarContacto('nombre', event.target.value)} /></div>
            <InputField id="contacto-rut" label="RUT" value={contacto.rut} placeholder="12.345.678-5" maxLength={20}
              onChange={event => editarContacto('rut', event.target.value)} />
            <div>
              <InputField id="contacto-correo" label="Correo" value={contacto.correo} type="email" autoComplete="email" maxLength={254} aria-describedby="correo-contacto-ayuda"
                placeholder="tu@correo.cl" onChange={event => editarContacto('correo', event.target.value)} />
              <p id="correo-contacto-ayuda" className="mt-1.5 text-xs text-slate-600">El correo con el que inicias sesión se administra por separado.</p>
            </div>
            <InputField id="contacto-telefono" label="Teléfono" value={contacto.telefono} type="tel" autoComplete="tel" maxLength={30} placeholder="+56 9 1234 5678"
              onChange={event => editarContacto('telefono', event.target.value)} />
            <InputField id="contacto-comuna" label="Comuna" value={contacto.comuna} list="ajustes-comunas" maxLength={100} placeholder="Busca o escribe una comuna"
              onChange={event => editarContacto('comuna', event.target.value)} />
            <div className="sm:col-span-2"><InputField id="contacto-direccion" label="Dirección" value={contacto.direccion} autoComplete="street-address" maxLength={250} placeholder="Calle y número, oficina"
              onChange={event => editarContacto('direccion', event.target.value)} /></div>
          </PanelDatos>
        )}
        {seccion === 'boleta' && (
          <PanelDatos titulo="Boleta de honorarios" completo={boletaCompleta} busy={busy}
            cambios={JSON.stringify(boleta) !== JSON.stringify(boletaGuardada)} aviso={avisoActual} onSubmit={event => void guardar(event, 'boleta')}
            accion={<button type="button" onClick={usarMisDatos} disabled={busy} className={botonSecundario}><Copy className="size-4" aria-hidden="true" />Usar mis datos</button>}>
            <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Si la boleta va a nombre de tu estudio o de tu cliente, guarda sus datos para usarlos en tus próximos encargos.
            </p>
            <div className="sm:col-span-2"><InputField id="boleta-ajustes-nombre" label="Nombre o razón social" value={boleta.nombre} placeholder="A nombre de quién va la boleta" maxLength={200} required
              onChange={event => editarBoleta('nombre', event.target.value)} /></div>
            <InputField id="boleta-ajustes-rut" label="RUT" value={boleta.rut} placeholder="12.345.678-5" maxLength={20} required
              onChange={event => editarBoleta('rut', event.target.value)} />
            <InputField id="boleta-ajustes-giro" label="Giro" value={boleta.giro} maxLength={160} placeholder="Servicios jurídicos"
              onChange={event => editarBoleta('giro', event.target.value)} />
            <InputField id="boleta-ajustes-correo" label="Correo para la boleta" value={boleta.correo} type="email" maxLength={254} placeholder="boletas@estudio.cl"
              onChange={event => editarBoleta('correo', event.target.value)} />
            <InputField id="boleta-ajustes-comuna" label="Comuna" value={boleta.comuna} list="ajustes-comunas" maxLength={100} placeholder="Busca o escribe una comuna"
              onChange={event => editarBoleta('comuna', event.target.value)} />
            <div className="sm:col-span-2"><InputField id="boleta-ajustes-direccion" label="Dirección" value={boleta.direccion} maxLength={250} placeholder="Calle y número, oficina"
              onChange={event => editarBoleta('direccion', event.target.value)} /></div>
          </PanelDatos>
        )}
        {seccion === 'cuenta' && (
          <div className="space-y-4">
            <section className="app-panel divide-y divide-slate-200 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <div><h2 className="font-bold text-slate-950">Recorrido de la plataforma</h2><p className="mt-1 text-sm text-slate-600">Vuelve a Inicio para ver dónde está cada sección.</p></div>
                <Link href="/abogados?recorrido=1" className={botonSecundario}>Ver recorrido</Link>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <h2 className="font-bold text-slate-950">Contraseña</h2>
                <Link href="/forgot-password" className={botonSecundario}>Restablecer contraseña</Link>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-[var(--shadow-sm)]" aria-labelledby="baja-titulo">
              <h2 id="baja-titulo" className="border-b border-rose-100 px-4 py-4 font-bold text-rose-800 sm:px-6">Dar de baja mi cuenta</h2>
              <form method="post" onSubmit={event => void guardar(event, 'baja')} aria-busy={busy}>
                <fieldset disabled={busy} className="space-y-4 p-4 sm:p-6">
                  <p className="max-w-2xl text-sm leading-relaxed text-slate-700">Perderás el acceso al portal. Tus causas, pagos, boletas y estampos se conservarán. Puedes contactar a soporte para solicitar la reactivación.</p>
                  <div className="max-w-2xl">
                    <label htmlFor="baja-motivo" className="mb-1.5 block text-sm font-semibold text-slate-800">¿Por qué te vas? <span className="font-normal text-slate-600">(opcional)</span></label>
                    <textarea id="baja-motivo" value={motivo} onChange={event => setMotivo(event.target.value)} maxLength={1000} rows={3}
                      placeholder="Cuéntanos qué no te sirvió" className={controlClassName} />
                  </div>
                  <label className="flex items-start gap-2.5 text-sm text-slate-800">
                    <input type="checkbox" checked={confirma} onChange={event => setConfirma(event.target.checked)} required className="mt-0.5 size-4 shrink-0 accent-rose-700" />
                    Entiendo que perderé el acceso a esta cuenta.
                  </label>
                  <Mensaje aviso={avisoActual} />
                  <button type="submit" disabled={!confirma || busy} className="inline-flex min-h-11 items-center rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 focus-visible:outline-rose-700 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? 'Procesando…' : 'Dar de baja mi cuenta'}
                  </button>
                </fieldset>
              </form>
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function Mensaje({ aviso }: { aviso?: Aviso }) {
  if (!aviso) return null
  return (
    <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm font-semibold ${aviso.tipo === 'error' ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900'}`}>
      {aviso.texto}
    </p>
  )
}

function PanelDatos({ titulo, descripcion, completo, busy, cambios, aviso, accion, onSubmit, children }: {
  titulo: string; descripcion?: string; completo: number; busy: boolean; cambios: boolean; aviso?: Aviso
  accion?: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode
}) {
  return (
    <section className="app-panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="flex items-center gap-2.5 font-bold text-slate-950"><span aria-hidden="true" className="h-4 w-1 rounded-full bg-blue-700" />{titulo}</h2>
        {descripcion && <p className="text-sm text-slate-600">{descripcion}</p>}
        {accion}
      </header>
      <form method="post" onSubmit={onSubmit} aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0">
          <legend className="sr-only">{titulo}</legend>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">{children}</div>
          <div className="space-y-3 border-t border-slate-200 px-4 py-4 sm:px-6">
            <Mensaje aviso={aviso} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-36 sm:w-56">
                <p className="mb-1.5 text-sm text-slate-600">{completo} de 6 completos</p>
                <progress aria-label={`Campos completos de ${titulo}`} value={completo} max={6}
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 accent-blue-700 [&::-moz-progress-bar]:bg-blue-700 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-blue-700" />
              </div>
              <button type="submit" disabled={!cambios || busy} className={botonPrincipal}>{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
