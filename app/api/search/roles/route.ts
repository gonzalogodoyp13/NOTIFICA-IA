import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import type { RoleSearchPayload, RoleSearchResult } from '@/lib/dashboard/types'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine(value => value === 50).default(50),
})

type SearchRow = {
  id: string
  rol: string
  tribunal: string
  caratula: string
  abogado: string
  ejecutados: string[]
  bancos: string[]
  estado: string
  rolMatch: boolean
  ejecutadoMatch: boolean
  abogadoMatch: boolean
  bancoMatch: boolean
  total: bigint
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()
    if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

    const query = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const normalizedQuery = normalizeSearch(query.q)
    if (!normalizedQuery) return NextResponse.json({ ok: false, error: 'Busqueda invalida.' }, { status: 400 })
    const offset = (query.page - 1) * 50

    const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH searchable AS (
        SELECT
          r.id,
          r.rol,
          r.estado::text AS estado,
          t.nombre AS tribunal,
          COALESCE(d.caratula, 'Sin caratula') AS caratula,
          COALESCE(a.nombre, 'Sin abogado') AS abogado,
          COALESCE(array_remove(array_agg(DISTINCT e.nombre), NULL), ARRAY[]::text[]) AS ejecutados,
          COALESCE(array_remove(array_agg(DISTINCT b.nombre), NULL), ARRAY[]::text[]) AS bancos,
          regexp_replace(translate(lower(COALESCE(r.rol, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') AS rol_normalized,
          trim(regexp_replace(translate(lower(COALESCE(r.rol, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')) AS rol_words,
          regexp_replace(translate(lower(COALESCE(string_agg(DISTINCT e.nombre, ' '), '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') AS ejecutado_normalized,
          trim(regexp_replace(translate(lower(COALESCE(string_agg(DISTINCT e.nombre, ' '), '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')) AS ejecutado_words,
          regexp_replace(translate(lower(COALESCE(a.nombre, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') AS abogado_normalized,
          trim(regexp_replace(translate(lower(COALESCE(a.nombre, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')) AS abogado_words,
          regexp_replace(translate(lower(COALESCE(string_agg(DISTINCT b.nombre, ' '), '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') AS banco_normalized
          ,trim(regexp_replace(translate(lower(COALESCE(string_agg(DISTINCT b.nombre, ' '), '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')) AS banco_words
        FROM "RolCausa" r
        JOIN "Tribunal" t ON t.id = r."tribunalId"
        LEFT JOIN demandas d ON d.id = r."demandaId" AND d."officeId" = ${user.officeId}
        LEFT JOIN abogados a ON a.id = d."abogadoId" AND a."officeId" = ${user.officeId}
        LEFT JOIN ejecutados e ON e."demandaId" = d.id
        LEFT JOIN abogado_bancos ab ON ab."abogadoId" = a.id AND ab."officeId" = ${user.officeId}
        LEFT JOIN bancos b ON b.id = ab."bancoId" AND b."officeId" = ${user.officeId}
        WHERE r."officeId" = ${user.officeId}
          AND r.estado NOT IN ('terminado', 'archivado')
        GROUP BY r.id, r.rol, r.estado, t.nombre, d.caratula, a.nombre
      ), ranked AS (
        SELECT *,
          (rol_normalized LIKE ${`%${normalizedQuery}%`}) AS "rolMatch",
          (ejecutado_normalized LIKE ${`%${normalizedQuery}%`}) AS "ejecutadoMatch",
          (abogado_normalized LIKE ${`%${normalizedQuery}%`}) AS "abogadoMatch",
          (banco_normalized LIKE ${`%${normalizedQuery}%`}) AS "bancoMatch",
          LEAST(
            CASE WHEN rol_normalized = ${normalizedQuery} THEN 0 WHEN rol_normalized LIKE ${`${normalizedQuery}%`} THEN 1 WHEN rol_words ~ ${`(^| )${normalizedQuery}`} THEN 2 WHEN rol_normalized LIKE ${`%${normalizedQuery}%`} THEN 3 + position(${normalizedQuery} in rol_normalized)::numeric / 1000 ELSE 99 END,
            CASE WHEN ejecutado_normalized = ${normalizedQuery} THEN 0 WHEN ejecutado_normalized LIKE ${`${normalizedQuery}%`} THEN 1 WHEN ejecutado_words ~ ${`(^| )${normalizedQuery}`} THEN 2 WHEN ejecutado_normalized LIKE ${`%${normalizedQuery}%`} THEN 3 + position(${normalizedQuery} in ejecutado_normalized)::numeric / 1000 ELSE 99 END,
            CASE WHEN abogado_normalized = ${normalizedQuery} THEN 0 WHEN abogado_normalized LIKE ${`${normalizedQuery}%`} THEN 1 WHEN abogado_words ~ ${`(^| )${normalizedQuery}`} THEN 2 WHEN abogado_normalized LIKE ${`%${normalizedQuery}%`} THEN 3 + position(${normalizedQuery} in abogado_normalized)::numeric / 1000 ELSE 99 END,
            CASE WHEN banco_normalized = ${normalizedQuery} THEN 0 WHEN banco_normalized LIKE ${`${normalizedQuery}%`} THEN 1 WHEN banco_words ~ ${`(^| )${normalizedQuery}`} THEN 2 WHEN banco_normalized LIKE ${`%${normalizedQuery}%`} THEN 3 + position(${normalizedQuery} in banco_normalized)::numeric / 1000 ELSE 99 END
          ) AS rank
        FROM searchable
        WHERE rol_normalized LIKE ${`%${normalizedQuery}%`}
          OR ejecutado_normalized LIKE ${`%${normalizedQuery}%`}
          OR abogado_normalized LIKE ${`%${normalizedQuery}%`}
          OR banco_normalized LIKE ${`%${normalizedQuery}%`}
      )
      SELECT id, rol, tribunal, caratula, abogado, ejecutados, bancos, estado,
        "rolMatch", "ejecutadoMatch", "abogadoMatch", "bancoMatch", count(*) OVER() AS total
      FROM ranked
      ORDER BY rank ASC, rol ASC, id ASC
      LIMIT 50 OFFSET ${offset}
    `)

    const total = rows.length ? Number(rows[0].total) : 0
    const results: RoleSearchResult[] = rows.map(row => ({
      id: row.id,
      rol: row.rol,
      tribunal: row.tribunal,
      caratula: row.caratula,
      abogado: row.abogado,
      ejecutados: row.ejecutados,
      bancos: row.bancos,
      estado: row.estado,
      matchReasons: [
        row.rolMatch ? 'ROL' : null,
        row.ejecutadoMatch ? 'Ejecutado' : null,
        row.abogadoMatch ? 'Abogado' : null,
        row.bancoMatch ? 'Banco' : null,
      ].filter((reason): reason is string => !!reason),
    }))
    const payload: RoleSearchPayload = {
      query: query.q,
      page: query.page,
      pageSize: 50,
      total,
      totalPages: Math.max(1, Math.ceil(total / 50)),
      results,
    }
    return NextResponse.json({ ok: true, data: payload })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: 'Parametros invalidos.' }, { status: 400 })
    console.error('[GET /api/search/roles]', error)
    return NextResponse.json({ ok: false, error: 'No se pudo completar la busqueda.' }, { status: 500 })
  }
}
