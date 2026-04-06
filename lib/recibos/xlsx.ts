import type { ReceiptListRow } from '@/lib/recibos/query'

type CellValue = string | number

interface ZipEntry {
  name: string
  data: Buffer
  crc32: number
  offset: number
}

const textEncoder = new TextEncoder()

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index: number) {
  let current = index
  let name = ''

  while (current >= 0) {
    name = String.fromCharCode((current % 26) + 65) + name
    current = Math.floor(current / 26) - 1
  }

  return name
}

function buildSheetRows(rows: CellValue[][]) {
  return rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`

          if (typeof value === 'number') {
            return `<c r="${ref}"><v>${value}</v></c>`
          }

          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
        })
        .join('')

      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff

  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index]
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function dateToIsoString(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function formatDateOnly(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date)
}

function makeEntry(name: string, content: string): ZipEntry {
  const data = Buffer.from(textEncoder.encode(content))
  return {
    name,
    data,
    crc32: crc32(data),
    offset: 0,
  }
}

function buildStoredZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    entry.offset = offset
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(entry.crc32, 14)
    localHeader.writeUInt32LE(entry.data.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuffer, entry.data)
    offset += localHeader.length + nameBuffer.length + entry.data.length

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(entry.crc32, 16)
    centralHeader.writeUInt32LE(entry.data.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(entry.offset, 42)

    centralParts.push(centralHeader, nameBuffer)
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(entries.length, 8)
  endOfCentralDirectory.writeUInt16LE(entries.length, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12)
  endOfCentralDirectory.writeUInt32LE(offset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory])
}

export function buildRecibosWorkbook(rows: ReceiptListRow[], totalValor: number) {
  const now = new Date()
  const created = dateToIsoString(now)
  const workbookRows: CellValue[][] = [
    [
      'ROL',
      'Tribunal',
      'Caratula',
      'Resultado',
      'Abogado',
      'Procurador',
      'Banco',
      'Valor',
      'Fecha creacion recibo',
    ],
    ...rows.map(row => [
      row.rol,
      row.tribunal,
      row.caratula,
      row.resultado,
      row.abogado,
      row.procurador,
      row.banco,
      row.valor,
      formatDateOnly(row.fechaCreacionRecibo),
    ]),
    ['Total filas', rows.length, '', '', '', '', '', totalValor, ''],
  ]

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${buildSheetRows(workbookRows)}</sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Recibos" sheetId="1" r:id="rId1" />
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" />
</Relationships>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" />
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" />
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
</Types>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11" /><name val="Calibri" /></font></fonts>
  <fills count="1"><fill><patternFill patternType="none" /></fill></fills>
  <borders count="1"><border /></borders>
  <cellStyleXfs count="1"><xf /></cellStyleXfs>
  <cellXfs count="1"><xf xfId="0" /></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0" /></cellStyles>
</styleSheet>`

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Gestion de Recibos</dc:title>
  <dc:creator>NOTIFICA IA</dc:creator>
  <cp:lastModifiedBy>NOTIFICA IA</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`

  return buildStoredZip([
    makeEntry('[Content_Types].xml', contentTypesXml),
    makeEntry('_rels/.rels', rootRelsXml),
    makeEntry('docProps/core.xml', coreXml),
    makeEntry('xl/workbook.xml', workbookXml),
    makeEntry('xl/_rels/workbook.xml.rels', workbookRelsXml),
    makeEntry('xl/styles.xml', stylesXml),
    makeEntry('xl/worksheets/sheet1.xml', worksheetXml),
  ])
}
