import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'

// Deliberately limited to public, read-only routes on the local machine.
const base = new URL(process.env.STRESS_BASE_URL || 'http://localhost:3000')
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') {
  throw new Error('This baseline runner only accepts HTTP loopback targets.')
}
const stages = [1, 5, 10, 25, 50]
const durationMs = 5000
const routes = ['/api/ping', '/login']
async function request(path, timeoutMs = 5000) {
  const response = await fetch(new URL(path, base), {
    redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Cache-Control': 'no-cache' },
  })
  const body = await response.text()
  const valid = response.status === 200 && (path === '/api/ping'
    ? (() => { try { return JSON.parse(body).ok === true } catch { return false } })()
    : body.toLowerCase().includes('<html'))
  return { status: response.status, valid }
}
for (const path of routes) {
  if (!(await request(path, 60000)).valid) throw new Error(`Preflight failed: ${path}`)
}
const report = {
  timestamp: new Date().toISOString(), target: base.origin,
  scope: 'Public HTTP baseline only; no authenticated workflows, database capacity, browser rendering, email or signing tested.',
  model: 'Closed-loop concurrent requests; 5 seconds per stage, 5-second request timeout. Latency includes full response body.',
  stages: [],
}
for (const concurrency of stages) {
  const started = performance.now()
  const samples = []
  const statuses = {}
  let failures = 0
  let sequence = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() - started < durationMs) {
      const path = routes[sequence++ % routes.length]
      const before = performance.now()
      try {
        const result = await request(path)
        statuses[result.status] = (statuses[result.status] || 0) + 1
        if (!result.valid) failures++
      } catch {
        statuses.networkOrTimeout = (statuses.networkOrTimeout || 0) + 1
        failures++
      }
      samples.push(performance.now() - before)
    }
  }))
  const elapsed = performance.now() - started
  samples.sort((a, b) => a - b)
  const percentile = p => Math.round(samples[Math.ceil(samples.length * p) - 1])
  const row = { concurrency, requests: samples.length,
    requestsPerSecond: Number((samples.length * 1000 / elapsed).toFixed(1)),
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    failures, errorPercent: Number((failures * 100 / samples.length).toFixed(2)), statuses }
  report.stages.push(row)
  console.log(JSON.stringify(row))
  if (failures / samples.length > .05) {
    report.stoppedEarly = 'Error rate exceeded 5%.'
    process.exitCode = 1
    break
  }
}
await mkdir('reports/stress', { recursive: true })
const output = `reports/stress/local-${report.timestamp.replace(/[:.]/g, '-')}.json`
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(`Report: ${output}`)
if (report.stages.some(stage => stage.failures)) process.exitCode = 1
