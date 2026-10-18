import { addMonthsNoOverflow, toApiDate, todayApiDate } from '@/lib/dates'

/**
 * Client-side mirror of the API's passport rules (StorePassportEntryRequest).
 * The API normalizes and validates again; these only give instant feedback.
 */

export const PASSPORT_NAME_MAX = 150
export const PASSPORT_NUMBER_PATTERN = /^[A-Z0-9]{6,20}$/
/** The passport must be valid for at least this many months after it is received. */
export const PASSPORT_MIN_VALIDITY_MONTHS = 18

/** While typing: uppercase only, so spaces can still be typed between words. */
export function normalizePassportNameInput(value: string): string {
  return value.toUpperCase()
}

/** Before saving: trim, collapse repeated spaces and uppercase (" md  rahim " → "MD RAHIM"). */
export function normalizePassportName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Remove all whitespace and uppercase (" ab 12 345 " → "AB12345"). Safe to apply while typing. */
export function normalizePassportNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

export interface PassportFormValues {
  passport_name: string
  passport_number: string
  /** Required: the passport's country. */
  country_code: string | null
  /** YYYY-MM-DD from the native date input */
  date_of_birth: string
  /** Required: the person or agency the passport came through. */
  reference_id: number | null
  company_id: number | null
  /** YYYY-MM-DD from the native date input */
  passport_received_date: string
  /** YYYY-MM-DD from the native date input */
  passport_expiry_date: string
}

export type PassportFormErrors = Partial<Record<keyof PassportFormValues, string>>

/** Returns one message per invalid field; an empty object means the form is valid. */
export function validatePassportForm(
  values: PassportFormValues,
  today: string = todayApiDate(),
): PassportFormErrors {
  const errors: PassportFormErrors = {}

  const name = normalizePassportName(values.passport_name)
  if (!name) errors.passport_name = 'Enter the passport name.'
  else if (name.length > PASSPORT_NAME_MAX)
    errors.passport_name = `The passport name must be at most ${PASSPORT_NAME_MAX} characters.`

  const number = normalizePassportNumber(values.passport_number)
  if (!number) errors.passport_number = 'Enter the passport number.'
  else if (!PASSPORT_NUMBER_PATTERN.test(number))
    errors.passport_number = 'The passport number must be 6 to 20 letters and digits.'

  if (values.reference_id === null) errors.reference_id = 'Reference is required.'
  if (!values.country_code) errors.country_code = 'Select the passport country.'
  if (values.company_id === null) errors.company_id = 'Select a company.'

  // YYYY-MM-DD strings compare correctly as text.
  const birth = toApiDate(values.date_of_birth)
  const minAge18 = (() => {
    const [y, m, d] = today.split('-').map(Number) as [number, number, number]
    const date = new Date(y - 18, m - 1, d)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })()
  if (!values.date_of_birth) errors.date_of_birth = 'Enter the date of birth.'
  else if (!birth) errors.date_of_birth = 'Enter a valid date.'
  else if (birth >= today) errors.date_of_birth = 'The date of birth must be in the past.'
  else if (birth > minAge18) errors.date_of_birth = 'The person must be at least 18 years old.'

  const received = toApiDate(values.passport_received_date)
  if (!values.passport_received_date) errors.passport_received_date = 'Enter the received date.'
  else if (!received) errors.passport_received_date = 'Enter a valid date.'
  else if (received > today)
    errors.passport_received_date = 'The passport received date cannot be in the future.'

  const expiry = toApiDate(values.passport_expiry_date)
  if (!values.passport_expiry_date) errors.passport_expiry_date = 'Enter the passport expiry date.'
  else if (!expiry) errors.passport_expiry_date = 'Enter a valid date.'
  else if (received && expiry <= received)
    errors.passport_expiry_date =
      'The passport expiry date must be after the passport received date.'
  else if (received && expiry < addMonthsNoOverflow(received, PASSPORT_MIN_VALIDITY_MONTHS))
    errors.passport_expiry_date = `The passport must be valid for at least ${PASSPORT_MIN_VALIDITY_MONTHS} months after the received date.`

  return errors
}
