import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type {
  AdminReferencePayload,
  NewReference,
  Reference,
  ReferenceType,
} from '@/types/passport'

const BASE = '/api/data-entry/references'

/**
 * Up to 20 active references, optionally of one type, matching `q`, and with passports of
 * `company_id`.
 */
export async function searchReferences(params: {
  type?: ReferenceType
  q?: string
  company_id?: number
}): Promise<Reference[]> {
  const { data } = await api.get<{ data: Reference[] }>(BASE, {
    params: { type: params.type, q: params.q || undefined, company_id: params.company_id },
  })
  return data.data
}

/** 422 with errors.name when a reference with this name already exists. */
export async function createReference(payload: NewReference): Promise<Reference> {
  const { data } = await api.post<{ data: Reference }>(BASE, payload)
  return data.data
}

/* ---------- Management (the operations head) ---------- */

const ADMIN = '/api/admin/references'

export interface AdminReferenceParams {
  q?: string
  type?: ReferenceType
  /** 1 = active only, 0 = inactive only; omit for all. */
  is_active?: 0 | 1
  page?: number
  per_page?: number
}

/** Every reference (active and inactive) with its passport count. */
export async function listAdminReferences(
  params: AdminReferenceParams,
): Promise<Paginated<Reference>> {
  const { data } = await api.get<Paginated<Reference>>(ADMIN, { params })
  return data
}

/** 422 with errors.name when the name is taken for this type. */
export async function createAdminReference(payload: AdminReferencePayload): Promise<Reference> {
  const { data } = await api.post<{ data: Reference }>(ADMIN, payload)
  return data.data
}

/** Edit or (de)activate. */
export async function updateAdminReference(
  id: number,
  changes: Partial<AdminReferencePayload> & { is_active?: boolean },
): Promise<Reference> {
  const { data } = await api.patch<{ data: Reference }>(`${ADMIN}/${id}`, changes)
  return data.data
}

/** 422 with code reference_has_passports when the reference has passports. */
export async function deleteAdminReference(id: number): Promise<void> {
  await api.delete(`${ADMIN}/${id}`)
}
