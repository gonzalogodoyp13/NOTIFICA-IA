import { readFileSync } from 'node:fs'
import { test, expect, request as playwrightRequest, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
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

function expectPdfDownloadName(response: APIResponse, fileName: string) {
  const asciiName = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/["\\]/g, '-')
  const disposition = response.headers()['content-disposition']
  expect(disposition).toContain(`filename="${asciiName}"`)
  expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(fileName)}`)
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

async function createDemand(api: APIRequestContext, suffix: string, ejecutadoCount = 1) {
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
      ejecutados: Array.from({ length: ejecutadoCount }, (_, index) =>
        ({
          nombre: qaName(`E2E Ejecutado ${suffix} ${index + 1}`),
          rut: '44.444.444-4',
          direccion: `Pasaje QA ${1000 + index}`,
          comunaId: qa.comunaId,
        })
      ),
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

async function expectViewportCenteredModal(page: Page) {
  const portal = page.locator('body > [data-modal-portal="viewport"]')
  await expect(portal).toHaveCount(1)
  const geometry = await portal.evaluate(element => {
    const portalRect = element.getBoundingClientRect()
    const card = element.querySelector('[data-testid="viewport-modal-card"]')
    if (!card) throw new Error('Missing viewport modal card')
    const cardRect = card.getBoundingClientRect()
    return {
      scrollY: window.scrollY,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      portal: {
        top: portalRect.top,
        left: portalRect.left,
        width: portalRect.width,
        height: portalRect.height,
        position: getComputedStyle(element).position,
      },
      cardCenter: {
        x: cardRect.left + cardRect.width / 2,
        y: cardRect.top + cardRect.height / 2,
      },
      documentOverflow: getComputedStyle(document.documentElement).overflow,
    }
  })

  expect(geometry.scrollY).toBeGreaterThan(1_000)
  expect(geometry.portal).toEqual({ top: 0, left: 0, width: 1280, height: 720, position: 'fixed' })
  expect(Math.abs(geometry.cardCenter.x - geometry.viewport.width / 2)).toBeLessThan(3)
  expect(Math.abs(geometry.cardCenter.y - geometry.viewport.height / 2)).toBeLessThan(3)
  expect(geometry.documentOverflow).toBe('hidden')
}

test('Nueva diligencia and Nueva Notificacion open in the visible viewport instead of the table center', async ({ baseURL, browser }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const { qa, demanda, ejecutadoId } = await createDemand(api, `MODAL-${suffix}`, 2)
  const diligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  try {
    await page.goto(`/roles/${demanda.rolId}?tab=diligencias`)
    await expect(page.getByRole('button', { name: '+ Nueva diligencia' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nueva Notificacion' })).toBeVisible()
    await page.evaluate(() => {
      const workspace = document.querySelector('main .app-section') as HTMLElement | null
      if (workspace) workspace.style.minHeight = '5000px'
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(item => item.textContent?.includes('Nueva diligencia')) as HTMLButtonElement | undefined
      button?.click()
    })
    const diligenceHeading = page.getByRole('heading', { name: 'Tipo de diligencia' })
    await expect(diligenceHeading).toBeVisible()
    await expectViewportCenteredModal(page)
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(diligenceHeading).toBeHidden()

    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(item => item.textContent?.trim() === 'Nueva Notificacion') as HTMLButtonElement | undefined
      button?.click()
    })

    const heading = page.getByRole('heading', { name: 'Seleccionar Ejecutado' })
    await expect(heading).toBeVisible()
    await expectViewportCenteredModal(page)
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(heading).toBeHidden()
  } finally {
    await context.close()
    await api.dispose()
  }
})

test('authenticated navigation replaces Ingresar with a subtle Cerrar sesión action', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH, serviceWorkers: 'block' })
  const page = await context.newPage()

  try {
    await page.goto('/dashboard')

    const logoutButton = page.getByRole('button', { name: 'Cerrar sesión' })
    await expect(logoutButton).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toHaveCount(0)
    await expect(logoutButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  } finally {
    await context.close()
  }
})

test('missing ROL search opens the creation handoff and composes the caratula', async ({ browser }) => {
  const missingRol = `C-${Date.now()}-2099`
  const qa = await findQaContext(prisma)
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH, serviceWorkers: 'block' })
  const page = await context.newPage()
  let submittedPayload: JsonRecord | null = null

  await page.route('**/api/demandas', async route => {
    submittedPayload = route.request().postDataJSON() as JsonRecord
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { id: 'qa-caratula-preview' } }),
    })
  })

  try {
    await page.goto('/dashboard')
    await page.getByLabel('Buscar ROL exacto').fill(missingRol)
    await page.getByRole('button', { name: 'Buscar ROL' }).click()

    await expect(page).toHaveURL(`/roles/no-encontrado?rol=${encodeURIComponent(missingRol)}`)
    await expect(page.getByRole('heading', {
      name: `No se registran causas con el rol ${missingRol}.`,
    })).toBeVisible()

    const createLink = page.getByRole('link', { name: `Crear causa con ROL ${missingRol}` })
    await expect(createLink).toBeVisible()
    await createLink.click()

    await expect(page).toHaveURL(`/demandas/nueva?rol=${encodeURIComponent(missingRol)}`)
    await expect(page.getByLabel('ROL *')).toHaveValue(missingRol)

    const bankSelect = page.locator('#bancoId')
    await expect.poll(() => bankSelect.locator('option').count()).toBeGreaterThan(1)
    await bankSelect.selectOption(String(qa.bancoId))
    const selectedBankName = (await bankSelect.locator('option:checked').textContent())?.trim() ?? ''
    expect(selectedBankName).not.toBe('')
    await expect(page.getByLabel('Banco de la carátula')).toHaveValue(selectedBankName)

    await page.getByLabel('Carátula *').fill('Cobro ejecutivo')
    await expect(page.getByText(`Vista final: ${selectedBankName}/Cobro ejecutivo`)).toBeVisible()

    await page.getByLabel('Ingresar banco manualmente').check()
    await expect(page.getByLabel('Banco de la carátula')).toHaveCount(0)
    await expect(page.getByLabel('Banco manual de la carátula')).toHaveValue('')
    await page.getByLabel('Banco manual de la carátula').fill('Banco ingresado manualmente')
    await expect(page.getByText('Vista final: Banco ingresado manualmente/Cobro ejecutivo')).toBeVisible()

    await page.locator('#tribunalId').selectOption(String(qa.tribunalId))
    await expect.poll(() => page.locator(`#abogadoId option[value="${qa.abogadoId}"]`).count()).toBe(1)
    await page.locator('#abogadoId').selectOption(String(qa.abogadoId))
    await page.getByLabel('Nombre *').fill('Ejecutado QA Carátula')
    await page.getByLabel('RUT *').fill('1-9')
    await page.getByRole('button', { name: 'Guardar Demanda' }).click()

    await expect.poll(() => submittedPayload).not.toBeNull()
    expect(submittedPayload).toMatchObject({
      rol: missingRol,
      caratula: 'Banco ingresado manualmente/Cobro ejecutivo',
      abogadoId: qa.abogadoId,
    })
  } finally {
    await context.close()
  }
})

test('manual receipt amount only becomes a lawyer-specific arancel when opted in', async ({ baseURL, browser }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const { qa, demanda, ejecutadoId } = await createDemand(api, `ARANCEL-${suffix}`)
  const diligence = await createDiligence(api, demanda.rolId, qa.diligenciaTipoId, ejecutadoId)
  const estampo = await prisma.estampo.create({
    data: {
      officeId: qa.officeId,
      nombre: qaName(`Arancel Opt In ${suffix}`),
      tipo: 'modelo',
      contenido: 'Monto $monto_ejecutado',
      fileUrl: '',
      activo: true,
    },
  })

  try {
    const withoutOptIn = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
    const firstResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
      headers: { 'Idempotency-Key': `qa-arancel-off-${suffix}` },
      data: {
        notificacionId: withoutOptIn.id,
        bancoId: qa.bancoId,
        operation: 'GENERATE',
        ejecucion: { fecha: '2026-08-04', hora: '14:00' },
        estampoTipo: { kind: 'CUSTOM', estampoId: estampo.id },
        monto: 17_000,
        medio: 'No especificado',
        saveManualArancelAsDefault: false,
      },
    })
    await expectStatus(firstResponse, 200)
    expect(await prisma.arancel.findFirst({
      where: { officeId: qa.officeId, bancoId: qa.bancoId, abogadoId: qa.abogadoId, estampoId: estampo.id },
    })).toBeNull()

    const revisionBefore = (await prisma.office.findUniqueOrThrow({
      where: { id: qa.officeId },
      select: { cacheRevision: true },
    })).cacheRevision
    const inspectionNotification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH })
    const page = await context.newPage()
    await page.goto(
      `/roles/${demanda.rolId}?tab=diligencias&diligenciaId=${diligence.id}&notificacionId=${inspectionNotification.id}&step=1`
    )
    await expect(page.getByRole('heading', { name: 'Datos de ejecución' })).toBeVisible()
    await expect(page.getByLabel('Banco *')).toHaveValue(String(qa.bancoId))
    await page.getByLabel('Fecha de ejecución *').fill('04/08/2026')
    await expect(page.getByLabel('Fecha de ejecución *')).toHaveValue('04/08/2026')
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Datos del recibo' })).toBeVisible()
    await page.getByLabel('Tipo de Estampo *').selectOption(`custom:${estampo.id}`)
    await page.getByLabel('Monto (CLP) *').fill('18000')
    const saveDefaultCheckbox = page.getByLabel('Guardar este monto como arancel predeterminado para este abogado')
    await expect(saveDefaultCheckbox).toBeVisible()
    await expect(saveDefaultCheckbox).not.toBeChecked()
    await saveDefaultCheckbox.check()
    await page.getByRole('button', { name: 'Generar recibo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Datos del recibo' })).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText('El monto quedó guardado como arancel predeterminado para este abogado.')).toBeVisible({ timeout: 30_000 })
    await context.close()

    const saved = await prisma.arancel.findFirstOrThrow({
      where: { officeId: qa.officeId, bancoId: qa.bancoId, abogadoId: qa.abogadoId, estampoId: estampo.id },
    })
    expect(saved.monto).toBe(18_000)
    expect(await prisma.arancel.findFirst({
      where: { officeId: qa.officeId, bancoId: qa.bancoId, abogadoId: null, estampoId: estampo.id },
    })).toBeNull()
    expect((await prisma.office.findUniqueOrThrow({
      where: { id: qa.officeId },
      select: { cacheRevision: true },
    })).cacheRevision).toBe(revisionBefore + 1)
    expect(await prisma.activityEvent.findFirst({
      where: { officeId: qa.officeId, eventType: 'settings.Arancel.created', recordId: String(saved.id) },
    })).toBeTruthy()

    const overwriteAttemptNotification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
    const overwriteAttemptResponse = await api.post(`/api/diligencias/${diligence.id}/recibo`, {
      headers: { 'Idempotency-Key': `qa-arancel-overwrite-${suffix}` },
      data: {
        notificacionId: overwriteAttemptNotification.id,
        bancoId: qa.bancoId,
        operation: 'GENERATE',
        ejecucion: { fecha: '2026-08-04', hora: '' },
        estampoTipo: { kind: 'CUSTOM', estampoId: estampo.id },
        monto: 19_000,
        medio: 'No especificado',
        saveManualArancelAsDefault: true,
      },
    })
    const overwriteAttempt = dataOf<{ defaultArancelSaved?: boolean }>(
      JSON.parse(await expectStatus(overwriteAttemptResponse, 200)) as JsonRecord
    )
    expect(overwriteAttempt.defaultArancelSaved).toBe(false)
    expect((await prisma.arancel.findUniqueOrThrow({ where: { id: saved.id } })).monto).toBe(18_000)
    expect((await prisma.office.findUniqueOrThrow({
      where: { id: qa.officeId },
      select: { cacheRevision: true },
    })).cacheRevision).toBe(revisionBefore + 1)

    const nextNotification = await createNotification(api, demanda.rolId, diligence.id, ejecutadoId)
    const workflowResponse = await api.get(
      `/api/roles/${demanda.rolId}/diligencias/${diligence.id}/notificaciones/${nextNotification.id}/workflow`
    )
    const workflow = dataOf<{ estampoOptions: Array<{ selection: { kind: string; estampoId?: string }; aranceles: Array<{ bancoId: number; monto: number; source: string }> }> }>(
      JSON.parse(await expectStatus(workflowResponse, 200)) as JsonRecord
    )
    const option = workflow.estampoOptions.find(item => item.selection.estampoId === estampo.id)
    expect(option?.aranceles).toContainEqual({ bancoId: qa.bancoId, monto: 18_000, source: 'abogado' })

    const verificationContext = await browser.newContext({ storageState: AUTH_STATE_PATH })
    const verificationPage = await verificationContext.newPage()
    await verificationPage.goto(
      `/roles/${demanda.rolId}?tab=diligencias&diligenciaId=${diligence.id}&notificacionId=${nextNotification.id}&step=2`
    )
    await expect(verificationPage.getByRole('heading', { name: 'Datos del recibo' })).toBeVisible()
    await verificationPage.getByLabel('Tipo de Estampo *').selectOption(`custom:${estampo.id}`)
    await expect(verificationPage.getByLabel('Monto (CLP) *')).toHaveValue('18000')
    await expect(
      verificationPage.getByLabel('Guardar este monto como arancel predeterminado para este abogado')
    ).toBeHidden()
    await verificationContext.close()
  } finally {
    await prisma.arancel.deleteMany({ where: { officeId: qa.officeId, estampoId: estampo.id } })
    await prisma.estampo.delete({ where: { id: estampo.id } })
    await api.dispose()
  }
})

test('authenticated workflow creates demanda, diligencia, notification, estampos, recibo, and XLSX export', async ({ baseURL }) => {
  const api = await createAuthenticatedContext(baseURL)
  const suffix = qaRequestSuffix().toUpperCase()
  const startedAt = new Date(Date.now() - 1_000)
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

  const customTemplate = await prisma.estampo.findUniqueOrThrow({
    where: { id: qa.customEstampoId },
    select: { nombre: true },
  })
  const customDownload = await api.get(`/api/documentos/${customDoc.id}/download`)
  expect(customDownload.status()).toBe(200)
  expectPdfDownloadName(customDownload, `${rol.toLowerCase()}. ${customTemplate.nombre}. 10-06-26.pdf`)
  const wizardDownload = await api.get(`/api/documentos/${wizardDoc.id}/download`)
  expect(wizardDownload.status()).toBe(200)
  expectPdfDownloadName(wizardDownload, `${rol.toLowerCase()}. ${wizard.nombreVisible}. 10-06-26.pdf`)
  const receiptDownload = await api.get(`/api/documentos/${receiptDoc.id}/download`)
  expect(receiptDownload.status()).toBe(200)
  expectPdfDownloadName(
    receiptDownload,
    `RECIBO. ${rol.toLowerCase()}. ${customTemplate.nombre}. 10-06-26.pdf`
  )

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
  await expect(page.getByLabel('Fecha de ejecución *')).toHaveValue('10/06/2026')
  await expect(page.getByLabel('Fecha de ejecución *')).toHaveAttribute('placeholder', 'DD/MM/AAAA')
  await expect(page.getByRole('button', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir calendario' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir calendario' }).click()
  await page.locator('#fecha-ejecucion-calendar').fill('2026-08-04')
  await expect(page.getByLabel('Fecha de ejecución *')).toHaveValue('04/08/2026')
  await page.getByRole('button', { name: 'Hoy' }).click()
  const todayDmy = await page.evaluate(() => {
    const today = new Date()
    return [
      String(today.getDate()).padStart(2, '0'),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getFullYear()),
    ].join('/')
  })
  await expect(page.getByLabel('Fecha de ejecución *')).toHaveValue(todayDmy)
  await page.getByLabel('Fecha de ejecución *').fill('10/06/2026')
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

  await page.evaluate(() => {
    const workspace = document.querySelector('main .app-section') as HTMLElement | null
    if (workspace) workspace.style.minHeight = '4000px'
    window.scrollTo(0, document.documentElement.scrollHeight)
    const button = Array.from(document.querySelectorAll('button'))
      .find(item => item.textContent?.includes('Nueva diligencia')) as HTMLButtonElement | undefined
    button?.click()
  })
  const newDiligenceHeading = page.getByRole('heading', { name: 'Tipo de diligencia' })
  await expect(newDiligenceHeading).toBeVisible()
  const modalPosition = await newDiligenceHeading.locator('xpath=../..').evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 }
  })
  const viewport = page.viewportSize()!
  expect(Math.abs(modalPosition.centerX - viewport.width / 2)).toBeLessThan(3)
  expect(Math.abs(modalPosition.centerY - viewport.height / 2)).toBeLessThan(3)
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(newDiligenceHeading).toBeHidden()

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

  const unauthenticatedResponse = await unauthenticated.post('/api/demandas', {
      data: {
        rol: qaRol('UNAUTH'),
      },
    })
  await expectError(unauthenticatedResponse, 401)
  expect(unauthenticatedResponse.headers()['server-timing']).toMatch(/auth;dur=.*handler;dur=.*total;dur=/)
  expect(unauthenticatedResponse.headers()['x-request-id']).toBeTruthy()

  const invalidDemand = await api.post('/api/demandas', {
    data: {
      rol: '',
      tribunalId: qa.tribunalId,
      caratula: '',
      abogadoId: qa.abogadoId,
    },
  })
  await expectError(invalidDemand, 400)
  expect(invalidDemand.headers()['server-timing']).toMatch(/auth;dur=.*handler;dur=.*total;dur=/)
  expect(invalidDemand.headers()['x-request-id']).toBeTruthy()

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
