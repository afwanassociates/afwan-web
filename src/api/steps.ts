import api from '@/lib/api'
import type { PassportWorkflow } from '@/types/medical'
import type { StepPayload, StepRecord, WorkflowWarning } from '@/types/workflow'

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
