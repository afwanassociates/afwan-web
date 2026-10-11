/** Steps 3–6 (calling, visa, BMET, flight) and the config-driven workflow. */

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
  /** Sent inside `details` (e.g. the flight's airline). */
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
  phase?: 'start' | 'result'
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
  /** Extra fields (e.g. flight airline, flight_no, departure_date, ticket_pnr). */
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
export type StepListTab = 'pending' | 'in_process' | 'completed' | 'rejected'

/** A row of a step page (lean: no permissions; actions follow the role). */
export interface StepListRow {
  id: number
  passport_name: string
  passport_number: string
  reference: { id: number; name: string } | null
  company: { id: number; name: string }
  /** The latest record of this step, if any. */
  record: {
    id: number
    status: StepStatus
    status_label: string
    /** YYYY-MM-DD */
    step_date: string
    reference_no: string | null
    valid_until: string | null
    details: Record<string, string | null> | null
  } | null
  /** YYYY-MM-DD: when the step before was completed (the medical date for the first step). */
  previous_step_completed_on: string | null
}

/** Filters of a step page. */
export interface StepListParams {
  tab: StepListTab
  search?: string
  company?: string
  reference?: string
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
