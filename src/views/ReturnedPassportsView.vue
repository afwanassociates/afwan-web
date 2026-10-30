<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PassportListBody from '@/components/PassportListBody.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import {
  downloadReturnedPassportsCsv,
  listReturnedPassports,
  undoPassportReturn,
} from '@/api/passports'
import { fetchCompanyReport } from '@/api/reports'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { countryName } from '@/lib/companyReport'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { referenceSubtitle, searchReferenceOptions } from '@/lib/referenceOptions'
import { canAccessArea } from '@/lib/roles'
import { TABLE_HEAD } from '@/lib/tableClasses'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { Paginated } from '@/types/auth'
import type {
  CompanySummary,
  ReferenceSummary,
  ReturnedPassport,
  ReturnedPassportFilters,
} from '@/types/passport'

/**
 * Returned Passports: every passport handed back to its owner, newest return first. Read-only
 * for every staff role; the operations head may undo a return (the passport goes back to the
 * step it was at). Search, company, reference and return date range live in the URL.
 */
const PER_PAGE = 15

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()

const searchId = useId()
const dateFromId = useId()
const dateToId = useId()

/** The passport team opens passports and uses the lookups; others use the reports. */
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
const fetchReferences = (query: string) =>
  searchReferenceOptions(query, isDataEntry.value, filters.value.company_id ?? undefined)

/* ---------- Filters (in the URL) ---------- */

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const idFrom = (value: unknown) => {
  const id = Number(text(value))
  return Number.isInteger(id) && id > 0 ? id : null
}

const filters = computed(() => {
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    company_id: idFrom(route.query.company_id),
    reference_id: idFrom(route.query.reference_id),
    date_from: text(route.query.date_from),
    date_to: text(route.query.date_to),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() => {
  const f = filters.value
  return Boolean(f.q || f.company_id || f.reference_id || f.date_from || f.date_to)
})

function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  for (const [key, value] of Object.entries(next))
    if (value && value !== 1) query[key] = String(value)
  return query
}

/** The API query for the current filters (without the page). */
const apiFilters = computed<Omit<ReturnedPassportFilters, 'page' | 'per_page'>>(() => {
  const f = filters.value
  return {
    q: f.q || undefined,
    company_id: f.company_id ?? undefined,
    reference_id: f.reference_id ?? undefined,
    date_from: f.date_from || undefined,
    date_to: f.date_to || undefined,
  }
})

const search = ref(filters.value.q)
const selectedReference = ref<ReferenceSummary | null>(null)
const selectedCompany = ref<CompanySummary | null>(null)

const searchDebounce = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  router.replace({ query: queryWith({ reference_id: value?.id ?? null }) })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  router.replace({ query: queryWith({ company_id: value?.id ?? null }) })
}

function onDate(key: 'date_from' | 'date_to', event: Event) {
  router.replace({ query: queryWith({ [key]: (event.target as HTMLInputElement).value }) })
}

function clearFilters() {
  search.value = ''
  selectedReference.value = null
  selectedCompany.value = null
  searchDebounce.cancel()
  router.replace({ query: {} })
}

watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (!f.reference_id && selectedReference.value) selectedReference.value = null
  if (!f.company_id && selectedCompany.value) selectedCompany.value = null
})

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<ReturnedPassport> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listReturnedPassports({
      ...apiFilters.value,
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
      loadError.value = errorMessage(error, 'Could not load the returned passports.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(filters.value),
  () => {
    if (route.name === 'returned-passports') load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

/* ---------- Export ---------- */

const isExporting = ref(false)

async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const fileName = await downloadReturnedPassportsCsv(apiFilters.value)
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the returned passports. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

/* ---------- Undo return (the operations head) ---------- */

const undoTarget = ref<ReturnedPassport | null>(null)
const undoOpen = ref(false)
const undoBusy = ref(false)
const undoError = ref<string | null>(null)

function askUndo(row: ReturnedPassport) {
  undoTarget.value = row
  undoError.value = null
  undoOpen.value = true
}

async function confirmUndo() {
  const row = undoTarget.value
  if (!row) return
  undoBusy.value = true
  undoError.value = null
  try {
    await undoPassportReturn(row.passport.id)
    undoOpen.value = false
    toast.success(`${row.passport.passport_number}: back in ${row.stage_label}.`)
    load()
    workflow.refresh()
  } catch (error) {
    const code = errorStatus(error)
    if (code === 403) undoError.value = 'Only the Operations Head can undo a return.'
    else if (code !== 401)
      undoError.value = errorMessage(error, 'Could not undo the return. Please try again.')
  } finally {
    undoBusy.value = false
  }
}

const emptyTitle = computed(() =>
  hasFilters.value ? 'No returned passports match these searches.' : 'No passports returned yet.',
)

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const th = 'py-3 pr-4 font-semibold whitespace-nowrap'
const td = 'py-3 pr-4 text-slate-800'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4" data-page-header>
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Returned Passports</h1>
        <p class="mt-1 text-sm text-muted">
          Passports handed back to their owners. Newest return first.
        </p>
      </div>
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

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Returned passports">
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
            :model-value="selectedCompany"
            :fetch="fetchCompanies"
            label="Filter by company"
            placeholder="Search company…"
            none-label="All companies"
            clearable
            data-company-filter
            @update:model-value="onCompanySelected"
          />
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
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label :for="dateFromId" class="block text-sm font-medium text-slate-700">
              Returned from
            </label>
            <input
              :id="dateFromId"
              type="date"
              :value="filters.date_from"
              :max="filters.date_to || undefined"
              :class="inputClass"
              data-date-from
              @change="onDate('date_from', $event)"
            />
          </div>
          <div>
            <label :for="dateToId" class="block text-sm font-medium text-slate-700">
              Returned to
            </label>
            <input
              :id="dateToId"
              type="date"
              :value="filters.date_to"
              :min="filters.date_from || undefined"
              :class="inputClass"
              data-date-to
              @change="onDate('date_to', $event)"
            />
          </div>
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
          @retry="load"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="[th, 'text-right']">No.</th>
                  <th scope="col" :class="th">Passport</th>
                  <th scope="col" :class="th">Reference</th>
                  <th scope="col" :class="th">Company</th>
                  <th scope="col" :class="th">Was at</th>
                  <th scope="col" :class="th">Return date</th>
                  <th scope="col" :class="th">Receiver</th>
                  <th scope="col" :class="th">Phone</th>
                  <th scope="col" :class="th">NID / Passport no.</th>
                  <th scope="col" :class="th">Returned by</th>
                  <th scope="col" class="py-3 font-semibold">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="row in list?.data ?? []" :key="row.id" class="align-top" data-row>
                  <td :class="[td, 'text-right tabular-nums']">{{ row.passport.entry_no }}</td>
                  <td :class="td">
                    <RouterLink
                      v-if="isDataEntry"
                      :to="{ name: 'passport-detail', params: { id: row.passport.id } }"
                      class="rounded-sm font-semibold text-primary-900 underline-offset-4 hover:underline"
                    >
                      {{ row.passport.passport_name }}
                    </RouterLink>
                    <span v-else class="font-semibold text-primary-900">
                      {{ row.passport.passport_name }}
                    </span>
                    <span class="block font-mono text-xs tracking-wider text-slate-600">
                      {{ row.passport.passport_number }}
                    </span>
                  </td>
                  <td :class="td">{{ row.reference?.name ?? '—' }}</td>
                  <td :class="td">{{ row.company.name }}</td>
                  <td :class="[td, 'whitespace-nowrap']">{{ row.stage_label }}</td>
                  <td :class="[td, 'whitespace-nowrap']">{{ toDisplayDate(row.return_date) }}</td>
                  <td :class="td">{{ row.receiver_name }}</td>
                  <td :class="[td, 'whitespace-nowrap']">{{ row.receiver_phone }}</td>
                  <td :class="td">{{ row.receiver_id_no || '—' }}</td>
                  <td :class="td">{{ row.returned_by?.name ?? '—' }}</td>
                  <td class="py-3 text-right">
                    <button
                      v-if="row.can_undo"
                      type="button"
                      class="rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap text-primary-700 hover:bg-primary-50"
                      data-undo-return
                      @click="askUndo(row)"
                    >
                      Undo return<span class="sr-only"> {{ row.passport.passport_number }}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </PassportListBody>
      </div>
    </section>

    <ConfirmDialog
      v-model:open="undoOpen"
      title="Undo return"
      confirm-label="Undo return"
      :busy="undoBusy"
      :error="undoError"
      @confirm="confirmUndo"
    >
      <p v-if="undoTarget">
        Bring <strong>{{ undoTarget.passport.passport_name }}</strong> back into the workflow? It
        goes back to {{ undoTarget.stage_label }}, exactly where it was. The return stays in the
        history.
      </p>
    </ConfirmDialog>
  </div>
</template>
