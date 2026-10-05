import api from '@/lib/api'
import type { Company, NewCompany } from '@/types/passport'

const BASE = '/api/data-entry/companies'

/** Up to 20 active companies matching `q`. */
export async function searchCompanies(q?: string): Promise<Company[]> {
  const { data } = await api.get<{ data: Company[] }>(BASE, { params: { q: q || undefined } })
  return data.data
}

/** 422 with errors.name when a company with this name already exists. */
export async function createCompany(payload: NewCompany): Promise<Company> {
  const { data } = await api.post<{ data: Company }>(BASE, payload)
  return data.data
}
