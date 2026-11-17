import { ref } from 'vue'
import { fetchAgentApprovalCount, fetchAgentChangeCount } from '@/api/agents'
import { useAuthStore } from '@/stores/auth'
import { AGENT_DECIDER_ROLES, AGENT_MANAGER_ROLES } from '@/lib/agents'

/**
 * The menu badges (shared module state): agent assignments waiting for the Operations Head,
 * and agent changes waiting for the Accounts Head.
 */
const approvals = ref<number | null>(null)
const changes = ref<number | null>(null)
let requestId = 0

export function useAgentBadges() {
  async function refresh() {
    const role = useAuthStore().user?.role
    if (!role) return
    const id = ++requestId
    try {
      if (AGENT_MANAGER_ROLES.includes(role)) {
        const count = await fetchAgentApprovalCount()
        if (id === requestId) approvals.value = count
      }
      if (AGENT_DECIDER_ROLES.includes(role)) {
        const count = await fetchAgentChangeCount()
        if (id === requestId) changes.value = count
      }
    } catch {
      // The badges just stay as they were.
    }
  }

  return { approvals, changes, refresh }
}
