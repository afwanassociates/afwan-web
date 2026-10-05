import { toApiDate, todayApiDate } from '@/lib/dates'

/**
 * Client-side mirror of the API's passport rules (StorePassportEntryRequest).
 * The API normalizes and validates again; these only give instant feedback.
 */

export const PASSPORT_NAME_MAX = 150
export const PASSPORT_NUMBER_PATTERN = /^[A-Z0-9]{6,20}$/

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
  reference_id: number | null
  company_id: number | null
  /** YYYY-MM-DD from the native date input */
  passport_received_date: string
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

  if (values.reference_id === null) errors.reference_id = 'Select a reference.'
  if (values.company_id === null) errors.company_id = 'Select a company.'

  const date = toApiDate(values.passport_received_date)
  if (!values.passport_received_date) errors.passport_received_date = 'Enter the received date.'
  else if (!date) errors.passport_received_date = 'Enter a valid date.'
  // YYYY-MM-DD strings compare correctly as text.
  else if (date > today)
    errors.passport_received_date = 'The passport received date cannot be in the future.'

  return errors
}
