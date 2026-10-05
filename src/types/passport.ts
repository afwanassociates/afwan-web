/** Types matching the afwan-api data-entry endpoints (/api/data-entry/...). */

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
  is_active: boolean
  created_at: string
  updated_at: string
}

/** The company as embedded in a passport entry. */
export type CompanySummary = Pick<Company, 'id' | 'name'>

export interface PassportEntry {
  id: number
  passport_name: string
  passport_number: string
  /** YYYY-MM-DD */
  passport_received_date: string
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
  reference_id: number
  company_id: number
  /** YYYY-MM-DD */
  passport_received_date: string
}

/** Query of GET /passports. Dates are YYYY-MM-DD. */
export interface PassportFilters {
  q?: string
  reference_id?: number
  reference_type?: ReferenceType
  company_id?: number
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
}
