import { initializeMonitor } from './lib/diagnostics/monitor'
initializeMonitor(process.env.SENTRY_DSN)
