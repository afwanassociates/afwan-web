import api from '@/lib/api'
import { businessToday, toDisplayDate } from '@/lib/dates'
import type { Paginated } from '@/types/auth'
import type { CompanyPassport, CompanyReport, CompanyReportParams } from '@/types/report'

const BASE = '/api/reports'

/** One page of the company report with the totals of every filtered company. */
export async function fetchCompanyReport(params: CompanyReportParams): Promise<CompanyReport> {
  const { data } = await api.get<CompanyReport>(`${BASE}/companies`, { params })
  return data
}

/**
 * Downloads the report as CSV (same filters and sort, every page). Returns the file name.
 * The browser is given the file through a temporary link.
 */
export async function downloadCompanyReportCsv(
  params: Omit<CompanyReportParams, 'page' | 'per_page'>,
): Promise<string> {
  const response = await api.get<Blob>(`${BASE}/companies`, {
    params: { ...params, export: 'csv' },
    responseType: 'blob',
  })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  const fileName = match?.[1]
    ? decodeURIComponent(match[1])
    : `company-report-${toDisplayDate(businessToday())}.csv`

  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return fileName
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
