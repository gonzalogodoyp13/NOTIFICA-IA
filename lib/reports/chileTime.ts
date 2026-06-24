export const CHILE_TIMEZONE = 'America/Santiago'

const DateSchema = /^(\d{4})-(\d{2})-(\d{2})$/

function partsInChile(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  }
}

function localChileDateTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = partsInChile(new Date(guess))
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second
    )
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
    const delta = desiredAsUtc - renderedAsUtc
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess)
}

export function parseChileReportDate(value: string) {
  const match = DateSchema.exec(value)
  if (!match) throw new Error('La fecha debe usar formato YYYY-MM-DD.')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('La fecha ingresada no es valida.')
  }
  return { year, month, day, isoDate: value }
}

export function chileDayBounds(dateValue: string) {
  const parsed = parseChileReportDate(dateValue)
  const start = localChileDateTimeToUtc(parsed.year, parsed.month, parsed.day)
  const nextDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1))
  const endExclusive = localChileDateTimeToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate()
  )
  const end = new Date(endExclusive.getTime() - 1)
  return { ...parsed, start, end, endExclusive, timezone: CHILE_TIMEZONE }
}

export function formatChileDateTime(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

export function formatChileDate(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TIMEZONE,
    dateStyle: 'short',
  }).format(date)
}
