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
