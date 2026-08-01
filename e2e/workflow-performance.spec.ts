import { performance } from 'node:perf_hooks'

import { expect, request as playwrightRequest, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

const prisma = new PrismaClient()
const SAMPLE_COUNT = 20
const WORKFLOW_P95_TARGET_MS = 500

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('workflow read p95 stays below 500 ms across 20 authenticated requests', async ({ baseURL }) => {
  expect(authStateExists(), 'Run npm run qa:auth before the workflow performance check.').toBe(true)

  const notification = await prisma.notificacion.findUniqueOrThrow({
    where: { id: 'qa-p9-noti-custom' },
    select: {
      id: true,
      diligencia: { select: { id: true, rolId: true } },
    },
  })
  const endpoint =
    `/api/roles/${notification.diligencia.rolId}` +
    `/diligencias/${notification.diligencia.id}` +
    `/notificaciones/${notification.id}/workflow`
  const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })

  try {
    // Exclude connection/JIT cold start so this measures the steady-state workflow-read target.
    for (let warmup = 0; warmup < 5; warmup += 1) {
      const response = await api.get(endpoint)
      expect(response.status(), await response.text()).toBe(200)
    }

    const durations: number[] = []
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const startedAt = performance.now()
      const response = await api.get(endpoint)
      durations.push(performance.now() - startedAt)
      expect(response.status(), await response.text()).toBe(200)
    }

    const ordered = [...durations].sort((left, right) => left - right)
    const p95 = ordered[Math.ceil(SAMPLE_COUNT * 0.95) - 1]
    const median = ordered[Math.floor(SAMPLE_COUNT / 2)]

    console.log(
      `Workflow read (${SAMPLE_COUNT} requests): median=${median.toFixed(1)} ms, ` +
      `p95=${p95.toFixed(1)} ms, min=${ordered[0].toFixed(1)} ms, ` +
      `max=${ordered[ordered.length - 1].toFixed(1)} ms.`
    )
    expect(p95).toBeLessThan(WORKFLOW_P95_TARGET_MS)
  } finally {
    await api.dispose()
  }
})
