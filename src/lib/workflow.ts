import { addMonthsNoOverflow, toApiDate } from '@/lib/dates'
import type { StepConfig, StepFieldConfig, StepRecordSummary } from '@/types/workflow'

/** Max remarks length (all steps). */
export const STEP_REMARKS_MAX = 1000
/** Mirrors afwan-api config workflow.passport_expiry_warning_months. */
export const PASSPORT_EXPIRY_WARNING_MONTHS = 6

/** Steps that are recorded on the Process page (they have statuses and fields). */
export const isRecordStep = (step: StepConfig) =>
  step.enabled && step.fields.length > 0 && step.statuses.length > 0

/** "in_process" → "In process". */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

/** Colour family of a stage status (always shown with text). */
export function statusTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'completed':
    case 'departed':
    case 'passed':
    case 'done':
      return 'success'
    case 'in_process':
      return 'info'
    case 'pending':
    case 'waiting':
    case 'expired':
    case 'expiring_soon':
      return 'warning'
    case 'rejected':
    case 'cancelled':
    case 'unfit':
    case 'failed':
      return 'danger'
    default:
      return 'muted'
  }
}

export const TONE_BADGE: Record<StatusTone, string> = {
  success: 'bg-green-50 text-green-800 ring-green-300',
  info: 'bg-blue-50 text-blue-800 ring-blue-300',
  warning: 'bg-amber-50 text-amber-800 ring-amber-300',
  danger: 'bg-red-50 text-red-800 ring-red-300',
  muted: 'bg-slate-100 text-slate-700 ring-slate-300',
}

/**
 * Field rules the API applies but the config endpoint does not describe, keyed by field
 * name (so they hold for any step). A field's own `not_future_for` / `pattern` from the
 * config wins when present.
 */
const FIELD_RULES: Record<string, { notFutureFor?: string[]; pattern?: RegExp; message?: string }> =
  {
    departure_date: { notFutureFor: ['completed'] },
    flight_no: { pattern: /^[A-Za-z0-9]+$/, message: 'may only contain letters and digits' },
  }

export type StepFormValues = Record<string, string>

/** Today (Dhaka) is passed in so the rules are testable. */
export function validateStepForm(
  step: StepConfig,
  status: string | null,
  values: StepFormValues,
  remarks: string,
  today: string,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!status) errors.status = 'Choose a status.'

  for (const field of step.fields) {
    const raw = (values[field.name] ?? '').trim()
    const label = field.label.toLowerCase()
    const required = status !== null && field.required_for.includes(status)

    if (!raw) {
      if (required) errors[field.name] = `Enter the ${label}.`
      continue
    }

    if (field.type === 'date') {
      const date = toApiDate(raw)
      if (!date) {
        errors[field.name] = `Enter a valid ${label}.`
        continue
      }
      const notFutureFor = field.not_future_for ?? FIELD_RULES[field.name]?.notFutureFor ?? []
      if (field.name === 'step_date' && date > today)
        errors[field.name] = 'The date cannot be in the future.'
      else if (status && notFutureFor.includes(status) && date > today)
        errors[field.name] =
          field.name === 'departure_date'
            ? 'A flight can only be marked departed on or after its departure date.'
            : `The ${label} cannot be in the future.`
      else if (field.name === 'valid_until') {
        const stepDate = toApiDate(values.step_date ?? '')
        if (stepDate && date <= stepDate)
          errors[field.name] = 'The valid until date must be after the date.'
        else if (date > addMonthsNoOverflow(today, 60))
          errors[field.name] = 'The valid until date cannot be more than 5 years ahead.'
      }
    } else {
      if (field.max && raw.length > field.max)
        errors[field.name] = `The ${label} must be at most ${field.max} characters.`
      else {
        const rule = FIELD_RULES[field.name]
        const pattern = field.pattern ? new RegExp(field.pattern) : rule?.pattern
        if (pattern && !pattern.test(raw))
          errors[field.name] = `The ${label} ${rule?.message ?? 'has an invalid format'}.`
      }
    }
  }

  if (remarks.length > STEP_REMARKS_MAX)
    errors.remarks = `The remarks must be at most ${STEP_REMARKS_MAX} characters.`
  return errors
}

/** Builds the API payload: config fields as columns or inside `details`. */
export function stepPayload(
  step: StepConfig,
  status: string,
  values: StepFormValues,
  remarks: string,
) {
  const payload: Record<string, unknown> = { status, remarks: remarks.trim() || null }
  const details: Record<string, string | null> = {}
  for (const field of step.fields) {
    const raw = (values[field.name] ?? '').trim()
    const value = raw ? (field.type === 'date' ? toApiDate(raw) : raw) : null
    if (field.in_details) details[field.name] = value
    else payload[field.name] = value
  }
  if (step.fields.some((f) => f.in_details)) payload.details = details
  return payload
}

/** Current form values from a record (for "Update status" and edits). */
export function valuesFromRecord(step: StepConfig, record: StepRecordSummary): StepFormValues {
  const values: StepFormValues = {}
  for (const field of step.fields) {
    const value = field.in_details
      ? record.details?.[field.name]
      : (record as unknown as Record<string, unknown>)[field.name]
    values[field.name] = typeof value === 'string' ? value : ''
  }
  return values
}

export interface StepWarningInput {
  stepKey: string
  values: StepFormValues
  passportExpiry: string | null
  /** Valid-until of the visa record, if any. */
  visaValidUntil: string | null
}

/** The API's non-blocking warnings, worked out before saving when the data is there. */
export function stepSoftWarnings(input: StepWarningInput): string[] {
  const warnings: string[] = []
  const departure = toApiDate(input.values.departure_date ?? '')
  if (!departure) return warnings
  if (
    input.passportExpiry &&
    input.passportExpiry < addMonthsNoOverflow(departure, PASSPORT_EXPIRY_WARNING_MONTHS)
  )
    warnings.push(
      `The passport expires less than ${PASSPORT_EXPIRY_WARNING_MONTHS} months after the flight departure date.`,
    )
  if (input.visaValidUntil && input.visaValidUntil < departure)
    warnings.push('The visa is valid only until before the flight departure date.')
  return warnings
}

/** Field the form shows per config field, exported for the views. */
export type { StepFieldConfig }
