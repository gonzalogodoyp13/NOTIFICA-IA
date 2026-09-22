import { request } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const baseURL = 'http://127.0.0.1:3002'
const authenticated = await request.newContext({ baseURL, storageState: '.auth/supabase-user.json' })
const anonymous = await request.newContext({ baseURL })
const results = []
try {
  async function check(name, context, method, url, expected, options = {}) {
    const { expectedCode, ...requestOptions } = options
    const response = await context.fetch(url, { method, ...requestOptions })
    const result = { name, status: response.status(), expected, passed: response.status() === expected }
    if (expectedCode) {
      const body = await response.json()
      result.code = body.error?.code ?? body.code ?? body.error
      result.passed &&= result.code === expectedCode
    }
    results.push(result)
    assert.equal(result.passed, true, name + ': unexpected response')
    return response
  }
  await check('Authenticated user', authenticated, 'GET', '/api/user/me', 200)
  await check('Authenticated device list', authenticated, 'GET', '/api/signing/devices', 200)
  const documents = await check('Existing QA documents', authenticated, 'GET', '/api/roles/cmthewciu007v9foxtmsgbk8t/documentos', 200)
  const document = (await documents.json()).data.find(item => item.hasPdf)
  assert.ok(document, 'Existing QA PDF is available')
  const pdf = await check('Existing receipt PDF download', authenticated, 'GET', `/api/documentos/${document.id}/download`, 200)
  const bytes = await pdf.body()
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-')
  results.at(-1).validPdfHeader = true
  await check('Health', anonymous, 'GET', '/api/ping', 200)
  await check('Anonymous device list denied', anonymous, 'GET', '/api/signing/devices', 401)
  await check('Anonymous enrollment administration denied', anonymous, 'POST', '/api/signing/devices', 401, { data: { action: 'enroll', role: 'SIGNER' } })
  await check('Authenticated enrollment over HTTP denied', authenticated, 'POST', '/api/signing/devices', 400, { data: { action: 'enroll', role: 'SIGNER' }, headers: { origin: baseURL }, expectedCode: 'HTTPS_REQUIRED' })
  await check('Device challenge over HTTP denied', anonymous, 'POST', '/api/signing/device/challenge', 400, { data: {}, expectedCode: 'HTTPS_REQUIRED' })
  await check('Spoofed proxy HTTPS header denied', anonymous, 'POST', '/api/signing/device/challenge', 400, { data: {}, headers: { 'x-forwarded-proto': 'https' }, expectedCode: 'HTTPS_REQUIRED' })
  await check('Spoofed proxy HTTPS header denied for browser administration', authenticated, 'POST', '/api/signing/devices', 400, { data: { action: 'invalid' }, headers: { origin: baseURL, 'x-forwarded-proto': 'https' }, expectedCode: 'HTTPS_REQUIRED' })
  await check('Forwarded scheme list denied', anonymous, 'POST', '/api/signing/device/challenge', 400, { data: {}, headers: { 'x-forwarded-proto': 'http,https' }, expectedCode: 'HTTPS_REQUIRED' })
  await check('Browser cookie cannot bypass device HTTPS', authenticated, 'POST', '/api/signing/device/heartbeat', 400, { data: {}, expectedCode: 'HTTPS_REQUIRED' })
  await check('Missing diligence completion is harmless', authenticated, 'PUT', '/api/diligencias/pre-phase6-nonexistent/complete', 404, { data: {} })
  await check('Anonymous completion denied', anonymous, 'PUT', '/api/diligencias/pre-phase6-nonexistent/complete', 401, { data: {} })
} finally {
  await authenticated.dispose()
  await anonymous.dispose()
  const output = { checkedAt: new Date().toISOString(), baseURL, results }
  writeFileSync('test-results/signing-browser-verification/pre-phase6-http-results.json', JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify(output, null, 2))
}
