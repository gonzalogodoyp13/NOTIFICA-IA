import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { createReceiptTestDatabase } from './receipt-test-database'

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ withApiUser: (_request: unknown, _operation: unknown, callback: (user: { id: string; officeId: number }) => unknown) => callback({ id: 'alice', officeId: 1001 }) }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, {
  get(_target, key) {
    const value = (holder.db as any)[key]
    return typeof value === 'function' ? value.bind(holder.db) : value
  },
}) }))

import { buildReceiptBulkPreview, executeReceiptBulkOperation, operationUndoability, undoReceiptBulkOperation } from '@/lib/recibos/bulk'
import { getReceiptList, parseReceiptFilters } from '@/lib/recibos/query'
import { getReconciliation } from '@/lib/recibos/reconciliation'
import { buildMonthlyReportData } from '@/lib/reports/monthlyReport'
import { chileMonthBounds } from '@/lib/reports/chileTime'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'
import { loadDashboardData } from '@/lib/dashboard/service'
import ExcelJS from 'exceljs'
import { GET as getEncargos } from '@/app/api/encargos/route'

const run = process.env.RUN_RECEIPT_DATABASE_TESTS === '1'
describe.skipIf(!run)('receipt payment isolation in PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createReceiptTestDatabase>>
  const date = new Date('2026-01-10T12:00:00.000Z')
  const filters = parseReceiptFilters(new URLSearchParams())
  const payment = (ids: string[], fechaPago = '2026-01-10') => ({ action: 'markPaid' as const, reciboIds: ids, fechaPago })
  async function apply(input: Parameters<typeof buildReceiptBulkPreview>[1]) {
    const preview = await buildReceiptBulkPreview(1001, input)
    return executeReceiptBulkOperation({ officeId: 1001, userId: 'alice', input, stateHash: preview.stateHash })
  }
  beforeAll(async () => {
    fixture = await createReceiptTestDatabase()
    holder.db = fixture.db
    const db = fixture.db
    // Reconstruct the pre-migration shape so this also verifies backfill on repeat runs.
    await db.$executeRawUnsafe(`ALTER TABLE "${fixture.schema}"."Recibo" DROP COLUMN IF EXISTS "estadoCobro", DROP COLUMN IF EXISTS "fechaPago"`)
    for (const officeId of [1001, 1002]) {
      await db.office.create({ data: { id: officeId, nombre: `Test ${officeId}` } })
      await db.tribunal.create({ data: { id: `t${officeId}`, officeId, nombre: 'Test tribunal' } })
      await db.rolCausa.create({ data: { id: `r${officeId}`, officeId, tribunalId: `t${officeId}`, rol: `TEST-${officeId}` } })
      await db.diligenciaTipo.create({ data: { id: `type${officeId}`, officeId, nombre: 'Test diligence' } })
      await db.diligencia.create({ data: { id: `d${officeId}`, rolId: `r${officeId}`, tipoId: `type${officeId}`, fecha: date } })
    }
    await db.user.create({ data: { id: 'alice', authUserId: 'test-alice', email: 'alice@example.test', officeName: 'Test', officeId: 1001 } })
    await db.diligencia.create({ data: { id: 'legacy', rolId: 'r1001', tipoId: 'type1001', fecha: date, estadoCobro: 'PAGADO', fechaPago: date } })
    for (const [id, officeId, diligenceId] of [['a', 1001, 'd1001'], ['b', 1001, 'd1001'], ['foreign', 1002, 'd1002'], ['legacy-a', 1001, 'legacy'], ['legacy-b', 1001, 'legacy']] as const) {
      await db.notificacion.create({ data: { id: `n-${id}`, diligenciaId: diligenceId } })
      await db.documento.create({ data: { id: `doc-${id}`, officeId, rolId: `r${officeId}`, diligenciaId: diligenceId, notificacionId: `n-${id}`, tipo: 'Recibo', nombre: id, pdfId: `test-${id}` } })
      await db.documento.create({ data: { officeId, rolId: `r${officeId}`, diligenciaId: diligenceId, notificacionId: `n-${id}`, tipo: 'Estampo', nombre: id, pdfId: `stamp-${id}` } })
      await db.$executeRawUnsafe(`INSERT INTO "${fixture.schema}"."Recibo" (id, "rolId", "officeId", "diligenciaId", "notificacionId", "documentoId", "numeroRecibo", monto, medio, "fechaEjecucion", "fechaRecibo") VALUES ($1,$2,$3,$4,$5,$6,$1,10000,'TRANSFERENCIA',$7,$7)`, id, `r${officeId}`, officeId, diligenceId, `n-${id}`, `doc-${id}`, date)
    }
    const migration = readFileSync('prisma/migrations/20261029000000_receipt_payment_state/migration.sql', 'utf8')
      .replace(/"(Recibo|Diligencia|EstadoCobro)"/g, `"${fixture.schema}"."$1"`)
    const statements = migration.replace(/^BEGIN;|^COMMIT;/gm, '').split(';').filter(s => s.trim())
    await db.$transaction(async tx => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement)
    })
  }, 180_000)
  afterAll(async () => { if (fixture) await fixture.dispose() }, 30_000)

  it('preserves existing paid history and defaults unpaid receipts independently', async () => {
    const rows = await fixture.db.recibo.findMany({ orderBy: { id: 'asc' } })
    expect(rows.filter(r => r.estadoCobro === 'PAGADO').map(r => r.id)).toEqual(['legacy-a', 'legacy-b'])
    expect(rows.find(r => r.id === 'legacy-a')?.fechaPago).toEqual(date)
    expect(rows.find(r => r.id === 'b')?.fechaPago).toBeNull()
  })

  it('pays only the selected sibling; lists, filters, exports, reconciliation and monthly rows agree', async () => {
    await apply(payment(['a']))
    expect(await fixture.db.recibo.findUnique({ where: { id: 'b' } })).toMatchObject({ estadoCobro: 'NO_PAGADO', fechaPago: null })
    expect(await fixture.db.diligencia.findUnique({ where: { id: 'd1001' } })).toMatchObject({ estadoCobro: 'NO_PAGADO', fechaPago: null })
    const list = await getReceiptList(1001, filters, { exportAll: true })
    expect(list.rows.find(r => r.reciboId === 'a')).toMatchObject({ estado: 'Pagado', fechaPago: date.toISOString() })
    expect(list.rows.find(r => r.reciboId === 'b')).toMatchObject({ estado: 'Sin pagar', fechaPago: null })
    const unpaid = await getReceiptList(1001, { ...filters, estados: ['NO_PAGADO'] })
    expect(unpaid.rows.map(r => r.reciboId)).toEqual(['b'])
    const reconciliation = await getReconciliation({ officeId: 1001, filters, exportAll: true })
    expect(reconciliation.rows.find(r => r.reciboId === 'a')?.category).toBe('PAID_WITHOUT_BOLETA')
    expect(reconciliation.rows.find(r => r.reciboId === 'b')?.category).toBe('WITHOUT_BOLETA_UNPAID')
    const monthly = await buildMonthlyReportData(1001, chileMonthBounds('2026-01'))
    expect(monthly.qualifiedRows.find(r => r.receiptId === 'a')?.estadoCobro).toBe('PAGADO')
    expect(monthly.qualifiedRows.find(r => r.receiptId === 'b')?.estadoCobro).toBe('NO_PAGADO')
    const dashboard = await loadDashboardData({ officeId: 1001, filters: { abogadoIds: [], bancoIds: [], procuradorIds: [] }, section: 'unpaid' })
    expect(dashboard.rows.unpaid.map(r => r.reciboId)).toEqual(['b'])
    expect(dashboard.metrics.unpaidAmount).toBe(10000)
    const encargos = await (await getEncargos(new NextRequest('http://localhost/api/encargos'))).json()
    expect(encargos.data.find((d: any) => d.id === 'd1001').estadoCobro).toBe('NO_PAGADO')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await buildRecibosWorkbook(list.rows, '') as any)
    const exported = new Map<string, unknown>()
    book.worksheets[0].eachRow((row, index) => { if (index > 4) exported.set(String(row.getCell(1).value), row.getCell(12).value) })
    expect(exported.get('a')).toBe('Pagado')
    expect(exported.get('b')).toBe('Sin pagar')
  }, 30_000)

  it('undo restores only its selected receipt, preserves boletas, and rejects repeated/stale undo', async () => {
    const result = await apply(payment(['b']))
    await apply({ action: 'associateBoleta', reciboIds: ['b'], numeroBoleta: 'B-1' })
    await undoReceiptBulkOperation({ officeId: 1001, userId: 'alice', operationId: result.operationId })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'b' } })).toMatchObject({ estadoCobro: 'NO_PAGADO', fechaPago: null, numeroBoleta: 'B-1' })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'a' } })).toMatchObject({ estadoCobro: 'PAGADO', fechaPago: date })
    expect((await operationUndoability(1001, result.operationId)).reversible).toBe(false)
    const changed = await apply(payment(['b']))
    await apply(payment(['b'], '2026-01-11'))
    expect((await operationUndoability(1001, changed.operationId)).reversible).toBe(false)
  }, 30_000)

  it('adapts legacy diligence snapshots to only the receipts explicitly selected', async () => {
    const snapshot = { targetType: 'diligence', targetId: 'legacy', receiptIds: ['legacy-a'] }
    const old = await fixture.db.receiptBulkOperation.create({ data: { officeId: 1001, userId: 'alice', action: 'markPaid', receiptIds: ['legacy-a'], beforeState: [{ ...snapshot, paymentStatus: 'NO_PAGADO', paymentDate: null }], afterState: [{ ...snapshot, paymentStatus: 'PAGADO', paymentDate: date.toISOString() }] } })
    await undoReceiptBulkOperation({ officeId: 1001, userId: 'alice', operationId: old.id })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'legacy-a' } })).toMatchObject({ estadoCobro: 'NO_PAGADO' })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'legacy-b' } })).toMatchObject({ estadoCobro: 'PAGADO', fechaPago: date })
  }, 15_000)

  it('excludes another office and rejects a preview after its selected receipt changes', async () => {
    const preview = await buildReceiptBulkPreview(1001, payment(['foreign', 'a']))
    expect(preview.items.find(i => i.receiptId === 'foreign')?.disposition).toBe('skipped')
    const input = payment(['a'], '2026-01-12')
    const stale = await buildReceiptBulkPreview(1001, input)
    await apply(payment(['a'], '2026-01-13'))
    await expect(executeReceiptBulkOperation({ officeId: 1001, userId: 'alice', input, stateHash: stale.stateHash })).rejects.toThrow('cambiaron')
    expect(await fixture.db.recibo.findUnique({ where: { id: 'foreign' } })).toMatchObject({ estadoCobro: 'NO_PAGADO', fechaPago: null })
  }, 15_000)

  it('updates multiple selected receipts independently and boleta undo leaves payment untouched', async () => {
    const paid = await apply(payment(['a', 'b'], '2026-01-14'))
    const encargos = await (await getEncargos(new NextRequest('http://localhost/api/encargos'))).json()
    expect(encargos.data.find((d: any) => d.id === 'd1001').estadoCobro).toBe('PAGADO')
    const operation = await fixture.db.receiptBulkOperation.findUniqueOrThrow({ where: { id: paid.operationId } })
    expect(operation.afterState).toMatchObject([
      { targetType: 'receipt', targetId: 'a', receiptIds: ['a'] },
      { targetType: 'receipt', targetId: 'b', receiptIds: ['b'] },
    ])
    const boleta = await apply({ action: 'associateBoleta', reciboIds: ['a', 'b'], numeroBoleta: 'BOTH' })
    await undoReceiptBulkOperation({ officeId: 1001, userId: 'alice', operationId: boleta.operationId })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'a' } })).toMatchObject({ estadoCobro: 'PAGADO', fechaPago: new Date('2026-01-14T12:00:00Z'), numeroBoleta: null })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'b' } })).toMatchObject({ estadoCobro: 'PAGADO', numeroBoleta: 'B-1' })
    await undoReceiptBulkOperation({ officeId: 1001, userId: 'alice', operationId: paid.operationId })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'a' } })).toMatchObject({ fechaPago: new Date('2026-01-13T12:00:00Z') })
    expect(await fixture.db.recibo.findUnique({ where: { id: 'b' } })).toMatchObject({ fechaPago: new Date('2026-01-11T12:00:00Z') })
  }, 30_000)
})
