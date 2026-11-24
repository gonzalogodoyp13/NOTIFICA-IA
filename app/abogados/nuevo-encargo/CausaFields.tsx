import { competencias, detallesDeDiligencia, tiposDeDiligencia } from '@/lib/encargos/diligencias'
import { maxPersonas, type DatosEncargo } from '@/lib/encargos/schema'
import { cortesDeApelaciones, tribunalesDeCorte } from '@/lib/encargos/tribunales'
import { Choices, controlClassName, InputField, Panel, SelectField } from './Fields'

const opciones = competencias.map(value => ({ value, label: value }))
export type CausaForm = Omit<DatosEncargo['causa'], 'cantidad'> & { cantidad: string }

export default function CausaFields({ causa, onChange }: {
  causa: CausaForm; onChange: (causa: CausaForm) => void
}) {
  function set<K extends keyof CausaForm>(key: K, value: CausaForm[K]) {
    onChange({ ...causa, [key]: value })
  }

  return (
    <Panel title="La causa">
      <div className="space-y-5">
        <Choices legend="Competencia" name="competencia" value={causa.competencia} options={opciones} onChange={value => set('competencia', value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="corte" label="Corte de Apelaciones" value={causa.corte} options={cortesDeApelaciones}
            placeholder={causa.competencia ? 'Selecciona la corte' : 'Elige primero la competencia'} disabled={!causa.competencia} required
            onChange={event => onChange({ ...causa, corte: event.target.value, tribunal: '' })} />
          <SelectField id="tribunal" label="Tribunal" value={causa.tribunal} options={tribunalesDeCorte(causa.corte)}
            placeholder={causa.corte ? 'Selecciona el tribunal' : 'Elige primero la corte'} disabled={!causa.corte} required
            onChange={event => set('tribunal', event.target.value)} />
          <InputField id="rol" label="ROL o RIT" placeholder="Ej. C-1234-2025" value={causa.rol} maxLength={80} required
            onChange={event => set('rol', event.target.value)} />
          <InputField id="cantidad" label="N° de personas a notificar" value={causa.cantidad} type="number" min={1} max={maxPersonas} step={1} required
            onChange={event => set('cantidad', event.target.value)} />
          <SelectField id="tipo" label="¿Qué necesitas?" value={causa.tipo} options={tiposDeDiligencia}
            placeholder="Notificación, embargo, lanzamiento…" required onChange={event => set('tipo', event.target.value)} />
          <InputField id="detalle" label="Detalle de la diligencia" value={causa.detalle} list="encargo-detalles" autoComplete="off"
            placeholder="Busca o selecciona un detalle" maxLength={180} required onChange={event => set('detalle', event.target.value)} />
          <datalist id="encargo-detalles">
            {detallesDeDiligencia.map(detalle => <option key={detalle} value={detalle} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="encargo-notas" className="mb-1.5 block text-sm font-semibold text-slate-800">Notas extras <span className="font-normal text-slate-500">(opcional)</span></label>
          <textarea id="encargo-notas" rows={3} maxLength={4000} value={causa.notas} placeholder="Agrega información que el receptor deba conocer antes de responder."
            onChange={event => set('notas', event.target.value)} className={controlClassName} />
        </div>
      </div>
    </Panel>
  )
}
