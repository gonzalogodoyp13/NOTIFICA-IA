export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'OTHER'

const CREATE_VERBS = new Set(['create', 'created', 'generate', 'generated'])
const UPDATE_VERBS = new Set([
  'update',
  'updated',
  'regenerated',
  'corrected',
  'status_changed',
  'completed',
  'scheduled',
  'payment',
  'boleta',
  'undo',
  'reset',
  'toggled',
  'resolution',
  'reply_classify',
])
const DELETE_VERBS = new Set(['delete', 'deleted', 'voided', 'cancelled', 'canceled', 'anulled'])
const HISTORICAL_DELETE_DESCRIPTION = /\b(eliminad[oa]s?|eliminaci[oó]n|anulad[oa]s?|anulaci[oó]n|suprimid[oa]s?|borrad[oa]s?)\b/i

export function classifyActivityAction(eventType: string, description?: string | null): ActivityAction {
  const terminalVerb = eventType.trim().toLowerCase().split('.').at(-1) ?? ''
  if (CREATE_VERBS.has(terminalVerb)) return 'CREATE'
  if (UPDATE_VERBS.has(terminalVerb)) return 'UPDATE'
  if (DELETE_VERBS.has(terminalVerb)) return 'DELETE'
  if (description && HISTORICAL_DELETE_DESCRIPTION.test(description)) return 'DELETE'
  return 'OTHER'
}
