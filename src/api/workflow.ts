import api from '@/lib/api'
import type { WorkflowSummary } from '@/types/medical'
import type { WorkflowConfig } from '@/types/workflow'

/** Counts for the step bar and the sidebar badges. */
export async function fetchWorkflowSummary(): Promise<WorkflowSummary> {
  const { data } = await api.get<{ data: WorkflowSummary }>('/api/data-entry/workflow/summary')
  return data.data
}

/** Step definitions (labels, statuses, fields). Changes only with a deploy, so load once. */
export async function fetchWorkflowConfig(): Promise<WorkflowConfig> {
  const { data } = await api.get<{ data: WorkflowConfig }>('/api/data-entry/workflow/config')
  return data.data
}
