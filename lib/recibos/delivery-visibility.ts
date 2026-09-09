export type DeliveryMode = 'live' | 'simulation'

export function withAdminDiagnostics<T extends object, D>(safeValue: T, diagnostics: D, includeDiagnostics: boolean): T & { diagnostics?: D } {
  return includeDiagnostics ? { ...safeValue, diagnostics } : safeValue
}

export function deliveryPresentation(provider: string) {
  const deliveryMode: DeliveryMode = provider === 'dry-run' ? 'simulation' : 'live'
  return {
    deliveryMode,
    deliveryLabel: deliveryMode === 'simulation'
      ? 'Simulación (no se envió ningún correo)'
      : 'Envío real',
    canSyncReplies: deliveryMode === 'live',
  }
}

export function sendTypeLabel(dispatchKind: string) {
  if (dispatchKind === 'resend') return 'Reenvío'
  if (dispatchKind === 'test') return 'Prueba'
  return 'Envío'
}

type ProviderHealthRecord = {
  provider: string
  mailboxAddress: string
  enabled: boolean
  configured: boolean
  status: string
  lastCheckedAt: string | null
  lastError: string | null
}

export function providerHealthView(records: ProviderHealthRecord[], includeDiagnostics: boolean, activeProvider: string) {
  const simulation = activeProvider === 'dry-run'
  const enabled = records.filter(record => record.enabled)
  const hasFailure = enabled.some(record => record.status === 'degraded' || record.status === 'misconfigured')
  const hasHealthy = enabled.some(record => record.status === 'healthy')

  const readiness = simulation
    ? { status: 'simulation' as const, label: 'Modo de simulación activo: no se enviarán correos.', canSyncReplies: false }
    : hasFailure
      ? { status: 'attention' as const, label: 'El servicio de correo requiere revisión antes de enviar.', canSyncReplies: true }
      : hasHealthy
        ? { status: 'available' as const, label: 'El servicio de correo está disponible.', canSyncReplies: true }
        : { status: 'unconfigured' as const, label: 'No se pudo confirmar la disponibilidad del servicio de correo.', canSyncReplies: true }

  return {
    readiness,
    ...(includeDiagnostics ? {
      diagnostics: {
        providers: records.map(record => ({
          provider: record.provider,
          mailboxAddress: record.mailboxAddress,
          status: record.status,
          lastCheckedAt: record.lastCheckedAt,
          lastError: record.lastError,
        })),
      },
    } : {}),
  }
}
