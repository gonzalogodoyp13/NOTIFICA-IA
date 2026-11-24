import { Plus, Trash2, UsersRound } from 'lucide-react'
import { comunasDeChile } from '@/lib/encargos/comunas'
import { maxDirecciones, type DatosEncargo, type ReceptorDisponible } from '@/lib/encargos/schema'
import { InputField, Panel } from './Fields'

type Persona = DatosEncargo['personas'][number]
export const direccionVacia = { calle: '', unidad: '', comuna: '' }
export const personaVacia: Persona = { nombre: '', rut: '', direcciones: [direccionVacia] }

export function ReceptoresField({ corte, receptores, seleccion, status, onToggle, onRetry }: {
  corte: string; receptores: ReceptorDisponible[]; seleccion: string[]; status: 'cargando' | 'error' | 'listo'
  onToggle: (id: string) => void; onRetry: () => void
}) {
  return (
    <Panel title="Receptor">
      {status === 'cargando' ? <p role="status" className="text-sm text-slate-600">Cargando receptores…</p>
        : status === 'error' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p role="alert" className="text-sm text-rose-900">No pudimos consultar los receptores de {corte}.</p>
            <button type="button" className="text-sm font-bold text-blue-800 underline underline-offset-4" onClick={onRetry}>Reintentar</button>
          </div>
        ) : receptores.length ? (
          <fieldset>
            <legend className="mb-3 text-sm text-slate-600">Puedes seleccionar varios receptores disponibles para {corte}.</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {receptores.map(receptor => (
                <label key={receptor.id} className="relative min-w-0 cursor-pointer">
                  <input type="checkbox" checked={seleccion.includes(receptor.id)} onChange={() => onToggle(receptor.id)}
                    className="peer absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 accent-blue-700" />
                  <span className="block h-full rounded-2xl border border-slate-200 py-3 pl-10 pr-3 hover:bg-slate-50 peer-checked:border-blue-500 peer-checked:bg-blue-50">
                    <span className="block break-words font-bold text-slate-900">{receptor.nombre}</span>
                    <span className="mt-0.5 block text-sm text-slate-600">{corte}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <UsersRound className="mt-0.5 size-5 shrink-0 text-blue-700" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-900">Aún no hay receptores disponibles para {corte}.</p>
              <p className="mt-1 text-sm text-slate-600">Puedes completar los datos y guardar el encargo como borrador.</p>
            </div>
          </div>
        )}
    </Panel>
  )
}

export function EjecutadosFields({ cantidad, personas, onChange }: {
  cantidad: number; personas: Persona[]; onChange: (index: number, value: Persona) => void
}) {
  return (
    <Panel title="Ejecutado · A quién notificar" optional>
      <datalist id="encargo-comunas">
        {comunasDeChile.map(comuna => <option key={comuna} value={comuna} />)}
      </datalist>
      <div className="space-y-5">
        {Array.from({ length: cantidad }, (_, index) => {
          const persona = personas[index] ?? personaVacia
          const direcciones = persona.direcciones.length ? persona.direcciones : personaVacia.direcciones
          const personId = `encargo-persona-${index}`
          return (
            <fieldset key={personId} className="min-w-0 rounded-2xl border border-slate-200 px-4 pb-4 pt-2">
              <legend className="px-1.5 font-bold text-slate-900">Persona {index + 1}</legend>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <InputField id={`${personId}-nombre`} label="Nombre completo" value={persona.nombre} maxLength={200}
                  onChange={event => onChange(index, { ...persona, nombre: event.target.value })} />
                <InputField id={`${personId}-rut`} label="RUT" value={persona.rut} maxLength={20} placeholder="12.345.678-5"
                  onChange={event => onChange(index, { ...persona, rut: event.target.value })} />
              </div>
              {direcciones.map((direccion, addressIndex) => {
                const addressId = `${personId}-direccion-${addressIndex}`
                function setDireccion(field: keyof typeof direccion, value: string) {
                  onChange(index, { ...persona, direcciones: direcciones.map((current, i) => i === addressIndex ? { ...current, [field]: value } : current) })
                }
                return (
                  <fieldset key={addressId} className="mt-4 min-w-0 border-t border-slate-200 pt-2">
                    <legend className="pr-2 text-sm font-bold text-slate-800">Dirección {addressIndex + 1}</legend>
                    <div className="grid gap-4 md:grid-cols-3">
                      <InputField id={`${addressId}-calle`} label="Calle y número" value={direccion.calle} maxLength={200}
                        onChange={event => setDireccion('calle', event.target.value)} />
                      <InputField id={`${addressId}-unidad`} label="Depto, oficina (opcional)" value={direccion.unidad} maxLength={100}
                        onChange={event => setDireccion('unidad', event.target.value)} />
                      <InputField id={`${addressId}-comuna`} label="Comuna" value={direccion.comuna} list="encargo-comunas" maxLength={100}
                        onChange={event => setDireccion('comuna', event.target.value)} />
                    </div>
                    {addressIndex > 0 && (
                      <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-800"
                        onClick={() => onChange(index, { ...persona, direcciones: direcciones.filter((_, i) => i !== addressIndex) })}>
                        <Trash2 className="size-4" aria-hidden="true" />Quitar dirección {addressIndex + 1}
                      </button>
                    )}
                  </fieldset>
                )
              })}
              {direcciones.length < maxDirecciones && (
                <button type="button" onClick={() => onChange(index, { ...persona, direcciones: [...direcciones, direccionVacia] })}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-blue-800 hover:bg-blue-50">
                  <Plus className="size-4" aria-hidden="true" />Otra dirección
                </button>
              )}
            </fieldset>
          )
        })}
      </div>
    </Panel>
  )
}

export function PlazosFields({ plazos, onChange }: { plazos: DatosEncargo['plazos']; onChange: (plazos: DatosEncargo['plazos']) => void }) {
  return (
    <Panel title="Plazo y audiencia" optional>
      <div className="grid gap-4 sm:grid-cols-3">
        <InputField id="plazo-notificar" label="Fecha límite para notificar" type="date" value={plazos.limite}
          onChange={event => onChange({ ...plazos, limite: event.target.value })} />
        <InputField id="fecha-audiencia" label="Audiencia" type="date" value={plazos.audiencia}
          onChange={event => onChange({ ...plazos, audiencia: event.target.value })} />
        <InputField id="hora-audiencia" label="Hora de la audiencia" type="time" value={plazos.hora}
          onChange={event => onChange({ ...plazos, hora: event.target.value })} />
      </div>
    </Panel>
  )
}
