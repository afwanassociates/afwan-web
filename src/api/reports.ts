import api from '@/lib/api'
import { businessToday, toDisplayDate } from '@/lib/dates'
import type { Paginated } from '@/types/auth'
import type { ReferenceSummary } from '@/types/passport'
import type {
  CompanyCounts,
  CompanyPassport,
  CompanyReport,
  CompanyReportParams,
  ReferenceReport,
  ReferenceReportParams,
} from '@/types/report'

const BASE = '/api/reports'

/** Passport counts over every passport (the dashboard cards of every role). */
export async function fetchReportSummary(): Promise<CompanyCounts> {
  const { data } = await api.get<{ data: CompanyCounts }>(`${BASE}/summary`)
  return data.data
}

/** One page of the company report with the totals of every filtered company. */
export async function fetchCompanyReport(params: CompanyReportParams): Promise<CompanyReport> {
  const { data } = await api.get<CompanyReport>(`${BASE}/companies`, { params })
  return data
}

/**
 * Downloads the company report as CSV (same filters and sort, every page). Returns the file
 * name.
 */
export function downloadCompanyReportCsv(
  params: Omit<CompanyReportParams, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv(`${BASE}/companies`, params, 'company-report')
}

/**
 * Gets a report (or a step page's tab) as CSV and gives the browser the file through a
 * temporary link. The file name comes from the response, else `<prefix>-<today>.csv`.
 */
export async function downloadCsv(url: string, params: object, prefix: string): Promise<string> {
  const response = await api.get<Blob>(url, {
    params: { ...params, export: 'csv' },
    responseType: 'blob',
  })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  const fileName = match?.[1]
    ? decodeURIComponent(match[1])
    : `${prefix}-${toDisplayDate(businessToday())}.csv`

  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
  return fileName
}

/** Downloads every passport of a company as CSV (newest first). Returns the file name. */
export function downloadCompanyPassportsCsv(companyId: number): Promise<string> {
  return downloadCsv(`${BASE}/companies/${companyId}/passports`, {}, 'company-passports')
}

/** A company's passports, newest first (15 per page by default). */
export async function fetchCompanyPassports(
  companyId: number,
  params: { page?: number; per_page?: number } = {},
): Promise<Paginated<CompanyPassport>> {
  const { data } = await api.get<Paginated<CompanyPassport>>(
    `${BASE}/companies/${companyId}/passports`,
    { params },
  )
  return data
}

/* ---------- Reference report ---------- */

/** One page of the reference report with the totals of every filtered reference. */
export async function fetchReferenceReport(
  params: ReferenceReportParams,
): Promise<ReferenceReport> {
  const { data } = await api.get<ReferenceReport>(`${BASE}/reference-report`, { params })
  return data
}

/** Downloads the reference report as CSV (same filters and sort, every page). */
export function downloadReferenceReportCsv(
  params: Omit<ReferenceReportParams, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv(`${BASE}/reference-report`, params, 'reference-report')
}

/** A reference's passports, newest first (15 per page by default). */
export async function fetchReferencePassports(
  referenceId: number,
  params: { page?: number; per_page?: number } = {},
): Promise<Paginated<CompanyPassport>> {
  const { data } = await api.get<Paginated<CompanyPassport>>(
    `${BASE}/reference-report/${referenceId}/passports`,
    { params },
  )
  return data
}

/** Downloads every passport of a reference as CSV (newest first). Returns the file name. */
export function downloadReferencePassportsCsv(referenceId: number): Promise<string> {
  return downloadCsv(`${BASE}/reference-report/${referenceId}/passports`, {}, 'reference-passports')
}

/* ---------- Reference options ---------- */

/**
 * Up to 20 references for the company report's "Filter by reference" dropdown (accounts
 * cannot use the data-entry lookup); with `company_id`, only references of that company.
 */
export async function fetchReportReferences(params: {
  q?: string
  company_id?: number
}): Promise<ReferenceSummary[]> {
  const { data } = await api.get<{ data: ReferenceSummary[] }>(`${BASE}/references`, {
    params: { q: params.q || undefined, company_id: params.company_id },
  })
  return data.data
}
