import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchWorkflowSummary } from '@/api/workflow'
import type { WorkflowSummary } from '@/types/medical'

/**
 * Workflow counts shared by the step bar, the sidebar badges and the "Unfit passports (N)"
 * link. Call `refresh()` after anything that changes a passport or a medical.
 */
export const useWorkflowStore = defineStore('workflow', () => {
  const summary = ref<WorkflowSummary | null>(null)
  const loadFailed = ref(false)

  let pending: Promise<void> | null = null

  async function fetchSummary() {
    try {
      summary.value = await fetchWorkflowSummary()
      loadFailed.value = false
    } catch {
      loadFailed.value = true
    }
  }

  /** Loads once (later calls reuse the counts). */
  function load(): Promise<void> {
    if (summary.value) return Promise.resolve()
    pending ??= fetchSummary().finally(() => (pending = null))
    return pending
  }

  /** Fetches fresh counts. */
  function refresh(): Promise<void> {
    pending = fetchSummary().finally(() => (pending = null))
    return pending
  }

  return { summary, loadFailed, load, refresh }
})
