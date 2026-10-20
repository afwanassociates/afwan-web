import { ref } from 'vue'
import { approveEntry, returnEntry } from '@/api/accounts'
import { useApprovalBadge } from '@/composables/useApprovalBadge'
import { useToast } from '@/composables/useToast'
import { useCashRefresh } from '@/lib/accounts'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { ApprovalType } from '@/types/accounts'

/** An entry to approve or return, with the words used in messages ("Receipt CR-2026-0001"). */
export interface ApprovalTarget {
  type: ApprovalType
  id: number
  label: string
}

/**
 * Approve / return actions shared by the accounts pages. After each action the page reloads
 * (`onDone`), and so do the approvals badge and the cash-in-hand header. Render
 * ReturnReasonDialog with `returnOpen`, `returnBusy`, `returnError` and `confirmReturn`.
 */
export function useApprovalActions(onDone: () => void) {
  const toast = useToast()
  const badge = useApprovalBadge()
  const refreshCash = useCashRefresh()

  const busyKey = ref<string | null>(null)
  const keyOf = (target: ApprovalTarget) => `${target.type}:${target.id}`

  function done() {
    onDone()
    badge.refresh()
    refreshCash()
  }

  async function approve(target: ApprovalTarget) {
    busyKey.value = keyOf(target)
    try {
      await approveEntry(target.type, target.id)
      toast.success(`${target.label} approved.`)
      done()
    } catch (error) {
      if (errorStatus(error) !== 401)
        toast.error(errorMessage(error, `Could not approve ${target.label}. Please try again.`))
      if (errorStatus(error) === 403 || errorStatus(error) === 404) onDone()
    } finally {
      busyKey.value = null
    }
  }

  const returnTarget = ref<ApprovalTarget | null>(null)
  const returnOpen = ref(false)
  const returnBusy = ref(false)
  const returnError = ref<string | null>(null)

  function askReturn(target: ApprovalTarget) {
    returnTarget.value = target
    returnError.value = null
    returnOpen.value = true
  }

  async function confirmReturn(reason: string) {
    const target = returnTarget.value
    if (!target) return
    returnBusy.value = true
    returnError.value = null
    try {
      await returnEntry(target.type, target.id, reason)
      returnOpen.value = false
      toast.success(`${target.label} returned to its preparer.`)
      done()
    } catch (error) {
      if (errorStatus(error) !== 401)
        returnError.value = errorMessage(error, 'Could not return it. Please try again.')
    } finally {
      returnBusy.value = false
    }
  }

  return {
    busyKey,
    isBusy: (target: ApprovalTarget) => busyKey.value === keyOf(target),
    approve,
    returnTarget,
    returnOpen,
    returnBusy,
    returnError,
    askReturn,
    confirmReturn,
  }
}
