<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ArrowIcon from '@/components/ArrowIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import PassportTable from '@/components/PassportTable.vue'
import { deletePassport, listPassports } from '@/api/passports'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { Paginated } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'

const PER_PAGE = 15

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()
workflow.load()

const searchId = useId()
const referenceId = useId()
const companyId = useId()

/**
 * This page lists only passports at the "Passport entered" stage: no medical slip date yet
 * (and so not unfit). Adding the medical slip moves a passport on to Medical → Pending.
 */
const STAGE = 'passport'

/* ---------- Filters, kept in the URL query ---------- */

/** Query keys of older versions of this page; ignored and dropped from the URL. */
const OLD_KEYS = [
  'reference_type',
  'reference_id',
  'reference_name',
  'company_id',
  'company_name',
  'company_country_code',
  'received_from',
  'received_to',
  'stage',
]

interface Filters {
  /** Name or passport number */
  q: string
  /** Part of the reference's name */
  reference: string
  /** Part of the company's name */
  company: string
  page: number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const positiveInt = (value: unknown) => {
  const n = Number(text(value))
  return Number.isInteger(n) && n > 0 ? n : null
}

const filters = computed<Filters>(() => ({
  q: text(route.query.q).trim(),
  reference: text(route.query.reference).trim(),
  company: text(route.query.company).trim(),
  page: positiveInt(route.query.page) ?? 1,
}))

const hasFilters = computed(() =>
  Boolean(filters.value.q || filters.value.reference || filters.value.company),
)

/** Builds the URL query from the current filters plus `changes`. Changing a search resets the page. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  if (next.q) query.q = next.q
  if (next.reference) query.reference = next.reference
  if (next.company) query.company = next.company
  if (next.page > 1) query.page = String(next.page)
  return query
}

// The three searches: debounced, and `replace` so typing does not flood the browser history.
const search = ref(filters.value.q)
const reference = ref(filters.value.reference)
const company = ref(filters.value.company)

/**
 * Puts all three typed searches in the URL at once, so typing in two boxes quickly cannot
 * lose one of them (each update would otherwise start from a URL the other has not yet
 * changed).
 */
function applySearches() {
  router.replace({
    query: queryWith({
      q: search.value.trim(),
      reference: reference.value.trim(),
      company: company.value.trim(),
    }),
  })
}

const debouncedSearch = useDebounce(applySearches, 300)
const debouncedReference = useDebounce(applySearches, 300)
const debouncedCompany = useDebounce(applySearches, 300)

function clearReference() {
  reference.value = ''
  debouncedReference.cancel()
  router.replace({ query: queryWith({ reference: '' }) })
}

function clearCompany() {
  company.value = ''
  debouncedCompany.cancel()
  router.replace({ query: queryWith({ company: '' }) })
}

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (f.reference !== reference.value.trim()) reference.value = f.reference
  if (f.company !== company.value.trim()) company.value = f.company
})

function clearFilters() {
  search.value = ''
  reference.value = ''
  company.value = ''
  debouncedSearch.cancel()
  debouncedReference.cancel()
  debouncedCompany.cancel()
  router.push({ query: {} })
}

/** "Search reference" and "Search company": same behaviour, different query key. */
const searchBoxes = [
  {
    key: 'reference',
    id: referenceId,
    label: 'Search reference',
    placeholder: 'Reference name',
    model: reference,
    onInput: (value: string) => {
      reference.value = value
      debouncedReference.run()
    },
    clear: clearReference,
  },
  {
    key: 'company',
    id: companyId,
    label: 'Search company',
    placeholder: 'Company name',
    model: company,
    onInput: (value: string) => {
      company.value = value
      debouncedCompany.run()
    },
    clear: clearCompany,
  },
]

onMounted(() => {
  if (OLD_KEYS.some((key) => key in route.query)) router.replace({ query: queryWith({}) })
})

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
      reference: f.reference || undefined,
      company: f.company || undefined,
      stage: STAGE,
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

/** The passport moved on to Medical → Pending: it leaves this list. Refresh list and counts. */
function afterSlip() {
  load()
  workflow.refresh()
}

// Everything here is "Passport entered", so the action is always "Add medical slip".
const slipAction = (entry: PassportEntry) =>
  entry.medical_status === 'not_started' ? 'Add medical slip' : null

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
          Passports entered, waiting for their medical slip.
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
      <!-- Search: name / passport number, reference and company (combined) -->
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
              @input="debouncedSearch.run()"
            />
          </div>
          <div v-for="box in searchBoxes" :key="box.key">
            <label :for="box.id" class="block text-sm font-medium text-slate-700">
              {{ box.label }}
            </label>
            <div class="relative">
              <input
                :id="box.id"
                :value="box.model.value"
                type="text"
                autocomplete="off"
                :placeholder="box.placeholder"
                :class="[inputClass, 'pr-10']"
                :data-search-box="box.key"
                @input="box.onInput(($event.target as HTMLInputElement).value)"
                @keydown.esc="box.clear"
              />
              <button
                v-if="box.model.value"
                type="button"
                class="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                :data-clear="box.key"
                @click="box.clear"
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
                <span class="sr-only">Clear {{ box.label.toLowerCase() }}</span>
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
        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{
              hasFilters
                ? 'No passports match these searches.'
                : 'No passports are waiting for a medical slip.'
            }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{
              hasFilters
                ? 'Check the name or passport number, reference and company searches, or clear them.'
                : 'New passports appear here until their medical slip is added.'
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
            Clear searches
          </button>
          <RouterLink v-else :to="{ name: 'passport-new' }" class="btn btn-accent mt-5 text-sm">
            Add passport
          </RouterLink>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <PassportTable
            :entries="list.data"
            :current-user-id="auth.user?.id ?? null"
            :columns="['reference', 'company', 'received', 'passport_entered', 'entered_by']"
            split-name-number
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

    <MedicalSlipModal
      v-model:open="slipOpen"
      :passport="slipPassport"
      success-message="Moved to Medical Pending"
      @saved="afterSlip"
    />

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
