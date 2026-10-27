/**
 * The company-wise and reference-wise reports (afwan-api /api/reports/...): every staff role.
 */

import type { LatestStatus, PassportEntry, ReferenceSummary, ReferenceType } from '@/types/passport'

/** Passport counts of one company (or of all companies, in the totals row). */
export interface CompanyCounts {
  total: number
  medical_fit: number
  medical_unfit: number
  medical_pending: number
  /** No medical slip date yet. */
  not_started: number
  calling_done: number
  visa_done: number
  bmet_done: number
  flight_done: number
  /** Not departed and not unfit. */
  in_process: number
}

/** One row of GET /reports/companies. */
export interface CompanyReportRow extends CompanyCounts {
  id: number
  name: string
  country_code: string
  quota: number | null
  /** quota − total; null when the company has no quota. Negative means over quota. */
  balance: number | null
}

/** Sums over every filtered company (not only the current page). */
export interface CompanyReportTotals extends CompanyCounts {
  quota: number | null
  /** Covers only companies with a quota. */
  balance: number | null
}

export interface CompanyReport {
  data: CompanyReportRow[]
  totals: CompanyReportTotals
  /** The chosen company / reference filter, with names (null when not filtered). */
  filters?: {
    company: { id: number; name: string; country_code: string } | null
    reference: ReferenceSummary | null
  }
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/** Columns the report may be sorted by. */
export type CompanyReportSortKey = 'name' | 'quota' | keyof CompanyCounts | 'balance'

export interface CompanyReportParams {
  /** Part of the company name (the dropdowns' option search). */
  search?: string
  /** Only this company. */
  company_id?: number
  /** Count only this reference's passports (and list only companies that have some). */
  reference_id?: number
  country_code?: string
  /** A sortable column, '-' prefixed for descending. */
  sort?: string
  page?: number
  /** Up to 100 (default 50). */
  per_page?: number
}

/**
 * An item of GET /reports/companies/{id}/passports: read-only, so it carries no action
 * permissions except whether the viewer may edit the passport details.
 */
export interface CompanyPassport extends Omit<PassportEntry, 'can'> {
  latest_status: LatestStatus
  can_edit_passport: boolean
}

/* ---------- Reference report (like the company report, without quota or balance) ---------- */

/** One row of GET /reports/reference-report. */
export interface ReferenceReportRow extends CompanyCounts {
  id: number
  name: string
  type: ReferenceType
  type_label: string
  phone: string | null
  is_active: boolean
}

export interface ReferenceReport {
  data: ReferenceReportRow[]
  /** Sums over every filtered reference (not only the current page). */
  totals: CompanyCounts
  /** The chosen reference / company filter, with names (null when not filtered). */
  filters?: {
    reference: ReferenceSummary | null
    company: { id: number; name: string; country_code: string } | null
  }
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/** Columns the reference report may be sorted by. */
export type ReferenceReportSortKey = 'name' | 'type' | keyof CompanyCounts

export interface ReferenceReportParams {
  /** Part of the reference name or phone. */
  search?: string
  type?: ReferenceType
  /** Only this reference. */
  reference_id?: number
  /** Count only this company's passports (and list only references that have some). */
  company_id?: number
  /** A sortable column, '-' prefixed for descending. */
  sort?: string
  page?: number
  /** Up to 100 (default 50). */
  per_page?: number
}
