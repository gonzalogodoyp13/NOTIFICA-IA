export type ReportSection = 'operations' | 'versions' | 'deliveries'
export type DeliveryStatus = 'not_sent' | 'pending' | 'sent' | 'partial' | 'failed'

export type Pagination = { page: number; limit: number; total: number; totalPages: number }

export type ReportRow = {
  id: string
  reportType: 'daily' | 'monthly' | 'custom'
  periodDate: string
  periodStart: string
  periodEnd: string
  status: string
  deliveryStatus: DeliveryStatus
  fileName: string
  sizeBytes: number
  activityCount: number
  generatedAt: string
  expiresAt: string | null
  retainedVersionCount: number
  deliveryAttemptCount: number
  createdBy?: { email: string } | null
  currentVersion: { id: string; versionNumber: number; status: string; checksumSha256: string | null; sizeBytes: number | null; generatedAt: string } | null
  latestDeliveryAttempt: { id: string; attemptNumber: number; status: string; failedCount: number; sentCount: number; skippedCount: number } | null
}

export type ReportSummary = { availableReports: number; retainedVersions: number; deliveryAttempts: number; needsAttention: number }
export type ReportEnvelope = { items: ReportRow[]; pagination: Pagination; summary: ReportSummary }

export type ReportVersion = {
  id: string
  reportId: string
  versionNumber: number
  status: string
  fileName: string
  mimeType: string
  sizeBytes: number | null
  checksumSha256: string | null
  generationMode: string
  generatedAt: string
  errorMessage: string | null
  failedAt: string | null
  deleteRequestedAt: string | null
  deletedAt: string | null
  isCurrent: boolean
  generatedBy?: { email: string } | null
  report: { reportType: 'daily' | 'monthly' | 'custom'; periodDate: string; currentVersion: { id: string; versionNumber: number } | null }
}

export type DeliveryAttemptSummary = {
  id: string
  attemptNumber: number
  status: string
  mode: string
  target: string
  parentAttemptId: string | null
  intendedRecipientCount: number
  sentCount: number
  failedCount: number
  skippedCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  retryCount: number
  recipientCount: number
  requestedBy?: { email: string } | null
  report: { id: string; reportType: 'daily' | 'monthly' | 'custom'; periodDate: string; currentVersionId: string | null; currentVersion: { id: string; versionNumber: number } | null }
  reportVersion?: { id: string; versionNumber: number; checksumSha256: string | null; fileName: string } | null
  parentAttempt?: { id: string; attemptNumber: number } | null
}

export type DeliveryAttemptDetail = Omit<DeliveryAttemptSummary, 'retryCount' | 'recipientCount'> & {
  provider: string
  fromAccount: string
  reportVersion?: { id: string; versionNumber: number; checksumSha256: string | null; fileName: string; sizeBytes: number | null } | null
  parentAttempt?: { id: string; attemptNumber: number; status: string } | null
  retryAttempts: Array<{ id: string; attemptNumber: number; status: string; createdAt: string }>
  recipients: Array<{
    id: string
    email: string
    authorizationDecision: string
    status: string
    attemptCount: number
    providerMessageId: string | null
    providerThreadId: string | null
    providerInternetMessageId: string | null
    attachmentFilename: string | null
    attachmentMimeType: string | null
    attachmentByteSize: number | null
    attachmentSha256: string | null
    errorMessage: string | null
    sentAt: string | null
    completedAt: string | null
  }>
}

export type Paged<T> = { items: T[]; pagination: Pagination }

export type ReportJobRow = {
  id: string; type: 'GENERATE' | 'DELIVER'; status: string; origin: string; reportKind: 'daily' | 'monthly' | 'custom'; requestedPeriodLabel: string
  progressPhase: string; completedUnits: number; totalUnits: number; resultCode: string | null; safeError: string | null; attemptCount: number; maxAttempts: number
  availableAt: string; leaseExpiresAt: string | null; createdAt: string; completedAt: string | null
  requestedBy?: { email: string } | null; customDefinition?: { name: string } | null; _count?: { runs: number; retryJobs: number }
}
export type JobEnvelope = Paged<ReportJobRow> & { summary: Record<string, number> }

export type RecipientConfiguration = { revision: number; recipients: Array<{ userId: string; email: string; active: boolean; dailyEnabled: boolean; monthlyEnabled: boolean; customEnabled: boolean; updatedAt: string | null }> }

export type ReportScheduleRow = {
  id: string; kind: 'DAILY' | 'MONTHLY' | 'CUSTOM'; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; localTime: string; weekday: number | null; monthDay: number | null
  enabled: boolean; latenessThresholdMinutes: number; nextRunAt: string | null; lastAttemptAt: string | null; lastSuccessAt: string | null; lastFailureAt: string | null
  consecutiveFailures: number; safeLastError: string | null; recipientCount: number; health: { state: string; reason: string }
  customDefinition?: { id: string; name: string; status: string } | null; lastJob?: { id: string; status: string; leaseExpiresAt: string | null } | null
}

export type CustomDefinitionRow = {
  id: string; name: string; description: string | null; status: 'ACTIVE' | 'ARCHIVED'; modules: string[]; actionCategories: string[]; results: string[]; actorUserIds: string[]; includeSystem: boolean; selectedColumns: string[]
  recipients: Array<{ userId: string }>; schedule: null | { id: string; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; localTime: string; weekday: number | null; monthDay: number | null; latenessThresholdMinutes: number; enabled: boolean }
  _count: { reports: number; jobs: number }; updatedAt: string
}
