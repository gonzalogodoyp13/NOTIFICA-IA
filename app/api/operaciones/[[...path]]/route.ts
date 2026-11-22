import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthResolutionError } from '@/lib/auth-server'
import { requirePlatformOwner, OperationsAccessError } from '@/lib/operations/auth'
import { loadOperations } from '@/lib/operations/queries'
import { updateIncident } from '@/lib/operations/incidents'
import { withRequestTiming, requestIdFor } from '@/lib/api/requestTiming'
import { previewRecovery, executeRecovery, verifyRecovery } from '@/lib/operations/recovery'
import { boundRequestBody, requireSameOrigin, RequestSecurityError } from '@/lib/security/request'
import { enforceRequestQuota } from '@/lib/security/rateLimit'
import { diagnosticExport } from '@/lib/operations/exports'
import { manageAlerts } from '@/lib/operations/alert-management'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ path?: string[] }> }
async function dispatch(request: NextRequest, context: Context) {
  return withRequestTiming(request, 'operations.request', async () => {
    try {
      const owner = await requirePlatformOwner(request.method === 'PATCH' ? 'incidents.write' : 'operations.read')
      await enforceRequestQuota('/api/operaciones', request.method, owner)
      const { path = [] } = await context.params
      if (request.method === 'GET' && path[0] === 'exportar' && path.length === 3) {
        const office = request.nextUrl.searchParams.get('office')
        const officeId = office ? z.coerce.number().int().positive().parse(office) : undefined
        return NextResponse.json(await diagnosticExport(path[1], path[2], officeId), { headers: { 'Content-Disposition': 'attachment; filename="diagnostico-notifica.json"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
      }
      if (request.method === 'GET') return NextResponse.json(await loadOperations(path, Object.fromEntries(request.nextUrl.searchParams)))
      requireSameOrigin(request)
      if(path.length===1&&path[0]==='recuperacion') {
        await boundRequestBody(request,16384)
        const body=z.object({mode:z.enum(['preview','execute','verify']),data:z.unknown()}).strict().parse(await request.json())
        return NextResponse.json(body.mode==='preview'?await previewRecovery(body.data):body.mode==='verify'?await verifyRecovery(z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).parse(body.data)):await executeRecovery(body.data,requestIdFor(request)))
      }
      if (path.length === 1 && path[0] === 'alertas') {
        await boundRequestBody(request, 16384)
        return NextResponse.json(await manageAlerts(await request.json()))
      }
      if (path.length !== 2 || path[0] !== 'incidentes' || !/^[a-zA-Z0-9_-]{1,160}$/.test(path[1])) throw new OperationsAccessError(404, 'NOT_FOUND')
      await boundRequestBody(request, 16384)
      return NextResponse.json(await updateIncident(path[1], await request.json()))
    } catch (error) {
      if (error instanceof OperationsAccessError || error instanceof AuthResolutionError || error instanceof RequestSecurityError) return NextResponse.json({ error: { code: error.code, message: 'No se pudo autorizar o completar esta solicitud.' } }, { status: error.status })
      if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Revisa los filtros o los datos ingresados.' } }, { status: 400 })
      throw error
    }
  })
}
export const GET = dispatch
export const PATCH = dispatch
