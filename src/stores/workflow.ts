import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchWorkflowConfig, fetchWorkflowSummary } from '@/api/workflow'
import type { WorkflowSummary } from '@/types/medical'
import type { StepConfig, WorkflowConfig } from '@/types/workflow'

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

  /* ---------- Step definitions (loaded once per session) ---------- */

  const config = ref<WorkflowConfig | null>(null)
  let configPending: Promise<void> | null = null

  function loadConfig(): Promise<void> {
    if (config.value) return Promise.resolve()
    configPending ??= fetchWorkflowConfig()
      .then((value) => {
        config.value = value
      })
      .catch(() => {
        // Callers show their own error; a later call retries.
      })
      .finally(() => (configPending = null))
    return configPending
  }

  /** A step's definition by key. */
  function stepConfig(key: string | null | undefined): StepConfig | undefined {
    return key ? config.value?.steps.find((s) => s.key === key) : undefined
  }

  return { summary, loadFailed, load, refresh, config, loadConfig, stepConfig }
})
