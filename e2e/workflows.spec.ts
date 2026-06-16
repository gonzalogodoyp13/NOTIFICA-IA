import { readFileSync } from 'node:fs'
import { test, expect, request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

import {
  AUTH_STATE_PATH,
  authStateExists,
  buildWizardAnswers,
  findQaContext,
  qaName,
  qaRequestSuffix,
  qaRol,
  validateRecibosWorkbook,
} from '../scripts/qa-support'

const prisma = new PrismaClient()

type JsonRecord = Record<string, unknown>

async function parseJson(response: APIResponse): Promise<JsonRecord> {
  return await response.json() as JsonRecord
}

function dataOf<T extends JsonRecord>(payload: JsonRecord): T {
  expect(payload.ok).toBe(true)
  expect(payload.data).toBeTruthy()
  return payload.data as T
}

async function expectError(response: APIResponse, status: number) {
  expect(response.status()).toBe(status)
  const payload = await parseJson(response)
  expect(payload.ok).toBe(false)
  return payload
}

async function expectStatus(response: APIResponse, status: number) {
  const body = await response.text().catch(() => '')
  expect(response.status(), body).toBe(status)
  return body
}

async function createAuthenticatedContext(baseURL: string | undefined) {
  if (!authStateExists()) {
    throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth once before npm run test:e2e.')
  }
  readFileSync(AUTH_STATE_PATH)
  return playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
}

async function createDemand(api: APIRequestContext, suffix: string) {
  const qa = await findQaContext(prisma)
  const rol = qaRol(`E2E-${suffix}`)
  const response = await api.post('/api/demandas', {
    data: {
      rol,
      tribunalId: qa.tribunalId,
      caratula: qaName(`E2E Caratula ${suffix}`),
      cuantia: 125000,
      abogadoId: qa.abogadoId,
      materiaId: qa.materiaId,
      procuradorId: qa.procuradorId,
      ejecutados: [
        {
          nombre: qaName(`E2E Ejecutado ${suffix}`),
          rut: '44.444.444-4',
          direccion: 'Pasaje QA 1000',
          comunaId: qa.comunaId,
        },
      ],
    },
  })
  const body = await expectStatus(response, 201)
  const demanda = dataOf<{ id: string; rolId: string; ejecutados: Array<{ id: string }> }>(JSON.parse(body) as JsonRecord)
  expect(demanda.rolId).toBeTruthy()
  expect(demanda.ejecutados[0]?.id).toBeTruthy()
  return { qa, rol, demanda, ejecutadoId: demanda.ejecutados[0].id }
}

async function createDiligence(api: APIRequestContext, rolId: string, tipoId: string, ejecutadoId: string, includeExecution = true) {
  const response = await api.post(`/api/roles/${rolId}/diligencias`, {
    data: {
      tipoId,
      fecha: '2026-06-10T14:00:00.000Z',
      ejecutadoId,
      meta: includeExecution
        ? {
            qa: 'QA-P9',
            fechaEjecucion: '2026-06-10T14:00:00.000Z',
            horaEjecucion: '14:00',
            monto: 125000,
          }
        : { qa: 'QA-P9' },
    },
  })
  const body = await expectStatus(response, 200)
  return dataOf<{ id: string }>(JSON.parse(body) as JsonRecord)
}

async function createNotification(api: APIRequestContext, rolId: string, diligenceId: string, ejecutadoId: string) {
  const response = await api.post(`/api/roles/${rolId}/diligencias/${diligenceId}/notificaciones`, {
    data: { ejecutadoId },
  })
  const body = await expectStatus(response, 200)
  return dataOf<{ id: string; ejecutadoId: string }>(JSON.parse(body) as JsonRecord)
}

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('authenticated workflow creates demanda, diligencia, notification, estampos, recibo, and XLSX export', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const { qa, rol, demanda, ejecutadoId } = await createDemand(api, suffix)
  const diligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  const notification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)

  const executionResponse = await api.patch(`/api/roles/${demanda.rolId}/diligencias/${diligence.id}/notificaciones/${notification.id}`, {
    data: {
      meta: {
        qa: 'QA-P9',
        fechaEjecucion: '2026-06-10T14:00:00.000Z',
        horaEjecucion: '14:15',
        resultado: 'POSITIVA',
        monto: 125000,
        ejecutadoId,
      },
    },
  })
  const executionBody = await expectStatus(executionResponse, 200)
  const executed = dataOf<{ step1Done: boolean; meta: JsonRecord }>(JSON.parse(executionBody) as JsonRecord)
  expect(executed.step1Done).toBe(true)

  const customResponse = await api.post(`/api/diligencias/${diligence.id}/estampo`, {
    data: {
      estampoId: qa.customEstampoId,
      notificacionId: notification.id,
      contenidoPersonalizado: 'CERTIFICO QA $nombre_ejecutado ROL $rol $tribunal $hora_diligencia.',
    },
  })
  const customBody = await expectStatus(customResponse, 200)
  const customDoc = dataOf<{ id: string; hasPdf: boolean }>(JSON.parse(customBody) as JsonRecord)
  expect(customDoc.hasPdf).toBe(true)

  const wizard = await prisma.estampoBase.findUniqueOrThrow({ where: { id: qa.wizardEstampoBaseId } })
  const wizardResponse = await api.post(`/api/diligencias/${diligence.id}/estampos/generate`, {
    data: {
      estampoBaseId: wizard.id,
      notificacionId: notification.id,
      wizardAnswers: {
        ...buildWizardAnswers(wizard.wizardSchema),
        firma: qaName('Firma Receptor'),
      },
    },
  })
  const wizardBody = await expectStatus(wizardResponse, 200)
  const wizardDoc = dataOf<{ documento: { id: string; hasPdf: boolean } }>(JSON.parse(wizardBody) as JsonRecord).documento
  expect(wizardDoc.hasPdf).toBe(true)

  const receiptResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    data: {
      notificacionId: notification.id,
      monto: 25000,
      medio: 'TRANSFERENCIA',
      referencia: `QA-BOLETA-${suffix}`,
    },
  })
  const receiptBody = await expectStatus(receiptResponse, 200)
  const receiptDoc = dataOf<{ id: string; hasPdf: boolean }>(JSON.parse(receiptBody) as JsonRecord)
  expect(receiptDoc.hasPdf).toBe(true)

  await expectError(
    await api.post(`/api/diligencias/${diligence.id}/recibo`, {
      data: {
        notificacionId: notification.id,
        monto: 25000,
        medio: 'TRANSFERENCIA',
        referencia: `QA-BOLETA-${suffix}`,
      },
    }),
    409
  )

  const generatedDocs = await prisma.documento.findMany({
    where: { id: { in: [customDoc.id, wizardDoc.id, receiptDoc.id] } },
    include: { currentVersion: true },
  })
  expect(generatedDocs).toHaveLength(3)
  for (const doc of generatedDocs) {
    expect(doc.rolId).toBe(demanda.rolId)
    expect(doc.currentVersion?.storageBucket).toBeTruthy()
    expect(doc.currentVersion?.storageKey).toContain(`/roles/${demanda.rolId}/`)
    expect(doc.currentVersion?.sizeBytes).toBeGreaterThan(0)
    expect(doc.currentVersion?.checksumSha256).toHaveLength(64)
  }

  const receipt = await prisma.recibo.findFirstOrThrow({ where: { documentoId: receiptDoc.id } })
  expect(receipt.officeId).toBe(qa.officeId)
  expect(receipt.notificacionId).toBe(notification.id)

  const exportResponse = await api.post('/api/recibos/export', {
    data: {
      filters: { rol },
      selection: { mode: 'allFiltered', excludedIds: [] },
    },
  })
  expect(exportResponse.status()).toBe(200)
  expect(exportResponse.headers()['content-type']).toContain('spreadsheetml.sheet')
  await validateRecibosWorkbook(Buffer.from(await exportResponse.body()), rol)

  await api.dispose()
})

test('workflow safety cases return expected status codes', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const qa = await findQaContext(prisma)
  const unauthenticated = await playwrightRequest.newContext({ baseURL })

  await expectError(
    await unauthenticated.post('/api/demandas', {
      data: {
        rol: qaRol('UNAUTH'),
      },
    }),
    401
  )

  const invalidDemand = await api.post('/api/demandas', {
    data: {
      rol: '',
      tribunalId: qa.tribunalId,
      caratula: '',
      abogadoId: qa.abogadoId,
    },
  })
  await expectError(invalidDemand, 400)

  await expectError(
    await api.post('/api/roles/qa-p9-missing-role/diligencias', {
      data: {
        tipoId: qa.diligenciaTipoId,
        fecha: '2026-06-10T14:00:00.000Z',
      },
    }),
    404
  )

  const suffix = qaRequestSuffix().toUpperCase()
  const { demanda, ejecutadoId } = await createDemand(api, `NEG-${suffix}`)
  const noExecutionDiligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId, false)
  const notification = await createNotification(api, demanda.rolId, noExecutionDiligence.id, ejecutadoId)

  await expectError(
    await api.post(`/api/diligencias/${noExecutionDiligence.id}/recibo`, {
      data: {
        notificacionId: notification.id,
        monto: 25000,
        medio: 'TRANSFERENCIA',
        referencia: `QA-BOLETA-MISSING-DATE-${suffix}`,
      },
    }),
    400
  )

  const invalidSelectionDiligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  await expectError(
    await api.post(`/api/roles/${demanda.rolId}/diligencias/${invalidSelectionDiligence.id}/notificaciones`, {
      data: { ejecutadoId: 'not-a-real-ejecutado' },
    }),
    400
  )

  await unauthenticated.dispose()
  await api.dispose()
})
