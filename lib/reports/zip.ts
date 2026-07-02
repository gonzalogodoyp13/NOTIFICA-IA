const CRC_TABLE = new Uint32Array(256)

for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: dosDate }
}

export function buildSingleFileZip(input: { filename: string; content: Buffer; modifiedAt?: Date }) {
  const filename = input.filename.replace(/\\/g, '/')
  const name = Buffer.from(filename, 'utf8')
  const content = input.content
  const checksum = crc32(content)
  const modified = dosDateTime(input.modifiedAt ?? new Date())

  const local = Buffer.alloc(30 + name.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(modified.time, 10)
  local.writeUInt16LE(modified.date, 12)
  local.writeUInt32LE(checksum, 14)
  local.writeUInt32LE(content.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  name.copy(local, 30)

  const central = Buffer.alloc(46 + name.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(modified.time, 12)
  central.writeUInt16LE(modified.date, 14)
  central.writeUInt32LE(checksum, 16)
  central.writeUInt32LE(content.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)
  name.copy(central, 46)

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length + content.length, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([local, content, central, end])
}
