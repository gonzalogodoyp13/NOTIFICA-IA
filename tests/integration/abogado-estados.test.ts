import { describe, expect, it } from 'vitest'
import type { RespuestaEncargo } from '@prisma/client'
import { estadoDeCausa } from '@/lib/encargos/estados'

const fecha = new Date('2026-11-23T18:00:00Z')
const receptor = (respuesta: RespuestaEncargo, pagos = 0) => ({ respuesta, _count: { pagos } })

describe('Estados del portal de abogados', () => {
  it('mantiene los borradores fuera del ciclo del encargo', () => {
    expect(estadoDeCausa({ enviadoAt: null, finalizadoAt: null, receptores: [] })).toBe('borrador')
  })

  it('espera respuestas hasta que haya una aceptación o todos hayan rechazado', () => {
    const causa = { enviadoAt: fecha, finalizadoAt: null }
    expect(estadoDeCausa({ ...causa, receptores: [] })).toBe('esperando-respuesta')
    expect(estadoDeCausa({ ...causa, receptores: [receptor('RECHAZADA'), receptor('PENDIENTE')] })).toBe('esperando-respuesta')
    expect(estadoDeCausa({ ...causa, receptores: [receptor('RECHAZADA'), receptor('RECHAZADA')] })).toBe('no-aceptadas')
  })

  it('reconoce el pago del receptor que aceptó y requiere el cierre para finalizar', () => {
    const causa = { enviadoAt: fecha, finalizadoAt: null }
    expect(estadoDeCausa({ ...causa, receptores: [receptor('ACEPTADA'), receptor('PENDIENTE', 1)] })).toBe('por-pagar')
    const aceptada = { ...causa, receptores: [receptor('ACEPTADA', 1), receptor('RECHAZADA')] }
    expect(estadoDeCausa(aceptada)).toBe('en-curso')
    expect(estadoDeCausa({ ...aceptada, finalizadoAt: fecha })).toBe('finalizadas')
  })
})
