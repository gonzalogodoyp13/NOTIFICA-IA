import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { chileDayBounds } from '../../lib/reports/chileTime'
import { buildDailyAuditWorkbook, dailyEventDetail } from '../../lib/reports/dailyWorkbook'
import { classifyActivityAction } from '../../lib/audit/classification'

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
  it('classifies canonical, legacy and historical action names without dropping unknown activity', () => {
    for (const verb of ['create', 'created', 'generate', 'generated']) {
      expect(classifyActivityAction(`notification.${verb}`)).toBe('CREATE')
    }
    for (const verb of ['update', 'updated', 'regenerated', 'corrected', 'status_changed', 'completed', 'scheduled', 'payment', 'boleta', 'undo', 'reset', 'toggled', 'resolution', 'reply_classify']) {
      expect(classifyActivityAction(`notification.${verb}`)).toBe('UPDATE')
    }
    for (const verb of ['delete', 'deleted', 'voided', 'cancelled', 'canceled', 'anulled']) {
      expect(classifyActivityAction(`notification.${verb}`)).toBe('DELETE')
    }
    expect(classifyActivityAction('legacy.event', 'Registro eliminado historicamente.')).toBe('DELETE')
    expect(classifyActivityAction('search.roles')).toBe('OTHER')
  })

  it('places canonical created, updated and deleted events in their action sheets', async () => {
    const buffer = await buildDailyAuditWorkbook({
      officeName: 'Oficina QA',
      periodDate: '2026-06-22',
      periodStart: new Date('2026-06-22T04:00:00.000Z'),
      periodEnd: new Date('2026-06-23T03:59:59.999Z'),
      generatedAt: new Date('2026-06-23T11:00:00.000Z'),
      events: [
        event({ id: 1, eventType: 'notification.created' }),
        event({ id: 2, eventType: 'notification.updated' }),
        event({ id: 3, eventType: 'notification.deleted' }),
        event({ id: 4, eventType: 'search.roles' }),
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    expect(workbook.getWorksheet('Creaciones')?.getCell('D2').value).toBe('notification.created')
    expect(workbook.getWorksheet('Modificaciones')?.getCell('D2').value).toBe('notification.updated')
    expect(workbook.getWorksheet('Eliminaciones')?.getCell('D2').value).toBe('notification.deleted')
    expect(workbook.getWorksheet('Actividad')?.rowCount).toBe(5)
  })

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
