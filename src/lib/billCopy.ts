import { fetchOwnerLoanBillCopy } from '@/api/accounts'
import { errorMessage } from '@/lib/errors'

/**
 * Opens an owner loan bill's copy in a new tab. The tab is opened first (while the click still
 * counts, so pop-up blockers allow it), then pointed at the fetched file. Returns an error
 * message, or null when it opened.
 */
export async function openBillCopy(billId: number): Promise<string | null> {
  const tab = window.open('', '_blank')
  try {
    const blob = await fetchOwnerLoanBillCopy(billId)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.location.href = url
    // Give the tab time to load it before the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return null
  } catch (error) {
    tab?.close()
    return errorMessage(error, 'Could not open the bill copy. Please try again.')
  }
}
