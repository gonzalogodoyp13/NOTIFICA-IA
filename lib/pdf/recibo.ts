import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Diligencia, RolCausa, Demanda, Abogado, Banco, Ejecutado, Comuna, Tribunal, DiligenciaTipo } from '@prisma/client'
import { formatCuantiaCLP } from '@/lib/utils/cuantia'
import { formatDateToSpanishWords } from '@/lib/utils/dateFormat'
import { wrapText } from '@/lib/pdf/textLayout'
import fs from 'fs'
import path from 'path'

// Tipo para diligencia con todas las relaciones necesarias para Recibo
export type DiligenciaWithReciboRelations = Diligencia & {
  rol: RolCausa & {
    tribunal: Tribunal | null
    demanda: (Demanda & {
      abogados: Abogado & {
        banco: Banco | null
      }
      ejecutados: (Ejecutado & {
        comunas: Comuna | null
      })[]
    }) | null
  }
  tipo: DiligenciaTipo | null
}

// Tipo para variables del Recibo
export type ReciboVariables = {
  receptor_nombre: string
  receptor_direccion_linea: string
  fecha_recibo: string
  numero_recibo: string
  fecha_pago: string
  nombre_abogado: string
  direccion_abogado: string
  causa: string
  caratula: string
  diligencia_encargada: string
  notificado: string
  direccion_diligencia: string
  rut_notificado: string
  resultado: string
  observaciones: string
  n_operacion: string
  cuantia: string
  valor_gestion: string
  otros: string
  total_a_pagar: string
}

/**
 * Construye el mapa de variables para el Recibo PDF
 */
export function buildReciboVariables(
  diligencia: DiligenciaWithReciboRelations,
  dbUser: { officeName: string } | null,
  monto: number,
  medio: string,
  referencia?: string,
  tipoEstampoNombre?: string // Nuevo parámetro opcional
): ReciboVariables {
  const meta = diligencia.meta as Record<string, unknown> | null
  
  // Extraer relaciones de forma segura
  const demanda = diligencia.rol.demanda ?? null
  const abogado = demanda?.abogados ?? null
  const banco = abogado?.banco ?? null
  const ejecutados = demanda?.ejecutados ?? []
  const tribunal = diligencia.rol.tribunal ?? null
  const tipoDiligencia = diligencia.tipo ?? null
  
  // Receptor
  const receptorNombre = dbUser?.officeName ?? 'Receptor Judicial'
  const receptorDireccion = 'Dirección: Irarrázabal 0276 - Puente Alto - Fono: (22) 723 2376'
  
  // Fechas
  const fechaRecibo = new Date()
  const fechaPago = new Date() // Igual a fecha_recibo por ahora
  
  // Número de recibo
  const numeroRecibo = `R-${diligencia.id.slice(0, 8).toUpperCase()}`
  
  // Datos del abogado
  const nombreAbogado = abogado?.nombre ?? ''
  const direccionAbogado = [abogado?.direccion, abogado?.comuna]
    .filter(Boolean)
    .join(', ')
  
  // Causa: ROL + " / " + tribunal.nombre
  const causa = `${diligencia.rol.rol} / ${tribunal?.nombre ?? ''}`
  
  // Seleccionar ejecutado: meta.ejecutadoId si existe, sino primer ejecutado, sino null
  const ejecutadoId = (meta?.ejecutadoId as string | undefined) ?? undefined
  const ejecutado = ejecutadoId
    ? ejecutados.find(e => e.id === ejecutadoId) ?? ejecutados[0] ?? null
    : ejecutados[0] ?? null
  
  // Carátula: Banco / Ejecutado
  const caratula = [banco?.nombre, ejecutado?.nombre]
    .filter(Boolean)
    .join(' / ')
  
  // Diligencia encargada
  const diligenciaEncargada = tipoDiligencia?.nombre ?? ''
  
  // Notificado (ejecutado)
  const notificado = ejecutado?.nombre ?? ''
  const direccionDiligencia = [
    ejecutado?.direccion,
    (ejecutado?.comunas ?? null)?.nombre
  ].filter(Boolean).join(', ')
  const rutNotificado = ejecutado?.rut ?? ''
  
  // Resultado, observaciones, n_operacion desde meta (verificación de tipo segura)
  // Priorizar tipoEstampoNombre si está disponible, sino usar meta.resultado como fallback
  const resultado = tipoEstampoNombre ?? ((typeof meta?.resultado === 'string' ? meta.resultado : '') ?? '')
  const observaciones = (typeof meta?.observaciones === 'string' ? meta.observaciones : '') ?? ''
  const nOperacion = (typeof meta?.n_operacion === 'string' ? meta.n_operacion : '') ?? ''
  
  // Cuantía
  const cuantiaRaw = demanda?.cuantia ?? 0
  const cuantia = formatCuantiaCLP(cuantiaRaw)
  
  // Montos
  const valorGestion = formatCuantiaCLP(monto || 0)
  const otros = '0' // Hard-coded por ahora
  const totalAPagar = formatCuantiaCLP(monto || 0)
  
  return {
    receptor_nombre: receptorNombre,
    receptor_direccion_linea: receptorDireccion,
    fecha_recibo: formatDateToSpanishWords(fechaRecibo),
    numero_recibo: numeroRecibo,
    fecha_pago: formatDateToSpanishWords(fechaPago),
    nombre_abogado: nombreAbogado,
    direccion_abogado: direccionAbogado,
    causa,
    caratula,
    diligencia_encargada: diligenciaEncargada,
    notificado,
    direccion_diligencia: direccionDiligencia,
    rut_notificado: rutNotificado,
    resultado,
    observaciones,
    n_operacion: nOperacion,
    cuantia,
    valor_gestion: valorGestion,
    otros,
    total_a_pagar: totalAPagar,
  }
}

/**
 * Construye el PDF del Recibo con el layout exacto del ejemplo
 */
export async function buildReciboPdf(
  variables: ReciboVariables,
  stampBytes?: Uint8Array
): Promise<string> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4 portrait (ancho x alto)
  
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  
  const margin = 50
  const pageWidth = page.getSize().width
  const pageHeight = page.getSize().height
  
  let y = pageHeight - margin
  
  // ===== HEADER: Dos columnas =====
  const headerLeftX = margin
  const headerRightX = pageWidth - margin - 150 // Ajustado para portrait más estrecho
  
  // Columna izquierda: Receptor
  page.drawText(variables.receptor_nombre, {
    x: headerLeftX,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0, 0, 0),
  })
  
  y -= 18
  
  // Dirección receptor (puede ser multi-línea)
  const receptorDirLines = wrapText(
    variables.receptor_direccion_linea,
    headerRightX - headerLeftX - 10, // Usa todo el espacio disponible hasta la columna derecha
    font,
    10
  )
  receptorDirLines.forEach(line => {
    if (line !== '__BLANK__') {
      page.drawText(line, {
        x: headerLeftX,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
      })
    }
    y -= 12
  })
  
  // Columna derecha: Fecha, Número, Fecha de pago
  y = pageHeight - margin
  const rightLabels = [
    { label: 'Fecha', value: variables.fecha_recibo },
    { label: 'N°', value: variables.numero_recibo },
    { label: 'Pagado el', value: variables.fecha_pago },
  ]
  
  rightLabels.forEach(({ label, value }) => {
    const labelText = `${label} :`
    const labelWidth = font.widthOfTextAtSize(labelText, 10)
    
    page.drawText(labelText, {
      x: headerRightX,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    
    page.drawText(value, {
      x: headerRightX + labelWidth + 5,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    
    y -= 14
  })
  
  // ===== SEPARADOR HORIZONTAL =====
  y -= 10
  const separatorY = y
  page.drawLine({
    start: { x: margin, y: separatorY },
    end: { x: pageWidth - margin, y: separatorY },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  
  y -= 20
  
  // ===== SECCIÓN: Datos principales =====
  const labelColonX = 170 // Columna fija para "Label :"
  const valueStartX = 180 // Inicio de valores
  
  const mainFields = [
    { label: 'Nombre Abogado', value: variables.nombre_abogado },
    { label: 'Dirección Abogado', value: variables.direccion_abogado },
    { label: 'CAUSA', value: variables.causa },
    { label: 'Carátula', value: variables.caratula },
    { label: 'Diligencia Encargada', value: variables.diligencia_encargada },
  ]
  
  mainFields.forEach(({ label, value }) => {
    const labelText = `${label} :`
    const labelWidth = font.widthOfTextAtSize(labelText, 10)
    
    // Alinear label a la derecha en su columna
    const labelX = labelColonX - labelWidth
    
    page.drawText(labelText, {
      x: labelX,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    })
    
    // Valor (puede ser multi-línea)
    const valueLines = wrapText(
      value,
      pageWidth - valueStartX - margin,
      font,
      10
    )
    
    valueLines.forEach((line, idx) => {
      if (line !== '__BLANK__') {
        page.drawText(line, {
          x: valueStartX,
          y: y - (idx * 12),
          size: 10,
          font: fontBold,
          color: rgb(0, 0, 0),
        })
      }
    })
    
    y -= Math.max(12, valueLines.length * 12) + 8
  })
  
  // ===== SEPARADOR =====
  y -= 10
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  y -= 20
  
  // ===== SECCIÓN: Notificado =====
  const notificadoFields = [
    { label: 'Notificado', value: variables.notificado },
    { label: 'Dirección diligencia', value: variables.direccion_diligencia },
    { label: 'RUT Notificado', value: variables.rut_notificado },
    { label: 'Resultado', value: variables.resultado },
    { label: 'Observaciones', value: variables.observaciones },
  ]
  
  notificadoFields.forEach(({ label, value }) => {
    const labelText = `${label} :`
    const labelWidth = font.widthOfTextAtSize(labelText, 10)
    const labelX = labelColonX - labelWidth
    
    page.drawText(labelText, {
      x: labelX,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    })
    
    const valueLines = wrapText(
      value,
      pageWidth - valueStartX - margin,
      font,
      10
    )
    
    valueLines.forEach((line, idx) => {
      if (line !== '__BLANK__') {
        page.drawText(line, {
          x: valueStartX,
          y: y - (idx * 12),
          size: 10,
          font: fontBold,
          color: rgb(0, 0, 0),
        })
      }
    })
    
    y -= Math.max(12, valueLines.length * 12) + 8
  })
  
  // ===== SEPARADOR =====
  y -= 10
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  y -= 20
  
  // ===== SECCIÓN: Totales =====
  const totalesFields = [
    { label: 'Valor Gestión', value: `$${variables.valor_gestion}` },
    { label: 'Otros', value: `$${variables.otros}` },
    { label: 'TOTAL A PAGAR', value: `$${variables.total_a_pagar}`, bold: true },
  ]
  
  totalesFields.forEach(({ label, value, bold = false }) => {
    const labelText = `${label} :`
    const labelWidth = font.widthOfTextAtSize(labelText, 11)
    const labelX = labelColonX - labelWidth
    
    page.drawText(labelText, {
      x: labelX,
      y,
      size: 11,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    })
    
    page.drawText(value, {
      x: valueStartX,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    
    y -= 16
  })
  
  // ===== STAMP "RECIBO PAGADO" =====
  if (stampBytes) {
    try {
      const stampImage = await doc.embedPng(stampBytes)
      const stampDims = stampImage.scale(0.3) // Escalar aprox. 0.3x
      
      // Posición: esquina inferior izquierda
      const stampX = margin
      const stampY = 100
      
      page.drawImage(stampImage, {
        x: stampX,
        y: stampY,
        width: stampDims.width,
        height: stampDims.height,
      })
    } catch (error) {
      console.warn('Error embedding stamp image:', error)
    }
  }
  
  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes).toString('base64')
}

/**
 * Carga la imagen del sello "RECIBO PAGADO" desde public/
 */
export async function loadReciboStamp(): Promise<Uint8Array | undefined> {
  const stampPath = path.resolve('./public/recibo-pagado.png')
  try {
    if (fs.existsSync(stampPath)) {
      return await fs.promises.readFile(stampPath)
    }
  } catch (error) {
    console.warn('Error loading recibo stamp:', error)
  }
  return undefined
}

