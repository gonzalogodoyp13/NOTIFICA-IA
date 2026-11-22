import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ guard: vi.fn(), incident: vi.fn(), events: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/operations/auth', () => ({ requirePlatformOwner: state.guard, OperationsAccessError: class extends Error { constructor(public status: number, code: string) { super(code) } } }))
vi.mock('@/lib/prisma', () => ({ prisma: { diagnosticIncident: { findFirst: state.incident }, diagnosticEvent: { findMany: state.events }, platformAudit: { create: state.audit } } }))
import { diagnosticExport, exportEvidence } from '@/lib/operations/exports'
beforeEach(() => { vi.clearAllMocks(); state.guard.mockResolvedValue({ id: 'owner' }); state.incident.mockResolvedValue({ id: 'incident' }); state.events.mockResolvedValue([]) })
it('redacts secrets, contents, arbitrary free text, identities and sensitive URLs', () => {
  const output = exportEvidence({ code:'TOKEN_MISSING', release:'v1.2.3', module:'signing', password:'secret', pin:'1234', privateKey:'private', cookie:'cookie', body:'document', userId:'person', frames:['secret'], operation:'https://secret.example/?token=secret', recordId:'token=secret', errorType:'Error' })
  expect(output).toEqual({ code:'TOKEN_MISSING', release:'v1.2.3', module:'signing', errorType:'Error' })
})
it('checks dedicated permission before querying and requires audit success', async () => {
  state.guard.mockRejectedValueOnce(new Error('denied')); await expect(diagnosticExport('incidentes','id')).rejects.toThrow('denied'); expect(state.incident).not.toHaveBeenCalled()
  state.audit.mockRejectedValueOnce(new Error('audit failed')); await expect(diagnosticExport('incidentes','id',12)).rejects.toThrow('audit failed')
  expect(state.guard).toHaveBeenLastCalledWith('operations.export')
})
it('keeps office scope, bounded evidence and explicit truncation', async () => {
  state.events.mockResolvedValue(Array.from({length:101},()=>({ reference:'ref',evidence:{code:'TOKEN_MISSING',body:'secret'} })))
  const result = await diagnosticExport('incidentes','id',12)
  expect(state.events.mock.calls[0][0]).toMatchObject({ where:{incidentId:'id',officeId:12},take:101 })
  expect((result.data as any).truncated).toBe(true); expect((result.data as any).events).toHaveLength(100)
  expect(JSON.stringify(result)).not.toContain('secret'); expect(state.audit).toHaveBeenCalled()
})
