import api from '@/lib/api'
import { downloadCsv } from '@/api/reports'
import type { PassportWorkflow } from '@/types/medical'
import type {
  BulkResult,
  StepListParams,
  StepListResponse,
  StepPayload,
  StepRecord,
  StepResultPayload,
  WorkflowWarning,
} from '@/types/workflow'

const BASE = '/api/data-entry'

/** Response of saving a step: the record, the passport's new stage and step bar, warnings. */
export interface StepSaveResponse {
  data: StepRecord
  passport: {
    id: number
    current_stage: string | null
    stage_status: string | null
    medical_status: string
    workflow: PassportWorkflow
  }
  warnings: WorkflowWarning[]
}

/** A passport's step history, grouped by step key (newest first within each). */
export async function listStepRecords(passportId: number): Promise<Record<string, StepRecord[]>> {
  const { data } = await api.get<{ data: Record<string, StepRecord[]> }>(
    `${BASE}/passports/${passportId}/steps`,
  )
  return data.data
}

/**
 * Records a step (a rejected step may be recorded again). 422 with `code`:
 * previous_step_incomplete, step_already_completed, step_in_process, medical_not_valid.
 */
export async function recordStep(
  passportId: number,
  stepKey: string,
  payload: StepPayload,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}`,
    payload,
  )
  return data
}

/** Changes a record, e.g. in_process → completed or rejected. */
export async function updateStepRecord(
  id: number,
  payload: Partial<StepPayload>,
): Promise<StepSaveResponse> {
  const { data } = await api.patch<StepSaveResponse>(`${BASE}/step-records/${id}`, payload)
  return data
}

/* ---------- Step pages (one page per step) ---------- */

/** One step's work list for a tab, in the API's fixed order for that tab. */
export async function listStepPassports(
  stepKey: string,
  params: StepListParams,
): Promise<StepListResponse> {
  const { data } = await api.get<StepListResponse>(
    `${BASE}/steps/${encodeURIComponent(stepKey)}/passports`,
    { params },
  )
  return data
}

/**
 * One action for many passports (at most 100): visa `start` / `result`, a BMET action or
 * `all`, flight `booking` / `confirm`. `data` is the body the single action takes. Each
 * passport is checked as its single button is; the ones that fail come back in `skipped`.
 */
export async function bulkStep(
  stepKey: string,
  action: string,
  passportIds: number[],
  data: Record<string, unknown> = {},
): Promise<BulkResult> {
  const { data: result } = await api.post<BulkResult>(
    `${BASE}/steps/${encodeURIComponent(stepKey)}/bulk`,
    { action, passport_ids: passportIds, data },
  )
  return result
}

/**
 * Downloads a step page's tab as CSV (same filters, every page, the API's order). Returns the
 * file name.
 */
export function downloadStepListCsv(
  stepKey: string,
  params: Omit<StepListParams, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv(
    `${BASE}/steps/${encodeURIComponent(stepKey)}/passports`,
    params,
    `${stepKey}-${params.tab ?? 'pending'}`,
  )
}

/**
 * Starts the step with its "start" fields (the step date and e.g. the flight details):
 * creates the in-process record. Also used for "Apply again" after a rejection.
 */
export async function startStep(
  passportId: number,
  stepKey: string,
  payload: Partial<StepPayload>,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}/start`,
    payload,
  )
  return data
}

/** Records the step's result (completed or rejected) with its "result" fields. */
export async function recordStepResult(
  passportId: number,
  stepKey: string,
  payload: StepResultPayload,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}/result`,
    payload,
  )
  return data
}

/** Body of POST /passports/{id}/steps/calling/update. Dates are YYYY-MM-DD. */
export interface CallingUpdatePayload {
  receive_date: string
  issue_date: string
  valid_until: string
}

/** Calling in one save: the three permit dates (all required); the passport becomes Permitted. */
export async function updateCalling(
  passportId: number,
  stepKey: string,
  payload: CallingUpdatePayload,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}/update`,
    payload,
  )
  return data
}

/**
 * Marks a milestone action done (BMET: training, finger, clearance). Without a date the API
 * uses today (Dhaka); a date corrects an action already done.
 */
export async function markStepAction(
  passportId: number,
  stepKey: string,
  action: string,
  date?: string,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}/${encodeURIComponent(action)}`,
    date ? { date } : {},
  )
  return data
}

/** Undoes a milestone action (data is null once the last one is undone). */
export async function undoStepAction(
  passportId: number,
  stepKey: string,
  action: string,
): Promise<void> {
  await api.delete(
    `${BASE}/passports/${passportId}/steps/${encodeURIComponent(stepKey)}/${encodeURIComponent(action)}`,
  )
}

/**
 * Saves (or changes) the flight booking date: any time after the visa is issued, today or
 * later is fine, not before the visa issue date (422 on booking_date).
 */
export async function bookFlight(
  passportId: number,
  bookingDate: string,
): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/flight/booking`,
    { booking_date: bookingDate },
  )
  return data
}

/** Clears the flight booking date (not once the flight is confirmed). */
export async function clearFlightBooking(passportId: number): Promise<void> {
  await api.delete(`${BASE}/passports/${passportId}/steps/flight/booking`)
}

/**
 * Confirms the flight (no body). Refused with 422 unless BMET is cleared and a booking date
 * exists (the row's can_confirm).
 */
export async function confirmFlight(passportId: number): Promise<StepSaveResponse> {
  const { data } = await api.post<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/flight/confirm`,
    {},
  )
  return data
}

/** Undoes the confirmation: back to Flight Pending, the booking date kept. */
export async function undoFlightConfirm(passportId: number): Promise<StepSaveResponse> {
  const { data } = await api.delete<StepSaveResponse>(
    `${BASE}/passports/${passportId}/steps/flight/confirm`,
  )
  return data
}
