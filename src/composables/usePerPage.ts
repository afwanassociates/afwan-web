import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * How many rows a paginated list shows (the "Rows per page" dropdown next to
 * "Showing 1–15 of 30"). One choice for every list, remembered in this browser.
 */
export const PER_PAGE_OPTIONS = [15, 50, 100, 200, 300] as const
export const DEFAULT_PER_PAGE = 15

const STORAGE_KEY = 'afwan.perPage'

function stored(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return (PER_PAGE_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_PER_PAGE
  } catch {
    return DEFAULT_PER_PAGE
  }
}

/** The chosen rows per page (shared by every list). */
export const perPage = ref<number>(stored())

export function setPerPage(value: number) {
  if (!(PER_PAGE_OPTIONS as readonly number[]).includes(value)) return
  perPage.value = value
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Only a convenience: the choice is kept for this visit.
  }
}

/**
 * A list page: reload from page 1 when the rows per page change. With ?page=N in the address
 * the page number is dropped (the page's own watcher reloads); otherwise `reload` runs.
 */
export function usePerPage(reload: () => unknown) {
  const route = useRoute()
  const router = useRouter()
  watch(perPage, () => {
    if (route.query.page) {
      const query = { ...route.query }
      delete query.page
      router.replace({ query })
    } else {
      reload()
    }
  })
  return perPage
}
