import api from '@/lib/api'
import type { NewReference, Reference, ReferenceType } from '@/types/passport'

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
