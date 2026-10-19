<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportOverviewTable from '@/components/PassportOverviewTable.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { searchCompanies } from '@/api/companies'
import { downloadPassportOverviewCsv, listPassportOverview } from '@/api/passports'
import { fetchCompanyReport } from '@/api/reports'
import { useDebounce } from '@/composables/useDebounce'
import { businessToday, datePresetRange, toDisplayDate } from '@/lib/dates'
import { useToast } from '@/composables/useToast'
import { countryName } from '@/lib/companyReport'
import { referenceSubtitle, searchReferenceOptions } from '@/lib/referenceOptions'
import { errorMessage, errorStatus } from '@/lib/errors'
import { canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { Paginated } from '@/types/auth'
import type { CompanySummary, PassportOverview, ReferenceSummary } from '@/types/passport'

/**
 * All Passports: a read-only overview of every passport in every status (unfit included),
 * each with one coloured "Latest status". No create, edit or delete controls, no sorting
 * (newest entered first) and no "Completed" bucket: Flight is the final step and shows
 * through the latest status. Three searches, all in the URL and combined (AND): ?q= (name
 * or passport number), ?reference= (part of the reference's name) and ?company= (part of
 * the company's name).
 */
const PER_PAGE = 15

/** Query keys of older versions of this page; ignored and dropped from the URL. */
const OLD_KEYS = [
  'status',
  'medical_status',
  'sort',
  'company_id',
  'company_name',
  'company_country_code',
  'company',
  // The old reference text search (now Filter by reference, ?reference_id=).
  'reference',
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

/**
 * Data-entry users and admins open passports and search the company lookup. Accounts read
 * this page only: no passport links, and companies come from the company report.
 */
const isDataEntry = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})

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

const searchId = useId()
const stageId = useId()
const dateId = useId()
const dateFromId = useId()
const dateToId = useId()

/* ---------- Step and date filters ---------- */

const workflow = useWorkflowStore()

/** Every step from the workflow (labels from the API), then Completed. */
const stageOptions = computed(() => [
  ...[...(workflow.summary?.steps ?? [])]
    .filter((s) => s.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ value: s.key, label: s.label })),
  { value: 'completed', label: 'Completed' },
])

const DATE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
] as const
type DateFilter = (typeof DATE_OPTIONS)[number]['value']
const isDateFilter = (value: string): value is DateFilter =>
  DATE_OPTIONS.some((o) => o.value === value)

/** With a company chosen, only references that have passports of that company. */
const fetchReferences = (query: string) =>
  searchReferenceOptions(query, isDataEntry.value, filters.value.company_id ?? undefined)

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  const companyId = Number(text(route.query.company_id))
  const referenceId = Number(text(route.query.reference_id))
  const date = text(route.query.date)
  return {
    q: text(route.query.q).trim(),
    stage: text(route.query.stage),
    date: isDateFilter(date) ? date : '',
    date_from: text(route.query.date_from),
    date_to: text(route.query.date_to),
    reference_id: Number.isInteger(referenceId) && referenceId > 0 ? referenceId : null,
    company_id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() =>
  Boolean(
    filters.value.q ||
    filters.value.reference_id ||
    filters.value.company_id ||
    filters.value.stage ||
    filters.value.date,
  ),
)

/**
 * The step status date range sent to the API: Today, This week (from Saturday) or This month
 * (from the 1st) end today in Dhaka; Custom range uses the From / To dates.
 */
const statusDates = computed(() => {
  const f = filters.value
  if (f.date === 'custom') return { from: f.date_from || undefined, to: f.date_to || undefined }
  if (f.date) {
    const { from, to } = datePresetRange(f.date, businessToday())
    return { from, to }
  }
  return { from: undefined, to: undefined }
})

/** The current query with `changes` applied; a search change goes back to page 1. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  const set = (key: string, value: string | number | null) => {
    if (!value || value === 1) delete query[key]
    else query[key] = String(value)
  }
  set('q', next.q)
  set('stage', next.stage)
  set('date', next.date)
  // From / To only for a custom range.
  set('date_from', next.date === 'custom' ? next.date_from : null)
  set('date_to', next.date === 'custom' ? next.date_to : null)
  set('reference_id', next.reference_id)
  set('company_id', next.company_id)
  set('page', next.page)
  return query
}

/* ---------- The searches (debounced, 300 ms) ---------- */

const search = ref(filters.value.q)
const selectedReference = ref<ReferenceSummary | null>(null)
const selectedCompany = ref<CompanySummary | null>(null)

const searchDebounce = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)
function onStageChange(event: Event) {
  router.replace({ query: queryWith({ stage: (event.target as HTMLSelectElement).value }) })
}

function onDateChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  router.replace({ query: queryWith({ date: isDateFilter(value) ? value : '' }) })
}

function onCustomDate(key: 'date_from' | 'date_to', event: Event) {
  router.replace({ query: queryWith({ [key]: (event.target as HTMLInputElement).value }) })
}

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  router.replace({ query: queryWith({ reference_id: value?.id ?? null }) })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  router.replace({ query: queryWith({ company_id: value?.id ?? null }) })
}

function clearFilters() {
  search.value = ''
  selectedReference.value = null
  selectedCompany.value = null
  searchDebounce.cancel()
  router.replace({
    query: queryWith({
      q: '',
      reference_id: null,
      company_id: null,
      stage: '',
      date: '',
      date_from: '',
      date_to: '',
    }),
  })
}

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (!f.reference_id && selectedReference.value) selectedReference.value = null
  if (!f.company_id && selectedCompany.value) selectedCompany.value = null
})

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<PassportOverview> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

/* ---------- Export ---------- */

const isExporting = ref(false)

/** Downloads every passport with the current searches as CSV. */
async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  const f = filters.value
  try {
    const fileName = await downloadPassportOverviewCsv({
      view: 'overview',
      medical_status: 'all',
      q: f.q || undefined,
      reference_id: f.reference_id ?? undefined,
      company_id: f.company_id ?? undefined,
      stage: f.stage || undefined,
      status_date_from: statusDates.value.from,
      status_date_to: statusDates.value.to,
    })
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the passports. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listPassportOverview({
      view: 'overview',
      medical_status: 'all',
      q: f.q || undefined,
      reference_id: f.reference_id ?? undefined,
      company_id: f.company_id ?? undefined,
      stage: f.stage || undefined,
      status_date_from: statusDates.value.from,
      status_date_to: statusDates.value.to,
      page: f.page,
      per_page: PER_PAGE,
    })
    if (id !== requestId) return
    const { current_page, last_page } = result.meta
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

watch(
  () => JSON.stringify(filters.value),
  () => {
    if (route.name === 'all-passports') load()
  },
  { immediate: true },
)

onMounted(() => {
  if (OLD_KEYS.some((key) => key in route.query)) router.replace({ query: queryWith({}) })
})

const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

const emptyTitle = computed(() =>
  hasFilters.value ? 'No passports match these searches.' : 'No passports yet.',
)
const emptyText = computed(() =>
  hasFilters.value
    ? 'Check the name or passport number, reference and company searches, or clear them.'
    : undefined,
)

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <!-- Overview: no step is highlighted, and no "Completed" bucket. -->
    <WorkflowStepper hide-completed />

    <div class="mt-6 flex flex-wrap items-end justify-between gap-4" data-page-header>
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">All Passports</h1>
        <p class="mt-1 text-sm text-muted">
          Every passport in every status, including unfit. Newest entered first.
        </p>
      </div>
      <!-- Every passport with the same searches, newest first. -->
      <button
        type="button"
        class="btn btn-white text-sm"
        :disabled="isExporting || !list"
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

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="All passports">
      <div role="search" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
            <input
              :id="searchId"
              v-model="search"
              type="search"
              autocomplete="off"
              placeholder="Name or passport number"
              :class="inputClass"
              data-search
              @input="searchDebounce.run()"
            />
          </div>
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
          <SearchSelect
            :model-value="selectedCompany"
            :fetch="fetchCompanies"
            label="Filter by company"
            placeholder="Search company…"
            none-label="All companies"
            clearable
            data-company-filter
            @update:model-value="onCompanySelected"
          />
        </div>
        <!-- Step and date (the date of the passport's current step status) -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label :for="stageId" class="block text-sm font-medium text-slate-700">Step</label>
            <select
              :id="stageId"
              :value="filters.stage"
              :class="inputClass"
              data-stage-filter
              @change="onStageChange"
            >
              <option value="">All steps</option>
              <option v-for="o in stageOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
          </div>
          <div>
            <label :for="dateId" class="block text-sm font-medium text-slate-700">Date</label>
            <select
              :id="dateId"
              :value="filters.date"
              :class="inputClass"
              :aria-describedby="`${dateId}-hint`"
              data-date-filter
              @change="onDateChange"
            >
              <option v-for="o in DATE_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <p :id="`${dateId}-hint`" class="mt-1 text-xs text-muted">
              <template v-if="statusDates.from || statusDates.to">
                {{ toDisplayDate(statusDates.from) || '…' }} –
                {{ toDisplayDate(statusDates.to) || '…' }} ·
              </template>
              date of the current step's status
            </p>
          </div>
          <template v-if="filters.date === 'custom'">
            <div>
              <label :for="dateFromId" class="block text-sm font-medium text-slate-700">From</label>
              <input
                :id="dateFromId"
                type="date"
                :value="filters.date_from"
                :max="filters.date_to || undefined"
                :class="inputClass"
                data-date-from
                @change="onCustomDate('date_from', $event)"
              />
            </div>
            <div>
              <label :for="dateToId" class="block text-sm font-medium text-slate-700">To</label>
              <input
                :id="dateToId"
                type="date"
                :value="filters.date_to"
                :min="filters.date_from || undefined"
                :class="inputClass"
                data-date-to
                @change="onCustomDate('date_to', $event)"
              />
            </div>
          </template>
        </div>
        <button
          v-if="hasFilters"
          type="button"
          class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          @click="clearFilters"
        >
          Clear searches
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2">
        <PassportListBody
          :list="list"
          :is-loading="isLoading"
          :load-error="loadError"
          :page-link="pageLink"
          :empty-title="emptyTitle"
          :empty-text="emptyText"
          @retry="load"
        >
          <PassportOverviewTable :entries="list?.data ?? []" :linked="isDataEntry" />
        </PassportListBody>
      </div>
    </section>
  </div>
</template>
