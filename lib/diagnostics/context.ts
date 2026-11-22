import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { DiagnosticContext } from './core'
const context = new AsyncLocalStorage<DiagnosticContext>()
export const diagnosticContext = () => context.getStore()
export function withDiagnosticContext<T>(value: DiagnosticContext, fn: () => T): T { return context.run(value, fn) }
