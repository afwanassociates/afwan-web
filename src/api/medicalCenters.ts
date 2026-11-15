import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type { MedicalCenter, MedicalCenterSummary } from '@/types/medical'

const ADMIN = '/api/admin/medical-centers'

/** Up to 20 active medical centres matching `q` (the passport team and admins). */
export async function searchMedicalCenters(q?: string): Promise<MedicalCenterSummary[]> {
  const { data } = await api.get<{ data: MedicalCenterSummary[] }>(
    '/api/data-entry/medical-centers',
    { params: { q: q || undefined } },
  )
  return data.data
}

/* Management (list, rename, deactivate, delete): the operations head only (403 otherwise). */

/** Every centre, active and inactive, with its passport count. */
export async function listMedicalCenters(params: {
  q?: string
  is_active?: 0 | 1
  page?: number
  per_page?: number
}): Promise<Paginated<MedicalCenter>> {
  const { data } = await api.get<Paginated<MedicalCenter>>(ADMIN, { params })
  return data
}

/**
 * Add a centre: the passport team (data entry and the operations head), from the medical
 * slip or the Medical Centers page. 422 with errors.name when the name already exists.
 */
export async function createMedicalCenter(name: string): Promise<MedicalCenter> {
  const { data } = await api.post<{ data: MedicalCenter }>('/api/data-entry/medical-centers', {
    name,
  })
  return data.data
}

/** Rename or (de)activate; 422 with errors.name when the new name is taken. */
export async function updateMedicalCenter(
  id: number,
  changes: { name?: string; is_active?: boolean },
): Promise<MedicalCenter> {
  const { data } = await api.patch<{ data: MedicalCenter }>(`${ADMIN}/${id}`, changes)
  return data.data
}

/** 422 with code medical_center_has_passports when a passport names it. */
export async function deleteMedicalCenter(id: number): Promise<void> {
  await api.delete(`${ADMIN}/${id}`)
}
