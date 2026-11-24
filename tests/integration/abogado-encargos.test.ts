import { describe, expect, it } from 'vitest'
import { guardarEncargoSchema } from '@/lib/encargos/schema'
import { cortesDeApelaciones, tribunalesDeCorte } from '@/lib/encargos/tribunales'

const datos = {
  causa: {
    competencia: 'Civil', corte: 'C.A. San Miguel', tribunal: '10° Juzgado de Garantía de Santiago',
    rol: 'C-1234-2025', cantidad: 2, tipo: 'Notificación de demanda', detalle: 'Notificación demanda ordinaria', notas: '',
  },
  receptorIds: [] as string[],
  personas: [{ nombre: '', rut: '', direcciones: [
    { calle: 'Calle de prueba 1', unidad: '', comuna: 'San Miguel' },
    { calle: 'Calle de prueba 2', unidad: 'Oficina 4', comuna: 'Santiago' },
  ] }],
  plazos: { limite: '', audiencia: '', hora: '' },
  boleta: { nombre: 'Cuenta de prueba', rut: '', correo: 'prueba@example.test', aNombreDe: '', retencion: '' },
}
const id = '898a3c83-4f2d-4f68-960b-673eda7ddaea'

describe('Nuevo encargo', () => {
  it('usa las 17 cortes y distingue los tribunales de Santiago y San Miguel', () => {
    expect(cortesDeApelaciones).toHaveLength(17)
    expect(tribunalesDeCorte('C.A. Santiago')).toContain('9° Juzgado de Garantía de Santiago')
    expect(tribunalesDeCorte('C.A. Santiago')).not.toContain('10° Juzgado de Garantía de Santiago')
    expect(tribunalesDeCorte('C.A. San Miguel')).toContain('10° Juzgado de Garantía de Santiago')
    expect(tribunalesDeCorte('__proto__')).toEqual([])
    for (const corte of cortesDeApelaciones) {
      const tribunales = tribunalesDeCorte(corte)
      expect(tribunales.length).toBeGreaterThan(0)
      expect(new Set(tribunales).size).toBe(tribunales.length)
    }
  })

  it('permite guardar un borrador sin receptores y obliga a revisar el tribunal cuando cambia la corte', () => {
    expect(guardarEncargoSchema.safeParse({ id, accion: 'guardar', datos }).success).toBe(true)
    const otraCorte = { ...datos, causa: { ...datos.causa, corte: 'C.A. Santiago' } }
    expect(guardarEncargoSchema.safeParse({ id, accion: 'guardar', datos: otraCorte }).success).toBe(false)
  })

  it('requiere receptores y datos obligatorios de boleta antes de enviar, con Ejecutado y Plazos opcionales', () => {
    const fallo = guardarEncargoSchema.safeParse({ id, accion: 'enviar', datos })
    expect(fallo.error?.issues.map(issue => issue.path.join('.'))).toEqual([
      'datos.receptorIds', 'datos.boleta.rut', 'datos.boleta.retencion',
    ])
    const completo = { ...datos, receptorIds: ['receptor-1', 'receptor-2'], personas: [],
      boleta: { ...datos.boleta, rut: '12.345.678-5', retencion: 'receptor' } }
    expect(guardarEncargoSchema.safeParse({ id, accion: 'enviar', datos: completo }).success).toBe(true)
    const horaSinFecha = { ...completo, plazos: { ...completo.plazos, hora: '14:30' } }
    expect(guardarEncargoSchema.safeParse({ id, accion: 'enviar', datos: horaSinFecha }).success).toBe(false)
  })
})
