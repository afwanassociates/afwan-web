import { onBeforeUnmount, readonly, ref, watchEffect } from 'vue'

/**
 * The page title and description shown in the staff header bar (StaffLayout), instead of a
 * heading inside the page (the passport flow pages: Passport Entry List, Medical, Calling,
 * Visa, BMET, Flight). The page keeps a visually hidden <h1> for screen readers.
 */
export interface PageHeading {
  title: string
  subtitle?: string
}

const current = ref<PageHeading | null>(null)

/** The heading the header bar shows (null: none). */
export const pageHeading = readonly(current)

/** Show this page's heading in the header bar while the page is open. */
export function usePageHeading(source: () => PageHeading | null) {
  watchEffect(() => {
    current.value = source()
  })
  onBeforeUnmount(() => {
    current.value = null
  })
}
