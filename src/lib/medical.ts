import { toDisplayDate } from '@/lib/dates'
import type { Role } from '@/types/auth'
import type { MedicalStatus, StepState } from '@/types/medical'

/** Mirrors afwan-api config/medical.php. */
export const EXPIRING_SOON_DAYS = 14

/** Roles that may re-test an unfit passport and delete medical records (the API agrees). */
export const MEDICAL_ADMIN_ROLES: readonly Role[] = ['admin', 'super_admin']

export const isMedicalAdmin = (role: Role | undefined) =>
  role !== undefined && MEDICAL_ADMIN_ROLES.includes(role)

/** Short badge text for a medical status. */
export function medicalStatusText(status: MedicalStatus, validUntil?: string | null): string {
  switch (status) {
    case 'not_started':
      return 'Not started'
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
  not_started: 'Not started',
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
    case 'not_started':
      return 'muted'
    case 'ready':
    case 'in_process':
      return 'info'
  }
}
