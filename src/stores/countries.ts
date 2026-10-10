import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { fetchCountries, fetchDefaults } from '@/api/countries'
import type { AppDefaults, CountryOption, CountrySummary } from '@/types/country'

/**
 * Active countries and the data-entry defaults, loaded once per session and shared by
 * every form. Call `reload()` after an admin changes countries or settings.
 */
export const useCountriesStore = defineStore('countries', () => {
  const countries = shallowRef<CountryOption[]>([])
  const defaults = ref<AppDefaults | null>(null)
  const isLoaded = ref(false)
  const loadError = ref(false)

  const byCodeMap = computed(() => new Map(countries.value.map((c) => [c.code, c])))

  let pending: Promise<void> | null = null

  async function fetchAll(fresh: boolean) {
    // Independent: a failed settings request must not leave the country list empty.
    const [list, values] = await Promise.allSettled([fetchCountries(fresh), fetchDefaults()])
    if (values.status === 'fulfilled') defaults.value = values.value
    if (list.status === 'fulfilled') {
      countries.value = list.value
      isLoaded.value = true
      loadError.value = false
    } else {
      loadError.value = true
    }
  }

  /** Loads once; later calls reuse the result (and concurrent calls share one request). */
  function load(): Promise<void> {
    if (isLoaded.value) return Promise.resolve()
    pending ??= fetchAll(false).finally(() => (pending = null))
    return pending
  }

  /** Fetches again, bypassing the browser cache. */
  function reload(): Promise<void> {
    pending = fetchAll(true).finally(() => (pending = null))
    return pending
  }

  /**
   * Fetches the defaults again (e.g. when a form opens), so a changed setting applies
   * without reloading the app. Keeps the previous values and returns false if the request
   * fails.
   */
  async function refreshDefaults(): Promise<boolean> {
    try {
      defaults.value = await fetchDefaults()
      return true
    } catch {
      // The caller decides what to fall back to.
      return false
    }
  }

  /** An active country by code, or undefined. */
  function byCode(code: string | null | undefined): CountryOption | undefined {
    return code ? byCodeMap.value.get(code) : undefined
  }

  /**
   * Active countries matching `query` (name contains it, or code equals it), in dropdown
   * order. `include` keeps a current value selectable even if it was deactivated.
   */
  function search(query: string, include?: CountrySummary | null): CountrySummary[] {
    const q = query.trim().toLowerCase()
    const matches = (c: CountrySummary) =>
      !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
    const result: CountrySummary[] = countries.value.filter(matches)
    if (include && !byCodeMap.value.has(include.code) && matches(include)) result.unshift(include)
    return result
  }

  return {
    countries,
    defaults,
    isLoaded,
    loadError,
    load,
    reload,
    refreshDefaults,
    byCode,
    search,
  }
})
