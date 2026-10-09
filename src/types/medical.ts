/** Step 2 (medical) and the workflow step bar (afwan-api /data-entry/...). */

export type MedicalResult = 'fit' | 'unfit'

/** expiring_soon is a fit result with 14 days or fewer left. */
export type MedicalStatus = 'pending' | 'fit' | 'expiring_soon' | 'expired' | 'unfit'

export type StepState =
  'done' | 'needs_attention' | 'pending' | 'passed' | 'failed' | 'expired' | 'locked' | 'ready'

export interface WorkflowStep {
  key: string
  label: string
  state: StepState
  enabled: boolean
}

/** A passport's progress through the steps. */
export interface PassportWorkflow {
  steps: WorkflowStep[]
  /** First enabled step that is not done; null when all are done. */
  current_step: string | null
}

/** A medical record as embedded in a passport (current_medical). Dates are YYYY-MM-DD. */
export interface MedicalSummary {
  id: number
  medical_date: string
  result: MedicalResult
  /** Null for unfit results. */
  valid_until: string | null
  days_left: number | null
  remarks: string | null
  recorded_by: { id: number; name: string } | null
  created_at: string
}

/** A full medical record (history, save responses). */
export interface MedicalRecord extends MedicalSummary {
  passport_entry_id: number
  result_label: string
  updated_by: number | null
  updated_at: string
  can: { update: boolean; delete: boolean }
}

export interface MedicalWarning {
  code: string
  message: string
}

/** Response of POST /passports/{id}/medicals and PATCH /medicals/{id}. */
export interface MedicalSaveResponse {
  data: MedicalRecord
  passport: {
    id: number
    medical_status: MedicalStatus
    medical_status_label: string
    current_medical_id: number | null
    workflow: PassportWorkflow
  }
  warnings: MedicalWarning[]
}

export interface MedicalPayload {
  /** YYYY-MM-DD */
  medical_date: string
  result: MedicalResult
  remarks: string | null
}

/** An item of GET /medical/queue (oldest received first). */
export interface MedicalQueueItem {
  id: number
  passport_name: string
  passport_number: string
  passport_received_date: string
}

export interface WorkflowSummary {
  steps: { key: string; label: string; enabled: boolean }[]
  /** total_all counts every passport (unfit included); total_active leaves unfit out. */
  step1: { total_all: number; total_active: number; incomplete: number }
  /** fit includes expiring_soon. */
  step2: { pending: number; fit: number; expiring_soon: number; expired: number; unfit: number }
  step3: { enabled: boolean; ready: number }
}
