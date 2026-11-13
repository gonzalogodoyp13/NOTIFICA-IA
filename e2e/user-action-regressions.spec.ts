import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

function compile(file: string) {
  return ts.transpileModule(`import React from 'react';\n${readFileSync(file, 'utf8')}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    fileName: file,
  }).outputText
}

test('searchable dropdown filters accents, selects with keyboard, and preserves selection on dismissal', async ({ page }) => {
  await page.route('http://regression.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://regression.test/')
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
  await page.evaluate(source => {
    const w = window as any
    const React = w.React
    const module = { exports: {} as any }
    new Function('require', 'module', 'exports', source)((id: string) => id === 'react' ? React : { ChevronDown: () => null }, module, module.exports)
    function Harness() {
      const [value, setValue] = React.useState('')
      return React.createElement('form', { onSubmit: (event: any) => { event.preventDefault(); w.submitted = value } },
        React.createElement(module.exports.SearchableSelect, { value, onValueChange: setValue, required: true, 'aria-label': 'Abogado' },
          React.createElement('option', { value: '' }, 'Seleccionar abogado'),
          React.createElement('optgroup', { label: 'Abogados' },
            React.createElement('option', { value: '1' }, 'José Pérez'),
            React.createElement('option', { value: '2', disabled: true }, 'José histórico'),
            React.createElement('option', { value: '3' }, 'Ana López'))),
        React.createElement('output', null, value),
        React.createElement('button', { type: 'submit' }, 'Guardar'))
    }
    w.ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness))
  }, compile('components/ui/searchable-select.tsx'))
  const input = page.getByRole('combobox', { name: 'Abogado' })
  await input.fill('jose')
  await expect(page.getByRole('option')).toHaveCount(2)
  await expect(page.getByRole('option', { name: 'José histórico' })).toHaveAttribute('aria-disabled', 'true')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toHaveValue('José Pérez')
  await expect(page.locator('output')).toHaveText('1')
  await input.click()
  await input.fill('no matches')
  await expect(page.getByRole('status').filter({ hasText: 'Sin resultados' })).toBeVisible()
  await input.press('Escape')
  await expect(input).toHaveValue('José Pérez')
  await page.getByRole('button', { name: 'Guardar' }).click()
  expect(await page.evaluate(() => (window as any).submitted)).toBe('1')
  await input.click()
  await page.getByRole('option', { name: 'Seleccionar abogado', exact: true }).click()
  await expect(page.locator('output')).toHaveText('')
  await input.fill('unlisted name')
  expect(await input.evaluate((node: HTMLInputElement) => node.checkValidity())).toBe(false)
})

async function mountAuditControl(page: Page, kind: 'association' | 'notes', status = 'terminado') {
  await page.route('http://regression.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://regression.test/')
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
  const source = compile(kind === 'association' ? 'app/(protected)/recibos/components/ReplyAssociation.tsx' : 'app/(protected)/roles/[id]/notas/NotaList.tsx')
  await page.evaluate(({ source, kind, status }) => {
    const w = window as any
    const React = w.React
    w.associated = 0
    w.notesCreated = 0
    const mocks: Record<string, any> = {
      react: React,
      '@/components/ui/button': { Button: ({ children, variant, ...props }: any) => React.createElement('button', props, children) },
      '@/lib/hooks/useRolWorkspace': { useNotas: () => ({ data: [{ id: 'note', contenido: 'Existing note', createdAt: '2026-01-01', userId: 'user' }] }), useCreateNota: () => ({ mutate: () => { w.notesCreated++ }, isPending: false }) },
      '@/lib/validations/rol-workspace': { NotaCreateSchema: { safeParse: (data: any) => ({ success: true, data }) } },
      '@/lib/utils/dateInput': { formatDateTimeCL: (value: string) => value },
    }
    const module = { exports: {} as any }
    new Function('require', 'module', 'exports', source)((id: string) => mocks[id], module, module.exports)
    const props = kind === 'association' ? { replyId: 'reply', onAssociated: () => { w.associated++ } } : { rolId: 'role', rolEstado: status }
    w.ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.default, props))
  }, { source, kind, status })
}

test('reply association requires destination and explicit confirmation; Cancel sends no mutation', async ({ page }) => {
  const writes: unknown[] = []
  await page.route('**/api/recibos/send/replies/reply/association**', async route => {
    if (route.request().method() === 'PATCH') {
      writes.push(route.request().postDataJSON())
      await route.fulfill({ json: { ok: true, data: { id: 'reply' } } })
    } else await route.fulfill({ json: { ok: true, data: { items: [{ id: 'recipient', recipientName: 'Lawyer', recipientEmails: ['lawyer@example.test'], subject: 'Receipt list', sentAt: '2026-01-01' }] } } })
  })
  await mountAuditControl(page, 'association')
  await page.getByRole('button', { name: 'Asociar a un envío' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar asociación' })).toBeDisabled()
  await page.getByLabel('Envío de destino').selectOption('recipient')
  await expect(page.getByRole('button', { name: 'Confirmar asociación' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Asociar a un envío' }).click()
  await page.getByLabel('Envío de destino').selectOption('recipient')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar asociación' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).associated)).toBe(1)
  expect(writes).toEqual([{ recipientId: 'recipient', confirmed: true }])
})

for (const status of ['terminado', 'archivado']) {
  test(`notes remain visible without mutation controls for ${status}`, async ({ page }) => {
    await mountAuditControl(page, 'notes', status)
    await expect(page.getByText('Existing note')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar nota' })).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).notesCreated)).toBe(0)
  })
}

async function mount(page: Page, kind: 'editor' | 'history') {
  await page.route('http://regression.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
  await page.goto('http://regression.test/')
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
  const modules: Record<string, string> = {
    '@/lib/client/recentRoles': compile('lib/client/recentRoles.ts'),
    '@/lib/cache/officeCacheContext': compile('lib/cache/officeCacheContext.tsx'),
    provider: compile('app/(protected)/_components/ProtectedQueryProvider.tsx'),
    history: compile('app/(protected)/dashboard/DashboardSearch.tsx'),
    editor: compile('app/(protected)/roles/[id]/diligencias/EstampoWizardModal.tsx'),
  }
  await page.evaluate(({ modules, kind }) => {
    const w = window as any
    const React = w.React
    const component = (tag: string) => ({ children, ...props }: any) => React.createElement(tag, props, children)
    const cache: Record<string, any> = {
      react: React,
      '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: ({ children }: any) => children, useQueryClient: () => ({}) },
      '@/lib/hooks/useRolWorkspace': { applyStampGenerationToCache: () => {}, StampGenerationResponseSchema: { safeParse: (data: any) => ({ success: true, data }) } },
      '@/components/ui/modal-portal': { ModalPortal: ({ children }: any) => children },
      '@/components/ui/button': { Button: component('button') },
      '@/components/ui/input': { Input: component('input') },
      'next/link': { __esModule: true, default: component('a') },
      'lucide-react': new Proxy({}, { get: () => () => null }),
    }
    function load(id: string): any {
      if (cache[id]) return cache[id]
      if (!modules[id]) throw new Error(`Unmocked import: ${id}`)
      const module = { exports: {} }
      new Function('require', 'module', 'exports', modules[id])(load, module, module.exports)
      return cache[id] = module.exports
    }
    const root = w.ReactDOM.createRoot(document.getElementById('root'))
    if (kind === 'editor') {
      root.render(React.createElement(load('editor').default, { rolId: 'role', diligenciaId: 'diligence', notificacionId: 'notification', isOpen: true, onClose: () => {} }))
    } else {
      w.switchAccount = (userId: string, officeId: number) => root.render(React.createElement(load('provider').default,
        { key: `${userId}:${officeId}`, userId, officeId, initialCacheRevision: 1 }, React.createElement(load('history').default)))
      w.remember = load('@/lib/client/recentRoles').rememberRecentRole
    }
  }, { modules, kind })
}

test.describe('estampo draft confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/diligencias/diligence/estampos/wizard?**', route => route.fulfill({ json: { ok: true, data: { estampos: [{ id: 1, nombreVisible: 'Test template', wizardSchema: [], variablesSchema: [] }], initialVariables: {} } } }))
    await page.route('**/api/diligencias/diligence/estampos/preview', route => route.fulfill({ json: { ok: true, data: { renderedText: 'Original template text' } } }))
    await page.route('**/api/diligencias/diligence/estampos/generate', route => route.fulfill({ json: { ok: true, data: {} } }))
    await mount(page, 'editor')
  })

  async function open(page: Page) {
    await page.getByRole('button', { name: /Editar texto/i }).click()
    return page.getByRole('textbox', { name: 'Texto del estampo' })
  }
  async function submit(page: Page) {
    const request = page.waitForRequest('**/estampos/generate')
    await page.getByRole('button', { name: /^Generar estampo$/i }).click()
    return (await request).postDataJSON()
  }
  test('Cancel discards the first draft, including from the generation payload', async ({ page }) => {
    const text = await open(page)
    await expect(text).toHaveValue('Original template text')
    await text.fill('Discard me')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click()
    await expect(await open(page)).toHaveValue('Original template text')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click()
    expect(await submit(page)).not.toHaveProperty('textoEditado')
  })
  test('Confirm persists; a later Cancel preserves the last confirmed version', async ({ page }) => {
    await (await open(page)).fill('Confirmed text')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(await open(page)).toHaveValue('Confirmed text')
    await page.getByRole('textbox', { name: 'Texto del estampo' }).fill('Discard second draft')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click()
    expect(await submit(page)).toHaveProperty('textoEditado', 'Confirmed text')
  })
  test('Reset removes the confirmed override and returns to the template', async ({ page }) => {
    await (await open(page)).fill('Confirmed text')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await open(page)
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click()
    await expect(await open(page)).toHaveValue('Original template text')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click()
    expect(await submit(page)).not.toHaveProperty('textoEditado')
  })
})

test('dashboard history stays with its account and office across account switches', async ({ page }) => {
  await mount(page, 'history')
  await page.evaluate(() => {
    const w = window as any
    localStorage.setItem('notifica.recentRoles.v1', JSON.stringify([{ id: 'old', rol: 'Legacy private case', tribunal: '', caratula: '' }]))
    w.remember({ userId: 'alice', officeId: 1 }, { id: 'a', rol: 'Alice private case', tribunal: '', caratula: '' })
    w.switchAccount('alice', 1)
  })
  await expect(page.getByRole('link', { name: 'Alice private case' })).toBeVisible()
  await page.evaluate(() => (window as any).switchAccount('bob', 1))
  await expect(page.getByRole('link')).toHaveCount(0)
  await page.evaluate(() => (window as any).switchAccount('alice', 2))
  await expect(page.getByRole('link')).toHaveCount(0)
  await page.evaluate(() => (window as any).switchAccount('alice', 1))
  await expect(page.getByRole('link', { name: 'Alice private case' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Legacy private case' })).toHaveCount(0)
})
