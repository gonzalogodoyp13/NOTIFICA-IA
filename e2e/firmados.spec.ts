import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH } from '../scripts/qa-support'
import type { CenterData, CenterRow } from '../lib/signing/centerContracts'

// Route-controlled UI fixtures must not be intercepted by the app's service worker.
// Real server authorization and state transitions are verified separately.
test.use({ storageState: AUTH_STATE_PATH, serviceWorkers: 'block' })
const row: CenterRow = { id: 'document-1', documentId: 'document-1', name: 'Notificación personal', rolId: 'case-1', rol: 'C-1240-2026',
  businessDate: '2026-09-10', versionId: 'version-1', checksum: 'a'.repeat(64), status: 'ELIGIBLE', exclusion: null,
  itemId: null, jobId: null, origin: null, profile: null, requestedBy: null, attemptCount: 0, maxAttempts: 0,
  canRetry: false, canCancel: false, errorMessage: null, delivery: 'Sin firma validada', signedAt: null, started: false }
function fixture(admin = true): CenterData {
  return { canManage: admin, canRequest: true, rows: [row, { ...row, id: 'item-2', documentId: 'document-2', name: 'Requerimiento de pago',
    status: 'WAITING_FOR_OPERATOR', itemId: 'item-2', jobId: 'job-2', origin: 'AUTOMATIC', profile: 'PADES_LT',
    attemptCount: 1, maxAttempts: 4, canRetry: admin, started: true, errorMessage: 'Revisa el resultado anterior en el equipo firmante.',
    ...(admin ? { diagnosticCode: 'OUTCOME_UNKNOWN' } : {}) }], total: 2, page: 1, pageSize: 25,
    counts: { eligible: 1, active: 0, attention: 1, completed: 0, deliveryPending: 0 }, validatorConfigured: true,
    updatedAt: '2026-09-22T13:00:00Z', devices: [{ id: 'device-1', name: 'Oficina principal', role: 'SIGNER', health: 'TOKEN_READY',
      certificateSubject: 'Certificado de prueba', fingerprint: 'b'.repeat(64), expiresAt: '2027-09-14T18:00:00Z', lastHeartbeatAt: '2026-09-22T13:00:00Z', revoked: false }] }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/signing/archive?*', route => route.fulfill({ json: { ok: true, data: { documents: [], total: 0, page: 1, pageSize: 25 } } }))
})

test('office archive searches older signed versions and explains the shared 50-day folder on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const data = fixture()
  data.rows[1] = { ...data.rows[1], status: 'COMPLETED', canRetry: false, errorMessage: null, diagnosticCode: undefined,
    delivery: 'Disponible en el archivo de la aplicación',
    evidence: { signatureId: 'sig', signedVersionId: 'signed-version', signedChecksum: 'c'.repeat(64), signerFingerprint: 'b'.repeat(64), validatedAt: data.updatedAt, deviceId: 'device-1' } }
  await page.route('**/api/signing/center*', route => route.fulfill({ json: { ok: true, data } }))
  const queries: URL[] = []
  await page.route('**/api/signing/archive?*', route => {
    queries.push(new URL(route.request().url()))
    return route.fulfill({ json: { ok: true, data: { documents: [{ signatureId: 'older-signature', documentId: 'document-older', signedVersionId: 'old-version',
      name: 'Notificación histórica', rol: 'C-1240-2026', signedAt: '2025-01-02T12:00:00Z', checksumSha256: 'd'.repeat(64) }], total: 1, page: 1, pageSize: 25 } } })
  })
  await page.goto('/firmados')
  await expect(page.getByText('50 días en Windows')).toBeVisible()
  await page.getByLabel('Buscar firmas por nombre, ROL o identificador').fill('C-1240')
  await page.getByRole('button', { name: 'Buscar en el archivo' }).click()
  await expect.poll(() => queries.at(-1)?.searchParams.get('q')).toBe('C-1240')
  const archive = page.getByRole('region', { name: 'Archivo de firmas de la oficina' })
  await expect(archive.getByText('Notificación histórica')).toBeVisible()
  await expect(archive.getByRole('link', { name: 'Descargar firmado' })).toHaveAttribute('href', `/api/signing/archive/older-signature?checksum=${'d'.repeat(64)}`)
  await expect(page.getByRole('button', { name: 'Reintentar entrega' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/office-archive-mobile.png', fullPage: true })
})
test('desktop selection, confirmation, retry consent and date filtering', async ({ page }) => {
  const writes: unknown[] = [], queries: URL[] = [], data = fixture()
  data.devices.push({ id: 'receiver-1', name: 'Equipo receptor', role: 'RECEIVER', health: 'AGENT_ONLINE_TOKEN_MISSING', certificateSubject: null,
    fingerprint: null, expiresAt: null, lastHeartbeatAt: '2026-09-22T13:00:00Z', revoked: false })
  await page.route('**/api/signing/center*', async route => {
    const request = route.request()
    if (request.method() === 'POST') { writes.push(request.postDataJSON()); await route.fulfill({ json: { ok: true, data: { accepted: true } } }); return }
    const url = new URL(request.url()); queries.push(url)
    const eligible = data.rows.filter(r => r.status === 'ELIGIBLE')
    await route.fulfill({ json: { ok: true, data: url.searchParams.get('pageSize') === '500' ? { ...data, rows: eligible, total: eligible.length } : data } })
  })
  await page.goto('/firmados')
  await expect(page.getByRole('heading', { name: 'Firmados', exact: true })).toBeVisible()
  await expect(page.getByText('Token disponible')).toBeVisible()
  await expect(page.getByText('Receptor conectado', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Seleccionar elegibles de esta página' }).check()
  await page.getByRole('button', { name: 'Quitar selección' }).click()
  await page.getByRole('button', { name: 'Seleccionar todos los elegibles del rango' }).click()
  await expect(page.getByText('1 seleccionados', { exact: true })).toBeVisible()
  await page.getByLabel('Certificado firmante').selectOption('b'.repeat(64))
  await page.getByRole('button', { name: 'Revisar solicitud' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('button', { name: 'Confirmar solicitud', exact: true })).toBeDisabled()
  await expect(modal).toContainText('Notificación personal')
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Confirmar solicitud', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(writes[0]).toEqual({ action: 'queue', signerFingerprint: 'b'.repeat(64), requestedLevel: 'PADES_LT', sources: [{ versionId: 'version-1', checksum: 'a'.repeat(64) }] })
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Autorizar reintento' })).toBeDisabled()
  await expect(modal).toContainText('Detuve el trabajo anterior')
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
  expect(writes).toHaveLength(1)
  await page.getByLabel('Ejecución desde').fill('2026-09-01')
  await page.getByLabel('Ejecución hasta').fill('2026-09-10')
  await expect.poll(() => queries.at(-1)?.searchParams.get('to')).toBe('2026-09-10')
  expect(queries.at(-1)?.searchParams.get('from')).toBe('2026-09-01')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/firmados-desktop.png', fullPage: true })
})

test('mobile layout and accessible confirmation stay inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/signing/center*', route => route.fulfill({ json: { ok: true, data: fixture() } }))
  await page.goto('/firmados')
  await page.getByRole('checkbox', { name: 'Seleccionar Notificación personal' }).check()
  await page.getByLabel('Certificado firmante').selectOption('b'.repeat(64))
  await page.getByRole('button', { name: 'Revisar solicitud' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  const box = await modal.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await expect(modal.getByRole('checkbox')).toBeVisible()
  await page.screenshot({ path: 'test-results/firmados-mobile-confirmation.png' })
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/firmados-mobile.png', fullPage: true })
})

test('ordinary office members authorize remote signatures without admin recovery or a web PIN', async ({ page }) => {
  const writes: unknown[] = []
  await page.route('**/api/signing/center*', async route => {
    if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true, data: { accepted: true } } }); return }
    await route.fulfill({ json: { ok: true, data: fixture(false) } })
  })
  await page.goto('/firmados')
  await expect(page.getByText('Puedes autorizar firmas desde tu cuenta.', { exact: false })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Seleccionar Notificación personal' }).check()
  await page.getByLabel('Certificado firmante').selectOption('b'.repeat(64))
  await page.getByRole('button', { name: 'Revisar solicitud' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toContainText('sin otra aprobación local')
  await expect(modal.locator('input[type="password"]')).toHaveCount(0)
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Confirmar solicitud', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(writes).toEqual([{ action: 'queue', signerFingerprint: 'b'.repeat(64), requestedLevel: 'PADES_LT', sources: [{ versionId: 'version-1', checksum: 'a'.repeat(64) }] }])
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0)
  await expect(page.getByText('Diagnóstico del administrador')).toHaveCount(0)
})

test('actual center endpoint authenticates reads and rejects forged origins or invalid mutations', async ({ request, baseURL, playwright }) => {
  const response = await request.get('/api/signing/center')
  expect(response.status()).toBe(200)
  const value = await response.json()
  expect(value.ok).toBe(true)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect((await request.post('/api/signing/center', { headers: { Origin: 'https://foreign.invalid' }, data: {} })).status()).toBe(403)
  // Invalid input proves that same-origin requests reach validation, without
  // asking to change any existing office/document or create a signing job.
  expect((await request.post('/api/signing/center', { headers: { Origin: new URL(baseURL!).origin }, data: {} })).status()).toBe(400)
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try { expect((await anonymous.get('/api/signing/center')).status()).toBe(401) }
  finally { await anonymous.dispose() }
})

test('reviewed retry and pre-signing cancellation submit exact attempt snapshots', async ({ page }) => {
  const data = fixture(), writes: unknown[] = []
  data.rows.push({ ...row, id: 'queued-item', status: 'QUEUED', itemId: 'queued-item', attemptCount: 0, canCancel: true })
  await page.route('**/api/signing/center*', async route => {
    if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true, data: { accepted: true } } }) }
    else await route.fulfill({ json: { ok: true, data } })
  })
  await page.goto('/firmados')
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  let modal = page.getByRole('dialog')
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Autorizar reintento' }).click()
  await expect(modal).not.toBeVisible()
  expect(writes[0]).toEqual({ action: 'retry', itemId: 'item-2', attemptCount: 1, reviewed: true })
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  modal = page.getByRole('dialog')
  await expect(modal.getByRole('button', { name: 'Confirmar cancelación' })).toBeDisabled()
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Confirmar cancelación' }).click()
  await expect(modal).not.toBeVisible()
  expect(writes[1]).toEqual({ action: 'cancel', itemId: 'queued-item', attemptCount: 0 })
})

test('an uncertain submission retains its exact reviewed payload for retry', async ({ page }) => {
  await page.clock.install()
  const writes: unknown[] = []
  await page.route('**/api/signing/center*', async route => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON())
      if (writes.length === 1) await route.abort('failed')
      else await route.fulfill({ json: { ok: true, data: { accepted: true, replay: true } } })
    } else await route.fulfill({ json: { ok: true, data: fixture() } })
  })
  await page.goto('/firmados')
  await page.getByRole('checkbox', { name: 'Seleccionar Notificación personal' }).check()
  await page.getByLabel('Certificado firmante').selectOption('b'.repeat(64))
  await page.getByRole('button', { name: 'Revisar solicitud' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('checkbox').check()
  await modal.getByRole('button', { name: 'Confirmar solicitud', exact: true }).click()
  await expect(modal.getByRole('alert')).toBeVisible()
  await page.clock.fastForward(16000)
  await expect(modal.getByRole('alert')).toContainText('vuelve a enviar la misma solicitud')
  await modal.getByRole('button', { name: 'Confirmar solicitud', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1])
  await expect(page.getByText('La solicitud ya estaba registrada.', { exact: false })).toBeVisible()
})
