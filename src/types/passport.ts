/** Types matching the afwan-api data-entry endpoints (/api/data-entry/...). */

import type { CountrySummary } from '@/types/country'

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
  is_active: boolean
  created_at: string
  updated_at: string
}

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
  created_by: number | null
  updated_by: number | null
  created_at: string
  updated_at: string
  /** What the current user may do with this entry (decided by the API's policy). */
  can: { update: boolean; delete: boolean }
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
  page?: number
  per_page?: number
}

export interface NewReference {
  type: ReferenceType
  name: string
  phone?: string | null
}

export interface NewCompany {
  name: string
  country_code: string
}
