import { describe, expect, it } from 'vitest'
import { ajusteAbogadoSchema, boletaParaNuevoEncargo, boletaVacia } from '@/lib/encargos/ajustes'

const contacto = {
  nombre: 'Abogada de prueba', rut: '12.345.678-5', correo: 'contacto@example.test',
  telefono: '+56 9 1234 5678', comuna: 'Chillán', direccion: 'Calle Ficticia 8',
}

describe('Ajustes del portal de abogados', () => {
  it('valida cada formulario sin aceptar un identificador de otra cuenta', () => {
    expect(ajusteAbogadoSchema.safeParse({ accion: 'contacto', datos: contacto }).success).toBe(true)
    expect(ajusteAbogadoSchema.safeParse({ accion: 'contacto', datos: { ...contacto, nombre: ' ' } }).success).toBe(false)
    expect(ajusteAbogadoSchema.safeParse({ accion: 'contacto', datos: contacto, authUserId: 'otra-cuenta' }).success).toBe(false)
    expect(ajusteAbogadoSchema.safeParse({ accion: 'boleta', datos: { ...boletaVacia, nombre: 'Estudio' } }).success).toBe(false)
  })

  it('precarga la boleta usando la preferencia guardada o los datos de contacto', () => {
    expect(boletaParaNuevoEncargo(contacto, boletaVacia, 'acceso@example.test')).toMatchObject({
      nombre: contacto.nombre, rut: contacto.rut, correo: contacto.correo, aNombreDe: '', retencion: '',
    })
    expect(boletaParaNuevoEncargo(contacto, { ...boletaVacia, nombre: 'Estudio de prueba', rut: '76.123.456-K', correo: 'boleta@example.test' }, 'acceso@example.test')).toMatchObject({
      nombre: contacto.nombre, rut: '76.123.456-K', correo: 'boleta@example.test', aNombreDe: 'Estudio de prueba', retencion: '',
    })
  })

  it('exige confirmación explícita para la baja y acepta un motivo vacío', () => {
    expect(ajusteAbogadoSchema.safeParse({ accion: 'baja', motivo: '', confirma: false }).success).toBe(false)
    expect(ajusteAbogadoSchema.safeParse({ accion: 'baja', motivo: '', confirma: true }).success).toBe(true)
  })
})
