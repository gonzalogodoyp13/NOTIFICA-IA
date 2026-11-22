import { describe, it, expect } from 'vitest'
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

/** Isolated static bundle: real editor, test-only HTTP responses, no owner grant. */
describe.skipIf(process.env.TEST_OPERATIONS_BROWSER !== 'true')('operations browser workflow', () => {
  it('submits edits, reports concurrent conflicts and supports a mobile viewport', async () => {
    const built = await build({ configFile: false, logLevel: 'error',
      oxc: { jsx: { runtime: 'automatic', development: false } }, define: { 'process.env.NODE_ENV': '"production"' },
      resolve: { alias: { '@': process.cwd(), 'next/navigation': 'virtual:ops-router' } },
      build: { write: false, minify: false, lib: { entry: 'virtual:ops-entry', formats: ['iife'], name: 'OperationsUiTest' } },
      plugins: [{ name: 'isolated-editor',
        resolveId(id) { if (id.endsWith('virtual:ops-entry')) return '\0ops-entry'; if (id === 'virtual:ops-router') return '\0ops-router' },
        load(id) {
          if (id === '\0ops-router') return 'export const useRouter = () => ({ refresh() {} })'
          if (id === '\0ops-entry') return `import React from 'react'; import { createRoot } from 'react-dom/client'; import IncidentEditor from '@/app/operaciones/incident-editor';
            createRoot(document.getElementById('root')).render(React.createElement(IncidentEditor, { incident: { id: 'test-only', revision: 4, status: 'OPEN', severity: 'error', assignedToUserId: null, impact: null, confirmedCause: null, suspectedCause: null, nextSteps: null } }));`
        },
      }],
    })
    const result = Array.isArray(built) ? built[0] : built
    if (!('output' in result)) throw new Error('Expected static test bundle')
    const chunk = result.output.find(item => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('No test bundle')
    const css = readFileSync(resolve('app/operaciones/operations.css'), 'utf8')
    const server = createServer((req, res) => {
      if (req.url === '/ui.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(chunk.code); return }
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main class="ops-shell ops-main"><h1>Verificación aislada</h1><div id="root"></div></main><script src="/ui.js"></script></body></html>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const browser = await chromium.launch({ headless: true, timeout: 15000 })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      page.setDefaultTimeout(10000)
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
      let submitted: any = null, status = 200
      const responses: number[] = []
      await page.route('**/api/operaciones/incidentes/test-only', async route => { submitted = route.request().postDataJSON(); responses.push(status); await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ revision: 5 }) }) })
      const address = server.address() as { port: number }
      await page.goto(`http://127.0.0.1:${address.port}`)
      expect(errors).toEqual([])
      await page.getByLabel('Nota / motivo del cambio (obligatorio)').fill('Verificación aislada completada')
      await page.getByLabel('Estado', { exact: true }).selectOption('RESOLVED')
      await page.getByLabel('Posibles causas (sin confirmar)').fill('Hipótesis de prueba')
      await page.getByRole('button', { name: 'Guardar seguimiento' }).click()
      await page.getByRole('status').filter({ hasText: 'Cambios guardados' }).waitFor()
      expect(submitted).toMatchObject({ revision: 4, status: 'RESOLVED', suspectedCause: 'Hipótesis de prueba', confirmedCause: '' })
      status = 409
      await page.getByLabel('Nota / motivo del cambio (obligatorio)').fill('Segunda revisión aislada')
      await page.getByRole('button', { name: 'Guardar seguimiento' }).click()
      await page.getByRole('status').filter({ hasText: 'El incidente cambió' }).waitFor().catch(async error => { throw new Error(`${error.message}; responses=${responses}; status=${await page.getByRole('status').textContent()}; errors=${errors.join(';')}`) })
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      mkdirSync(resolve('tmp'), { recursive: true })
      await page.screenshot({ path: resolve('tmp/operations-editor-mobile.png'), fullPage: true })
    } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }, 60000)
})
