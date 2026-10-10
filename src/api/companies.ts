import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type { AdminCompanyPayload, Company, NewCompany } from '@/types/passport'

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

/* ---------- Admin (admin and super_admin) ---------- */

const ADMIN = '/api/admin/companies'

export interface AdminCompanyParams {
  q?: string
  /** 1 = active only, 0 = inactive only; omit for all. */
  is_active?: 0 | 1
  page?: number
  per_page?: number
}

/** Every company (active and inactive) with its passport count. */
export async function listAdminCompanies(params: AdminCompanyParams): Promise<Paginated<Company>> {
  const { data } = await api.get<Paginated<Company>>(ADMIN, { params })
  return data
}

/** 422 with errors.name when the name is taken. */
export async function createAdminCompany(payload: AdminCompanyPayload): Promise<Company> {
  const { data } = await api.post<{ data: Company }>(ADMIN, payload)
  return data.data
}

/** Edit or (de)activate. */
export async function updateAdminCompany(
  id: number,
  changes: Partial<AdminCompanyPayload>,
): Promise<Company> {
  const { data } = await api.patch<{ data: Company }>(`${ADMIN}/${id}`, changes)
  return data.data
}

/** 422 with code company_has_passports when the company has passports. */
export async function deleteAdminCompany(id: number): Promise<void> {
  await api.delete(`${ADMIN}/${id}`)
}
