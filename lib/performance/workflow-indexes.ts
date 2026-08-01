export const EXPECTED_WORKFLOW_INDEXES = {
  notifications: 'notificaciones_diligenciaId_createdAt_idx',
  documentsByNotification: 'Documento_notificacionId_tipo_voidedAt_createdAt_idx',
  documentsByDiligence: 'Documento_diligenciaId_tipo_voidedAt_createdAt_idx',
} as const

export type ExplainPlanNode = {
  'Node Type'?: string
  'Index Name'?: string
  'Plan Rows'?: number
  'Actual Rows'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Local Hit Blocks'?: number
  'Local Read Blocks'?: number
  'Temp Read Blocks'?: number
  'Temp Written Blocks'?: number
  Plans?: ExplainPlanNode[]
}

export type ExplainDocument = {
  Plan?: ExplainPlanNode
  'Planning Time'?: number
  'Execution Time'?: number
}

export type ExplainSummary = {
  planningTimeMs: number | null
  executionTimeMs: number | null
  nodeTypes: string[]
  indexNames: string[]
  planRows: number | null
  actualRows: number | null
  sharedHitBlocks: number
  sharedReadBlocks: number
  localHitBlocks: number
  localReadBlocks: number
  tempReadBlocks: number
  tempWrittenBlocks: number
  hasSequentialScan: boolean
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function summarizeExplain(document: ExplainDocument): ExplainSummary {
  const nodeTypes = new Set<string>()
  const indexNames = new Set<string>()
  const visit = (node: ExplainPlanNode | undefined) => {
    if (!node) return
    if (node['Node Type']) nodeTypes.add(node['Node Type'])
    if (node['Index Name']) indexNames.add(node['Index Name'])
    for (const child of node.Plans ?? []) visit(child)
  }

  visit(document.Plan)

  return {
    planningTimeMs: finiteNumber(document['Planning Time']),
    executionTimeMs: finiteNumber(document['Execution Time']),
    nodeTypes: Array.from(nodeTypes).sort(),
    indexNames: Array.from(indexNames).sort(),
    planRows: finiteNumber(document.Plan?.['Plan Rows']),
    actualRows: finiteNumber(document.Plan?.['Actual Rows']),
    sharedHitBlocks: finiteNumber(document.Plan?.['Shared Hit Blocks']) ?? 0,
    sharedReadBlocks: finiteNumber(document.Plan?.['Shared Read Blocks']) ?? 0,
    localHitBlocks: finiteNumber(document.Plan?.['Local Hit Blocks']) ?? 0,
    localReadBlocks: finiteNumber(document.Plan?.['Local Read Blocks']) ?? 0,
    tempReadBlocks: finiteNumber(document.Plan?.['Temp Read Blocks']) ?? 0,
    tempWrittenBlocks: finiteNumber(document.Plan?.['Temp Written Blocks']) ?? 0,
    hasSequentialScan: nodeTypes.has('Seq Scan'),
  }
}

export function explainUsesIndexes(summary: ExplainSummary, expectedIndexes: string[]) {
  return expectedIndexes.every(indexName => summary.indexNames.includes(indexName))
}

export function assertTemporaryBenchmarkAllowed(params: {
  environment: string | undefined
  allowTemporaryBenchmark: boolean
}) {
  const environment = params.environment?.trim().toLowerCase()
  const allowed = new Set(['local', 'development', 'test', 'qa', 'staging', 'performance'])

  if (!params.allowTemporaryBenchmark) {
    throw new Error('Temporary benchmark mode requires --allow-temporary-benchmark.')
  }
  if (!environment || !allowed.has(environment)) {
    throw new Error(
      'Temporary benchmark mode requires NEXT_PUBLIC_ENVIRONMENT=local|development|test|qa|staging|performance.',
    )
  }
}

export function assertProductionConfirmationAllowed(params: {
  environment: string | undefined
  confirmed: boolean
}) {
  const environment = params.environment?.trim().toLowerCase()
  if (environment !== 'production' || !params.confirmed) {
    throw new Error(
      'Production confirmation requires NEXT_PUBLIC_ENVIRONMENT=production and --confirm-production-read-only.',
    )
  }
}
