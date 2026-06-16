import { describe, expect, it } from 'vitest'

import { buildRecibosWorkbook } from '../../lib/recibos/xlsx'
import { validateRecibosWorkbook } from '../../scripts/qa-support'

describe('receipt export workbook validation', () => {
  it('parses generated XLSX bytes and finds the QA receipt row', async () => {
    const workbook = await buildRecibosWorkbook([
      {
        reciboId: 'qa-recibo',
        createdAt: '2026-06-10T14:20:00.000Z',
        rolId: 'qa-role',
        documentoId: 'qa-doc',
        notificacionId: 'qa-notification',
        numeroRecibo: 'QA-REC-001',
        rol: 'QA-P9-EXPORT',
        tribunal: 'QA Tribunal',
        caratula: 'QA Caratula',
        gestion: 'Notificacion',
        estampoTemplate: 'QA Template',
        estampoTemplateKey: 'custom:qa',
        resultado: 'POSITIVA',
        abogado: 'QA Abogado',
        procurador: 'QA Procurador',
        banco: 'QA Banco',
        valor: 25000,
        fechaRecibo: '2026-06-10T14:20:00.000Z',
        fechaEjecucion: '2026-06-10T14:00:00.000Z',
        fechaPago: '2026-06-11T14:00:00.000Z',
        estado: 'Pagado',
        numeroBoleta: 'B-QA-001',
      },
    ], 'QA export')

    await expect(validateRecibosWorkbook(Buffer.from(workbook), 'QA-P9-EXPORT')).resolves.toBeUndefined()
  })
})

