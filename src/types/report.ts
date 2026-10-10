/** The company-wise report (afwan-api /api/reports/...): data_entry, accounts and admins. */

import type { LatestStatus, PassportEntry } from '@/types/passport'

/** Passport counts of one company (or of all companies, in the totals row). */
export interface CompanyCounts {
  total: number
  medical_fit: number
  medical_unfit: number
  medical_pending: number
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
  agent_name: string | null
  bd_agency_name: string | null
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
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/** Columns the report may be sorted by. */
export type CompanyReportSortKey = 'name' | 'quota' | keyof CompanyCounts | 'balance'

export interface CompanyReportParams {
  search?: string
  country_code?: string
  /** A sortable column, '-' prefixed for descending. */
  sort?: string
  page?: number
  /** Up to 100 (default 50). */
  per_page?: number
}

/** An item of GET /reports/companies/{id}/passports. */
export interface CompanyPassport extends PassportEntry {
  latest_status: LatestStatus
}
