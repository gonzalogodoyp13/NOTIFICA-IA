import 'server-only'

import { Prisma } from '@prisma/client'

import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'
import { classifyBulkItem, receiptBulkStateHash } from '@/lib/recibos/bulk-core'

export type ReceiptBulkAction = 'markPaid' | 'associateBoleta'

export type ReceiptBulkInput = {
  action: ReceiptBulkAction
  reciboIds: string[]
  fechaPago?: string
  numeroBoleta?: string
}

type ReceiptState = {
  receiptId: string
  diligenceId: string | null
  rol: string
  numeroRecibo: string
  amount: number
  validDocument: boolean
  paymentStatus: 'PAGADO' | 'NO_PAGADO' | null
  paymentDate: string | null
  boletaNumber: string | null
}

export type ReceiptBulkPreviewItem = ReceiptState & {
  disposition: 'eligible' | 'unchanged' | 'skipped'
  conflict: boolean
  warning: string | null
  proposedPaymentDate: string | null
  proposedBoletaNumber: string | null
}

export type ReceiptBulkPreview = {
  action: ReceiptBulkAction
  items: ReceiptBulkPreviewItem[]
  counts: { eligible: number; skipped: number; unchanged: number; conflicting: number }
  totalEligibleAmount: number
  stateHash: string
}

type OperationSnapshot = {
  targetType: 'diligence' | 'receipt'
  targetId: string
  receiptIds: string[]
  paymentStatus?: 'PAGADO' | 'NO_PAGADO'
  paymentDate?: string | null
  boletaNumber?: string | null
}

const validDocumentWhere: Prisma.DocumentoWhereInput = {
  voidedAt: null,
  OR: [{ pdfId: { not: null } }, { currentVersion: { is: { deletedAt: null } } }],
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).sort()
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null
  return new Date(value).toISOString()
}

function proposedPaymentDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Debes indicar una fecha de pago valida.')
  const date = new Date(`${value}T12:00:00.000Z`)
  const today = new Date(); today.setUTCHours(23, 59, 59, 999)
  if (date > today) throw new Error('La fecha de pago no puede estar en el futuro.')
  return date.toISOString()
}

type ReceiptDb = typeof prisma | Prisma.TransactionClient

export async function buildReceiptBulkPreview(officeId: number, input: ReceiptBulkInput, db: ReceiptDb = prisma): Promise<ReceiptBulkPreview> {
  const ids = normalizeIds(input.reciboIds)
  if (!ids.length) throw new Error('Debes seleccionar al menos un recibo.')
  if (ids.length > 25) throw new Error('Las acciones masivas admiten hasta 25 recibos de la pagina actual.')

  const paymentDate = input.action === 'markPaid' ? proposedPaymentDate(input.fechaPago) : null
  const boletaNumber = input.action === 'associateBoleta' ? input.numeroBoleta?.trim() : null
  if (input.action === 'associateBoleta' && !boletaNumber) throw new Error('Debes ingresar un numero de boleta.')

  const receipts = await db.recibo.findMany({
    where: { id: { in: ids }, rol: { officeId } },
    select: { id: true, diligenciaId: true, documentoId: true, numeroRecibo: true, numeroBoleta: true, ref: true, monto: true, rol: { select: { rol: true } } },
  })
  const receiptMap = new Map(receipts.map(item => [item.id, item]))
  const documentIds = receipts.map(item => item.documentoId).filter((id): id is string => !!id)
  const diligenceIds = receipts.map(item => item.diligenciaId).filter((id): id is string => !!id)
  const [validDocuments, diligences] = await Promise.all([
    documentIds.length ? db.documento.findMany({ where: { ...validDocumentWhere, id: { in: documentIds }, rol: { officeId } }, select: { id: true } }) : [],
    diligenceIds.length ? db.diligencia.findMany({ where: { id: { in: diligenceIds }, rol: { officeId } }, select: { id: true, estadoCobro: true, fechaPago: true } }) : [],
  ])
  const validDocumentIds = new Set(validDocuments.map(item => item.id))
  const diligenceMap = new Map(diligences.map(item => [item.id, item]))

  const states: ReceiptState[] = ids.map(id => {
    const receipt = receiptMap.get(id)
    const diligence = receipt?.diligenciaId ? diligenceMap.get(receipt.diligenciaId) : null
    return {
      receiptId: id,
      diligenceId: receipt?.diligenciaId ?? null,
      rol: receipt?.rol.rol ?? '-',
      numeroRecibo: receipt?.numeroRecibo?.trim() || '-',
      amount: Number(receipt?.monto ?? 0),
      validDocument: !!receipt?.documentoId && validDocumentIds.has(receipt.documentoId),
      paymentStatus: diligence?.estadoCobro ?? null,
      paymentDate: normalizeDate(diligence?.fechaPago),
      boletaNumber: receipt ? (receipt.numeroBoleta?.trim() || null) : null,
    }
  })

  const items = states.map<ReceiptBulkPreviewItem>(state => {
    const proposedBoletaNumber = boletaNumber || null
    return { ...state, ...classifyBulkItem({ exists: receiptMap.has(state.receiptId), validDocument: state.validDocument, action: input.action, diligenceId: state.diligenceId, paymentStatus: state.paymentStatus, paymentDate: state.paymentDate, proposedPaymentDate: paymentDate, boletaNumber: state.boletaNumber, proposedBoletaNumber }), proposedPaymentDate: paymentDate, proposedBoletaNumber }
  })
  const hashPayload = items.map(item => ({
    receiptId: item.receiptId, diligenceId: item.diligenceId, validDocument: item.validDocument,
    paymentStatus: item.paymentStatus, paymentDate: item.paymentDate, boletaNumber: item.boletaNumber,
    disposition: item.disposition, proposedPaymentDate: item.proposedPaymentDate, proposedBoletaNumber: item.proposedBoletaNumber,
  }))
  return {
    action: input.action,
    items,
    counts: {
      eligible: items.filter(item => item.disposition === 'eligible').length,
      skipped: items.filter(item => item.disposition === 'skipped').length,
      unchanged: items.filter(item => item.disposition === 'unchanged').length,
      conflicting: items.filter(item => item.conflict).length,
    },
    totalEligibleAmount: items.filter(item => item.disposition === 'eligible').reduce((sum, item) => sum + item.amount, 0),
    stateHash: receiptBulkStateHash(hashPayload),
  }
}

function makeSnapshots(preview: ReceiptBulkPreview) {
  const eligible = preview.items.filter(item => item.disposition === 'eligible')
  if (preview.action === 'associateBoleta') {
    const before: OperationSnapshot[] = eligible.map(item => ({ targetType: 'receipt', targetId: item.receiptId, receiptIds: [item.receiptId], boletaNumber: item.boletaNumber }))
    const after: OperationSnapshot[] = eligible.map(item => ({ targetType: 'receipt', targetId: item.receiptId, receiptIds: [item.receiptId], boletaNumber: item.proposedBoletaNumber }))
    return { before, after }
  }
  const grouped = new Map<string, ReceiptBulkPreviewItem[]>()
  for (const item of eligible) if (item.diligenceId) grouped.set(item.diligenceId, [...(grouped.get(item.diligenceId) ?? []), item])
  const before: OperationSnapshot[] = []; const after: OperationSnapshot[] = []
  for (const [diligenceId, items] of Array.from(grouped.entries())) {
    before.push({ targetType: 'diligence', targetId: diligenceId, receiptIds: items.map(item => item.receiptId), paymentStatus: items[0].paymentStatus ?? 'NO_PAGADO', paymentDate: items[0].paymentDate })
    after.push({ targetType: 'diligence', targetId: diligenceId, receiptIds: items.map(item => item.receiptId), paymentStatus: 'PAGADO', paymentDate: items[0].proposedPaymentDate })
  }
  return { before, after }
}

export async function executeReceiptBulkOperation(params: { officeId: number; userId: string; input: ReceiptBulkInput; stateHash: string }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt-bulk-${params.officeId}`}))`
    const preview = await buildReceiptBulkPreview(params.officeId, params.input, tx)
    if (preview.stateHash !== params.stateHash) throw new Error('Los recibos cambiaron desde la vista previa. Revisa y confirma nuevamente.')
    if (!preview.counts.eligible) throw new Error('No hay recibos elegibles para actualizar.')
    const { before, after } = makeSnapshots(preview)

    if (params.input.action === 'markPaid') {
      for (const state of after) await tx.diligencia.update({ where: { id: state.targetId }, data: { estadoCobro: 'PAGADO', fechaPago: state.paymentDate ? new Date(state.paymentDate) : null } })
    } else {
      for (const state of after) await tx.recibo.update({ where: { id: state.targetId }, data: { numeroBoleta: state.boletaNumber ?? null } })
    }
    const operation = await tx.receiptBulkOperation.create({
      data: {
        officeId: params.officeId, userId: params.userId, action: params.input.action,
        receiptIds: preview.items.filter(item => item.disposition === 'eligible').map(item => item.receiptId),
        beforeState: before as unknown as Prisma.InputJsonValue, afterState: after as unknown as Prisma.InputJsonValue,
        summary: { counts: preview.counts, totalEligibleAmount: preview.totalEligibleAmount } as Prisma.InputJsonValue,
      },
    })
    await tx.auditLog.create({
      data: { userId: params.userId, officeId: params.officeId, tabla: 'OperationalActivity', accion: params.input.action === 'markPaid' ? 'bulk_payment' : 'bulk_boleta', diff: { operationId: operation.id, count: preview.counts.eligible, receiptIds: preview.items.filter(item => item.disposition === 'eligible').map(item => item.receiptId).slice(0, 100) } },
    })
    await recordActivityEvent({
      userId: params.userId,
      officeId: params.officeId,
      eventType: params.input.action === 'markPaid' ? 'receipt.payment' : 'receipt.boleta',
      module: 'payments',
      result: 'success',
      recordType: 'ReceiptBulkOperation',
      recordId: operation.id,
      description: params.input.action === 'markPaid' ? 'Pago masivo de recibos registrado.' : 'Boleta asociada a recibos.',
      metadata: {
        operationId: operation.id,
        action: params.input.action,
        count: preview.counts.eligible,
        totalAmount: preview.totalEligibleAmount,
        receiptIds: preview.items.filter(item => item.disposition === 'eligible').map(item => item.receiptId).slice(0, 100),
        numeroBoleta: params.input.action === 'associateBoleta' ? params.input.numeroBoleta : undefined,
        fechaPago: params.input.action === 'markPaid' ? params.input.fechaPago : undefined,
      },
    }, tx)
    return { operationId: operation.id, preview }
  })
}

function snapshots(value: Prisma.JsonValue): OperationSnapshot[] {
  return Array.isArray(value) ? value as unknown as OperationSnapshot[] : []
}

export async function operationUndoability(officeId: number, operationId: string, db: ReceiptDb = prisma) {
  const operation = await db.receiptBulkOperation.findFirst({ where: { id: operationId, officeId } })
  if (!operation) return { reversible: false, reason: 'Operacion no encontrada.' }
  if (operation.undoneAt) return { reversible: false, reason: 'La operacion ya fue deshecha.' }
  const after = snapshots(operation.afterState)
  for (const state of after) {
    if (state.targetType === 'receipt') {
      const receipt = await db.recibo.findFirst({ where: { id: state.targetId, rol: { officeId } }, select: { numeroBoleta: true } })
      if (!receipt || (receipt.numeroBoleta ?? null) !== (state.boletaNumber ?? null)) return { reversible: false, reason: 'Un recibo cambio despues de la operacion.' }
    } else {
      const diligence = await db.diligencia.findFirst({ where: { id: state.targetId, rol: { officeId } }, select: { estadoCobro: true, fechaPago: true } })
      if (!diligence || diligence.estadoCobro !== state.paymentStatus || normalizeDate(diligence.fechaPago) !== (state.paymentDate ?? null)) return { reversible: false, reason: 'Una diligencia cambio despues de la operacion.' }
    }
  }
  return { reversible: true, reason: null }
}

export async function undoReceiptBulkOperation(params: { officeId: number; userId: string; operationId: string }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipt-bulk-${params.officeId}`}))`
    const undoability = await operationUndoability(params.officeId, params.operationId, tx)
    if (!undoability.reversible) throw new Error(undoability.reason ?? 'La operacion no se puede deshacer.')
    const operation = await tx.receiptBulkOperation.findFirstOrThrow({ where: { id: params.operationId, officeId: params.officeId } })
    for (const state of snapshots(operation.beforeState)) {
      if (state.targetType === 'receipt') await tx.recibo.update({ where: { id: state.targetId }, data: { numeroBoleta: state.boletaNumber ?? null } })
      else await tx.diligencia.update({ where: { id: state.targetId }, data: { estadoCobro: state.paymentStatus ?? 'NO_PAGADO', fechaPago: state.paymentDate ? new Date(state.paymentDate) : null } })
    }
    await tx.receiptBulkOperation.update({ where: { id: operation.id }, data: { undoneAt: new Date(), undoneByUserId: params.userId } })
    await tx.auditLog.create({ data: { userId: params.userId, officeId: params.officeId, tabla: 'OperationalActivity', accion: 'bulk_undo', diff: { operationId: operation.id, action: operation.action, receiptIds: operation.receiptIds } } })
    await recordActivityEvent({
      userId: params.userId,
      officeId: params.officeId,
      eventType: 'receipt.undo',
      module: 'payments',
      result: 'success',
      recordType: 'ReceiptBulkOperation',
      recordId: operation.id,
      description: 'Operacion masiva de recibos deshecha.',
      metadata: {
        operationId: operation.id,
        action: operation.action,
        receiptIds: operation.receiptIds,
      },
    }, tx)
    return { operationId: operation.id }
  })
}

export async function recentReceiptBulkOperations(officeId: number) {
  const operations = await prisma.receiptBulkOperation.findMany({ where: { officeId }, orderBy: { createdAt: 'desc' }, take: 10 })
  return Promise.all(operations.map(async operation => ({
    id: operation.id, action: operation.action, createdAt: operation.createdAt.toISOString(), undoneAt: operation.undoneAt?.toISOString() ?? null,
    summary: operation.summary, ...(await operationUndoability(officeId, operation.id)),
  })))
}
