import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
vi.stubGlobal('React', React)
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ guard: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/operations/auth', () => ({ requireOwnerPage: state.guard, OperationsAccessError: class extends Error {} }))
vi.mock('@/lib/operations/queries', () => ({ loadOperations: state.load }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error('404') } }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children) }))
import OperationsPage from '@/app/operaciones/[[...path]]/page'
beforeEach(() => { state.guard.mockReset().mockResolvedValue({}); state.load.mockReset() })
it('renders Spanish filters, accessible evidence tables, support links and pagination', async () => {
  state.load.mockResolvedValue({ title: 'Incidentes', subtitle: 'Datos de prueba aislada', refreshedAt: '2026-11-20T12:00:00Z', tables: [{ title: 'Ocurrencias', columns: ['Referencia', 'Estado'], rows: [[{ text: 'reference', href: '/operaciones/incidentes/test' }, { text: 'Abierto' }]], more: true }] })
  const html = renderToStaticMarkup(await OperationsPage({ params: Promise.resolve({ path: ['incidentes'] }), searchParams: Promise.resolve({ office: '12', page: '2' }) }))
  expect(html).toContain('scope="col"'); expect(html).toContain('aria-label="Paginación"')
  expect(html).toContain('office=12&amp;page=3'); expect(html).toContain('/operaciones/incidentes/test')
  expect(html).toContain('name="status"'); expect(html).toContain('name="from"')
})
it('renders workflow fields with separate evidence and hypotheses and no recovery actions', async () => {
  state.load.mockResolvedValue({ title: 'Detalle del incidente', subtitle: 'test', refreshedAt: new Date().toISOString(), tables: [], incident: { id: 'test', revision: 1, status: 'OPEN', severity: 'error', assignedToUserId: null, impact: null, suspectedCause: 'Sin confirmar', confirmedCause: null, nextSteps: null } })
  const html = renderToStaticMarkup(await OperationsPage({ params: Promise.resolve({ path: ['incidentes', 'test'] }), searchParams: Promise.resolve({}) }))
  expect(html).toContain('name="suspectedCause"'); expect(html).toContain('name="confirmedCause"'); expect(html).toContain('Guardar seguimiento')
  expect(html).not.toMatch(/Revocar dispositivo|Firmar documento|Reintentar trabajo/)
})
it('does not fetch or render platform data when page authorization fails', async () => {
  state.guard.mockRejectedValue(new Error('denied'))
  await expect(OperationsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).rejects.toThrow('denied')
  expect(state.load).not.toHaveBeenCalled()
})
it('labels missing data honestly instead of showing fabricated healthy metrics', async () => {
  state.load.mockResolvedValue({ title: 'Control de tokens', subtitle: 'Sin datos', refreshedAt: new Date().toISOString(), tables: [{ title: 'Equipos', columns: ['Equipo'], rows: [] }] })
  const html = renderToStaticMarkup(await OperationsPage({ params: Promise.resolve({ path: ['tokens'] }), searchParams: Promise.resolve({}) }))
  expect(html).toContain('Sin registros para esta consulta'); expect(html).not.toContain('Operativo')
})
it.each(['trabajos', 'reportes', 'recibos', 'correos', 'salud'])('renders %s with scoped pagination and no recovery controls', async section => {
  state.load.mockResolvedValue({ title: section, subtitle: 'Evidencia persistida', refreshedAt: new Date().toISOString(), tables: [{ title: 'Estado observado', columns: ['Registro'], rows: [[{ text: 'job', href: '/operaciones/trabajos/job' }]], more: true }] })
  const html = renderToStaticMarkup(await OperationsPage({ params: Promise.resolve({ path: [section] }), searchParams: Promise.resolve({ office: '12', page: '2', from: '2026-11-01' }) }))
  expect(html).toContain('office=12&amp;page=3&amp;from=2026-11-01')
  expect(html).toContain('/operaciones/trabajos/job?office=12&amp;from=2026-11-01')
  if (section === 'trabajos') expect(html).toContain('name="state"')
  expect(html).not.toMatch(/Revocar dispositivo|Firmar documento|Reintentar trabajo/)
})
it.skipIf(process.env.TEST_OPERATIONS_BROWSER !== 'true')('navigates real server-rendered operational filters and tables on desktop and mobile', async () => {
  state.load.mockImplementation(async (_path, filters) => ({ title: 'Firmas y trabajos', subtitle: 'Verificación aislada de interfaz', refreshedAt: new Date().toISOString(), tables: [{ title: 'Elementos de firma', columns: ['Trabajo', 'Estado', 'Oficina'], rows: [[{ text: 'job', href: '/operaciones/trabajos/job' }, { text: filters.state === 'FAILED' ? 'Fallido' : 'En cola' }, { text: filters.office ?? 'Todas' }]], more: true }] }))
  const css = readFileSync('app/operaciones/operations.css', 'utf8')
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const content = renderToStaticMarkup(await OperationsPage({ params: Promise.resolve({ path: ['trabajos'] }), searchParams: Promise.resolve(Object.fromEntries(url.searchParams)) }))
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css}</style></head><body><main class="ops-shell ops-main">${content}</main></body></html>`)
    } catch { res.statusCode = 500; res.end('UI test failed') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/operaciones/trabajos`)
    await page.getByLabel('Oficina (ID)').fill('12')
    await page.getByLabel('Estado de firma').selectOption('FAILED')
    await page.getByRole('button', { name: 'Aplicar filtros' }).click()
    await page.waitForURL(/state=FAILED/)
    expect(await page.getByRole('cell', { name: 'Fallido', exact: true }).count()).toBe(1)
    await page.getByRole('link', { name: 'Siguiente', exact: true }).click()
    await page.waitForURL(/page=2/)
    expect(new URL(page.url()).searchParams.get('office')).toBe('12')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    mkdirSync('tmp', { recursive: true })
    await page.screenshot({ path: 'tmp/operations-phase3-mobile.png', fullPage: true })
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}, 60000)
