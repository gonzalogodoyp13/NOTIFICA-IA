import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { chileDayBounds } from '../../lib/reports/chileTime'
import { buildDailyAuditWorkbook, dailyEventDetail } from '../../lib/reports/dailyWorkbook'

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    officeId: 1,
    userId: 'user-1',
    eventType: 'search.roles',
    module: 'search',
    result: 'success',
    recordType: 'RolCausa',
    recordId: 'role-1',
    rolId: 'role-1',
    rol: 'C-0001-2026',
    shortName: 'Caratula QA',
    description: 'Busqueda de roles realizada.',
    metadata: { resultCount: 3, page: 1, pageSize: 50 },
    occurredAt: new Date('2026-06-22T15:00:00.000Z'),
    createdAt: new Date('2026-06-22T15:00:01.000Z'),
    user: { email: 'user@example.com' },
    ...overrides,
  } as any
}

describe('daily report Chile date bounds', () => {
  it('converts winter Chile calendar days to UTC bounds', () => {
    const bounds = chileDayBounds('2026-06-22')
    expect(bounds.start.toISOString()).toBe('2026-06-22T04:00:00.000Z')
    expect(bounds.end.toISOString()).toBe('2026-06-23T03:59:59.999Z')
  })

  it('converts summer Chile calendar days to UTC bounds', () => {
    const bounds = chileDayBounds('2026-01-15')
    expect(bounds.start.toISOString()).toBe('2026-01-15T03:00:00.000Z')
    expect(bounds.end.toISOString()).toBe('2026-01-16T02:59:59.999Z')
  })

  it('rejects invalid calendar dates', () => {
    expect(() => chileDayBounds('2026-02-31')).toThrow('fecha')
  })
})

describe('daily report workbook', () => {
  it('creates all required worksheets and hides raw metadata JSON', async () => {
    const buffer = await buildDailyAuditWorkbook({
      officeName: 'Oficina QA',
      periodDate: '2026-06-22',
      periodStart: new Date('2026-06-22T04:00:00.000Z'),
      periodEnd: new Date('2026-06-23T03:59:59.999Z'),
      generatedAt: new Date('2026-06-23T11:00:00.000Z'),
      events: [
        event({
          eventType: 'document.download',
          module: 'documents',
          metadata: {
            mode: 'download',
            fileName: 'qa.pdf',
            searchText: 'NO-DEBE-APARECER',
            body: 'NO-DEBE-APARECER',
            rawDocumentText: 'NO-DEBE-APARECER',
          },
        }),
        event({
          id: 2,
          eventType: 'roles.delete',
          module: 'roles',
          metadata: { deletedRecord: { recordType: 'RolCausa', recordId: 'role-1', rol: 'C-0001-2026' } },
        }),
        event({ id: 3, eventType: 'document.access_denied', module: 'security', result: 'denied' }),
      ],
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'Resumen',
      'Por usuario',
      'Actividad',
      'Creaciones',
      'Modificaciones',
      'Eliminaciones',
      'Documentos y descargas',
      'Correos',
      'Pagos y boletas',
      'Errores',
    ])
    expect(workbook.getWorksheet('Actividad')?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(workbook.getWorksheet('Correos')?.getCell('A2').value).toBe('Sin actividad')
    const serialized = JSON.stringify(workbook.model)
    expect(serialized).not.toContain('NO-DEBE-APARECER')
    expect(serialized).not.toContain('searchText')
    expect(serialized).not.toContain('rawDocumentText')
  })

  it('renders friendly details instead of JSON', () => {
    expect(dailyEventDetail(event({ metadata: { resultCount: 2, page: 1, pageSize: 50 } }))).toBe(
      'ROL: C-0001-2026 | Nombre: Caratula QA | Registro: RolCausa | ID interno: role-1 | Cantidad: 2 | Pagina: 1 | Tamano pagina: 50'
    )
  })
})
