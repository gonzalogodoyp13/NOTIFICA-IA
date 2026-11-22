import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ current: null as any, incidentStatus: 'OPEN', occurrences: 1, queued: new Map<string, any>(), maintenance: false }))
vi.mock('@/lib/email/system-mailer', () => ({ createSystemMailAdapter: () => { throw new Error('Real sending is forbidden in evaluation tests') } }))
vi.mock('@/lib/prisma', () => {
  const db: any = {
    operationsPolicy: { findUnique: async () => null, findMany: async () => [{key:'global',settings:{ enabled:true,recipients:['owner'],timezone:'UTC' }}], upsert: async () => ({}) },
    office: { findMany: async () => [] }, signingDevice: { findMany: async () => [] },
    diagnosticIncident: { findMany: async () => [{id:'incident',status:state.incidentStatus,severity:'critical',occurrences:state.occurrences}] },
    operationsMaintenance: { findFirst: async () => state.maintenance ? {id:'window'} : null },
    operationsAlert: { findUnique: async () => state.current, upsert: async ({create,update}:any) => { state.current = state.current ? {...state.current,...update} : create; return state.current } },
    operationsNotification: { findFirst: async () => ({id:'digest-already-frozen'}), createMany: async ({data}:any) => { for(const row of data) if(!state.queued.has(row.dedupeKey)) state.queued.set(row.dedupeKey,row); return {count:data.length} } },
    platformGrant: { findMany: async () => [{userId:'owner'}] }, platformAudit: {create:async()=>({})},
    $executeRaw: async () => 1, $queryRaw: async () => [{count:1,office:12}],
  }
  db.$transaction = async (work:any) => work(db)
  return {prisma:db}
})
import { evaluateAlerts } from '@/lib/operations/notifications'
beforeEach(() => { state.current=null; state.incidentStatus='OPEN';state.occurrences=1;state.queued.clear();state.maintenance=false;vi.stubEnv('OPERATIONS_NOTIFICATIONS_ENABLED','false') })
it('deduplicates many occurrences into one preview and never marks a preview as delivered', async () => {
  await evaluateAlerts(new Date('2026-11-20T10:00:00Z'))
  state.occurrences=500
  await evaluateAlerts(new Date('2026-11-20T10:15:00Z'))
  await evaluateAlerts(new Date('2026-11-20T10:30:00Z'))
  expect(state.queued.size).toBe(1)
  expect([...state.queued.values()][0].status).toBe('PREVIEW')
  expect(state.current.lastNotifiedAt).toBeUndefined()
})
it('preserves evidence during maintenance and only offers recovery on an observed terminal state', async () => {
  await evaluateAlerts(new Date('2026-11-20T10:00:00Z'))
  state.maintenance=true;await evaluateAlerts(new Date('2026-11-20T10:15:00Z'))
  expect(state.queued.size).toBe(0);expect(state.current.status).toBe('OPEN')
  state.maintenance=false;await evaluateAlerts(new Date('2026-11-20T10:30:00Z'));expect(state.queued.size).toBe(1)
  state.incidentStatus='RESOLVED';await evaluateAlerts(new Date('2026-11-20T10:45:00Z'));expect(state.current.status).toBe('RECOVERY_PENDING')
  state.incidentStatus='OPEN';await evaluateAlerts(new Date('2026-11-20T11:00:00Z'));expect(state.current.generation).toBe(2)
})
