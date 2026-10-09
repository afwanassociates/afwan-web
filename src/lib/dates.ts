/**
 * Date helpers. The UI shows dates as DD-MM-YYYY; the API uses YYYY-MM-DD.
 * Dates are calendar days in the user's local time zone (no time part).
 */

const API_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE = /^(\d{2})-(\d{2})-(\d{4})$/

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** 'YYYY-MM-DD' → 'DD-MM-YYYY'. Returns '' for empty or invalid input. */
export function toDisplayDate(value: string | null | undefined): string {
  const match = API_DATE.exec(value ?? '')
  if (!match) return ''
  const [, year, month, day] = match
  if (!isRealDate(Number(year), Number(month), Number(day))) return ''
  return `${day}-${month}-${year}`
}

/**
 * A Date, 'DD-MM-YYYY' or 'YYYY-MM-DD' → 'YYYY-MM-DD'. Returns '' for empty or invalid input.
 */
export function toApiDate(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  const text = (value ?? '').trim()
  const api = API_DATE.exec(text)
  if (api) return isRealDate(Number(api[1]), Number(api[2]), Number(api[3])) ? text : ''
  const display = DISPLAY_DATE.exec(text)
  if (display) {
    const [, day, month, year] = display
    return isRealDate(Number(year), Number(month), Number(day)) ? `${year}-${month}-${day}` : ''
  }
  return ''
}

/** Today in the local time zone as 'YYYY-MM-DD'. */
export function todayApiDate(): string {
  return toApiDate(new Date())
}

/** 'YYYY-MM-DD' plus `days` (may be negative) as 'YYYY-MM-DD'. Returns '' for invalid input. */
export function addDays(value: string, days: number): string {
  const ymd = toApiDate(value)
  if (!ymd) return ''
  const [year, month, day] = ymd.split('-').map(Number) as [number, number, number]
  return toApiDate(new Date(year, month - 1, day + days))
}

/* ---------- Business dates (medical): plain Y-m-d strings, no time zone shifts ---------- */

/** "Today" for medical dates and statuses is the calendar date in Dhaka (as on the API). */
export const BUSINESS_TIMEZONE = 'Asia/Dhaka'

/** Today's date in Dhaka as 'YYYY-MM-DD', whatever the browser's time zone. */
export function businessToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function parseYmd(value: string): [number, number, number] | null {
  const ymd = toApiDate(value)
  if (!ymd) return null
  return ymd.split('-').map(Number) as [number, number, number]
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * Adds calendar months without overflowing into the next month:
 * 30 Nov + 3 months = 28 Feb (29 in leap years), 31 Jan + 1 month = 28/29 Feb.
 * Matches the API's medical validity rule. Returns '' for invalid input.
 */
export function addMonthsNoOverflow(dateYmd: string, months: number): string {
  const parts = parseYmd(dateYmd)
  if (!parts) return ''
  const [year, month, day] = parts
  const index = month - 1 + months
  const newYear = year + Math.floor(index / 12)
  const newMonth = (((index % 12) + 12) % 12) + 1
  const newDay = Math.min(day, daysInMonth(newYear, newMonth))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${newYear}-${pad(newMonth)}-${pad(newDay)}`
}

/**
 * Whole days from `todayYmd` to `validUntilYmd`: 0 on the last valid day, negative once
 * past. Null for invalid input.
 */
export function daysLeft(validUntilYmd: string, todayYmd: string): number | null {
  const until = parseYmd(validUntilYmd)
  const today = parseYmd(todayYmd)
  if (!until || !today) return null
  // Date.UTC takes 0-based months.
  const utc = ([y, m, d]: [number, number, number]) => Date.UTC(y, m - 1, d)
  return Math.round((utc(until) - utc(today)) / 86_400_000)
}
