import { addMonthsNoOverflow, toApiDate } from '@/lib/dates'
import type { WorkflowSummary } from '@/types/medical'
import type {
  StepConfig,
  StepFieldConfig,
  StepRecordSummary,
  StepResultPayload,
} from '@/types/workflow'

/** Max remarks length (all steps). */
export const STEP_REMARKS_MAX = 1000

/** Steps recorded on their own step pages (they have statuses and fields). */
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
    // Calling's permit: neither the receive nor the issued date in the future.
    receive_date: { notFutureFor: ['completed'] },
    issue_date: { notFutureFor: ['completed'] },
  }

/**
 * A step's Pending count from /workflow/summary (`step_tabs`): the number the step bar and the
 * sidebar badge show, the same as the step page's Pending tab. Undefined until known.
 */
export function stepPendingCount(
  summary: WorkflowSummary | null | undefined,
  stepKey: string,
): number | undefined {
  return summary?.step_tabs?.[stepKey]?.pending
}

/** Statuses for which a date field may not be in the future (the config's, else the rules'). */
export const notFutureFor = (field: StepFieldConfig): string[] =>
  field.not_future_for ?? FIELD_RULES[field.name]?.notFutureFor ?? []

/** A field's label by name, lower case, for messages ("the issued date"). */
const labelOf = (fields: StepFieldConfig[], name: string) =>
  (fields.find((f) => f.name === name)?.label ?? humanize(name)).toLowerCase()

export type StepFormValues = Record<string, string>

/** Today (Dhaka) is passed in so the rules are testable. */
export function validateStepForm(
  step: StepConfig,
  status: string | null,
  values: StepFormValues,
  remarks: string,
  today: string,
  /** All of the step's fields, for labels in messages (when `step` holds only some). */
  allFields: StepFieldConfig[] = step.fields,
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
      if (field.name === 'step_date' && date > today)
        errors[field.name] = 'The date cannot be in the future.'
      else if (status && notFutureFor(field).includes(status) && date > today)
        errors[field.name] = `The ${label} cannot be in the future.`
      else if (field.after) {
        // The config's "after" (e.g. the expiry after the issued date).
        const other = field.after.replace(/^details\./, '')
        const otherDate = toApiDate(values[other] ?? '')
        if (otherDate && date <= otherDate)
          errors[field.name] = `The ${label} must be after the ${labelOf(allFields, other)}.`
      } else if (field.name === 'valid_until') {
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

/** Field the form shows per config field, exported for the views. */
export type { StepFieldConfig }

/* ---------- Step pages: start and result phases ---------- */

/** The step with only the fields entered in `phase` (a field without a phase is "start"). */
export function stepWithPhase(step: StepConfig, phase: 'start' | 'result'): StepConfig {
  return { ...step, fields: step.fields.filter((f) => (f.phase ?? 'start') === phase) }
}

/** Status values that end a step (e.g. Approved / Rejected), in config order. */
export function finalStatuses(
  step: StepConfig,
): { value: 'completed' | 'rejected'; label: string }[] {
  return step.statuses.filter(
    (s): s is { value: 'completed' | 'rejected'; label: string } =>
      s.value === 'completed' || s.value === 'rejected',
  )
}

/** A status's label from the config, e.g. in_process → "Applied". */
export function statusLabel(step: StepConfig, status: string): string {
  return step.statuses.find((s) => s.value === status)?.label ?? humanize(status)
}

/**
 * The result's payload: result, result date and the "result" fields (columns, or inside
 * `details`). Empty values are left out so they do not clear what the step already has.
 */
export function stepResultPayload(
  step: StepConfig,
  result: 'completed' | 'rejected',
  resultDate: string,
  values: StepFormValues,
): StepResultPayload {
  const payload: StepResultPayload = { result, result_date: toApiDate(resultDate) }
  const details: Record<string, string> = {}
  for (const field of stepWithPhase(step, 'result').fields) {
    const raw = (values[field.name] ?? '').trim()
    if (!raw) continue
    const value = field.type === 'date' ? toApiDate(raw) : raw
    if (field.in_details) details[field.name] = value
    else payload[field.name] = value
  }
  if (Object.keys(details).length > 0) payload.details = details
  return payload
}
