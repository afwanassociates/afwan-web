/** Steps 3–6 (calling, visa, BMET, flight) and the config-driven workflow. */

import type { Paginated } from '@/types/auth'

/** A step key from the API's config ('passport', 'medical', 'calling', …). */
export type StageKey = string

/** Status of a step record (steps 3+). The step's own labels come from the config. */
export type StepStatus = 'in_process' | 'completed' | 'rejected'

export interface StepFieldConfig {
  name: string
  label: string
  type: 'text' | 'date'
  /** Max length for text fields. */
  max: number | null
  /** Sent inside `details` (e.g. the flight's booking date). */
  in_details: boolean
  /** Statuses for which the field is required. */
  required_for: string[]
  /** Optional: statuses for which a date may not be in the future. */
  not_future_for?: string[]
  /** Optional: a JavaScript regular expression source the value must match. */
  pattern?: string
  /**
   * When it is entered on the step pages: "start" (with the step date, when the step is
   * started) or "result" (when Approved / Rejected … is recorded). Defaults to "start".
   */
  phase?: 'start' | 'result' | (string & {})
  /** Optional: the date must be after this field's (e.g. "details.issue_date"). */
  after?: string | null
}

export interface StepConfig {
  key: StageKey
  label: string
  short_label: string
  order: number
  enabled: boolean
  statuses: { value: string; label: string }[]
  fields: StepFieldConfig[]
  /** A valid-until date within this many days counts as expiring soon. */
  warning_days: number | null
  /**
   * The step page's tabs, in order (calling: Pending, Permitted; the others Pending, then one
   * per status). Older APIs leave it out.
   */
  tabs?: { key: string; label: string }[]
  /**
   * One-click actions of a milestone step (BMET: Training done, Finger done, then the last
   * one, BMET clearance done, which completes it). Empty or absent for other steps.
   */
  actions?: StepAction[]
}

/** A milestone action: POST/DELETE /passports/{id}/steps/{step}/{key}. */
export interface StepAction {
  key: string
  label: string
  /** The field it dates (e.g. training_certificate_date). */
  field: string
}

export interface WorkflowConfig {
  steps: StepConfig[]
}

export type ValidityStatus = 'valid' | 'expiring_soon' | 'expired'

/** A step record as embedded in a passport's workflow.steps[].record. */
export interface StepRecordSummary {
  id: number
  status: StepStatus
  status_label: string
  reference_no: string | null
  /** YYYY-MM-DD */
  step_date: string
  valid_until: string | null
  validity_status: ValidityStatus | null
  days_left: number | null
  /** Extra fields (e.g. the flight's booking_date and confirmed_date). */
  details: Record<string, string> | null
  remarks: string | null
  recorded_by: { id: number; name: string } | null
}

/** A full step record (history, save responses). */
export interface StepRecord extends StepRecordSummary {
  passport_entry_id: number
  step_key: StageKey
  step_label: string
  updated_by: number | null
  created_at: string
  updated_at: string
  can: { update: boolean; delete: boolean }
}

/** Body of POST /passports/{id}/steps/{key} and PATCH /step-records/{id}. */
export interface StepPayload {
  status: StepStatus
  remarks: string | null
  reference_no?: string | null
  step_date?: string | null
  valid_until?: string | null
  details?: Record<string, string | null> | null
}

export interface WorkflowWarning {
  code: string
  message: string
}

/** The step pages' tabs (GET /steps/{step}/passports?tab=). */
export type StepListTab = string

/** A step record as the step pages show it. Dates are YYYY-MM-DD. */
export interface StepListRecord {
  id: number
  step_key?: string
  status: StepStatus
  status_label: string
  step_date: string
  /** When the step was started (e.g. the visa submitted date). */
  submitted_date?: string
  reference_no: string | null
  /** Calling's permit (null on old records). */
  receive_date?: string | null
  issue_date?: string | null
  valid_until: string | null
  details: Record<string, string | null> | null
}

/** A row of a step page (lean: no permissions; actions follow the role). */
export interface StepListRow {
  id: number
  passport_name: string
  passport_number: string
  reference: { id: number; name: string } | null
  company: { id: number; name: string }
  /** The latest record of this step, if any. */
  record: StepListRecord | null
  /** The step before's record (e.g. the calling permit on a visa row), when there is one. */
  previous_record?: StepListRecord | null
  /** The next step's record (e.g. the visa on a calling row), when there is one. */
  next_record?: StepListRecord | null
  /** YYYY-MM-DD: when the step before was completed (the medical date for the first step). */
  previous_step_completed_on: string | null
  /** The Online mark (set on the Medical Fit tab). */
  entry_mode?: { value: 'online'; label: string } | null
  /** BMET and Flight rows: the visa's expiry (YYYY-MM-DD). */
  visa_valid_until?: string | null
  /** BMET rows: the visa's issue date. */
  visa_issue_date?: string | null
  /**
   * BMET rows: when each action was done (`<action>_date`, YYYY-MM-DD or null); Flight rows
   * have the clearance date too.
   */
  training_date?: string | null
  finger_date?: string | null
  clearance_date?: string | null
  /** Flight rows: whether BMET is cleared (clearance_date has its date). */
  bmet_cleared?: boolean
  /** Flight rows: the booking and confirmed dates (YYYY-MM-DD or null). */
  booking_date?: string | null
  confirmed_date?: string | null
  /** Flight rows: the flight may be confirmed (BMET cleared and a booking date). */
  can_confirm?: boolean
  /** Flight rows: what the confirm still needs. */
  missing?: ('bmet' | 'booking_date')[]
}

/** GET /steps/{step}/passports: a page of rows plus every tab's count (same searches). */
export type StepListResponse = Paginated<StepListRow> & {
  tab_counts?: Record<StepListTab, number>
}

/** Filters of a step page. */
export interface StepListParams {
  tab: StepListTab
  search?: string
  company?: string
  company_id?: number
  reference?: string
  /** Filter by reference (the dropdown). */
  reference_id?: number
  receive_date_from?: string
  receive_date_to?: string
  booking_date_from?: string
  booking_date_to?: string
  page?: number
  per_page?: number
}

/** Body of POST /passports/{id}/steps/{step}/result. */
export interface StepResultPayload {
  result: 'completed' | 'rejected'
  /** YYYY-MM-DD; today (Dhaka) when left out */
  result_date: string
  [field: string]: unknown
}

/** A passport saved by a bulk action, with what an admin needs to undo it. */
export interface BulkUpdated {
  id: number
  passport_number: string
  passport_name: string
  /** The new or changed record (start, result, booking, confirm). */
  record_id?: number
  /** BMET: the actions marked, in order. */
  marked?: string[]
  /** Flight booking: the date it had before (null: none). */
  previous_booking_date?: string | null
  warnings: string[]
}

/** A passport a bulk action skipped, and why (the single action's own message). */
export interface BulkSkipped {
  id: number
  passport_number: string
  passport_name: string
  reason: string
}

/** POST /steps/{step}/bulk: the passports saved and the ones skipped. */
export interface BulkResult {
  updated: BulkUpdated[]
  skipped: BulkSkipped[]
}
