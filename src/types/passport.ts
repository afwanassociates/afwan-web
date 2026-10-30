/** Types matching the afwan-api data-entry endpoints (/api/data-entry/...). */

import type { CountrySummary } from '@/types/country'
import type {
  MedicalCenterSummary,
  MedicalSlip,
  MedicalStatus,
  MedicalSummary,
  PassportWorkflow,
} from '@/types/medical'
import type { WorkflowWarning } from '@/types/workflow'

export type ReferenceType = 'person' | 'agency'

/** How the passport goes to Calling / Work Permit: only "online" (label from the API). */
export type EntryMode = 'online'
export interface EntryModeValue {
  value: EntryMode
  label: string
}

export interface Reference {
  id: number
  type: ReferenceType
  type_label: string
  name: string
  phone: string | null
  notes: string | null
  is_active: boolean
  /** Only in the management list and its responses. */
  passports_count?: number
  created_at: string
  updated_at: string
}

/** The reference as embedded in a passport entry. */
export type ReferenceSummary = Pick<Reference, 'id' | 'type' | 'type_label' | 'name'>

export interface Company {
  id: number
  name: string
  /** Where the employer is. */
  country: CountrySummary
  /** Workers the company asked for. */
  quota: number | null
  is_active: boolean
  /** Only in the admin list and admin responses. */
  passports_count?: number
  created_at: string
  updated_at: string
}

/** The company as embedded in a passport entry. */
export type CompanySummary = Pick<Company, 'id' | 'name' | 'country'>

export interface PassportEntry {
  id: number
  /** Serial number given when the passport is added (1, 2, 3, …), shown as "No.". */
  entry_no: number
  passport_name: string
  passport_number: string
  /** Country of the passport (optional). */
  country: CountrySummary | null
  /** YYYY-MM-DD; null on entries made before the field existed. */
  date_of_birth: string | null
  /** YYYY-MM-DD */
  passport_received_date: string
  /** YYYY-MM-DD; null on entries made before the field existed. */
  passport_expiry_date: string | null
  /** Null when the passport came without a reference (the reference is optional). */
  reference: ReferenceSummary | null
  company: CompanySummary
  /** Missing from responses of older API versions. */
  medical_slip?: MedicalSlip
  /** YYYY-MM-DD; the medical slip date (lists send it flat; details in medical_slip). */
  medical_slip_date?: string | null
  /** YYYY-MM-DD: the current fit result's issue and expiry dates (null until fit). */
  issue_date?: string | null
  valid_until?: string | null
  /** The Online mark: a fit passport needs it before Calling / Work Permit. */
  entry_mode?: EntryModeValue | null
  /** Ready-to-show latest status ("Permitted - enter visa submitted date"), when sent. */
  latest_status?: LatestStatus
  /** Calling has started: the mark can no longer change. */
  has_calling_record?: boolean
  /** The date the passport goes (or went) for its medical; null until entered. */
  medical_date?: string | null
  /**
   * Passport scan copy (details responses only; never a storage path). The file itself is
   * fetched from GET /passports/{id}/scan. Missing on API versions without scans.
   */
  has_scan?: boolean
  scan_original_name?: string | null
  /** e.g. image/jpeg, image/png, application/pdf */
  scan_mime?: string | null
  /** Bytes */
  scan_size?: number | null
  /** ISO timestamp */
  scan_uploaded_at?: string | null
  /** Where the medical is done (same as medical_slip.medical_center). */
  medical_center?: MedicalCenterSummary | null
  medical_status: MedicalStatus
  medical_status_label: string
  current_medical: MedicalSummary | null
  workflow: PassportWorkflow
  /** Step the passport is at ('medical', 'calling', …, 'completed'). */
  current_stage?: string | null
  /** Status at that step ('pending', 'unfit', 'waiting', 'in_process', 'rejected'). */
  stage_status?: string | null
  /** Date problems worth a look (never blocking). */
  warnings?: WorkflowWarning[]
  created_by: number | null
  /** Who entered it, by name (null when the user is gone). */
  entered_by?: { id: number; name: string } | null
  updated_by: number | null
  created_at: string
  updated_at: string
  /** Set while the passport is returned to its owner (null when it is in the workflow). */
  returned?: PassportReturnInfo | null
  /** What the current user may do with this entry (decided by the API's policy). */
  can: {
    update: boolean
    record_medical: boolean
    /** Return the passport (the operations head, while it is not returned). */
    return?: boolean
    /** Undo the return (the operations head, while it is returned). */
    undo_return?: boolean
  }
}

/** A passport handed back to its owner: who collected it, when and at which step. */
export interface PassportReturnInfo {
  id: number
  /** YYYY-MM-DD */
  return_date: string
  receiver_name: string
  receiver_phone: string
  /** NID or passport number of the receiver (optional). */
  receiver_id_no: string | null
  remarks: string | null
  /** The step the passport was at ('medical', 'visa', …, 'completed'). */
  stage: string
  stage_label: string
  returned_by: { id: number; name: string } | null
  /** ISO timestamp of when the return was recorded. */
  returned_at: string
}

/** Body of POST /passports/{id}/return. */
export interface PassportReturnPayload {
  /** YYYY-MM-DD, today or earlier */
  return_date: string
  receiver_name: string
  receiver_phone: string
  receiver_id_no: string | null
  remarks: string | null
}

/** One row of GET /reports/returned-passports. */
export interface ReturnedPassport extends PassportReturnInfo {
  passport: { id: number; entry_no: number; passport_name: string; passport_number: string }
  reference: Pick<Reference, 'id' | 'name'> | null
  company: Pick<Company, 'id' | 'name'>
  /** Whether the current user may undo this return. */
  can_undo: boolean
}

/** Query of GET /reports/returned-passports. Dates are YYYY-MM-DD. */
export interface ReturnedPassportFilters {
  /** Part of the passport name or number. */
  q?: string
  company_id?: number
  reference_id?: number
  /** Return date range. */
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
}

/** Body of POST /passports and PATCH /passports/{id}. */
export interface PassportPayload {
  passport_name: string
  passport_number: string
  country_code: string | null
  /** YYYY-MM-DD */
  date_of_birth: string
  /** Required by the form (the API also accepts null). */
  reference_id: number | null
  company_id: number
  /** YYYY-MM-DD */
  passport_received_date: string
  /** YYYY-MM-DD, after the received date */
  passport_expiry_date: string
}

export type PassportSort =
  'passport_received_date' | 'created_at' | 'medical_date' | 'valid_until' | 'status_date'

/** Query of GET /passports. Dates are YYYY-MM-DD. */
export interface PassportFilters {
  q?: string
  /** Named list mode: 'medical' (one Medical tab, fixed order) or 'passport_entered'. */
  mode?: 'medical' | 'passport_entered'
  /** Part of the reference's name, any case (combines with q). */
  reference?: string
  /** Part of the company's name, any case (combines with q and reference). */
  company?: string
  reference_id?: number
  reference_type?: ReferenceType
  company_id?: number
  /** Country of the company (2-letter code). */
  company_country_code?: string
  received_from?: string
  received_to?: string
  /** Filter by medical centre ID. */
  medical_center_id?: number
  /** YYYY-MM-DD: medical date range start. */
  medical_date_from?: string
  /** YYYY-MM-DD: medical date range end. */
  medical_date_to?: string
  /** Without it the API leaves out unfit passports; 'unfit' lists only them; 'all' lists every status. */
  medical_status?: MedicalStatus | 'all'
  sort?: PassportSort
  /** 'overview' returns lean PassportOverview items. */
  view?: 'overview'
  /** Current step: medical, calling, visa, bmet, flight or completed. */
  stage?: string
  /** YYYY-MM-DD: the current step status date from (All Passports' date filter). */
  status_date_from?: string
  /** YYYY-MM-DD: the current step status date to. */
  status_date_to?: string
  /** Status at that step: pending, unfit, waiting, in_process or rejected. */
  stage_status?: string
  direction?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export interface NewReference {
  type: ReferenceType
  name: string
  phone?: string | null
}

/** The reference management form (the operations head). */
export interface AdminReferencePayload {
  type: ReferenceType
  name: string
  phone: string | null
  notes: string | null
}

export interface NewCompany {
  name: string
  country_code: string
  quota?: number
}

/** Body of POST /admin/companies and PATCH /admin/companies/{id}. */
export interface AdminCompanyPayload {
  name: string
  country_code: string
  quota: number
}

/** Colour of a latest status (afwan-api config workflow.tones). */
export type StatusTone = 'red' | 'amber' | 'blue' | 'green' | 'gray'

/** A passport's latest status, e.g. "Medical: Pending" (from the API's workflow). */
export interface LatestStatus {
  stage: string
  stage_label: string
  status: string
  status_label: string
  /** Ready-to-show text, e.g. "Medical: Unfit". */
  text: string
  tone: StatusTone
  /** YYYY-MM-DD, or null when no status date is recorded. */
  date: string | null
}

/** A lean item of GET /passports?view=overview (the All Passports screen). */
export interface PassportOverview {
  id: number
  /** Serial number given when the passport is added (1, 2, 3, …). */
  entry_no: number
  passport_name: string
  passport_number: string
  date_of_birth: string | null
  country: CountrySummary | null
  passport_expiry_date: string | null
  company: CompanySummary
  reference: Pick<Reference, 'id' | 'name' | 'type'> | null
  passport_received_date: string
  entered_by: { id: number; name: string } | null
  created_at: string
  latest_status: LatestStatus
  /** Set while the passport is returned to its owner. */
  returned?: PassportReturnInfo | null
}

/** One row of GET /passports/{id}/history: what happened, from entry to flight. */
export interface PassportHistoryEvent {
  key: string
  /** YYYY-MM-DD */
  date: string
  step_key: string
  step_label: string
  /** "Passport entered", "Medical Fit", "Visa issued", … */
  title: string
  tone: StatusTone
  /** Filled fields only; dates are YYYY-MM-DD when type is "date". */
  details: { label: string; value: string; type: string }[]
  recorded_by: { id: number; name: string } | null
  remarks: string | null
}
