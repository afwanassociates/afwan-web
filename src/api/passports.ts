import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type {
  PassportEntry,
  PassportFilters,
  PassportOverview,
  PassportPayload,
} from '@/types/passport'

const BASE = '/api/data-entry/passports'

export async function listPassports(filters: PassportFilters): Promise<Paginated<PassportEntry>> {
  const { data } = await api.get<Paginated<PassportEntry>>(BASE, { params: filters })
  return data
}

/** Lean overview items with a latest status (view=overview), for the All Passports screen. */
export async function listPassportOverview(
  filters: PassportFilters,
): Promise<Paginated<PassportOverview>> {
  const { data } = await api.get<Paginated<PassportOverview>>(BASE, {
    params: { ...filters, view: 'overview' },
  })
  return data
}

export async function getPassport(id: number): Promise<PassportEntry> {
  const { data } = await api.get<{ data: PassportEntry }>(`${BASE}/${id}`)
  return data.data
}

export async function createPassport(payload: PassportPayload): Promise<PassportEntry> {
  const { data } = await api.post<{ data: PassportEntry }>(BASE, payload)
  return data.data
}

export async function updatePassport(
  id: number,
  payload: Partial<PassportPayload>,
): Promise<PassportEntry> {
  const { data } = await api.patch<{ data: PassportEntry }>(`${BASE}/${id}`, payload)
  return data.data
}

export async function deletePassport(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`)
}
