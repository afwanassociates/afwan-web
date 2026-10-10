/** Types matching the afwan-api data-entry endpoints (/api/data-entry/...). */

import type { CountrySummary } from '@/types/country'
import type { MedicalStatus, MedicalSummary, PassportWorkflow } from '@/types/medical'
import type { WorkflowWarning } from '@/types/workflow'

export type ReferenceType = 'person' | 'agency'

export interface Reference {
  id: number
  type: ReferenceType
  type_label: string
  name: string
  phone: string | null
  notes: string | null
  is_active: boolean
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
  agent_name: string | null
  agent_phone: string | null
  agent_email: string | null
  /** The Bangladeshi recruiting agency. */
  bd_agency_name: string | null
  /** Workers the company asked for. */
  quota: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Optional agent details of a company (all nullable). */
export type CompanyAgentDetails = Pick<
  Company,
  'agent_name' | 'agent_phone' | 'agent_email' | 'bd_agency_name' | 'quota'
>

/** The company as embedded in a passport entry. */
export type CompanySummary = Pick<Company, 'id' | 'name' | 'country'>

export interface PassportEntry {
  id: number
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
  reference: ReferenceSummary
  company: CompanySummary
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
  updated_by: number | null
  created_at: string
  updated_at: string
  /** What the current user may do with this entry (decided by the API's policy). */
  can: { update: boolean; delete: boolean; record_medical: boolean }
}

/** Body of POST /passports and PATCH /passports/{id}. */
export interface PassportPayload {
  passport_name: string
  passport_number: string
  country_code: string | null
  /** YYYY-MM-DD */
  date_of_birth: string
  reference_id: number
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
  reference_id?: number
  reference_type?: ReferenceType
  company_id?: number
  /** Country of the company (2-letter code). */
  company_country_code?: string
  received_from?: string
  received_to?: string
  /** Without it the API leaves out unfit passports; 'unfit' lists only them; 'all' lists every status. */
  medical_status?: MedicalStatus | 'all'
  sort?: PassportSort
  /** 'overview' returns lean PassportOverview items. */
  view?: 'overview'
  /** Current step: medical, calling, visa, bmet, flight or completed. */
  stage?: string
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

export interface NewCompany extends Partial<CompanyAgentDetails> {
  name: string
  country_code: string
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
  passport_name: string
  passport_number: string
  date_of_birth: string | null
  country: CountrySummary | null
  passport_expiry_date: string | null
  company: CompanySummary
  reference: Pick<Reference, 'id' | 'name' | 'type'>
  passport_received_date: string
  entered_by: { id: number; name: string } | null
  created_at: string
  latest_status: LatestStatus
}
