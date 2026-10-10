<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportOverviewTable from '@/components/PassportOverviewTable.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { listPassportOverview } from '@/api/passports'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { PassportOverview } from '@/types/passport'

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
  'stage',
  'medical_status',
  'sort',
  'company_id',
  'company_name',
  'company_country_code',
]

const route = useRoute()
const router = useRouter()

const searchId = useId()
const referenceId = useId()
const companyId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    reference: text(route.query.reference).trim(),
    company: text(route.query.company).trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() =>
  Boolean(filters.value.q || filters.value.reference || filters.value.company),
)

/** The current query with `changes` applied; a search change goes back to page 1. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  const set = (key: string, value: string | number) => {
    if (value === '' || value === 1) delete query[key]
    else query[key] = String(value)
  }
  set('q', next.q)
  set('reference', next.reference)
  set('company', next.company)
  set('page', next.page)
  return query
}

/* ---------- The three searches (debounced, 300 ms) ---------- */

const search = ref(filters.value.q)
const reference = ref(filters.value.reference)
const company = ref(filters.value.company)

const searchDebounce = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)
const referenceDebounce = useDebounce(
  () => router.replace({ query: queryWith({ reference: reference.value.trim() }) }),
  300,
)

const companyDebounce = useDebounce(
  () => router.replace({ query: queryWith({ company: company.value.trim() }) }),
  300,
)

function clearCompany() {
  company.value = ''
  companyDebounce.cancel()
  router.replace({ query: queryWith({ company: '' }) })
}

function clearReference() {
  reference.value = ''
  referenceDebounce.cancel()
  router.replace({ query: queryWith({ reference: '' }) })
}

function clearFilters() {
  search.value = ''
  reference.value = ''
  company.value = ''
  searchDebounce.cancel()
  referenceDebounce.cancel()
  companyDebounce.cancel()
  router.replace({ query: queryWith({ q: '', reference: '', company: '' }) })
}

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (f.reference !== reference.value.trim()) reference.value = f.reference
  if (f.company !== company.value.trim()) company.value = f.company
})

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<PassportOverview> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

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
      reference: f.reference || undefined,
      company: f.company || undefined,
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

    <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl">All Passports</h1>
    <p class="mt-1 text-sm text-muted">
      Every passport in every status, including unfit. Newest entered first.
    </p>

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
          <div>
            <label :for="referenceId" class="block text-sm font-medium text-slate-700">
              Search reference
            </label>
            <div class="relative">
              <input
                :id="referenceId"
                v-model="reference"
                type="text"
                autocomplete="off"
                placeholder="Reference name"
                :class="[inputClass, 'pr-10']"
                data-reference-search
                @input="referenceDebounce.run()"
                @keydown.esc="clearReference"
              />
              <button
                v-if="reference"
                type="button"
                class="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                data-clear-reference
                @click="clearReference"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span class="sr-only">Clear reference search</span>
              </button>
            </div>
          </div>
          <div>
            <label :for="companyId" class="block text-sm font-medium text-slate-700">
              Search company
            </label>
            <div class="relative">
              <input
                :id="companyId"
                v-model="company"
                type="text"
                autocomplete="off"
                placeholder="Company name"
                :class="[inputClass, 'pr-10']"
                data-company-search
                @input="companyDebounce.run()"
                @keydown.esc="clearCompany"
              />
              <button
                v-if="company"
                type="button"
                class="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                data-clear-company
                @click="clearCompany"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span class="sr-only">Clear company search</span>
              </button>
            </div>
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
          :empty-text="emptyText"
          @retry="load"
        >
          <PassportOverviewTable :entries="list?.data ?? []" />
        </PassportListBody>
      </div>
    </section>
  </div>
</template>
