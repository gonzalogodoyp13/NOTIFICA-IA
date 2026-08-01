import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  EXPECTED_WORKFLOW_INDEXES,
  assertProductionConfirmationAllowed,
  assertTemporaryBenchmarkAllowed,
  explainUsesIndexes,
  summarizeExplain,
} from '../../lib/performance/workflow-indexes'

describe('workflow index verification', () => {
  it('keeps Prisma and the deployed migration aligned with all workflow indexes', () => {
    const root = process.cwd()
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    const migration = readFileSync(
      join(root, 'prisma/migrations/20260730150000_optimize_receipt_workflow/migration.sql'),
      'utf8',
    )

    expect(schema).toContain('@@index([diligenciaId, createdAt])')
    expect(schema).toContain('@@index([notificacionId, tipo, voidedAt, createdAt])')
    expect(schema).toContain('@@index([diligenciaId, tipo, voidedAt, createdAt])')
    for (const indexName of Object.values(EXPECTED_WORKFLOW_INDEXES)) {
      expect(migration).toContain(indexName)
    }
  })

  it('summarizes nested index and bitmap plans', () => {
    const summary = summarizeExplain({
      'Planning Time': 0.2,
      'Execution Time': 1.4,
      Plan: {
        'Node Type': 'Bitmap Heap Scan',
        'Plan Rows': 8,
        'Actual Rows': 7,
        'Shared Hit Blocks': 3,
        'Local Hit Blocks': 5,
        Plans: [
          {
            'Node Type': 'BitmapOr',
            Plans: [
              {
                'Node Type': 'Bitmap Index Scan',
                'Index Name': EXPECTED_WORKFLOW_INDEXES.documentsByNotification,
              },
              {
                'Node Type': 'Bitmap Index Scan',
                'Index Name': EXPECTED_WORKFLOW_INDEXES.documentsByDiligence,
              },
            ],
          },
        ],
      },
    })

    expect(summary.hasSequentialScan).toBe(false)
    expect(summary.executionTimeMs).toBe(1.4)
    expect(summary.sharedHitBlocks).toBe(3)
    expect(summary.localHitBlocks).toBe(5)
    expect(
      explainUsesIndexes(summary, [
        EXPECTED_WORKFLOW_INDEXES.documentsByNotification,
        EXPECTED_WORKFLOW_INDEXES.documentsByDiligence,
      ]),
    ).toBe(true)
  })

  it('rejects unsafe benchmark and production modes', () => {
    expect(() =>
      assertTemporaryBenchmarkAllowed({ environment: 'production', allowTemporaryBenchmark: true }),
    ).toThrow(/NEXT_PUBLIC_ENVIRONMENT/)
    expect(() =>
      assertTemporaryBenchmarkAllowed({ environment: 'qa', allowTemporaryBenchmark: false }),
    ).toThrow(/allow-temporary-benchmark/)
    expect(() =>
      assertTemporaryBenchmarkAllowed({ environment: 'qa', allowTemporaryBenchmark: true }),
    ).not.toThrow()

    expect(() =>
      assertProductionConfirmationAllowed({ environment: 'production', confirmed: false }),
    ).toThrow(/confirm-production-read-only/)
    expect(() =>
      assertProductionConfirmationAllowed({ environment: 'production', confirmed: true }),
    ).not.toThrow()
  })
})
