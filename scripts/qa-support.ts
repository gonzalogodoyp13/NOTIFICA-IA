import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Prisma, PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

import { busquedasNegativasSeeds } from '../lib/estampos/busquedasNegativasSeeds'

export const QA_PREFIX = 'QA-P9'
export const AUTH_STATE_PATH = path.join(process.cwd(), '.auth', 'supabase-user.json')

export type QaSeedResult = {
  userId: string
  userEmail: string
  officeId: number
  tribunalId: string
  abogadoId: number
  procuradorId: number
  materiaId: number
  comunaId: number
  bancoId: number
  diligenciaTipoId: string
  customEstampoId: string
  wizardEstampoBaseId: number
  exportRol: string
}

type WizardStep = {
  variable?: unknown
  inputType?: unknown
  options?: unknown
}

type WizardOption = {
  value?: unknown
}

export function qaName(label: string) {
  return `${QA_PREFIX} ${label}`
}

export function qaRol(label: string) {
  return `${QA_PREFIX}-${label}`
}

export function isQaRol(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(`${QA_PREFIX}-`)
}

export function authStateExists() {
  return existsSync(AUTH_STATE_PATH)
}

export function qaRequestSuffix() {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`
}

export function buildWizardAnswers(wizardSchema: unknown): Record<string, string> {
  if (!Array.isArray(wizardSchema)) {
    return {}
  }

  const answers: Record<string, string> = {}

  for (const rawStep of wizardSchema) {
    const step = rawStep as WizardStep
    if (typeof step.variable !== 'string' || !step.variable) {
      continue
    }

    const options = Array.isArray(step.options) ? (step.options as WizardOption[]) : []
    const firstOption = options.find(option => typeof option.value === 'string' && option.value)

    if (firstOption && typeof firstOption.value === 'string') {
      answers[step.variable] = firstOption.value
      continue
    }

    answers[step.variable] = qaName(step.variable)
  }

  return answers
}

export async function validateRecibosWorkbook(buffer: Buffer, expectedRol: string) {
  const workbook = new ExcelJS.Workbook()
  const workbookBuffer = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
  await workbook.xlsx.load(workbookBuffer)
  const worksheet = workbook.getWorksheet('Recibos')

  if (!worksheet) {
    throw new Error('Expected Recibos worksheet')
  }

  const headers = worksheet.getRow(4).values
  const headerValues = Array.isArray(headers) ? headers.map(value => String(value ?? '')) : []
  if (!headerValues.includes('ROL')) {
    throw new Error('Expected ROL header in exported workbook')
  }

  let found = false
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return
    const values = row.values
    if (Array.isArray(values) && values.some(value => String(value ?? '').includes(expectedRol))) {
      found = true
    }
  })

  if (!found) {
    throw new Error(`Expected exported workbook to include ${expectedRol}`)
  }
}

export async function resolveQaUser(prisma: PrismaClient) {
  const email = process.env.QA_USER_EMAIL?.trim()

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing?.officeId) return existing

    const office = await prisma.office.create({ data: { nombre: qaName('Office') } })
    return prisma.user.upsert({
      where: { email },
      update: {
        officeId: office.id,
        officeName: office.nombre,
      },
      create: {
        email,
        officeId: office.id,
        officeName: office.nombre,
      },
    })
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, take: 2 })
  if (users.length === 1 && users[0].officeId) {
    return users[0]
  }

  if (users.length > 1) {
    throw new Error('Set QA_USER_EMAIL in .env.local when more than one DB user exists.')
  }

  const office = await prisma.office.create({ data: { nombre: qaName('Office') } })
  return prisma.user.create({
    data: {
      email: 'qa-p9@example.local',
      officeId: office.id,
      officeName: office.nombre,
    },
  })
}

export async function seedEstampoBasesForQa(prisma: PrismaClient) {
  for (const seed of busquedasNegativasSeeds) {
    await prisma.estampoBase.upsert({
      where: { slug: seed.slug },
      update: {
        nombreVisible: seed.nombreVisible,
        categoria: seed.categoria,
        descripcion: seed.descripcion,
        textoTemplate: seed.textoTemplate,
        variablesSchema: seed.variablesSchema as unknown as Prisma.InputJsonValue,
        wizardSchema: seed.wizardSchema as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
      create: {
        slug: seed.slug,
        nombreVisible: seed.nombreVisible,
        categoria: seed.categoria,
        descripcion: seed.descripcion,
        textoTemplate: seed.textoTemplate,
        variablesSchema: seed.variablesSchema as unknown as Prisma.InputJsonValue,
        wizardSchema: seed.wizardSchema as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
    })
  }
}

export async function findQaContext(prisma: PrismaClient): Promise<QaSeedResult> {
  const user = await resolveQaUser(prisma)
  if (!user.officeId) {
    throw new Error(`QA user ${user.email} does not have an officeId.`)
  }

  const [
    tribunal,
    abogado,
    procurador,
    materia,
    comuna,
    banco,
    diligenciaTipo,
    customEstampo,
    wizardEstampoBase,
  ] = await Promise.all([
    prisma.tribunal.findFirst({ where: { officeId: user.officeId, nombre: qaName('Tribunal Civil') } }),
    prisma.abogado.findFirst({ where: { officeId: user.officeId, nombre: qaName('Abogado') } }),
    prisma.procurador.findFirst({ where: { officeId: user.officeId, nombre: qaName('Procurador') } }),
    prisma.materia.findFirst({ where: { officeId: user.officeId, nombre: qaName('Cobranza') } }),
    prisma.comuna.findFirst({ where: { officeId: user.officeId, nombre: qaName('Santiago') } }),
    prisma.banco.findFirst({ where: { officeId: user.officeId, nombre: qaName('Banco') } }),
    prisma.diligenciaTipo.findFirst({ where: { officeId: user.officeId, nombre: qaName('Notificacion') } }),
    prisma.estampo.findFirst({ where: { officeId: user.officeId, nombre: qaName('Custom Estampo') } }),
    prisma.estampoBase.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
  ])

  if (!tribunal || !abogado || !procurador || !materia || !comuna || !banco || !diligenciaTipo || !customEstampo || !wizardEstampoBase) {
    throw new Error('QA seed data is missing. Run npm run db:seed:qa first.')
  }

  return {
    userId: user.id,
    userEmail: user.email,
    officeId: user.officeId,
    tribunalId: tribunal.id,
    abogadoId: abogado.id,
    procuradorId: procurador.id,
    materiaId: materia.id,
    comunaId: comuna.id,
    bancoId: banco.id,
    diligenciaTipoId: diligenciaTipo.id,
    customEstampoId: customEstampo.id,
    wizardEstampoBaseId: wizardEstampoBase.id,
    exportRol: qaRol('EXPORT'),
  }
}
