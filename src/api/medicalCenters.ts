import api from '@/lib/api'
import type { MedicalCenterSummary } from '@/types/medical'

/** Up to 20 active medical centres matching `q` (data_entry, admin, super_admin). */
export async function searchMedicalCenters(q?: string): Promise<MedicalCenterSummary[]> {
  const { data } = await api.get<{ data: MedicalCenterSummary[] }>(
    '/api/data-entry/medical-centers',
    { params: { q: q || undefined } },
  )
  return data.data
}

/** Admins only (403 otherwise); 422 with errors.name when the name already exists. */
export async function createMedicalCenter(name: string): Promise<MedicalCenterSummary> {
  const { data } = await api.post<{ data: MedicalCenterSummary }>('/api/admin/medical-centers', {
    name,
  })
  return data.data
}
