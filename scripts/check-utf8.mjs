import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const roots = ['app', 'components', 'lib']
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const decoder = new TextDecoder('utf-8', { fatal: true })
const invalidPaths = []

function walk(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue
    }

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (!extensions.has(path.extname(entry.name))) {
      continue
    }

    const buffer = readFileSync(fullPath)

    try {
      decoder.decode(buffer)
    } catch (error) {
      invalidPaths.push({
        path: fullPath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

for (const root of roots) {
  const fullRoot = path.resolve(root)
  if (statSync(fullRoot, { throwIfNoEntry: false })?.isDirectory()) {
    walk(fullRoot)
  }
}

if (invalidPaths.length > 0) {
  console.error('Invalid UTF-8 detected in source files:')
  for (const file of invalidPaths) {
    console.error(`- ${file.path}: ${file.message}`)
  }
  process.exit(1)
}

console.log('UTF-8 check passed for app, components, and lib.')
