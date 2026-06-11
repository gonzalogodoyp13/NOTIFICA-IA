export const DASHBOARD_TIMEZONE = 'America/Santiago'

type DateParts = {
  year: number
  month: number
  day: number
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function partsToRecord(parts: Intl.DateTimeFormatPart[]) {
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function parseDateKey(value: string): DateParts {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function getTimeZoneOffsetMs(date: Date) {
  const values = partsToRecord(dateTimeFormatter.formatToParts(date))
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  )

  return representedAsUtc - date.getTime()
}

export function startOfSantiagoDay(value: string) {
  const { year, month, day } = parseDateKey(value)
  const utcGuess = new Date(Date.UTC(year, month - 1, day))
  const firstPass = new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess))
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(firstPass))
}

export function addCalendarDays(value: string, amount: number) {
  const { year, month, day } = parseDateKey(value)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return date.toISOString().slice(0, 10)
}

export function santiagoDateKey(date = new Date()) {
  const values = partsToRecord(dateFormatter.formatToParts(date))
  return `${values.year}-${values.month}-${values.day}`
}

export function buildDashboardDateRange(fechaDesde?: string, fechaHasta?: string) {
  return {
    from: fechaDesde ? startOfSantiagoDay(fechaDesde) : null,
    toExclusive: fechaHasta ? startOfSantiagoDay(addCalendarDays(fechaHasta, 1)) : null,
  }
}

export function getOverdueBoundary(now = new Date()) {
  return startOfSantiagoDay(addCalendarDays(santiagoDateKey(now), -14))
}

export function getRecentDocumentsBoundary(now = new Date()) {
  return startOfSantiagoDay(addCalendarDays(santiagoDateKey(now), -6))
}

export function getActivityBoundary(now = new Date()) {
  const current = parseDateKey(santiagoDateKey(now))
  const targetMonthStart = new Date(Date.UTC(current.year, current.month - 3, 1))
  const targetYear = targetMonthStart.getUTCFullYear()
  const targetMonth = targetMonthStart.getUTCMonth() + 1
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const targetDay = Math.min(current.day, daysInTargetMonth)
  return startOfSantiagoDay(`${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`)
}

export function isWithinDateRange(date: Date, from: Date | null, toExclusive: Date | null) {
  if (from && date < from) return false
  if (toExclusive && date >= toExclusive) return false
  return true
}

export function calendarDayDifference(earlier: Date, later: Date) {
  const earlierKey = parseDateKey(santiagoDateKey(earlier))
  const laterKey = parseDateKey(santiagoDateKey(later))
  const earlierUtc = Date.UTC(earlierKey.year, earlierKey.month - 1, earlierKey.day)
  const laterUtc = Date.UTC(laterKey.year, laterKey.month - 1, laterKey.day)
  return Math.max(0, Math.floor((laterUtc - earlierUtc) / 86_400_000))
}
