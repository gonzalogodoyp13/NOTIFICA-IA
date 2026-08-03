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
  expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
  const payload = await parseJson(response)
  expect(payload.ok).toBe(false)
  return payload
}

async function expectStatus(response: APIResponse, status: number) {
  const body = await response.text().catch(() => '')
  expect(response.status(), body).toBe(status)
  expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
  return body
}

async function waitForCanonicalEvents(officeId: number, startedAt: Date, minimum: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const events = await prisma.activityEvent.findMany({
      where: { officeId, occurredAt: { gte: startedAt } },
      orderBy: { occurredAt: 'asc' },
    })
    if (events.length >= minimum) return events
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return prisma.activityEvent.findMany({
    where: { officeId, occurredAt: { gte: startedAt } },
    orderBy: { occurredAt: 'asc' },
  })
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
  const startedAt = new Date(Date.now() - 1_000)
  const initialQa = await findQaContext(prisma)
  const legacyCountBefore = await prisma.auditLog.count({ where: { officeId: initialQa.officeId } })
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
  const customResult = dataOf<{ documento: { id: string; hasPdf: boolean }; notificacion: JsonRecord | null }>(JSON.parse(customBody) as JsonRecord)
  const customDoc = customResult.documento
  expect(customDoc.hasPdf).toBe(true)
  expect(customResult.notificacion?.id).toBe(notification.id)

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
    headers: { 'Idempotency-Key': `qa-receipt-${suffix}` },
    data: {
      notificacionId: notification.id,
      bancoId: qa.bancoId,
      operation: 'GENERATE',
      ejecucion: { fecha: '2026-06-10', hora: '14:15' },
      estampoTipo: { kind: 'CUSTOM', estampoId: qa.customEstampoId },
      monto: 25000,
      medio: 'TRANSFERENCIA',
      referencia: `QA-BOLETA-${suffix}`,
    },
  })
  const receiptBody = await expectStatus(receiptResponse, 200)
  const receiptResult = dataOf<{ documento: { id: string; hasPdf: boolean } }>(JSON.parse(receiptBody) as JsonRecord)
  const receiptDoc = receiptResult.documento
  expect(receiptDoc.hasPdf).toBe(true)

  await expectError(
    await api.post(`/api/diligencias/${diligence.id}/recibo`, {
      headers: { 'Idempotency-Key': `qa-receipt-conflict-${suffix}` },
      data: {
        notificacionId: notification.id,
        bancoId: qa.bancoId,
        operation: 'GENERATE',
        ejecucion: { fecha: '2026-06-10', hora: '14:15' },
        estampoTipo: { kind: 'CUSTOM', estampoId: qa.customEstampoId },
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
  expect(exportResponse.headers()['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
  expect(exportResponse.headers()['content-type']).toContain('spreadsheetml.sheet')
  await validateRecibosWorkbook(Buffer.from(await exportResponse.body()), rol)

  const events = await waitForCanonicalEvents(qa.officeId, startedAt, 8)
  const expectExactlyOne = (eventType: string, recordId: string) => {
    const matching = events.filter(event => event.eventType === eventType && event.recordId === recordId)
    expect(matching, `${eventType} should have exactly one canonical event for ${recordId}`).toHaveLength(1)
    expect(matching[0].requestId).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
    expect(matching[0].actorType).toBe('USER')
    expect(matching[0].source).toBe('WEB')
    return matching[0]
  }

  const successfulActionEvents = [
    expectExactlyOne('case.created', demanda.id),
    expectExactlyOne('diligence.created', diligence.id),
    expectExactlyOne('notification.created', notification.id),
    expectExactlyOne('notification.updated', notification.id),
    expectExactlyOne('stamp.generated', customDoc.id),
    expectExactlyOne('stamp.generated', wizardDoc.id),
    expectExactlyOne('receipt.generated', receipt.id),
  ]
  for (const actionEvent of successfulActionEvents) {
    const successesForRequest = events.filter(event => event.requestId === actionEvent.requestId && event.result === 'success')
    expect(successesForRequest, `request ${actionEvent.requestId} should produce one successful business event`).toHaveLength(1)
  }

  const workflowRecordIds = new Set([
    demanda.id,
    diligence.id,
    notification.id,
    customDoc.id,
    wizardDoc.id,
    receipt.id,
  ])
  const workflowEvents = events.filter(event => event.recordId && workflowRecordIds.has(event.recordId))
  const forbiddenMetadataKeys = /(^|_)(name|nombre|email|rut|phone|telefono|address|direccion|note|nota|search|body|subject|pdf|secret|password|token|prompt|variables?)($|_)/i
  for (const event of workflowEvents) {
    expect(event.metadata).toBeTruthy()
    const metadata = event.metadata as JsonRecord
    expect(Object.keys(metadata).some(key => forbiddenMetadataKeys.test(key))).toBe(false)
    const serialized = JSON.stringify(metadata)
    expect(serialized).not.toContain('44.444.444-4')
    expect(serialized).not.toContain('Pasaje QA 1000')
    expect(serialized).not.toContain(`E2E Caratula ${suffix}`)
    expect(serialized).not.toContain(`E2E Ejecutado ${suffix}`)
    expect(serialized).not.toContain('Firma Receptor')
    expect(serialized).not.toContain('CERTIFICO QA')
  }

  const legacyCountAfter = await prisma.auditLog.count({ where: { officeId: qa.officeId } })
  expect(legacyCountAfter).toBe(legacyCountBefore)

  await api.dispose()
})

test('receipt lifecycle is idempotent and distinguishes regeneration from correction', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const startedAt = new Date(Date.now() - 1_000)
  const { qa, demanda, ejecutadoId } = await createDemand(api, `LIFE-${suffix}`)
  const diligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  const notification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
  const basePayload = {
    notificacionId: notification.id,
    bancoId: qa.bancoId,
    ejecucion: { fecha: '2026-06-10', hora: '14:15' },
    estampoTipo: { kind: 'CUSTOM', estampoId: qa.customEstampoId },
    monto: 25000,
    medio: 'TRANSFERENCIA',
    referencia: `QA-LIFECYCLE-${suffix}`,
  }
  const createKey = `qa-lifecycle-create-${suffix}`

  const workflowBefore = await api.get(
    `/api/roles/${demanda.rolId}/diligencias/${diligence.id}/notificaciones/${notification.id}/workflow`
  )
  const workflowBeforeBody = dataOf<{ bankContext: { selectedBankId: number | null } }>(
    JSON.parse(await expectStatus(workflowBefore, 200)) as JsonRecord
  )
  expect(workflowBeforeBody.bankContext.selectedBankId).toBe(qa.bancoId)

  const createdResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    headers: { 'Idempotency-Key': createKey },
    data: { ...basePayload, operation: 'GENERATE' },
  })
  const created = dataOf<{
    operation: string
    documento: { id: string; version: number }
    recibo: { id: string; numeroRecibo: string }
    notificacion: { bancoId: number; meta: JsonRecord }
  }>(JSON.parse(await expectStatus(createdResponse, 200)) as JsonRecord)
  expect(created.operation).toBe('created')
  expect(created.notificacion.bancoId).toBe(qa.bancoId)
  expect((created.notificacion.meta.ejecucion as JsonRecord).fecha).toBe('2026-06-10')
  expect(created.notificacion.meta.estampoTipo).toEqual(basePayload.estampoTipo)
  expect(created.notificacion.meta.monto).toBe(25000)

  const replayResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    headers: { 'Idempotency-Key': createKey },
    data: { ...basePayload, operation: 'GENERATE' },
  })
  const replay = dataOf<{
    documento: { id: string; version: number }
    recibo: { id: string; numeroRecibo: string }
  }>(JSON.parse(await expectStatus(replayResponse, 200)) as JsonRecord)
  expect(replay.recibo.id).toBe(created.recibo.id)
  expect(replay.documento.id).toBe(created.documento.id)
  expect(replay.documento.version).toBe(1)
  expect(await prisma.documentoVersion.count({ where: { documentoId: created.documento.id } })).toBe(1)

  const regeneratedResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    headers: { 'Idempotency-Key': `qa-lifecycle-regen-${suffix}` },
    data: { ...basePayload, operation: 'REGENERATE' },
  })
  const regenerated = dataOf<{
    operation: string
    documento: { id: string; version: number }
    recibo: { id: string; numeroRecibo: string }
  }>(JSON.parse(await expectStatus(regeneratedResponse, 200)) as JsonRecord)
  expect(regenerated.operation).toBe('regenerated')
  expect(regenerated.recibo.id).toBe(created.recibo.id)
  expect(regenerated.recibo.numeroRecibo).toBe(created.recibo.numeroRecibo)
  expect(regenerated.documento).toMatchObject({ id: created.documento.id, version: 2 })

  const changedRegeneration = await expectError(
    await api.post(`/api/diligencias/${diligence.id}/recibo`, {
      headers: { 'Idempotency-Key': `qa-lifecycle-invalid-regen-${suffix}` },
      data: { ...basePayload, operation: 'REGENERATE', monto: 26000 },
    }),
    409
  )
  expect((changedRegeneration.error as JsonRecord).code).toBe('RECEIPT_CORRECTION_REQUIRED')

  const correctedResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    headers: { 'Idempotency-Key': `qa-lifecycle-correct-${suffix}` },
    data: {
      ...basePayload,
      operation: 'CORRECT',
      monto: 26000,
      correctionReason: 'Corrección QA por cambio de monto',
    },
  })
  const corrected = dataOf<{
    operation: string
    documento: { id: string; version: number }
    recibo: { id: string; numeroRecibo: string; supersedesReciboId: string }
    notificacion: { meta: JsonRecord }
  }>(JSON.parse(await expectStatus(correctedResponse, 200)) as JsonRecord)
  expect(corrected.operation).toBe('corrected')
  expect(corrected.recibo.id).not.toBe(created.recibo.id)
  expect(corrected.recibo.numeroRecibo).not.toBe(created.recibo.numeroRecibo)
  expect(corrected.recibo.supersedesReciboId).toBe(created.recibo.id)
  expect(corrected.documento).toMatchObject({ version: 1 })
  expect(corrected.documento.id).not.toBe(created.documento.id)
  expect(corrected.notificacion.meta.monto).toBe(26000)

  const [oldReceipt, oldDocument, activeReceipts, events] = await Promise.all([
    prisma.recibo.findUniqueOrThrow({ where: { id: created.recibo.id } }),
    prisma.documento.findUniqueOrThrow({ where: { id: created.documento.id } }),
    prisma.recibo.findMany({ where: { notificacionId: notification.id, status: 'ACTIVE' } }),
    waitForCanonicalEvents(qa.officeId, startedAt, 3),
  ])
  expect(oldReceipt.status).toBe('CORRECTED')
  expect(oldReceipt.voidReason).toBe('Corrección QA por cambio de monto')
  expect(oldDocument.voidedAt).toBeTruthy()
  expect(activeReceipts.map(item => item.id)).toEqual([corrected.recibo.id])
  expect(events.filter(event => event.eventType === 'receipt.generated' && event.recordId === created.recibo.id)).toHaveLength(1)
  expect(events.filter(event => event.eventType === 'receipt.regenerated' && event.recordId === created.recibo.id)).toHaveLength(1)
  expect(events.filter(event => event.eventType === 'receipt.corrected' && event.recordId === corrected.recibo.id)).toHaveLength(1)

  await api.dispose()
})

test('execution wizard uses one workflow read and keeps Step 1 continuation local', async ({ browser, baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const { qa, demanda, ejecutadoId } = await createDemand(api, `UI-${suffix}`)
  const diligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  const notification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
  const receiptPayload = {
    notificacionId: notification.id,
    bancoId: qa.bancoId,
    operation: 'GENERATE',
    ejecucion: { fecha: '2026-06-10', hora: '14:15' },
    estampoTipo: { kind: 'CUSTOM', estampoId: qa.customEstampoId },
    monto: 25000,
    medio: 'TRANSFERENCIA',
    referencia: `QA-UI-${suffix}`,
  }
  const receiptResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
    headers: { 'Idempotency-Key': `qa-ui-receipt-${suffix}` },
    data: receiptPayload,
  })
  await expectStatus(receiptResponse, 200)

  const workflowResponse = await api.get(
    `/api/roles/${demanda.rolId}/diligencias/${diligence.id}/notificaciones/${notification.id}/workflow`
  )
  const workflowPayload = dataOf<{
    estampoOptions: Array<{ selection: { kind: string; estampoId?: string } }>
  }>(JSON.parse(await expectStatus(workflowResponse, 200)) as JsonRecord)
  expect(
    workflowPayload.estampoOptions.some(
      option => option.selection.kind === 'CUSTOM' && option.selection.estampoId === qa.customEstampoId
    )
  ).toBe(true)

  const context = await browser.newContext({ storageState: AUTH_STATE_PATH })
  const page = await context.newPage()
  const wizardRequests: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (url.includes('/workflow') || url.includes('/aranceles/lookup') || url.includes('/estampos')) {
      wizardRequests.push(url)
    }
  })
  await page.goto(
    `/roles/${demanda.rolId}?tab=diligencias&diligenciaId=${diligence.id}&notificacionId=${notification.id}&step=1`
  )

  await expect(page.getByRole('heading', { name: 'Datos de ejecución' })).toBeVisible()
  await expect(page.getByLabel('Fecha de ejecución *')).toHaveValue('2026-06-10')
  await expect(page.getByLabel('Banco *')).toHaveValue(String(qa.bancoId))
  let progressPatchCount = 0
  page.on('request', request => {
    if (
      request.method() === 'PATCH' &&
      request.url().includes(`/notificaciones/${notification.id}`)
    ) {
      progressPatchCount += 1
    }
  })
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: 'Datos del recibo' })).toBeVisible()
  await expect(page.getByLabel('Tipo de Estampo *')).toHaveValue(`custom:${qa.customEstampoId}`)
  await expect(page.locator('#receipt-operation')).toHaveValue('REGENERATE')
  expect(progressPatchCount).toBe(0)
  expect(wizardRequests.filter(url => url.includes('/workflow') && !url.includes('detail=stamp'))).toHaveLength(1)
  expect(wizardRequests.some(url => url.includes('/aranceles/lookup'))).toBe(false)
  expect(wizardRequests.some(url => url.includes('/estampos/wizard/categorias'))).toBe(false)

  await page.locator('#receipt-operation').selectOption('CORRECT')
  await expect(page.getByLabel('Motivo de corrección *')).toBeVisible()

  await page.getByLabel('Motivo de corrección *').fill('Corrección QA para validar caché')
  await page.getByRole('button', { name: 'Guardar recibo y continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Generar estampo' })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Generar estampo' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Editar recibo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar con estampo' })).toBeVisible()

  await context.close()

  const mobileContext = await browser.newContext({
    storageState: AUTH_STATE_PATH,
    viewport: { width: 390, height: 844 },
  })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(
    `/roles/${demanda.rolId}?tab=diligencias&diligenciaId=${diligence.id}&notificacionId=${notification.id}&step=1`
  )

  const expectWizardActionsInsideViewport = async (headingName: string) => {
    const heading = mobilePage.getByRole('heading', { name: headingName })
    await expect(heading).toBeVisible()
    const modal = heading.locator('xpath=../../..')
    const modalBox = await modal.boundingBox()
    expect(modalBox).not.toBeNull()
    expect(modalBox!.x).toBeGreaterThanOrEqual(0)
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(390)
    const buttonBoxes = await modal.locator('footer button').evaluateAll(buttons =>
      buttons.map(button => {
        const rect = button.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })
    )
    expect(buttonBoxes.every(box => box.left >= modalBox!.x && box.right <= modalBox!.x + modalBox!.width)).toBe(true)
  }

  await expectWizardActionsInsideViewport('Datos de ejecución')
  await expect(mobilePage.getByLabel('Banco *')).toHaveValue(String(qa.bancoId))
  await mobilePage.getByRole('button', { name: 'Siguiente' }).click()
  await expectWizardActionsInsideViewport('Datos del recibo')

  await mobileContext.close()
  await api.dispose()
})

test('workflow safety cases return expected status codes', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const qa = await findQaContext(prisma)
  const unauthenticated = await playwrightRequest.newContext({ baseURL })

  const seededRole = await prisma.rolCausa.findFirstOrThrow({
    where: { officeId: qa.officeId, rol: qaRol('RECONFLICT') },
    select: { id: true, demandaId: true },
  })
  expect(seededRole.id).not.toBe(seededRole.demandaId)
  const rolesResponse = await api.get('/api/roles')
  const rolesBody = JSON.parse(await expectStatus(rolesResponse, 200)) as JsonRecord
  expect(rolesBody.ok).toBe(true)
  const listedRoles = rolesBody.data as Array<{ id: string; demandaId: string; rol: string }>
  const listedSeededRole = listedRoles.find(role => role.rol === qaRol('RECONFLICT'))
  expect(listedSeededRole).toMatchObject({ id: seededRole.id, demandaId: seededRole.demandaId })
  await expectStatus(await api.get(`/api/roles/${seededRole.id}`), 200)

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
      headers: { 'Idempotency-Key': `qa-receipt-invalid-${suffix}` },
      data: {
        notificacionId: notification.id,
        bancoId: qa.bancoId,
        operation: 'GENERATE',
        estampoTipo: { kind: 'CUSTOM', estampoId: qa.customEstampoId },
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

  const foreignOffice = await prisma.office.create({
    data: { nombre: qaName(`Foreign office ${suffix}`) },
  })
  const foreignTribunal = await prisma.tribunal.create({
    data: { officeId: foreignOffice.id, nombre: qaName(`Foreign tribunal ${suffix}`) },
  })
  const foreignRole = await prisma.rolCausa.create({
    data: {
      id: `qa-foreign-${suffix.toLowerCase()}`,
      officeId: foreignOffice.id,
      rol: qaRol(`FOREIGN-${suffix}`),
      tribunalId: foreignTribunal.id,
    },
  })
  try {
    await expectError(await api.get(`/api/roles/${foreignRole.id}`), 404)
    await expectError(
      await api.put(`/api/roles/${foreignRole.id}/status`, { data: { estado: 'en_proceso' } }),
      404
    )
    const unchangedForeignRole = await prisma.rolCausa.findUniqueOrThrow({ where: { id: foreignRole.id } })
    expect(unchangedForeignRole.estado).toBe('pendiente')
  } finally {
    await prisma.rolCausa.delete({ where: { id: foreignRole.id } })
    await prisma.tribunal.delete({ where: { id: foreignTribunal.id } })
    await prisma.office.delete({ where: { id: foreignOffice.id } })
  }

  await unauthenticated.dispose()
  await api.dispose()
})

test('an already authenticated disabled user is blocked immediately', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const qa = await findQaContext(prisma)
  const user = await prisma.user.findFirstOrThrow({ where: { officeId: qa.officeId, isActive: true } })
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
  try {
    const response = await api.get('/api/user/me')
    const payload = await expectError(response, 403)
    expect((payload.error as JsonRecord).code).toBe('ACCOUNT_DISABLED')
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } })
    await api.dispose()
  }
})
