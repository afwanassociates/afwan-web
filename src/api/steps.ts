import api from '@/lib/api'
import type { PassportWorkflow } from '@/types/medical'
import type { Paginated } from '@/types/auth'
import type {
  StepListParams,
  StepListRow,
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

/** Admin only: removes a record (undo). */
export async function deleteStepRecord(id: number): Promise<void> {
  await api.delete(`${BASE}/step-records/${id}`)
}

/* ---------- Step pages (one page per step) ---------- */

/** One step's work list for a tab, in the API's fixed order for that tab. */
export async function listStepPassports(
  stepKey: string,
  params: StepListParams,
): Promise<Paginated<StepListRow>> {
  const { data } = await api.get<Paginated<StepListRow>>(
    `${BASE}/steps/${encodeURIComponent(stepKey)}/passports`,
    { params },
  )
  return data
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
