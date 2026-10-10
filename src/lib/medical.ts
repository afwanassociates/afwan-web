import { addMonthsNoOverflow, toDisplayDate } from '@/lib/dates'
import type { Role } from '@/types/auth'
import type { MedicalStatus, StepState } from '@/types/medical'

/** Mirrors afwan-api config/medical.php. */
export const MEDICAL_VALIDITY_MONTHS = 3
export const EXPIRING_SOON_DAYS = 14
export const REMARKS_MAX = 1000

/** Roles that may re-test an unfit passport and delete medical records (the API agrees). */
export const MEDICAL_ADMIN_ROLES: readonly Role[] = ['admin', 'super_admin']

export const isMedicalAdmin = (role: Role | undefined) =>
  role !== undefined && MEDICAL_ADMIN_ROLES.includes(role)

/** Valid-until date of a fit result recorded on `medicalDate` (YYYY-MM-DD). */
export function validUntilFor(medicalDate: string): string {
  return addMonthsNoOverflow(medicalDate, MEDICAL_VALIDITY_MONTHS)
}

/** Short badge text for a medical status. */
export function medicalStatusText(status: MedicalStatus, validUntil?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'fit':
      return validUntil ? `Fit until ${toDisplayDate(validUntil)}` : 'Fit'
    case 'expiring_soon':
      return 'Expiring soon'
    case 'expired':
      return 'Expired'
    case 'unfit':
      return 'Unfit'
  }
}

/** Words for a workflow step state (shown or read out, never colour alone). */
export const STEP_STATE_TEXT: Record<StepState, string> = {
  done: 'Done',
  passed: 'Passed',
  needs_attention: 'Needs attention',
  pending: 'Pending',
  expired: 'Expired',
  failed: 'Unfit',
  locked: 'Locked',
  ready: 'Ready',
  waiting: 'Waiting',
  in_process: 'In process',
  rejected: 'Rejected',
  completed: 'Completed',
}

export type StepTone = 'success' | 'warning' | 'danger' | 'muted' | 'info'

export function stepTone(state: StepState): StepTone {
  switch (state) {
    case 'done':
    case 'passed':
    case 'completed':
      return 'success'
    case 'pending':
    case 'needs_attention':
    case 'expired':
    case 'waiting':
      return 'warning'
    case 'failed':
    case 'rejected':
      return 'danger'
    case 'locked':
      return 'muted'
    case 'ready':
    case 'in_process':
      return 'info'
  }
}

export interface DateWarningInput {
  /** YYYY-MM-DD */
  medicalDate: string
  /** null for unfit */
  validUntil: string | null
  passportReceivedDate: string
  passportExpiryDate: string | null
  today: string
}

/** The API's non-blocking date warnings, worked out before saving. */
export function medicalDateWarnings(input: DateWarningInput): string[] {
  const warnings: string[] = []
  const { medicalDate, validUntil, passportReceivedDate, passportExpiryDate, today } = input
  if (medicalDate && medicalDate < passportReceivedDate)
    warnings.push('The medical date is before the passport received date.')
  if (passportExpiryDate && passportExpiryDate < today)
    warnings.push('The passport has already expired.')
  else if (passportExpiryDate && validUntil && passportExpiryDate < validUntil)
    warnings.push('The passport expires before the medical valid-until date.')
  return warnings
}
