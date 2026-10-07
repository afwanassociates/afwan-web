import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type {
  AdminCountry,
  AppDefaults,
  CountryChanges,
  CountryOption,
  NewCountry,
} from '@/types/country'

/* ---------- Data entry ---------- */

/**
 * Active countries, pinned first. The API lets the browser cache this list for 5 minutes;
 * pass `fresh` after an admin change to bypass that cache.
 */
export async function fetchCountries(fresh = false): Promise<CountryOption[]> {
  const { data } = await api.get<{ data: CountryOption[] }>('/api/data-entry/countries', {
    // A query parameter (not a header) so no CORS preflight is needed.
    params: fresh ? { _: Date.now() } : undefined,
  })
  return data.data
}

/** The defaults the data-entry forms start with. */
export async function fetchDefaults(): Promise<AppDefaults> {
  const { data } = await api.get<{ data: AppDefaults }>('/api/data-entry/defaults')
  return data.data
}

/* ---------- Admin ---------- */

export interface AdminCountryParams {
  q?: string
  is_active?: 0 | 1
  /** Up to 300 */
  per_page?: number
  page?: number
}

/** Every country (active and inactive) with usage counts. */
export async function listAdminCountries(
  params: AdminCountryParams,
): Promise<Paginated<AdminCountry>> {
  const { data } = await api.get<Paginated<AdminCountry>>('/api/admin/countries', { params })
  return data
}

/** 422 for a duplicate or invalid code or name. */
export async function createCountry(payload: NewCountry): Promise<AdminCountry> {
  const { data } = await api.post<{ data: AdminCountry }>('/api/admin/countries', payload)
  return data.data
}

/** 422 (errors.is_active) when deactivating a country that is a default. */
export async function updateCountry(code: string, changes: CountryChanges): Promise<AdminCountry> {
  const { data } = await api.patch<{ data: AdminCountry }>(
    `/api/admin/countries/${encodeURIComponent(code)}`,
    changes,
  )
  return data.data
}
