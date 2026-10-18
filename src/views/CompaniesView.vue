<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import { searchReferences } from '@/api/references'
import { downloadCompanyReportCsv, fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { useToast } from '@/composables/useToast'
import {
  COUNT_COLUMNS,
  balanceClass,
  countClass,
  countryName,
  formatBalance,
  nextSort,
  parseSort,
  rememberRows,
} from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import { canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { useCountriesStore } from '@/stores/countries'
import type { CompanySummary, ReferenceSummary } from '@/types/passport'
import type { CompanyReport, CompanyReportParams, CompanyReportSortKey } from '@/types/report'

/**
 * Companies: one row per company with its passport counts, quota and balance, plus a
 * totals row over every filtered company. Read-only for everyone (accounts included).
 * Always one country at a time: the default company country (settings, else Malaysia) unless
 * another is chosen. The company and reference filters (searchable dropdowns), country, sort and
 * page live in the URL. The reference filter counts only that reference's passports and lists only
 * companies that have some.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const countries = useCountriesStore()
const toast = useToast()

const countryId = useId()

/** Only data-entry users and admins may load the country list (and open passports). */
const isDataEntry = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})

/** Used when the settings cannot be read (accounts) or have no default company country. */
const FALLBACK_COUNTRY = 'MY'
/** The default company country; null until known, so the first request already uses it. */
const defaultCountry = ref<string | null>(isDataEntry.value ? null : FALLBACK_COUNTRY)
if (isDataEntry.value) {
  countries.load().finally(() => {
    defaultCountry.value = countries.defaults?.default_company_country_code || FALLBACK_COUNTRY
  })
}

/*
 * The dropdowns' options. Data-entry users and admins use the lookups; accounts cannot, so
 * they use the company report and the reports' reference options instead.
 */
async function searchReportCompanies(query: string): Promise<CompanySummary[]> {
  const { data } = await fetchCompanyReport({ search: query || undefined, per_page: 20 })
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    country: { code: c.country_code, name: countryName(c.country_code) },
  }))
}
const fetchCompanies = (query: string) =>
  isDataEntry.value ? searchCompanies(query) : searchReportCompanies(query)
/** With a company chosen, only references that have passports of that company. */
const fetchReferences = (query: string) => {
  const companyId = params.value.company_id
  return isDataEntry.value
    ? searchReferences({ q: query, company_id: companyId })
    : fetchReportReferences({ q: query, company_id: companyId })
}
const companySubtitle = (item: CompanySummary) => item.country?.name
const referenceSubtitle = (item: ReferenceSummary) => item.type_label

const report = shallowRef<CompanyReport | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const isExporting = ref(false)

/* ---------- Filters (in the URL) ---------- */

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** A positive whole number from the URL, else undefined. */
const idFrom = (value: unknown) => {
  const id = Number(text(value))
  return Number.isInteger(id) && id > 0 ? id : undefined
}

const params = computed<CompanyReportParams>(() => {
  const page = Number(text(route.query.page)) || 1
  return {
    company_id: idFrom(route.query.company_id),
    reference_id: idFrom(route.query.reference_id),
    country_code: text(route.query.country) || defaultCountry.value || undefined,
    sort: text(route.query.sort) || undefined,
    page: page > 1 ? page : undefined,
  }
})

const sort = computed(() => parseSort(route.query.sort))
const hasFilters = computed(() =>
  Boolean(params.value.company_id || params.value.reference_id || text(route.query.country)),
)

/** The chosen company and reference; after a reload their names come from the report. */
const selectedCompany = ref<CompanySummary | null>(null)
const selectedReference = ref<ReferenceSummary | null>(null)
const country = ref(params.value.country_code ?? '')

function queryWith(changes: Record<string, string | number | undefined>): LocationQuery {
  const query: LocationQuery = { ...route.query }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') delete query[key]
    else query[key] = String(value)
  }
  return query
}

/** A filter change goes back to page 1. */
function setFilter(changes: Record<string, string | undefined>) {
  router.replace({ query: queryWith({ ...changes, page: undefined }) })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  setFilter({ company_id: value ? String(value.id) : undefined })
}

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  setFilter({ reference_id: value ? String(value.id) : undefined })
}

watch(country, (code) => {
  if (code !== params.value.country_code) {
    // A company of another country would leave the list empty.
    selectedCompany.value = null
    setFilter({ country: code === defaultCountry.value ? undefined : code, company_id: undefined })
  }
})

/** Clears the company and reference filters and goes back to the default country. */
function clearFilters() {
  selectedCompany.value = null
  selectedReference.value = null
  setFilter({ company_id: undefined, reference_id: undefined, country: undefined })
}

function sortBy(key: CompanyReportSortKey) {
  const value = nextSort(text(route.query.sort), key)
  router.replace({
    query: queryWith({ sort: value === 'name' ? undefined : value, page: undefined }),
  })
}

const ariaSort = (key: CompanyReportSortKey) =>
  sort.value.key === key ? (sort.value.desc ? 'descending' : 'ascending') : undefined

const pageLink = (page: number) => ({ query: queryWith({ page: page > 1 ? page : undefined }) })

/* ---------- Loading ---------- */

/** Countries seen in the report, for users who cannot load the country list. */
const seenCountries = ref(new Set<string>())

const countryOptions = computed(() => {
  if (isDataEntry.value && countries.countries.length > 0)
    return countries.countries.map((c) => ({ code: c.code, name: c.name }))
  const codes = new Set(seenCountries.value)
  if (country.value) codes.add(country.value)
  return [...codes]
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchCompanyReport(params.value)
    if (id !== requestId) return
    report.value = result
    rememberRows(result.data)
    const { company, reference } = result.filters ?? {}
    if (company && selectedCompany.value?.id !== company.id)
      selectedCompany.value = {
        id: company.id,
        name: company.name,
        country: { code: company.country_code, name: countryName(company.country_code) },
      }
    if (reference && selectedReference.value?.id !== reference.id)
      selectedReference.value = reference
    const codes = new Set(seenCountries.value)
    for (const row of result.data) codes.add(row.country_code)
    seenCountries.value = codes
  } catch (error) {
    if (id !== requestId) return
    loadError.value = errorMessage(error, 'Could not load the companies. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(params.value),
  () => {
    // Back / forward: drop a selection the URL no longer has.
    if (!params.value.company_id) selectedCompany.value = null
    if (!params.value.reference_id) selectedReference.value = null
    country.value = params.value.country_code ?? ''
    // Wait for the default country, so the list never shows every country.
    if (params.value.country_code) load()
  },
  { immediate: true },
)

async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const { company_id, reference_id, country_code, sort: s } = params.value
    const fileName = await downloadCompanyReportCsv({
      company_id,
      reference_id,
      country_code,
      sort: s,
    })
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the companies. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

const rows = computed(() => report.value?.data ?? [])
const meta = computed(() => report.value?.meta ?? null)
const showingFrom = computed(() =>
  meta.value && meta.value.total > 0 ? (meta.value.current_page - 1) * meta.value.per_page + 1 : 0,
)
const showingTo = computed(() =>
  meta.value ? Math.min(meta.value.current_page * meta.value.per_page, meta.value.total) : 0,
)

const companyLink = (id: number) => ({ name: 'company-report', params: { id } })

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const th = 'px-3 py-3 font-semibold whitespace-nowrap'
const sortButton =
  'inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-primary-800'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Companies</h1>
        <p class="mt-1 text-sm text-muted">
          Passports per company, with each company's quota and balance.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-white text-sm"
        :disabled="isExporting || !report"
        data-export
        @click="exportCsv"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
        </svg>
        {{ isExporting ? 'Exporting…' : 'Export CSV' }}
      </button>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Companies">
      <!-- Filters -->
      <div role="search" class="flex flex-wrap items-end gap-4">
        <div class="w-full sm:w-72">
          <SearchSelect
            :model-value="selectedCompany"
            :fetch="fetchCompanies"
            :subtitle-of="companySubtitle"
            label="Filter by company"
            placeholder="Search company…"
            none-label="All companies"
            clearable
            data-company-filter
            @update:model-value="onCompanySelected"
          />
        </div>
        <div class="w-full sm:w-72">
          <SearchSelect
            :model-value="selectedReference"
            :fetch="fetchReferences"
            :subtitle-of="referenceSubtitle"
            label="Filter by reference"
            placeholder="Search reference…"
            none-label="All references"
            clearable
            data-reference-filter
            @update:model-value="onReferenceSelected"
          />
        </div>
        <div class="w-full sm:w-56">
          <label :for="countryId" class="block text-sm font-medium text-slate-700">Country</label>
          <select :id="countryId" v-model="country" :class="inputClass" data-country>
            <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }}</option>
          </select>
        </div>
        <button
          v-if="hasFilters"
          type="button"
          class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          data-clear-filters
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <!-- Error -->
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <!-- First load -->
        <div v-else-if="!report" class="animate-pulse space-y-3 py-4" data-skeleton>
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
            <div class="hidden h-4 w-1/6 rounded bg-slate-200 md:block" />
          </div>
          <span class="sr-only">Loading companies…</span>
        </div>

        <!-- Empty -->
        <div v-else-if="rows.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No companies match these filters.' : 'No companies yet.' }}
          </p>
          <p v-if="!hasFilters" class="mt-1 text-sm text-muted">
            Companies are added from the Add Passport form.
          </p>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" data-report-table>
              <caption class="sr-only">
                Companies with passport counts. Column headers sort the table.
              </caption>
              <thead class="border-b border-stroke text-xs text-muted">
                <tr>
                  <th scope="col" :class="th" :aria-sort="ariaSort('name')">
                    <button type="button" :class="sortButton" @click="sortBy('name')">
                      Company
                      <span aria-hidden="true">{{
                        sort.key === 'name' ? (sort.desc ? '↓' : '↑') : ''
                      }}</span>
                    </button>
                  </th>
                  <th scope="col" :class="[th, 'text-right']" :aria-sort="ariaSort('quota')">
                    <button type="button" :class="sortButton" @click="sortBy('quota')">
                      Quota
                      <span aria-hidden="true">{{
                        sort.key === 'quota' ? (sort.desc ? '↓' : '↑') : ''
                      }}</span>
                    </button>
                  </th>
                  <th
                    v-for="col in COUNT_COLUMNS"
                    :key="col.key"
                    scope="col"
                    :class="[th, 'text-right']"
                    :aria-sort="ariaSort(col.key)"
                  >
                    <button
                      type="button"
                      :class="sortButton"
                      :data-sort="col.key"
                      @click="sortBy(col.key)"
                    >
                      {{ col.label }}
                      <span aria-hidden="true">{{
                        sort.key === col.key ? (sort.desc ? '↓' : '↑') : ''
                      }}</span>
                    </button>
                  </th>
                  <th scope="col" :class="[th, 'text-right']" :aria-sort="ariaSort('balance')">
                    <button
                      type="button"
                      :class="sortButton"
                      data-sort="balance"
                      @click="sortBy('balance')"
                    >
                      Balance
                      <span aria-hidden="true">{{
                        sort.key === 'balance' ? (sort.desc ? '↓' : '↑') : ''
                      }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  class="cursor-pointer align-top hover:bg-primary-50/60"
                  :data-company-row="row.id"
                  @click="router.push(companyLink(row.id))"
                >
                  <th scope="row" class="px-3 py-3 text-left font-semibold">
                    <RouterLink
                      :to="companyLink(row.id)"
                      class="text-primary-800 underline-offset-4 hover:underline"
                      @click.stop
                    >
                      {{ row.name }}
                    </RouterLink>
                    <span class="block text-xs font-normal text-muted">
                      {{ countryName(row.country_code) }}
                    </span>
                  </th>
                  <td
                    class="px-3 py-3 text-right tabular-nums"
                    :class="row.quota ? 'text-ink' : 'text-slate-400'"
                  >
                    {{ row.quota ?? '—' }}
                  </td>
                  <td
                    v-for="col in COUNT_COLUMNS"
                    :key="col.key"
                    class="px-3 py-3 text-right tabular-nums"
                    :class="countClass(col.key, row[col.key])"
                    :data-count="col.key"
                  >
                    {{ row[col.key] }}
                  </td>
                  <td
                    class="px-3 py-3 text-right tabular-nums"
                    :class="balanceClass(row.balance)"
                    data-balance
                  >
                    {{ formatBalance(row.balance) }}
                    <span v-if="row.balance !== null && row.balance < 0" class="sr-only">
                      (over quota)
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="report.totals" class="border-t-2 border-primary-200 bg-primary-50/70">
                <tr class="font-semibold" data-totals>
                  <th scope="row" class="px-3 py-3 text-left text-ink">
                    Totals
                    <span class="block text-xs font-normal text-muted">
                      All {{ meta?.total ?? rows.length }}
                      {{ (meta?.total ?? rows.length) === 1 ? 'company' : 'companies' }}
                    </span>
                  </th>
                  <td class="px-3 py-3 text-right text-ink tabular-nums" data-total="quota">
                    {{ report.totals.quota ?? '—' }}
                  </td>
                  <td
                    v-for="col in COUNT_COLUMNS"
                    :key="col.key"
                    class="px-3 py-3 text-right tabular-nums"
                    :class="countClass(col.key, report.totals[col.key])"
                    :data-total="col.key"
                  >
                    {{ report.totals[col.key] }}
                  </td>
                  <td
                    class="px-3 py-3 text-right tabular-nums"
                    :class="balanceClass(report.totals.balance)"
                    data-total="balance"
                  >
                    {{ formatBalance(report.totals.balance) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <nav
            v-if="meta"
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <p class="text-sm text-muted">
              Showing {{ showingFrom }}–{{ showingTo }} of {{ meta.total }}
            </p>
            <div v-if="meta.last_page > 1" class="flex items-center gap-2">
              <RouterLink
                v-if="meta.current_page > 1"
                :to="pageLink(meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="text-sm text-muted">
                Page {{ meta.current_page }} of {{ meta.last_page }}
              </span>
              <RouterLink
                v-if="meta.current_page < meta.last_page"
                :to="pageLink(meta.current_page + 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>
  </div>
</template>
