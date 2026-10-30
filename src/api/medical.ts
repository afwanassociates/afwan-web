import api from '@/lib/api'
import type { PassportEntry } from '@/types/passport'
import type {
  MedicalResult,
  MedicalSlipPayload,
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

/**
 * Sets the date the passport goes (or went) for its medical: today or earlier (Dhaka
 * date). Needs the medical slip date; locked once a result is recorded (admins excepted).
 */
export async function updateMedicalDate(
  passportId: number,
  medicalDate: string,
): Promise<PassportEntry> {
  const { data } = await api.patch<{ data: PassportEntry }>(
    `${BASE}/passports/${passportId}/medical-date`,
    { medical_date: medicalDate },
  )
  return data.data
}

/**
 * Records the result for the passport's medical date (422 without a medical date). Fit needs
 * the issue and expiry dates printed on it (expiry after issue, issue not in the future);
 * unfit needs none.
 */
export async function recordMedicalResult(
  passportId: number,
  result: MedicalResult,
  dates?: { issue_date: string; expiry_date: string },
): Promise<MedicalSaveResponse> {
  const { data } = await api.post<MedicalSaveResponse>(
    `${BASE}/passports/${passportId}/medical-result`,
    result === 'fit' ? { result, ...dates } : { result },
  )
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
