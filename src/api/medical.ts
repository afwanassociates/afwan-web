import api from '@/lib/api'
import type { PassportEntry } from '@/types/passport'
import type {
  MedicalPayload,
  MedicalSlipPayload,
  MedicalQueueItem,
  MedicalRecord,
  MedicalSaveResponse,
} from '@/types/medical'

const BASE = '/api/data-entry'

/** A passport's medical history, newest first. */
export async function listMedicals(passportId: number): Promise<MedicalRecord[]> {
  const { data } = await api.get<{ data: MedicalRecord[] }>(
    `${BASE}/passports/${passportId}/medicals`,
  )
  return data.data
}

/** Records a result (a re-test adds a new record). 403 when not allowed (e.g. re-test by data entry). */
export async function recordMedical(
  passportId: number,
  payload: MedicalPayload,
): Promise<MedicalSaveResponse> {
  const { data } = await api.post<MedicalSaveResponse>(
    `${BASE}/passports/${passportId}/medicals`,
    payload,
  )
  return data
}

export async function updateMedical(
  id: number,
  payload: Partial<MedicalPayload>,
): Promise<MedicalSaveResponse> {
  const { data } = await api.patch<MedicalSaveResponse>(`${BASE}/medicals/${id}`, payload)
  return data
}

export async function deleteMedical(id: number): Promise<void> {
  await api.delete(`${BASE}/medicals/${id}`)
}

/** Passports waiting for a medical, oldest received first. */
export async function fetchMedicalQueue(
  params: { per_page?: number; cursor?: string } = {},
): Promise<{ data: MedicalQueueItem[]; meta: { next_cursor: string | null } }> {
  const { data } = await api.get<{
    data: MedicalQueueItem[]
    meta: { next_cursor: string | null }
  }>(`${BASE}/medical/queue`, { params })
  return data
}

/**
 * Saves a passport's medical slip (MYGRAM date, number, centre). Entering the date moves the
 * passport from "not started" into Medical → Pending. Returns the updated passport.
 */
export async function updateMedicalSlip(
  passportId: number,
  payload: MedicalSlipPayload,
): Promise<PassportEntry> {
  const { data } = await api.patch<{ data: PassportEntry }>(
    `${BASE}/passports/${passportId}/medical-slip`,
    payload,
  )
  return data.data
}
