import 'server-only'

import { randomUUID } from 'crypto'
import {
  Prisma,
  ReceiptGenerationOperation,
  ReceiptGenerationStatus,
  type Banco,
} from '@prisma/client'

import { ApiError, type RequestContext } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { buildDocumentGenerationMetadata } from '@/lib/documents/generationMetadata'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { parseEstampoTipo } from '@/lib/estampos/selection'
import { buildReciboPdf, buildReciboVariables, loadOfficeReciboStampForPdf } from '@/lib/pdf/recibo'
import type { DiligenciaWithReciboRelations } from '@/lib/pdf/recibo'
import { loadOfficePdfConfig } from '@/lib/pdf/officeConfig'
import { prisma } from '@/lib/prisma'
import {
  buildExecutionMetadata,
  receiptGenerationFingerprint,
  receiptRequestHash,
} from '@/lib/recibos/generation-core'
import type { ReciboGenerateInput } from '@/lib/validations/rol-workspace'
import { serializeNotification } from '@/lib/workflow/notificationView'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function formatNumeroRecibo(year: number, sequence: number) {
  return `R-${year}-${String(sequence).padStart(6, '0')}`
}

function operationResult(operation: ReceiptGenerationOperation) {
  if (operation === ReceiptGenerationOperation.REGENERATE) return 'regenerated' as const
  if (operation === ReceiptGenerationOperation.CORRECT) return 'corrected' as const
  return 'created' as const
}

function eventTypeFor(operation: ReceiptGenerationOperation) {
  if (operation === ReceiptGenerationOperation.REGENERATE) return 'receipt.regenerated'
  if (operation === ReceiptGenerationOperation.CORRECT) return 'receipt.corrected'
  return 'receipt.generated'
}

function receiptDocumentView(documento: any, diligencia: any) {
  return {
    id: documento.id,
    nombre: documento.nombre,
    tipo: documento.tipo,
    version: documento.version,
    hasPdf: hasStoredPdf(documento),
    createdAt: documento.createdAt.toISOString(),
    diligenciaId: documento.diligenciaId,
    notificacionId: documento.notificacionId,
    voidedAt: documento.voidedAt ? documento.voidedAt.toISOString() : null,
    voidReason: documento.voidReason ?? null,
    voidedByUserId: documento.voidedByUserId ?? null,
    generatedByUserId: documento.generatedByUserId,
    generatedAt: documento.generatedAt ? documento.generatedAt.toISOString() : null,
    sourceTemplate: documento.sourceTemplate,
    generationVariables: documento.generationVariables,
    generationVersion: documento.generationVersion,
    diligencia: { id: diligencia.id, tipo: diligencia.tipo?.nombre ?? null },
    estampo: null,
    estampoBase: null,
  }
}

function receiptView(receipt: any) {
  return {
    id: receipt.id,
    notificacionId: receipt.notificacionId,
    documentoId: receipt.documentoId,
    documentVersionId: receipt.documentVersionId,
    bancoId: receipt.bancoId,
    numeroRecibo: receipt.numeroRecibo,
    monto: Number(receipt.monto),
    medio: receipt.medio,
    ref: receipt.ref,
    fechaEjecucion: receipt.fechaEjecucion ? receipt.fechaEjecucion.toISOString() : null,
    fechaRecibo: receipt.fechaRecibo ? receipt.fechaRecibo.toISOString() : null,
    status: receipt.status,
    supersedesReciboId: receipt.supersedesReciboId,
    createdAt: receipt.createdAt.toISOString(),
  }
}

const completedNotificationInclude = {
  ejecutado: { include: { comunas: { select: { id: true, nombre: true } } } },
  diligencia: {
    include: {
      tipo: true,
      rol: {
        include: {
          demanda: {
            include: {
              abogados: { include: { bancos: { include: { banco: true } } } },
            },
          },
        },
      },
    },
  },
  documentos: {
    where: {
      tipo: { in: ['Recibo', 'Estampo'] },
      voidedAt: null,
      OR: [{ pdfId: { not: null } }, { currentVersion: { is: { deletedAt: null } } }],
    },
    include: {
      currentVersion: true,
      estampo: { select: { id: true, nombre: true } },
      estampoBase: { select: { id: true, slug: true, nombreVisible: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.NotificacionInclude

async function loadCompletedResult(reservationId: string) {
  const reservation = await prisma.receiptGenerationReservation.findUnique({ where: { id: reservationId } })
  if (!reservation?.receiptId || !reservation.documentVersionId) {
    throw new ApiError('INTERNAL_ERROR', 'La reserva completada no tiene referencias finales', 500)
  }
  const [receipt, documento, notification] = await Promise.all([
    prisma.recibo.findUnique({ where: { id: reservation.receiptId } }),
    prisma.documento.findUnique({
      where: { id: reservation.documentoId },
      include: { currentVersion: true },
    }),
    prisma.notificacion.findUnique({
      where: { id: reservation.notificacionId },
      include: completedNotificationInclude,
    }),
  ])
  if (!receipt || !documento || !notification) {
    throw new ApiError('INTERNAL_ERROR', 'No se pudo reconstruir el recibo completado', 500)
  }
  return {
    operation: operationResult(reservation.operation),
    documento: receiptDocumentView(documento, notification.diligencia),
    recibo: receiptView(receipt),
    notificacion: serializeNotification(notification, notification.diligencia),
  }
}

async function loadGenerationContext(
  input: ReciboGenerateInput,
  context: RequestContext,
  diligenciaId: string
) {
  const notification = await prisma.notificacion.findFirst({
    where: {
      id: input.notificacionId,
      diligenciaId,
      diligencia: { rol: { officeId: context.officeId } },
    },
    include: {
      ejecutado: { include: { comunas: true } },
      diligencia: {
        include: {
          tipo: true,
          rol: {
            include: {
              tribunal: true,
              demanda: {
                include: {
                  abogados: {
                    include: { bancos: { include: { banco: true }, orderBy: { bancoId: 'asc' } } },
                  },
                  ejecutados: { include: { comunas: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!notification) throw new ApiError('NOT_FOUND', 'Notificación no encontrada', 404)
  if (!notification.ejecutadoId || !notification.ejecutado) {
    throw new ApiError('VALIDATION_ERROR', 'La notificación requiere un ejecutado', 400)
  }
  const attorney = notification.diligencia.rol.demanda?.abogados
  if (!attorney) throw new ApiError('VALIDATION_ERROR', 'La demanda no tiene abogado asociado', 400)
  const selectedBankLink = attorney.bancos.find(item => item.bancoId === input.bancoId)
  if (!selectedBankLink || selectedBankLink.banco.officeId !== context.officeId) {
    throw new ApiError('VALIDATION_ERROR', 'El banco no pertenece al abogado de la demanda', 400)
  }

  const currentMeta = isPlainObject(notification.meta) ? notification.meta : {}
  const currentSelection = parseEstampoTipo(currentMeta)
  const exactHistoricalRegeneration =
    input.operation === 'REGENERATE' &&
    currentSelection &&
    JSON.stringify(currentSelection) === JSON.stringify(input.estampoTipo)

  let estampoLabel: string
  if (input.estampoTipo.kind === 'CUSTOM') {
    const estampo = await prisma.estampo.findFirst({
      where: {
        id: input.estampoTipo.estampoId,
        officeId: context.officeId,
        ...(exactHistoricalRegeneration ? {} : { activo: true }),
      },
      select: { nombre: true },
    })
    if (!estampo) throw new ApiError('VALIDATION_ERROR', 'El estampo seleccionado no está disponible', 400)
    estampoLabel = estampo.nombre
  } else {
    const base = await prisma.estampoBase.findFirst({
      where: {
        categoria: input.estampoTipo.categoria,
        ...(exactHistoricalRegeneration ? {} : { isActive: true }),
      },
      select: { nombreVisible: true },
    })
    if (!base) throw new ApiError('VALIDATION_ERROR', 'La categoría de estampo no está disponible', 400)
    estampoLabel = `${input.estampoTipo.categoria
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')} (Wizard)`
  }

  return {
    notification,
    diligencia: notification.diligencia as unknown as DiligenciaWithReciboRelations,
    selectedBank: selectedBankLink.banco as Banco,
    estampoLabel,
    currentMeta,
  }
}

async function reserveGeneration(params: {
  input: ReciboGenerateInput
  context: RequestContext
  rolId: string
  diligenciaId: string
  requestHash: string
  fingerprint: string
  idempotencyKey: string
  currentMeta: Record<string, unknown>
}) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`receipt-notification-${params.input.notificacionId}`}))
    `

    const sameKey = await tx.receiptGenerationReservation.findUnique({
      where: {
        officeId_idempotencyKey: {
          officeId: params.context.officeId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    })
    if (sameKey) {
      if (sameKey.requestHash !== params.requestHash) {
        throw new ApiError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya fue usada con otros datos', 409)
      }
      if (sameKey.status === ReceiptGenerationStatus.COMPLETED) {
        return { kind: 'completed' as const, reservationId: sameKey.id }
      }
      if (sameKey.status === ReceiptGenerationStatus.UPLOADED) {
        return { kind: 'uploaded' as const, reservation: sameKey, activeReceipt: null }
      }
      if (sameKey.status === ReceiptGenerationStatus.FAILED) {
        throw new ApiError(
          'RECEIPT_GENERATION_FAILED',
          'Este intento falló. Inicia un nuevo intento para reservar otro número.',
          409,
          undefined,
          { reservationId: sameKey.id, numeroRecibo: sameKey.numeroRecibo }
        )
      }
      throw new ApiError(
        'RECEIPT_GENERATION_IN_PROGRESS',
        'La generación del recibo sigue en curso',
        409,
        undefined,
        { reservationId: sameKey.id }
      )
    }

    const activeAttempt = await tx.receiptGenerationReservation.findFirst({
      where: {
        notificacionId: params.input.notificacionId,
        status: { in: [ReceiptGenerationStatus.RESERVED, ReceiptGenerationStatus.UPLOADED] },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (activeAttempt) {
      throw new ApiError(
        'RECEIPT_GENERATION_IN_PROGRESS',
        'Ya existe una generación activa para esta notificación',
        409,
        undefined,
        { reservationId: activeAttempt.id }
      )
    }

    const activeReceipt = await tx.recibo.findFirst({
      where: { notificacionId: params.input.notificacionId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })
    if (params.input.operation === 'GENERATE' && activeReceipt) {
      throw new ApiError(
        'RECEIPT_EXISTS',
        'Ya existe un recibo activo para esta notificación',
        409,
        undefined,
        { receiptId: activeReceipt.id, numeroRecibo: activeReceipt.numeroRecibo }
      )
    }
    if (params.input.operation !== 'GENERATE' && !activeReceipt) {
      throw new ApiError('NOT_FOUND', 'No existe un recibo activo para regenerar o corregir', 404)
    }

    if (params.input.operation === 'REGENERATE' && activeReceipt) {
      let currentFingerprint = activeReceipt.generationFingerprint
      if (!currentFingerprint) {
        const currentSelection = parseEstampoTipo(params.currentMeta) ?? params.input.estampoTipo
        const execution = isPlainObject(params.currentMeta.ejecucion) ? params.currentMeta.ejecucion : {}
        const fecha =
          typeof execution.fecha === 'string'
            ? execution.fecha
            : activeReceipt.fechaEjecucion
              ? activeReceipt.fechaEjecucion.toISOString().slice(0, 10)
              : params.input.ejecucion.fecha
        const hora =
          typeof execution.hora === 'string'
            ? execution.hora
            : typeof params.currentMeta.horaEjecucion === 'string'
              ? params.currentMeta.horaEjecucion
              : ''
        currentFingerprint = receiptGenerationFingerprint({
          notificacionId: params.input.notificacionId,
          bancoId: activeReceipt.bancoId ?? params.input.bancoId,
          ejecucion: { fecha, hora },
          estampoTipo: currentSelection,
          monto: Number(activeReceipt.monto),
          medio: activeReceipt.medio,
          referencia: activeReceipt.ref ?? undefined,
          otros: 0,
        })
      }
      if (currentFingerprint !== params.fingerprint) {
        throw new ApiError(
          'RECEIPT_CORRECTION_REQUIRED',
          'Los datos legales cambiaron; debes emitir una corrección con un nuevo número',
          409,
          undefined,
          { receiptId: activeReceipt.id, numeroRecibo: activeReceipt.numeroRecibo }
        )
      }
    }

    let numeroRecibo: string
    let numeroReciboYear: number
    let assignedNumber: number | null = null
    let documentoId: string
    let targetVersionNumber: number

    if (params.input.operation === 'REGENERATE' && activeReceipt) {
      if (!activeReceipt.numeroRecibo || !activeReceipt.numeroReciboYear || !activeReceipt.documentoId) {
        throw new ApiError('RECEIPT_CORRECTION_REQUIRED', 'El recibo histórico debe corregirse con un nuevo número', 409)
      }
      numeroRecibo = activeReceipt.numeroRecibo
      numeroReciboYear = activeReceipt.numeroReciboYear
      documentoId = activeReceipt.documentoId
      const aggregate = await tx.documentoVersion.aggregate({
        where: { documentoId },
        _max: { versionNumber: true },
      })
      targetVersionNumber = (aggregate._max.versionNumber ?? 0) + 1
    } else {
      numeroReciboYear = new Date().getFullYear()
      const rows = await tx.$queryRaw<Array<{ assignedNumber: number }>>`
        INSERT INTO "DocumentNumberSequence" (
          "id", "officeId", "year", "documentType", "nextNumber"
        )
        VALUES (
          ${`recibo-${params.context.officeId}-${numeroReciboYear}`},
          ${params.context.officeId},
          ${numeroReciboYear},
          'RECIBO'::"DocumentType",
          2
        )
        ON CONFLICT ("officeId", "year", "documentType")
        DO UPDATE SET
          "nextNumber" = "DocumentNumberSequence"."nextNumber" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "nextNumber" - 1 AS "assignedNumber"
      `
      assignedNumber = Number(rows[0]?.assignedNumber)
      if (!Number.isInteger(assignedNumber) || assignedNumber < 1) {
        throw new ApiError('DATABASE_ERROR', 'No se pudo reservar el número de recibo', 500)
      }
      numeroRecibo = formatNumeroRecibo(numeroReciboYear, assignedNumber)
      documentoId = randomUUID()
      targetVersionNumber = 1
    }

    const reservation = await tx.receiptGenerationReservation.create({
      data: {
        officeId: params.context.officeId,
        rolId: params.rolId,
        diligenciaId: params.diligenciaId,
        notificacionId: params.input.notificacionId,
        operation: params.input.operation,
        idempotencyKey: params.idempotencyKey,
        requestHash: params.requestHash,
        numeroRecibo,
        numeroReciboYear,
        assignedNumber,
        documentoId,
        targetVersionNumber,
      },
    })
    return { kind: 'reserved' as const, reservation, activeReceipt }
  })
}

async function markFailed(
  reservation: { id: string; notificacionId: string; numeroRecibo: string; operation: ReceiptGenerationOperation },
  context: RequestContext,
  errorCode: string
) {
  await prisma.receiptGenerationReservation.updateMany({
    where: { id: reservation.id, status: { in: ['RESERVED', 'UPLOADED'] } },
    data: { status: 'FAILED', failedAt: new Date(), failureCode: errorCode },
  })
  await recordBestEffortEvent(context, {
    eventType: 'receipt.generation_failed',
    module: 'recibos',
    result: 'failure',
    recordType: 'ReceiptGenerationReservation',
    recordId: reservation.id,
    description: 'Generación de recibo fallida.',
    metadata: {
      reservationId: reservation.id,
      notificationId: reservation.notificacionId,
      numeroRecibo: reservation.numeroRecibo,
      operation: reservation.operation,
      errorCode,
    },
  })
}

export async function generateReceipt(params: {
  input: ReciboGenerateInput
  idempotencyKey: string
  context: RequestContext
  diligenciaId: string
}) {
  const generationContext = await loadGenerationContext(
    params.input,
    params.context,
    params.diligenciaId
  )
  const diligenciaId = params.diligenciaId
  const rolId = generationContext.notification.diligencia.rolId
  const requestHash = receiptRequestHash(params.input)
  const fingerprint = receiptGenerationFingerprint(params.input)

  const reservationResult = await reserveGeneration({
    input: params.input,
    context: params.context,
    rolId,
    diligenciaId,
    requestHash,
    fingerprint,
    idempotencyKey: params.idempotencyKey,
    currentMeta: generationContext.currentMeta,
  })
  if (reservationResult.kind === 'completed') {
    return loadCompletedResult(reservationResult.reservationId)
  }

  let reservation = reservationResult.reservation
  let storedPdf =
    reservationResult.kind === 'uploaded' &&
    reservation.storageBucket &&
    reservation.storageKey &&
    reservation.fileName &&
    reservation.sizeBytes &&
    reservation.checksumSha256 &&
    reservation.mimeType
      ? {
          storageBucket: reservation.storageBucket,
          storageKey: reservation.storageKey,
          fileName: reservation.fileName,
          sizeBytes: reservation.sizeBytes,
          checksumSha256: reservation.checksumSha256,
          mimeType: reservation.mimeType,
        }
      : null

  const metadataPatch = buildExecutionMetadata(params.input)
  const mergedMeta = { ...generationContext.currentMeta, ...metadataPatch }
  const fechaEjecucion = new Date(`${params.input.ejecucion.fecha}T12:00:00.000Z`)
  const fechaGeneracion = new Date()
  let variables!: ReturnType<typeof buildReciboVariables>
  let generationMetadata!: ReturnType<typeof buildDocumentGenerationMetadata>

  try {
    const diligenciaForPdf = {
      ...generationContext.diligencia,
      meta: mergedMeta,
    } as DiligenciaWithReciboRelations
    const [stampBytes, officePdfConfig] = await Promise.all([
      loadOfficeReciboStampForPdf(params.context.officeId, params.context.officeCacheRevision),
      loadOfficePdfConfig({ officeId: params.context.officeId, officeCacheRevision: params.context.officeCacheRevision, fallbackReceptorNombre: params.context.officeName }),
    ])
    variables = buildReciboVariables(
      diligenciaForPdf,
      params.context,
      officePdfConfig,
      reservation.numeroRecibo,
      params.input.monto,
      params.input.medio,
      fechaEjecucion,
      params.input.referencia,
      generationContext.estampoLabel,
      generationContext.notification.ejecutado,
      params.input.otros ?? 0,
      generationContext.selectedBank
    )
    generationMetadata = buildDocumentGenerationMetadata({
      userId: params.context.id,
      generatedAt: fechaGeneracion,
      sourceTemplate: { type: 'recibo', name: 'default-recibo-pdf', version: 1 },
      variables,
    })

    if (!storedPdf) {
      const pdfBase64 = await buildReciboPdf(variables, stampBytes)
      storedPdf = await uploadPdfToDocumentStorage({
        pdfBase64,
        officeId: params.context.officeId,
        rolId,
        documentoId: reservation.documentoId,
        versionNumber: reservation.targetVersionNumber,
        fileName: `Recibo ${reservation.numeroRecibo}`,
        createdAt: fechaGeneracion,
      })
      reservation = await prisma.receiptGenerationReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'UPLOADED',
          ...storedPdf,
          uploadedAt: new Date(),
        },
      })
    }
  } catch (error) {
    await markFailed(reservation, params.context, 'RECEIPT_ARTIFACT_FAILURE')
    throw new ApiError(
      'RECEIPT_GENERATION_FAILED',
      'No se pudo generar o almacenar el PDF. El número reservado no se reutilizará.',
      500,
      undefined,
      { reservationId: reservation.id, numeroRecibo: reservation.numeroRecibo }
    )
  }

  const finalized = await prisma.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`receipt-reservation-${reservation.id}`}))
    `
    const currentReservation = await tx.receiptGenerationReservation.findUnique({ where: { id: reservation.id } })
    if (!currentReservation) throw new ApiError('NOT_FOUND', 'Reserva de recibo no encontrada', 404)
    if (currentReservation.status === 'COMPLETED') {
      return { replay: true as const, outboxId: null, reservationId: currentReservation.id }
    }
    if (currentReservation.status !== 'UPLOADED') {
      throw new ApiError('RECEIPT_GENERATION_IN_PROGRESS', 'El PDF todavía no está listo para finalizar', 409)
    }

    const existingReceipt = await tx.recibo.findFirst({
      where: { notificacionId: params.input.notificacionId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })
    const currentNotification = await tx.notificacion.findUnique({
      where: { id: params.input.notificacionId },
      select: { meta: true },
    })
    if (!currentNotification) throw new ApiError('NOT_FOUND', 'Notificación no encontrada', 404)
    const baseMeta = isPlainObject(currentNotification.meta) ? currentNotification.meta : {}
    const nextMeta = { ...baseMeta, ...metadataPatch } as Prisma.InputJsonObject

    if (params.input.operation === 'CORRECT' && existingReceipt?.documentoId) {
      await tx.documento.update({
        where: { id: existingReceipt.documentoId },
        data: {
          voidedAt: fechaGeneracion,
          voidReason: params.input.correctionReason,
          voidedByUserId: params.context.id,
        },
      })
      await tx.recibo.update({
        where: { id: existingReceipt.id },
        data: {
          status: 'CORRECTED',
          voidedAt: fechaGeneracion,
          voidReason: params.input.correctionReason,
          voidedByUserId: params.context.id,
        },
      })
    }

    let documento: any
    if (params.input.operation === 'REGENERATE') {
      if (!existingReceipt?.documentoId) throw new ApiError('NOT_FOUND', 'Documento de recibo no encontrado', 404)
      documento = await tx.documento.update({
        where: { id: existingReceipt.documentoId },
        data: {
          nombre: `Recibo ${currentReservation.numeroRecibo}`,
          version: currentReservation.targetVersionNumber,
          ...generationMetadata,
        },
      })
    } else {
      documento = await tx.documento.create({
        data: {
          id: currentReservation.documentoId,
          rolId,
          diligenciaId,
          notificacionId: params.input.notificacionId,
          nombre: `Recibo ${currentReservation.numeroRecibo}`,
          tipo: 'Recibo',
          pdfId: null,
          version: currentReservation.targetVersionNumber,
          ...generationMetadata,
        },
      })
    }

    const documentVersion = await tx.documentoVersion.create({
      data: {
        documentoId: documento.id,
        versionNumber: currentReservation.targetVersionNumber,
        ...storedPdf!,
        createdAt: fechaGeneracion,
        createdByUserId: params.context.id,
      },
    })
    documento = await tx.documento.update({
      where: { id: documento.id },
      data: { currentVersionId: documentVersion.id, version: currentReservation.targetVersionNumber },
      include: { currentVersion: true },
    })

    const numeroBoleta = params.input.referencia?.trim() || variables.n_operacion.trim() || null
    let receipt: any
    if (params.input.operation === 'REGENERATE') {
      if (!existingReceipt) throw new ApiError('NOT_FOUND', 'Recibo activo no encontrado', 404)
      receipt = await tx.recibo.update({
        where: { id: existingReceipt.id },
        data: {
          documentVersionId: documentVersion.id,
          bancoId: params.input.bancoId,
          numeroBoleta,
          monto: params.input.monto,
          medio: params.input.medio,
          ref: params.input.referencia ?? null,
          fechaEjecucion,
          generationFingerprint: fingerprint,
        },
      })
    } else {
      receipt = await tx.recibo.create({
        data: {
          rolId,
          officeId: params.context.officeId,
          diligenciaId,
          notificacionId: params.input.notificacionId,
          documentoId: documento.id,
          documentVersionId: documentVersion.id,
          bancoId: params.input.bancoId,
          numeroRecibo: currentReservation.numeroRecibo,
          numeroReciboYear: currentReservation.numeroReciboYear,
          numeroBoleta,
          monto: params.input.monto,
          medio: params.input.medio,
          ref: params.input.referencia ?? null,
          fechaEjecucion,
          fechaRecibo: fechaGeneracion,
          generationFingerprint: fingerprint,
          ...(params.input.operation === 'CORRECT' && existingReceipt
            ? { supersedesReciboId: existingReceipt.id }
            : {}),
        },
      })
    }

    await tx.notificacion.update({
      where: { id: params.input.notificacionId },
      data: { bancoId: params.input.bancoId, meta: nextMeta, updatedAt: fechaGeneracion },
    })
    await tx.diligencia.update({ where: { id: diligenciaId }, data: { estadoCobro: 'NO_PAGADO' } })

    const eventType = eventTypeFor(currentReservation.operation)
    const queuedEvent = await enqueueExternalEvent(tx, params.context, {
      eventType,
      module: 'recibos',
      result: 'success',
      recordType: 'Recibo',
      recordId: receipt.id,
      rolId,
      rol: generationContext.diligencia.rol.rol,
      description:
        currentReservation.operation === 'CORRECT'
          ? 'Recibo corregido.'
          : currentReservation.operation === 'REGENERATE'
            ? 'Recibo regenerado.'
            : 'Recibo generado.',
      deduplicationKey: `receipt:${currentReservation.id}:${eventType}`,
      metadata: {
        reservationId: currentReservation.id,
        receiptId: receipt.id,
        documentId: documento.id,
        documentVersionId: documentVersion.id,
        numeroRecibo: receipt.numeroRecibo,
        version: currentReservation.targetVersionNumber,
        amount: Number(receipt.monto),
        paymentMethod: receipt.medio,
        operationalReference: receipt.ref,
        notificationId: params.input.notificacionId,
        priorReceiptId: params.input.operation === 'CORRECT' ? existingReceipt?.id ?? null : null,
      },
    })
    await tx.receiptGenerationReservation.update({
      where: { id: currentReservation.id },
      data: {
        status: 'COMPLETED',
        receiptId: receipt.id,
        documentVersionId: documentVersion.id,
        completedAt: fechaGeneracion,
        failureCode: null,
      },
    })

    const notification = await tx.notificacion.findUniqueOrThrow({
      where: { id: params.input.notificacionId },
      include: completedNotificationInclude,
    })
    return {
      replay: false as const,
      outboxId: queuedEvent.id,
      reservationId: currentReservation.id,
      response: {
        operation: operationResult(currentReservation.operation),
        documento: receiptDocumentView(documento, notification.diligencia),
        recibo: receiptView(receipt),
        notificacion: serializeNotification(notification, notification.diligencia),
      },
    }
  })

  if (finalized.replay) return loadCompletedResult(finalized.reservationId)
  await processActivityOutbox(1, finalized.outboxId).catch(() => undefined)
  return finalized.response
}
