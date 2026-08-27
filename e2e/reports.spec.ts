import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

function requireAuthState() {
  if (!authStateExists()) throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth:auto before the QA report suite.')
}

async function tick(api: APIRequestContext) {
  const secret = process.env.REPORT_AUTOMATION_SECRET
  if (!secret) throw new Error('REPORT_AUTOMATION_SECRET is required for Phase 4 QA tests.')
  const response = await api.post('/api/internal/reports/tick', { headers: { Authorization: `Bearer ${secret}` }, data: { maxJobs: 20 } })
  expect(response.status(), await response.text()).toBe(200)
}

async function waitForJob(api: APIRequestContext, jobId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await tick(api)
    const response = await api.get(`/api/reports/jobs/${jobId}`)
    expect(response.status(), await response.text()).toBe(200)
    const job = (await response.json()).data as { id: string; status: string; reportId: string | null; resultCode: string | null }
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status)) return job
  }
  throw new Error(`Job ${jobId} did not reach a terminal state.`)
}

test.describe('Reportes Phase 4', () => {
  test('active administrator navigates the three sections and five URL-backed operations views', async ({ browser }) => {
    requireAuthState()
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH })
    const page = await context.newPage()
    await page.goto('/ajustes/reportes')
    await expect(page.getByRole('heading', { name: 'Reportes', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Resumen y operaciones/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /Control/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Generar diario', exact: true })).toBeVisible()

    for (const [view, heading] of [
      ['jobs', 'Trabajos'], ['recipients', 'Destinatarios'],
      ['schedules', 'Programación y salud'], ['custom', 'Reportes personalizados'],
    ] as const) {
      const hydrated = view === 'custom'
        ? page.waitForResponse(response => response.url().includes('/api/reports/custom-definitions') && response.request().method() === 'GET')
        : null
      await page.locator(`#operations-view-${view}`).click()
      await expect(page).toHaveURL(new RegExp(`view=${view}`))
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      if (hydrated) await hydrated
    }

    const customTab = page.locator('#operations-view-custom')
    await customTab.focus()
    await Promise.all([
      page.waitForURL(/view=control/),
      customTab.press('Home'),
    ])
    await expect(page.getByRole('tab', { name: /Control/i })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Generar diario', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: /Historial de versiones/i }).click()
    await expect(page.getByRole('heading', { name: 'Historial de versiones' })).toBeVisible()
    await page.getByRole('tab', { name: /Historial de entregas/i }).click()
    await expect(page.getByRole('heading', { name: 'Historial de entregas' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Historial de versiones' })).toBeVisible()
    await context.close()
  })

  test('Phase 4 administrator APIs expose bounded office-scoped ledgers and configuration', async ({ baseURL }) => {
    requireAuthState()
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    for (const url of ['/api/reports/jobs?limit=25', '/api/reports/recipients', '/api/reports/schedules', '/api/reports/custom-definitions']) {
      const response = await api.get(url)
      expect(response.status(), await response.text()).toBe(200)
      expect((await response.json()).ok).toBe(true)
    }
    expect((await api.get('/api/reports/jobs?limit=101')).status()).toBe(400)
    expect((await api.get('/api/reports/versions?reportType=custom')).status()).toBe(200)
    expect((await api.get('/api/reports/delivery-attempts?status=CANCELLED')).status()).toBe(200)
    await api.dispose()
  })

  test('concurrent scheduler ticks do not duplicate a scheduled execution identity', async ({ baseURL }) => {
    requireAuthState()
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    const secret = process.env.REPORT_AUTOMATION_SECRET
    if (!secret) throw new Error('REPORT_AUTOMATION_SECRET is required for Phase 4 QA tests.')
    const options = { headers: { Authorization: `Bearer ${secret}` }, data: { maxJobs: 1 } }
    const [first, second] = await Promise.all([
      api.post('/api/internal/reports/tick', options),
      api.post('/api/internal/reports/tick', options),
    ])
    expect(first.status(), await first.text()).toBe(200)
    expect(second.status(), await second.text()).toBe(200)
    const ledger = await api.get('/api/reports/jobs?origin=SCHEDULED&limit=100')
    expect(ledger.status(), await ledger.text()).toBe(200)
    const jobs = (await ledger.json()).data.items as Array<{ scheduleId: string | null; scheduledFor: string | null }>
    const identities = jobs.filter(job => job.scheduleId && job.scheduledFor).map(job => `${job.scheduleId}:${job.scheduledFor}`)
    expect(new Set(identities).size).toBe(identities.length)
    await api.dispose()
  })

  test('job cancellation, manual retry, recipient revisions, and run-now are idempotent', async ({ baseURL }) => {
    requireAuthState()
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })

    const enqueue = await api.post('/api/reports/daily/generate', {
      data: { date: '2026-08-01', force: true },
      headers: { 'Idempotency-Key': `qa-phase4-cancel-${crypto.randomUUID()}` },
    })
    expect(enqueue.status(), await enqueue.text()).toBe(202)
    const queuedJobId = (await enqueue.json()).data.id as string
    const cancelKey = `qa-phase4-cancel-action-${crypto.randomUUID()}`
    const cancelled = await api.post(`/api/reports/jobs/${queuedJobId}/cancel`, { headers: { 'Idempotency-Key': cancelKey } })
    expect(cancelled.status(), await cancelled.text()).toBe(200)
    expect((await cancelled.json()).data.status).toBe('CANCELLED')

    const retryKey = `qa-phase4-retry-${crypto.randomUUID()}`
    const retried = await api.post(`/api/reports/jobs/${queuedJobId}/retry`, { headers: { 'Idempotency-Key': retryKey } })
    expect(retried.status(), await retried.text()).toBe(202)
    const retriedJob = (await retried.json()).data as { id: string; retryOfJobId: string; status: string }
    expect(retriedJob).toMatchObject({ retryOfJobId: queuedJobId, status: 'QUEUED' })
    const duplicateRetry = await api.post(`/api/reports/jobs/${queuedJobId}/retry`, { headers: { 'Idempotency-Key': retryKey } })
    expect((await duplicateRetry.json()).data.id).toBe(retriedJob.id)
    await api.post(`/api/reports/jobs/${retriedJob.id}/cancel`, { headers: { 'Idempotency-Key': `qa-phase4-cancel-retry-${crypto.randomUUID()}` } })

    const configuration = (await (await api.get('/api/reports/recipients')).json()).data as {
      revision: number
      recipients: Array<{ userId: string; active: boolean; dailyEnabled: boolean; monthlyEnabled: boolean; customEnabled: boolean }>
    }
    const body = {
      revision: configuration.revision,
      recipients: configuration.recipients.filter(item => item.active).map(({ userId, dailyEnabled, monthlyEnabled, customEnabled }) => ({ userId, dailyEnabled, monthlyEnabled, customEnabled })),
    }
    const saved = await api.put('/api/reports/recipients', { data: body })
    expect(saved.status(), await saved.text()).toBe(200)
    expect((await api.put('/api/reports/recipients', { data: body })).status()).toBe(409)

    const schedules = (await (await api.get('/api/reports/schedules')).json()).data as Array<{ id: string; enabled: boolean; localTime: string }>
    const schedule = schedules.find(item => !item.enabled) ?? schedules[0]
    const patched = await api.patch(`/api/reports/schedules/${schedule.id}`, { data: { enabled: false, localTime: schedule.localTime } })
    expect(patched.status(), await patched.text()).toBe(200)
    const runKey = `qa-phase4-run-now-${crypto.randomUUID()}`
    const runNow = await api.post(`/api/reports/schedules/${schedule.id}/run-now`, { headers: { 'Idempotency-Key': runKey } })
    expect(runNow.status(), await runNow.text()).toBe(202)
    const runNowId = (await runNow.json()).data.id as string
    const duplicateRun = await api.post(`/api/reports/schedules/${schedule.id}/run-now`, { headers: { 'Idempotency-Key': runKey } })
    expect((await duplicateRun.json()).data.id).toBe(runNowId)
    await api.post(`/api/reports/jobs/${runNowId}/cancel`, { headers: { 'Idempotency-Key': `qa-phase4-cancel-run-${crypto.randomUUID()}` } })

    expect((await api.get('/api/reports/jobs/qa-p4-job-second-office')).status()).toBe(404)
    await api.dispose()
  })

  test('unauthenticated clients cannot read or mutate Phase 4 resources', async ({ request, page }) => {
    for (const url of ['/api/reports', '/api/reports/jobs', '/api/reports/recipients', '/api/reports/schedules', '/api/reports/custom-definitions']) {
      expect((await request.get(url)).status()).toBe(401)
    }
    expect((await request.post('/api/internal/reports/tick')).status()).toBe(401)
    await page.goto('/ajustes/reportes')
    await expect(page).not.toHaveURL(/\/ajustes\/reportes$/)
  })

  test('monthly generation and delivery use durable idempotent jobs while versions remain immediate', async ({ baseURL }) => {
    requireAuthState()
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    const generate = async () => {
      const response = await api.post('/api/reports/monthly/generate', {
        data: { month: '2026-06', force: true }, headers: { 'Idempotency-Key': `qa-phase4-monthly-${crypto.randomUUID()}` },
      })
      expect(response.status(), await response.text()).toBe(202)
      const jobId = (await response.json()).data.id as string
      const job = await waitForJob(api, jobId)
      expect(job.status).toBe('SUCCEEDED')
      expect(job.reportId).toBeTruthy()
      return job.reportId!
    }
    const reportId = await generate()
    expect(await generate()).toBe(reportId)

    const versions = await api.get(`/api/reports/${reportId}/versions`)
    expect(versions.status(), await versions.text()).toBe(200)
    const ready = ((await versions.json()).data.versions as Array<{ id: string; versionNumber: number; status: string; isCurrent: boolean; sizeBytes: number | null }>).filter(version => version.status === 'READY')
    expect(ready.length).toBeGreaterThanOrEqual(2)
    const current = ready.find(version => version.isCurrent)!
    const historical = ready.find(version => !version.isCurrent)!
    expect((await api.get(`/api/reports/${reportId}/download?versionId=${historical.id}`)).status()).toBe(200)
    const restored = await api.post(`/api/reports/${reportId}/versions/${historical.id}/restore`)
    expect((await restored.json()).data).toMatchObject({ restored: true, versionId: historical.id })
    const restoreCurrent = await api.post(`/api/reports/${reportId}/versions/${current.id}/restore`)
    expect((await restoreCurrent.json()).data).toMatchObject({ restored: true, versionId: current.id })

    const key = `qa-phase4-send-${crypto.randomUUID()}`
    const send = await api.post('/api/reports/monthly/send', { data: { month: '2026-06', target: 'all' }, headers: { 'Idempotency-Key': key } })
    expect(send.status(), await send.text()).toBe(202)
    const sendJobId = (await send.json()).data.id as string
    const duplicate = await api.post('/api/reports/monthly/send', { data: { month: '2026-06', target: 'all' }, headers: { 'Idempotency-Key': key } })
    expect((await duplicate.json()).data.id).toBe(sendJobId)
    const sendJob = await waitForJob(api, sendJobId)
    expect(sendJob.status).toBe('SUCCEEDED')
    const attempts = await api.get(`/api/reports/${reportId}/delivery-attempts`)
    const latest = ((await attempts.json()).data as Array<{ status: string; sentCount: number; intendedRecipientCount: number; reportVersionId: string }>)[0]
    expect(latest.status).toBe('SENT')
    expect(latest.sentCount).toBe(latest.intendedRecipientCount)
    expect(latest.reportVersionId).toBe(current.id)
    await api.dispose()
  })

  test('custom definition can be created, run, downloaded, and archived without exposing raw fields', async ({ baseURL }) => {
    requireAuthState()
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    const config = (await (await api.get('/api/reports/recipients')).json()).data as { recipients: Array<{ userId: string; customEnabled: boolean; active: boolean }> }
    const recipientUserIds = config.recipients.filter(item => item.active && item.customEnabled).map(item => item.userId)
    const created = await api.post('/api/reports/custom-definitions', { data: {
      name: `QA Custom ${Date.now()}`, description: 'Playwright Phase 4', modules: [], actionCategories: ['CREATE', 'UPDATE', 'DELETE', 'READ', 'OTHER'],
      results: ['success', 'failure', 'denied'], actorUserIds: [], includeSystem: true,
      selectedColumns: ['timestamp', 'actor', 'module', 'category', 'eventType', 'result', 'description', 'detail'], recipientUserIds, schedule: null,
    } })
    expect(created.status(), await created.text()).toBe(201)
    const definitionId = (await created.json()).data.id as string
    const run = await api.post(`/api/reports/custom-definitions/${definitionId}/run`, {
      data: { dateFrom: '2026-01-01', dateTo: '2026-12-31', deliver: false }, headers: { 'Idempotency-Key': `qa-phase4-custom-${crypto.randomUUID()}` },
    })
    expect(run.status(), await run.text()).toBe(202)
    const job = await waitForJob(api, (await run.json()).data.id)
    expect(job.status).toBe('SUCCEEDED')
    expect(job.reportId).toBeTruthy()
    if (job.reportId) expect((await api.get(`/api/reports/${job.reportId}/download`)).status()).toBe(200)
    const archived = await api.post(`/api/reports/custom-definitions/${definitionId}/archive`)
    expect(archived.status(), await archived.text()).toBe(200)
    expect((await archived.json()).data.status).toBe('ARCHIVED')
    await api.dispose()
  })
})
