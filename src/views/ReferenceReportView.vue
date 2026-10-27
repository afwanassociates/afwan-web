<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import { searchReferences } from '@/api/references'
import {
  downloadReferenceReportCsv,
  fetchCompanyReport,
  fetchReferenceReport,
  fetchReportReferences,
} from '@/api/reports'
import { useToast } from '@/composables/useToast'
import {
  COUNT_COLUMNS,
  REFERENCE_SORTABLE,
  countClass,
  countryName,
  nextSort,
  parseSort,
  rememberReferenceRows,
} from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import { canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import type { CompanySummary, ReferenceSummary, ReferenceType } from '@/types/passport'
import type { ReferenceReport, ReferenceReportParams, ReferenceReportSortKey } from '@/types/report'

/**
 * References: one row per reference with its passport counts (the company report's columns,
 * without quota or balance), plus a totals row over every filtered reference. Read-only for
 * every staff role. The reference and company filters (searchable dropdowns), type, sort and
 * page live in the URL. The company filter counts only that company's passports and lists only
 * references that have some.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const typeId = useId()

/** Only the passport team may use the data-entry lookups. */
const isDataEntry = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})

/*
 * The dropdowns' options. The passport team uses the lookups; everyone else uses the reports'
 * reference options and the company report instead.
 */
async function searchReportCompanies(query: string): Promise<CompanySummary[]> {
  const { data } = await fetchCompanyReport({ search: query || undefined, per_page: 20 })
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    country: { code: c.country_code, name: countryName(c.country_code) },
  }))
}
const fetchReferences = (query: string) =>
  isDataEntry.value ? searchReferences({ q: query }) : fetchReportReferences({ q: query })
const fetchCompanies = (query: string) =>
  isDataEntry.value ? searchCompanies(query) : searchReportCompanies(query)
const referenceSubtitle = (item: ReferenceSummary) => item.type_label
const companySubtitle = (item: CompanySummary) => item.country?.name

const report = shallowRef<ReferenceReport | null>(null)
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

const params = computed<ReferenceReportParams>(() => {
  const page = Number(text(route.query.page)) || 1
  const type = text(route.query.type)
  return {
    reference_id: idFrom(route.query.reference_id),
    company_id: idFrom(route.query.company_id),
    type: type === 'person' || type === 'agency' ? type : undefined,
    sort: text(route.query.sort) || undefined,
    page: page > 1 ? page : undefined,
  }
})

const sort = computed(() => parseSort(route.query.sort, REFERENCE_SORTABLE))
const hasFilters = computed(() =>
  Boolean(params.value.reference_id || params.value.company_id || params.value.type),
)

/** The chosen reference and company; after a reload their names come from the report. */
const selectedReference = ref<ReferenceSummary | null>(null)
const selectedCompany = ref<CompanySummary | null>(null)

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

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  setFilter({ reference_id: value ? String(value.id) : undefined })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  setFilter({ company_id: value ? String(value.id) : undefined })
}

const type = computed({
  get: () => params.value.type ?? '',
  set: (value: '' | ReferenceType) => setFilter({ type: value || undefined }),
})

function clearFilters() {
  selectedReference.value = null
  selectedCompany.value = null
  setFilter({ reference_id: undefined, company_id: undefined, type: undefined })
}

function sortBy(key: ReferenceReportSortKey) {
  const value = nextSort(text(route.query.sort), key, REFERENCE_SORTABLE)
  router.replace({
    query: queryWith({ sort: value === 'name' ? undefined : value, page: undefined }),
  })
}

const ariaSort = (key: ReferenceReportSortKey) =>
  sort.value.key === key ? (sort.value.desc ? 'descending' : 'ascending') : undefined

const pageLink = (page: number) => ({ query: queryWith({ page: page > 1 ? page : undefined }) })

/* ---------- Loading ---------- */

let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchReferenceReport(params.value)
    if (id !== requestId) return
    report.value = result
    rememberReferenceRows(result.data)
    const { reference, company } = result.filters ?? {}
    if (reference && selectedReference.value?.id !== reference.id)
      selectedReference.value = reference
    if (company && selectedCompany.value?.id !== company.id)
      selectedCompany.value = {
        id: company.id,
        name: company.name,
        country: { code: company.country_code, name: countryName(company.country_code) },
      }
  } catch (error) {
    if (id !== requestId) return
    loadError.value = errorMessage(error, 'Could not load the references. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(params.value),
  () => {
    // Back / forward: drop a selection the URL no longer has.
    if (!params.value.reference_id) selectedReference.value = null
    if (!params.value.company_id) selectedCompany.value = null
    load()
  },
  { immediate: true },
)

async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const { reference_id, company_id, type: t, sort: s } = params.value
    const fileName = await downloadReferenceReportCsv({
      reference_id,
      company_id,
      type: t,
      sort: s,
    })
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the references. Please try again.'))
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

const referenceLink = (id: number) => ({ name: 'reference-report-detail', params: { id } })

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
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">References</h1>
        <p class="mt-1 text-sm text-muted">Passports per reference (person or agency).</p>
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

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="References">
      <!-- Filters -->
      <div role="search" class="flex flex-wrap items-end gap-4">
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
        <div class="w-full sm:w-44">
          <label :for="typeId" class="block text-sm font-medium text-slate-700">Type</label>
          <select :id="typeId" v-model="type" :class="inputClass" data-type-filter>
            <option value="">All</option>
            <option value="person">Person</option>
            <option value="agency">Agency</option>
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
          <span class="sr-only">Loading references…</span>
        </div>

        <!-- Empty -->
        <div v-else-if="rows.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No references match these filters.' : 'No references yet.' }}
          </p>
          <p v-if="!hasFilters" class="mt-1 text-sm text-muted">
            References are added from the Add Passport form.
          </p>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" data-report-table>
              <caption class="sr-only">
                References with passport counts. Column headers sort the table.
              </caption>
              <thead class="border-b border-stroke text-xs text-muted">
                <tr>
                  <th scope="col" :class="th" :aria-sort="ariaSort('name')">
                    <button type="button" :class="sortButton" @click="sortBy('name')">
                      Reference
                      <span aria-hidden="true">{{
                        sort.key === 'name' ? (sort.desc ? '↓' : '↑') : ''
                      }}</span>
                    </button>
                  </th>
                  <th scope="col" :class="th" :aria-sort="ariaSort('type')">
                    <button
                      type="button"
                      :class="sortButton"
                      data-sort="type"
                      @click="sortBy('type')"
                    >
                      Type
                      <span aria-hidden="true">{{
                        sort.key === 'type' ? (sort.desc ? '↓' : '↑') : ''
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
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  class="cursor-pointer align-top hover:bg-primary-50/60"
                  :data-reference-row="row.id"
                  @click="router.push(referenceLink(row.id))"
                >
                  <th scope="row" class="px-3 py-3 text-left font-semibold">
                    <RouterLink
                      :to="referenceLink(row.id)"
                      class="text-primary-800 underline-offset-4 hover:underline"
                      @click.stop
                    >
                      {{ row.name }}
                    </RouterLink>
                    <span v-if="row.phone" class="block text-xs font-normal text-muted">
                      {{ row.phone }}
                    </span>
                    <span v-if="!row.is_active" class="block text-xs font-normal text-muted">
                      Inactive
                    </span>
                  </th>
                  <td class="px-3 py-3 whitespace-nowrap text-slate-700">{{ row.type_label }}</td>
                  <td
                    v-for="col in COUNT_COLUMNS"
                    :key="col.key"
                    class="px-3 py-3 text-right tabular-nums"
                    :class="countClass(col.key, row[col.key])"
                    :data-count="col.key"
                  >
                    {{ row[col.key] }}
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="report.totals" class="border-t-2 border-primary-200 bg-primary-50/70">
                <tr class="font-semibold" data-totals>
                  <th scope="row" class="px-3 py-3 text-left text-ink">
                    Totals
                    <span class="block text-xs font-normal text-muted">
                      All {{ meta?.total ?? rows.length }}
                      {{ (meta?.total ?? rows.length) === 1 ? 'reference' : 'references' }}
                    </span>
                  </th>
                  <td class="px-3 py-3" />
                  <td
                    v-for="col in COUNT_COLUMNS"
                    :key="col.key"
                    class="px-3 py-3 text-right tabular-nums"
                    :class="countClass(col.key, report.totals[col.key])"
                    :data-total="col.key"
                  >
                    {{ report.totals[col.key] }}
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
