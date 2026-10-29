import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecentRoles, rememberRecentRole } from '@/lib/client/recentRoles'

const alice = { userId: 'alice', officeId: 1 }
const bob = { userId: 'bob', officeId: 1 }
const otherOffice = { userId: 'alice', officeId: 2 }
const role = (id: string) => ({ id, rol: `ROL ${id}`, tribunal: 'Tribunal', caratula: '' })
let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } })
})
afterEach(() => vi.unstubAllGlobals())

describe('recent case history', () => {
  it('isolates accounts in the same office and the same account across offices', () => {
    rememberRecentRole(alice, role('a'))
    expect(readRecentRoles(bob)).toEqual([])
    expect(readRecentRoles(otherOffice)).toEqual([])
    rememberRecentRole(bob, role('b'))
    rememberRecentRole(otherOffice, role('c'))
    expect(readRecentRoles(alice)).toEqual([role('a')])
    expect(readRecentRoles(bob)).toEqual([role('b')])
    expect(readRecentRoles(otherOffice)).toEqual([role('c')])
  })
  it('discards ownerless legacy history rather than assigning it to the next login', () => {
    values.set('notifica.recentRoles.v1', JSON.stringify([role('private')]))
    expect(readRecentRoles(bob)).toEqual([])
    expect(values.has('notifica.recentRoles.v1')).toBe(false)
  })
  it('keeps the ten most recent unique cases within the account', () => {
    for (let i = 0; i < 12; i++) rememberRecentRole(alice, role(String(i)))
    rememberRecentRole(alice, role('5'))
    expect(readRecentRoles(alice).map(r => r.id)).toEqual(['5', '11', '10', '9', '8', '7', '6', '4', '3', '2'])
  })
  it('tolerates unavailable and malformed browser storage', () => {
    values.set('notifica.recentRoles.v2:1:alice', 'bad JSON')
    expect(readRecentRoles(alice)).toEqual([])
    values.set('notifica.recentRoles.v2:1:alice', JSON.stringify([null, {}, role('ok')]))
    expect(readRecentRoles(alice)).toEqual([role('ok')])
    vi.stubGlobal('window', { get localStorage() { throw new Error('disabled') } })
    expect(() => rememberRecentRole(alice, role('a'))).not.toThrow()
    expect(readRecentRoles(alice)).toEqual([])
  })
})
