import { spawnSync } from 'node:child_process'

type Step = {
  name: string
  command: string
  args: string[]
}

const steps: Step[] = [
  { name: 'Seed QA data', command: 'npm', args: ['run', 'db:seed:qa'] },
  { name: 'Refresh QA authentication state', command: 'npm', args: ['run', 'qa:auth:auto'] },
  { name: 'Vitest integration checks', command: 'npm', args: ['run', 'test:integration'] },
  { name: 'Playwright authenticated workflows', command: 'npm', args: ['run', 'test:e2e'] },
]

function run(step: Step) {
  console.log(`\n== ${step.name} ==`)
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return result.status ?? 1
}

let exitCode = 0

for (const step of steps) {
  const code = run(step)
  if (code !== 0) {
    exitCode = code
    break
  }
}

console.log('\n== Reset QA data ==')
const cleanupCode = run({ name: 'Reset QA data', command: 'npm', args: ['run', 'db:seed:qa:reset'] })

process.exitCode = exitCode || cleanupCode

