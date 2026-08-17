const INVALID_FILE_PART = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

function sanitizePart(value: string) {
  return value
    .replace(INVALID_FILE_PART, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/[. ]+$/g, '')
}

function ensurePdfExtension(value: string) {
  return value.toLowerCase().endsWith('.pdf') ? value : `${value}.pdf`
}

function formatExecutionDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  return `${day}-${month}-${year}`
}

export function buildPdfDownloadFileName(input: {
  documentType: string
  rol: string | null | undefined
  estampoName: string | null | undefined
  executionDate: Date | null | undefined
  fallbackFileName: string
}) {
  const rol = sanitizePart(input.rol?.toLowerCase() ?? '')
  const estampoName = sanitizePart(input.estampoName ?? '')
  const validDate = input.executionDate && !Number.isNaN(input.executionDate.getTime())
    ? input.executionDate
    : null

  if (!rol || !estampoName || !validDate) {
    return ensurePdfExtension(sanitizePart(input.fallbackFileName) || 'documento')
  }

  const prefix = input.documentType.toLowerCase() === 'recibo' ? 'RECIBO. ' : ''
  return `${prefix}${rol}. ${estampoName}. ${formatExecutionDate(validDate)}.pdf`
}

export function contentDispositionForPdf(mode: string | null, fileName: string) {
  const disposition = mode === 'inline' || mode === 'view' ? 'inline' : 'attachment'
  const asciiFallback = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/["\\]/g, '-')
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
