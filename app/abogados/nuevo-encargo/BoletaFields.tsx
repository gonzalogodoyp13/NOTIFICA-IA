import type { DatosEncargo } from '@/lib/encargos/schema'
import { Choices, InputField, Panel } from './Fields'

const retenciones = [
  { value: 'receptor', label: 'El receptor' },
  { value: 'abogado', label: 'Yo' },
] as const

export default function BoletaFields({ boleta, onChange }: { boleta: DatosEncargo['boleta']; onChange: (boleta: DatosEncargo['boleta']) => void }) {
  return (
    <Panel title="Boleta">
      <div className="space-y-4">
        <InputField id="boleta-nombre" label="Tu nombre" value={boleta.nombre} required maxLength={200}
          onChange={event => onChange({ ...boleta, nombre: event.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField id="boleta-rut" label="RUT" value={boleta.rut} placeholder="12.345.678-5" required maxLength={20}
            onChange={event => onChange({ ...boleta, rut: event.target.value })} />
          <InputField id="boleta-correo" label="Correo" value={boleta.correo} required type="email" maxLength={254}
            onChange={event => onChange({ ...boleta, correo: event.target.value })} />
        </div>
        <InputField id="boleta-a-nombre-de" label="Boleta a nombre de (si es otro: tu estudio o tu cliente)" value={boleta.aNombreDe}
          placeholder="Igual que tu nombre" maxLength={200} onChange={event => onChange({ ...boleta, aNombreDe: event.target.value })} />
        <Choices legend="¿Quién retiene el impuesto?" name="boleta-retencion" value={boleta.retencion} options={retenciones}
          onChange={value => onChange({ ...boleta, retencion: value === 'receptor' ? 'receptor' : 'abogado' })} />
      </div>
    </Panel>
  )
}
