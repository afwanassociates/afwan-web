import { ref } from 'vue'
import { fetchApprovalSummary } from '@/api/accounts'

/**
 * The menu badge (shared module state): for an approver, the entries waiting for approval;
 * for the accounts team ("My entries"), their own entries returned for correction.
 */
const count = ref<number | null>(null)
let requestId = 0

export function useApprovalBadge() {
  async function refresh() {
    const id = ++requestId
    try {
      const summary = await fetchApprovalSummary()
      if (id === requestId)
        count.value = summary.is_approver ? summary.pending : summary.returned_mine
    } catch {
      // The badge just stays as it was.
    }
  }

  return { count, refresh }
}
