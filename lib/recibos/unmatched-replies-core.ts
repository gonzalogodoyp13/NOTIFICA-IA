import { z } from 'zod'

export const UnmatchedReplyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', 'unmatched', 'needs_review']).default('all'),
}).strict()

export type UnmatchedReplyStatusFilter = z.infer<typeof UnmatchedReplyQuerySchema>['status']

export function unmatchedReplyStatuses(status: UnmatchedReplyStatusFilter) {
  return status === 'all' ? ['unmatched', 'needs_review'] : [status]
}
