import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  abogadoBanco: { findMany: vi.fn() },
  procurador: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/api/server', () => ({
  withApiUser: (_req: unknown, _label: string, handler: (user: unknown) => unknown) => handler({ officeId: 7 }),
}))
vi.mock('@/lib/audit/businessEvents', () => ({ recordSettingsEvent: vi.fn() }))

import { GET } from '../../app/api/procuradores/route'
import { validateProcuradorBanks } from '../../lib/procuradorBanks'
import { resolveDemandaBank } from '../../lib/demandaBank'
import { mapProcuradorListItem } from '../../lib/procuradores'
import { ProcuradorSchema, ProcuradorUpdateSchema } from '../../lib/zodSchemas'

beforeEach(() => vi.clearAllMocks())

describe('explicit procurador banks', () => {
  it('keeps both attorney and bank predicates when the demanda supplies both', async () => {
    db.procurador.findMany.mockResolvedValue([])
    const response = await GET(new NextRequest('http://localhost/api/procuradores?abogadoId=11&bancoId=22'))
    expect(response.status).toBe(200)
    expect(db.procurador.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        officeId: 7,
        abogados: { some: { abogadoId: 11, officeId: 7 } },
        bancos: { some: { bancoId: 22, officeId: 7 } },
      },
    }))
  })

  it('returns only selected banks, not every bank of an assigned attorney', () => {
    const first = { bancoId: 22, banco: { id: 22, nombre: 'Primero' } }
    const second = { bancoId: 23, banco: { id: 23, nombre: 'Segundo' } }
    const record = { id: 1, nombre: 'QA', email: null, telefono: null, notas: null, activo: true,
      createdAt: new Date(), updatedAt: new Date(), bancos: [second],
      abogados: [{ abogadoId: 11, abogado: { id: 11, nombre: 'QA abogado', bancos: [first, second] } }],
    }
    expect(mapProcuradorListItem(record).bancos).toEqual([second])
    expect(mapProcuradorListItem({ ...record, bancos: [] }).bancos).toEqual([])
    expect(mapProcuradorListItem({ ...record, abogados: [] }).bancos).toEqual([])
  })

  it('preserves explicit empty selections in create and update payloads', () => {
    expect(ProcuradorSchema.parse({ nombre: 'QA', abogadoIds: [11], bancoIds: [] }).bancoIds).toEqual([])
    expect(ProcuradorUpdateSchema.parse({ bancoIds: [22] }).bancoIds).toEqual([22])
    expect(ProcuradorUpdateSchema.safeParse({ bancoIds: [-1] }).success).toBe(false)
  })

  it('rejects a bank outside the selected attorneys and office', async () => {
    db.abogadoBanco.findMany.mockResolvedValue([{ bancoId: 22 }])
    await expect(validateProcuradorBanks(db as never, 7, [11], [23])).rejects.toThrow('Selecciona solamente')
    expect(db.abogadoBanco.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { officeId: 7, abogadoId: { in: [11] }, bancoId: { in: [23] }, banco: { officeId: 7 } },
    }))
    await expect(validateProcuradorBanks(db as never, 7, [11], [22])).resolves.toBeUndefined()
  })
})

describe('demanda bank inheritance', () => {
  beforeEach(() => db.abogadoBanco.findMany.mockResolvedValue([
    { banco: { id: 22, nombre: 'Primero' } }, { banco: { id: 23, nombre: 'Segundo' } },
  ]))

  it('retains the selected second bank independently of a manual caratula prefix', async () => {
    expect(await resolveDemandaBank(7, 11, 'Nombre manual/Detalle', 23)).toBe(23)
  })
  it('resolves a legacy composed caratula without choosing the first attorney bank', async () => {
    expect(await resolveDemandaBank(7, 11, 'Segundo/Detalle/con barra')).toBe(23)
  })
  it('does not guess an ambiguous legacy bank', async () => {
    expect(await resolveDemandaBank(7, 11, 'Nombre manual/Detalle')).toBeNull()
  })
  it('rejects a foreign or malformed explicit bank', async () => {
    await expect(resolveDemandaBank(7, 11, 'Segundo/Detalle', 99)).rejects.toThrow('no pertenece')
    await expect(resolveDemandaBank(7, 11, 'Segundo/Detalle', 23.5)).rejects.toThrow('no pertenece')
  })
})
