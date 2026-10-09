import api from '@/lib/api'
import type { WorkflowSummary } from '@/types/medical'

/** Counts for the step bar and the sidebar badges. */
export async function fetchWorkflowSummary(): Promise<WorkflowSummary> {
  const { data } = await api.get<{ data: WorkflowSummary }>('/api/data-entry/workflow/summary')
  return data.data
}
