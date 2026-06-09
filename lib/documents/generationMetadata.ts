import type { Prisma } from '@prisma/client'

export const DOCUMENT_GENERATION_VERSION = 1

export type DocumentSourceTemplate =
  | {
      type: 'recibo'
      name: string
      version: number
    }
  | {
      type: 'legacy-estampo'
      estampoId: string
      name: string
      version: number
    }
  | {
      type: 'wizard-estampo'
      estampoBaseId: number
      slug: string
      categoria: string
      customized: boolean
      version: number
    }

export function buildDocumentGenerationMetadata(params: {
  userId: string
  generatedAt?: Date
  sourceTemplate: DocumentSourceTemplate
  variables: Record<string, unknown>
}) {
  return {
    generatedByUserId: params.userId,
    generatedAt: params.generatedAt ?? new Date(),
    sourceTemplate: params.sourceTemplate as Prisma.InputJsonObject,
    generationVariables: params.variables as Prisma.InputJsonObject,
    generationVersion: DOCUMENT_GENERATION_VERSION,
  }
}
