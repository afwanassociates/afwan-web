import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { listPassports } from '@/api/passports'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus } from '@/lib/errors'
import { useCountriesStore } from '@/stores/countries'
import type { Paginated } from '@/types/auth'
import type { CountrySummary } from '@/types/country'
import type { PassportEntry, PassportFilters, PassportSort } from '@/types/passport'

export interface SortOption {
  /** 'field:direction', e.g. 'valid_until:asc' */
  value: `${PassportSort}:${'asc' | 'desc'}`
  label: string
}

export interface PassportListOptions<T = PassportEntry> {
  /** Only load while this route is shown. */
  routeName: string
  /** API filters set by the page or tab (e.g. medical_status). */
  fixed: () => PassportFilters
  /** Sort choices for the page or tab; the first is the default. */
  sortOptions: () => SortOption[]
  perPage?: number
  /** Loads one page; defaults to GET /passports with full PassportEntry items. */
  fetch?: (filters: PassportFilters) => Promise<Paginated<T>>
  /** Wait to load until this is true (e.g. until the page's tabs are known). */
  ready?: () => boolean
}

interface CompanyFilterItem {
  id: number
  name: string
  country?: CountrySummary
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const positiveInt = (value: unknown) => {
  const n = Number(text(value))
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * A passport list whose search, company, company country, sort and page live in the URL
 * query (other query keys, like a tab, are kept). Shared by the Medical and Unfit pages.
 */
export function usePassportList<T = PassportEntry>(options: PassportListOptions<T>) {
  const fetchPage =
    options.fetch ??
    (listPassports as unknown as (filters: PassportFilters) => Promise<Paginated<T>>)
  const route = useRoute()
  const router = useRouter()
  const countries = useCountriesStore()
  countries.load()

  const perPage = options.perPage ?? 15

  const filters = computed(() => {
    const query = route.query
    const sorts = options.sortOptions()
    const sort = sorts.find((s) => s.value === text(query.sort))?.value ?? sorts[0]?.value
    return {
      q: text(query.q).trim(),
      company_id: positiveInt(query.company_id),
      company_name: text(query.company_name),
      company_country_code: /^[A-Z]{2}$/.test(text(query.company_country_code))
        ? text(query.company_country_code)
        : '',
      sort,
      page: positiveInt(query.page) ?? 1,
    }
  })

  type Filters = typeof filters.value

  const hasFilters = computed(() =>
    Boolean(filters.value.q || filters.value.company_id || filters.value.company_country_code),
  )

  /** The current query with `changes` applied; any filter change resets the page. */
  function queryWith(changes: Partial<Filters>): LocationQuery {
    const next = { ...filters.value, page: 1, ...changes }
    const query: LocationQuery = { ...route.query }
    const set = (key: string, value: string | number | null | undefined) => {
      if (value === null || value === undefined || value === '') delete query[key]
      else query[key] = String(value)
    }
    set('q', next.q)
    set('company_id', next.company_id)
    set('company_name', next.company_id ? next.company_name : '')
    set('company_country_code', next.company_country_code)
    set('sort', next.sort === options.sortOptions()[0]?.value ? '' : next.sort)
    set('page', next.page > 1 ? next.page : '')
    return query
  }

  function apply(changes: Partial<Filters>, replace = false) {
    const location = { query: queryWith(changes) }
    return replace ? router.replace(location) : router.push(location)
  }

  /* ---------- Filter models ---------- */

  const search = ref(filters.value.q)
  const debouncedSearch = useDebounce((value: string) => apply({ q: value.trim() }, true), 300)
  const onSearchInput = () => debouncedSearch.run(search.value)
  watch(
    () => filters.value.q,
    (q) => {
      if (q !== search.value.trim()) search.value = q
    },
  )

  const company = computed({
    get: (): CompanyFilterItem | null =>
      filters.value.company_id
        ? { id: filters.value.company_id, name: filters.value.company_name || 'Selected' }
        : null,
    set: (item: CompanyFilterItem | null) =>
      apply({ company_id: item?.id ?? null, company_name: item?.name ?? '' }),
  })

  const companyCountry = computed({
    get: (): CountrySummary | null => {
      const code = filters.value.company_country_code
      return code ? (countries.byCode(code) ?? { code, name: code }) : null
    },
    set: (country: CountrySummary | null) => apply({ company_country_code: country?.code ?? '' }),
  })

  const sort = computed({
    get: () => filters.value.sort ?? '',
    set: (value: string) => apply({ sort: value as SortOption['value'] }),
  })

  function clearFilters() {
    search.value = ''
    debouncedSearch.cancel()
    apply({ q: '', company_id: null, company_name: '', company_country_code: '' })
  }

  /* ---------- Loading ---------- */

  const list = ref(null) as Ref<Paginated<T> | null>
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  let requestId = 0

  async function load() {
    if (options.ready && !options.ready()) return
    const id = ++requestId
    const f = filters.value
    const [sortField, direction] = (f.sort ?? '').split(':') as [
      PassportSort | undefined,
      'asc' | 'desc' | undefined,
    ]
    isLoading.value = true
    loadError.value = null
    try {
      const result = await fetchPage({
        ...options.fixed(),
        q: f.q || undefined,
        company_id: f.company_id ?? undefined,
        company_country_code: f.company_country_code || undefined,
        sort: sortField || undefined,
        direction: direction || undefined,
        page: f.page,
        per_page: perPage,
      })
      if (id !== requestId) return
      const { current_page, last_page } = result.meta
      // The page no longer exists (e.g. after its last passport moved on): go to the last one.
      if (result.data.length === 0 && current_page > last_page && last_page >= 1) {
        router.replace({ query: queryWith({ ...f, page: last_page }) })
        return
      }
      list.value = result
    } catch (error) {
      if (id !== requestId) return
      if (errorStatus(error) !== 401)
        loadError.value = errorMessage(error, 'Could not load the passports. Please try again.')
    } finally {
      if (id === requestId) isLoading.value = false
    }
  }

  // Reload when the URL changes, and when the page's fixed filters or readiness change
  // (e.g. a tab that only becomes known once its config has loaded).
  watch(
    () => [route.query, JSON.stringify(options.fixed()), options.ready?.() ?? true],
    () => {
      if (route.name === options.routeName) load()
    },
    { immediate: true },
  )

  const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

  return {
    filters,
    hasFilters,
    search,
    onSearchInput,
    company,
    companyCountry,
    sort,
    clearFilters,
    list,
    isLoading,
    loadError,
    load,
    pageLink,
    queryWith,
  }
}
