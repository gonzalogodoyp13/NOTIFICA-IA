import { reportBrowserError } from './lib/diagnostics/browser'
// Same-origin relay provides durable capture and resolves identity on the server.
window.addEventListener('error', event => { void reportBrowserError(event.error) })
window.addEventListener('unhandledrejection', event => { void reportBrowserError(event.reason) })
