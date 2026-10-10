<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ArrowIcon from '@/components/ArrowIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import PassportTable from '@/components/PassportTable.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import { deletePassport, listPassports } from '@/api/passports'
import { searchReferences } from '@/api/references'
import { searchCompanies } from '@/api/companies'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus } from '@/lib/errors'
import { toApiDate, todayApiDate } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { useCountriesStore } from '@/stores/countries'
import { useWorkflowStore } from '@/stores/workflow'
import type { Paginated } from '@/types/auth'
import type { PassportEntry, ReferenceType } from '@/types/passport'
import type { CountrySummary } from '@/types/country'

const PER_PAGE = 15

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()
workflow.load()

const searchId = useId()
const typeId = useId()
const stageId = useId()
const fromId = useId()
const toId = useId()

/* ---------- Filters, kept in the URL query ---------- */

interface Filters {
  q: string
  reference_type: ReferenceType | ''
  reference_id: number | null
  /** Shown in the reference filter after a refresh (the API has no lookup by id). */
  reference_name: string
  company_id: number | null
  company_name: string
  /** 2-letter code of the company's country */
  company_country_code: string
  /** YYYY-MM-DD */
  received_from: string
  received_to: string
  /** Current step: a step key from the config, or 'completed'. */
  stage: string
  page: number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const positiveInt = (value: unknown) => {
  const n = Number(text(value))
  return Number.isInteger(n) && n > 0 ? n : null
}

const filters = computed<Filters>(() => {
  const query = route.query
  const type = text(query.reference_type)
  return {
    q: text(query.q).trim(),
    reference_type: type === 'person' || type === 'agency' ? type : '',
    reference_id: positiveInt(query.reference_id),
    reference_name: text(query.reference_name),
    company_id: positiveInt(query.company_id),
    company_name: text(query.company_name),
    company_country_code: /^[A-Z]{2}$/.test(text(query.company_country_code))
      ? text(query.company_country_code)
      : '',
    received_from: toApiDate(text(query.received_from)),
    received_to: toApiDate(text(query.received_to)),
    stage: /^[a-z_]+$/.test(text(query.stage)) ? text(query.stage) : '',
    page: positiveInt(query.page) ?? 1,
  }
})

const hasFilters = computed(() => {
  const f = filters.value
  return Boolean(
    f.q ||
    f.reference_type ||
    f.reference_id ||
    f.company_id ||
    f.company_country_code ||
    f.received_from ||
    f.received_to ||
    f.stage,
  )
})

/** Builds the URL query from the current filters plus `changes`. Changing a filter resets the page. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  if (next.q) query.q = next.q
  if (next.reference_type) query.reference_type = next.reference_type
  if (next.reference_id) {
    query.reference_id = String(next.reference_id)
    if (next.reference_name) query.reference_name = next.reference_name
  }
  if (next.company_id) {
    query.company_id = String(next.company_id)
    if (next.company_name) query.company_name = next.company_name
  }
  if (next.company_country_code) query.company_country_code = next.company_country_code
  if (next.received_from) query.received_from = next.received_from
  if (next.received_to) query.received_to = next.received_to
  if (next.stage) query.stage = next.stage
  if (next.page > 1) query.page = String(next.page)
  return query
}

function applyFilters(changes: Partial<Filters>, replace = false) {
  const location = { query: queryWith(changes) }
  return replace ? router.replace(location) : router.push(location)
}

// Search box: debounced, and `replace` so typing does not flood the browser history.
const search = ref(filters.value.q)
const debouncedSearch = useDebounce((value: string) => applyFilters({ q: value.trim() }, true), 300)
watch(
  () => filters.value.q,
  (q) => {
    if (q !== search.value.trim()) search.value = q
  },
)

const referenceType = computed({
  get: () => filters.value.reference_type,
  // References are filtered by type, so changing the type also clears the reference.
  set: (type: ReferenceType | '') =>
    applyFilters({ reference_type: type, reference_id: null, reference_name: '' }),
})

const referenceFilter = computed({
  get: () =>
    filters.value.reference_id
      ? { id: filters.value.reference_id, name: filters.value.reference_name || 'Selected' }
      : null,
  set: (item: { id: number; name: string } | null) =>
    applyFilters({ reference_id: item?.id ?? null, reference_name: item?.name ?? '' }),
})

interface CompanyFilterItem {
  id: number
  name: string
  country?: CountrySummary
}

const companySubtitle = (item: CompanyFilterItem) => item.country?.name

const companyFilter = computed({
  get: () =>
    filters.value.company_id
      ? { id: filters.value.company_id, name: filters.value.company_name || 'Selected' }
      : null,
  set: (item: CompanyFilterItem | null) =>
    applyFilters({ company_id: item?.id ?? null, company_name: item?.name ?? '' }),
})

const countries = useCountriesStore()
countries.load()

/** "All countries" when empty. Falls back to the code until the country list has loaded. */
/** Stage filter: the steps from the config (from Medical on), then Completed. */
workflow.loadConfig()
const stageOptions = computed(() => [
  { value: 'passport', label: 'Medical not started' },
  ...(workflow.config?.steps ?? [])
    .filter((s) => s.enabled && s.order > 1)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ value: s.key, label: s.label })),
  { value: 'completed', label: 'Completed' },
])

const stageFilter = computed({
  get: () => filters.value.stage,
  set: (stage: string) => applyFilters({ stage }),
})

const companyCountryFilter = computed({
  get: (): CountrySummary | null => {
    const code = filters.value.company_country_code
    if (!code) return null
    return countries.byCode(code) ?? { code, name: code }
  },
  set: (country: CountrySummary | null) =>
    applyFilters({ company_country_code: country?.code ?? '' }),
})

const fetchReferences = (q: string) =>
  searchReferences({ type: filters.value.reference_type || undefined, q })
const fetchCompanies = (q: string) => searchCompanies(q)

// Date range: applied on change, after checking that "to" is not before "from".
const today = todayApiDate()
const dateFrom = ref(filters.value.received_from)
const dateTo = ref(filters.value.received_to)
const dateError = ref<string | null>(null)

watch(
  () => [filters.value.received_from, filters.value.received_to],
  ([from, to]) => {
    dateFrom.value = from ?? ''
    dateTo.value = to ?? ''
  },
)

function applyDates() {
  if (dateFrom.value && dateTo.value && dateTo.value < dateFrom.value) {
    dateError.value = '“To” must be on or after “From”.'
    return
  }
  dateError.value = null
  applyFilters({ received_from: dateFrom.value, received_to: dateTo.value })
}

function clearFilters() {
  search.value = ''
  dateError.value = null
  debouncedSearch.cancel()
  router.push({ query: {} })
}

/* ---------- Loading ---------- */

/**
 * A search with no result here may match a passport in the Unfit list (they are left out
 * of this list), so we check and say so.
 */
const unfitMatches = ref(0)

async function checkUnfitMatches(q: string, id: number) {
  try {
    const unfit = await listPassports({ q, medical_status: 'unfit', per_page: 1 })
    if (id === requestId) unfitMatches.value = unfit.meta.total
  } catch {
    // Only a hint: ignore failures.
  }
}

const list = ref<Paginated<PassportEntry> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listPassports({
      q: f.q || undefined,
      reference_type: f.reference_type || undefined,
      reference_id: f.reference_id ?? undefined,
      company_id: f.company_id ?? undefined,
      company_country_code: f.company_country_code || undefined,
      received_from: f.received_from || undefined,
      received_to: f.received_to || undefined,
      stage: f.stage || undefined,
      page: f.page,
      per_page: PER_PAGE,
    })
    if (id !== requestId) return
    const { current_page, last_page } = result.meta
    // The page no longer exists (e.g. after deleting its last entry): go to the last one.
    if (result.data.length === 0 && current_page > last_page && last_page >= 1) {
      router.replace({ query: queryWith({ ...f, page: last_page }) })
      return
    }
    list.value = result
    unfitMatches.value = 0
    if (result.data.length === 0 && f.q) checkUnfitMatches(f.q, id)
  } catch (error) {
    if (id !== requestId) return
    if (errorStatus(error) !== 401) {
      loadError.value = errorMessage(error, 'Could not load passport entries. Please try again.')
    }
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => route.query,
  () => {
    if (route.name === 'passports') load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ page }) })

/* ---------- Medical slip ---------- */

/** data_entry, admin and super_admin (everyone who can open this page) may add a slip. */
const slipOpen = ref(false)
const slipPassport = ref<PassportEntry | null>(null)

function openSlip(entry: PassportEntry) {
  slipPassport.value = entry
  slipOpen.value = true
}

/** The row's medical status changes ("Not started" → "Pending"): reload the page. */
function afterSlip() {
  load()
}

const slipAction = (entry: PassportEntry) =>
  entry.medical_status === 'not_started'
    ? 'Add medical slip'
    : entry.medical_status === 'pending'
      ? 'Edit slip'
      : null

const rowActionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50'

/* ---------- Delete ---------- */

const deleteTarget = ref<PassportEntry | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(entry: PassportEntry) {
  deleteTarget.value = entry
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const entry = deleteTarget.value
  if (!entry) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deletePassport(entry.id)
    deleteOpen.value = false
    toast.success(`Passport ${entry.passport_number} deleted.`)
    load()
    workflow.refresh()
  } catch (error) {
    const status = errorStatus(error)
    if (status === 404) {
      // Already gone: just refresh.
      deleteOpen.value = false
      load()
    } else if (status === 403) {
      deleteError.value = 'Only admins can delete passport entries.'
    } else if (status !== 401) {
      deleteError.value = errorMessage(error, 'Could not delete the entry. Please try again.')
    }
  } finally {
    deleteBusy.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Passport list</h1>
        <p class="mt-1 text-sm text-muted">
          Search and manage received passports.
          <RouterLink
            :to="{ name: 'all-passports' }"
            class="font-semibold text-primary-700 underline underline-offset-2"
            data-all-link
          >
            View all passports ({{ workflow.summary?.step1.total_all ?? '–' }})
          </RouterLink>
        </p>
      </div>
      <RouterLink :to="{ name: 'passport-new' }" class="btn btn-accent btn-icon">
        Add passport <ArrowIcon />
      </RouterLink>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-labelledby="passport-list-heading">
      <h2 id="passport-list-heading" class="sr-only">Passport entries</h2>

      <!-- Search and filters -->
      <div role="search" class="space-y-4">
        <div>
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Name, passport number, reference or company"
            :class="inputClass"
            @input="debouncedSearch.run(search)"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label :for="typeId" class="block text-sm font-medium text-slate-700">
              Reference type
            </label>
            <select :id="typeId" v-model="referenceType" :class="inputClass">
              <option value="">All</option>
              <option value="person">Person</option>
              <option value="agency">Agency</option>
            </select>
          </div>
          <SearchSelect
            :key="`reference-${filters.reference_type}`"
            v-model="referenceFilter"
            :fetch="fetchReferences"
            label="Reference"
            placeholder="Any reference"
            clearable
          />
          <SearchSelect
            v-model="companyFilter"
            :fetch="fetchCompanies"
            :subtitle-of="companySubtitle"
            label="Company"
            placeholder="Any company"
            clearable
          />
          <CountrySelect
            v-model="companyCountryFilter"
            label="Company country"
            placeholder="All countries"
            clearable
          />
          <div>
            <label :for="stageId" class="block text-sm font-medium text-slate-700">Stage</label>
            <select :id="stageId" v-model="stageFilter" :class="inputClass" data-stage-filter>
              <option value="">All stages</option>
              <option v-for="option in stageOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <fieldset class="min-w-0">
            <legend class="text-sm font-medium text-slate-700">Received date</legend>
            <div class="mt-1 grid grid-cols-2 gap-2">
              <div>
                <label :for="fromId" class="block text-xs text-muted">From</label>
                <input
                  :id="fromId"
                  v-model="dateFrom"
                  type="date"
                  :max="today"
                  :class="[inputClass, 'px-2']"
                  :aria-invalid="dateError ? 'true' : undefined"
                  :aria-describedby="dateError ? `${fromId}-error` : undefined"
                  @change="applyDates"
                />
              </div>
              <div>
                <label :for="toId" class="block text-xs text-muted">To</label>
                <input
                  :id="toId"
                  v-model="dateTo"
                  type="date"
                  :max="today"
                  :class="[inputClass, 'px-2']"
                  :aria-invalid="dateError ? 'true' : undefined"
                  :aria-describedby="dateError ? `${fromId}-error` : undefined"
                  @change="applyDates"
                />
              </div>
            </div>
            <p v-if="dateError" :id="`${fromId}-error`" class="mt-1 text-sm text-red-700">
              {{ dateError }}
            </p>
          </fieldset>
        </div>

        <button
          v-if="hasFilters"
          type="button"
          class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          @click="clearFilters"
        >
          Clear all filters
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <!-- Error -->
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <!-- First load: skeleton -->
        <div v-else-if="!list" class="animate-pulse space-y-3 py-4" aria-label="Loading passports">
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
            <div class="hidden h-4 w-1/5 rounded bg-slate-200 md:block" />
            <div class="hidden h-4 w-1/12 rounded bg-slate-200 md:block" />
          </div>
          <span class="sr-only">Loading passport entries…</span>
        </div>

        <!-- Empty -->
        <div v-else-if="list.data.length === 0" class="py-12 text-center">
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No entries match your filters.' : 'No passport entries yet.' }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{
              hasFilters ? 'Try other filters or clear them.' : 'Add the first received passport.'
            }}
          </p>
          <p
            v-if="unfitMatches > 0"
            class="mx-auto mt-3 max-w-md rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-900"
            data-unfit-hint
          >
            Not found here. Check
            <RouterLink
              :to="{ name: 'medical', query: { tab: 'unfit', q: filters.q } }"
              class="font-semibold underline underline-offset-2"
              >Medical → Unfit</RouterLink
            >.
          </p>
          <button
            v-if="hasFilters"
            type="button"
            class="btn btn-white mt-5 text-sm"
            @click="clearFilters"
          >
            Clear filters
          </button>
          <RouterLink v-else :to="{ name: 'passport-new' }" class="btn btn-accent mt-5 text-sm">
            Add passport
          </RouterLink>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <PassportTable
            :entries="list.data"
            :current-user-id="auth.user?.id ?? null"
            :columns="['reference', 'company', 'received', 'medical_status', 'stage', 'entered_by']"
            @delete="askDelete"
          >
            <template #extra-actions="{ entry }">
              <button
                v-if="slipAction(entry)"
                type="button"
                :class="[
                  rowActionClass,
                  entry.medical_status === 'not_started'
                    ? 'bg-accent-100 text-primary-900 hover:bg-accent-200'
                    : 'text-primary-700',
                ]"
                :data-slip-action="entry.id"
                @click="openSlip(entry)"
              >
                {{ slipAction(entry)
                }}<span class="sr-only"> for passport {{ entry.passport_number }}</span>
              </button>
            </template>
          </PassportTable>

          <nav
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <p class="text-sm text-muted">
              Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
            </p>
            <div class="flex items-center gap-2">
              <RouterLink
                v-if="list.meta.current_page > 1"
                :to="pageLink(list.meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="px-2 text-sm text-muted" aria-current="page">
                Page {{ list.meta.current_page }} of {{ list.meta.last_page }}
              </span>
              <RouterLink
                v-if="list.meta.current_page < list.meta.last_page"
                :to="pageLink(list.meta.current_page + 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>

    <MedicalSlipModal v-model:open="slipOpen" :passport="slipPassport" @saved="afterSlip" />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete passport entry"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete the entry for <strong>{{ deleteTarget.passport_name }}</strong> (passport
        <span class="font-mono">{{ deleteTarget.passport_number }}</span
        >)? It will disappear from the list.
      </p>
    </ConfirmDialog>
  </div>
</template>
