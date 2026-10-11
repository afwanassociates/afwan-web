<script setup lang="ts">
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportTable from '@/components/PassportTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalDateCell from '@/components/MedicalDateCell.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import type { PassportColumn } from '@/lib/passportColumns'
import { recordMedicalResult } from '@/api/medical'
import { listPassports } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus } from '@/lib/errors'
import { canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalResult, MedicalStatus } from '@/types/medical'
import type { Paginated } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'

/**
 * Step 2: Medical. One tab per medical status. The tab and three searches (name / passport
 * number, company, reference; combined with AND) live in the URL. No sorting: the API's
 * fixed order (Pending: oldest medical slip date first; other tabs: newest first).
 */
type TabKey = 'pending' | 'fit' | 'expiring_soon' | 'expired' | 'unfit'

interface Tab {
  key: TabKey
  label: string
  status: MedicalStatus
  columns: PassportColumn[]
  emptyTitle: string
}

/** Read-only result tabs: the result's dates, no actions. */
const MEDICAL_COLUMNS: PassportColumn[] = [
  'reference',
  'company',
  'medical_center',
  'medical_date',
  'valid_until',
  'days_left',
]

const TABS: Tab[] = [
  {
    key: 'pending',
    label: 'Pending medical',
    status: 'pending',
    columns: ['reference', 'company', 'medical_center', 'slip_date', 'medical_date', 'received'],
    emptyTitle: 'No passports are waiting for a medical result.',
  },
  {
    key: 'fit',
    label: 'Fit (valid)',
    status: 'fit',
    columns: MEDICAL_COLUMNS,
    emptyTitle: 'No passports with a valid fit result.',
  },
  {
    key: 'expiring_soon',
    label: 'Expiring soon',
    status: 'expiring_soon',
    columns: MEDICAL_COLUMNS,
    emptyTitle: 'No fit results expire in the next 14 days.',
  },
  {
    key: 'expired',
    label: 'Expired',
    status: 'expired',
    columns: MEDICAL_COLUMNS,
    emptyTitle: 'No expired fit results.',
  },
  {
    // Unfit passports live only here: the Passport List leaves them out.
    key: 'unfit',
    label: 'Unfit',
    status: 'unfit',
    columns: ['reference', 'company', 'medical_center', 'medical_date', 'remarks', 'entered_by'],
    emptyTitle: 'No unfit passports.',
  },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workflow = useWorkflowStore()
workflow.load()

const tab = computed<Tab>(() => TABS.find((t) => t.key === route.query.tab) ?? TABS[0]!)

const PER_PAGE = 15

/** Query keys of older versions of this page; ignored and dropped from the URL. */
const OLD_KEYS = ['sort', 'company_id', 'company_name', 'company_country_code']

const searchId = useId()
const companyId = useId()
const referenceId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    company: text(route.query.company).trim(),
    reference: text(route.query.reference).trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() =>
  Boolean(filters.value.q || filters.value.company || filters.value.reference),
)

/** The current query (the tab is kept) with `changes`; a search change goes back to page 1. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  const set = (key: string, value: string | number) => {
    if (value === '' || value === 1) delete query[key]
    else query[key] = String(value)
  }
  set('q', next.q)
  set('company', next.company)
  set('reference', next.reference)
  set('page', next.page)
  return query
}

/* ---------- The three searches (debounced 300 ms) ---------- */

const search = ref(filters.value.q)
const company = ref(filters.value.company)
const reference = ref(filters.value.reference)

/** All three at once, so quick typing in two boxes cannot lose one of them. */
function applySearches() {
  router.replace({
    query: queryWith({
      q: search.value.trim(),
      company: company.value.trim(),
      reference: reference.value.trim(),
    }),
  })
}
const debouncedSearch = useDebounce(applySearches, 300)
const debouncedCompany = useDebounce(applySearches, 300)
const debouncedReference = useDebounce(applySearches, 300)

function clearCompany() {
  company.value = ''
  debouncedCompany.cancel()
  router.replace({ query: queryWith({ company: '' }) })
}

function clearReference() {
  reference.value = ''
  debouncedReference.cancel()
  router.replace({ query: queryWith({ reference: '' }) })
}

function clearFilters() {
  search.value = ''
  company.value = ''
  reference.value = ''
  debouncedSearch.cancel()
  debouncedCompany.cancel()
  debouncedReference.cancel()
  router.replace({ query: queryWith({ q: '', company: '', reference: '' }) })
}

/** "Search company" and "Search reference": same behaviour, different query key. */
const searchBoxes = [
  {
    key: 'company',
    id: companyId,
    label: 'Search company',
    placeholder: 'Company name',
    model: company,
    debounce: debouncedCompany,
    clear: clearCompany,
  },
  {
    key: 'reference',
    id: referenceId,
    label: 'Search reference',
    placeholder: 'Reference name',
    model: reference,
    debounce: debouncedReference,
    clear: clearReference,
  },
]

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (f.company !== company.value.trim()) company.value = f.company
  if (f.reference !== reference.value.trim()) reference.value = f.reference
})

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<PassportEntry> | null>(null)
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
      mode: 'medical',
      medical_status: tab.value.status,
      q: f.q || undefined,
      company: f.company || undefined,
      reference: f.reference || undefined,
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
  () => [route.query.tab, JSON.stringify(filters.value)],
  () => {
    if (route.name !== 'medical') return
    if (OLD_KEYS.some((key) => key in route.query)) {
      router.replace({ query: queryWith({}) })
      return
    }
    load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

const emptyTitle = computed(() =>
  hasFilters.value ? 'No passports match these searches.' : tab.value.emptyTitle,
)
const emptyText = computed(() =>
  hasFilters.value
    ? 'Check the name or passport number, company and reference searches, or clear them.'
    : undefined,
)

/** data_entry, admin and super_admin may act; accounts (and anyone else) only read. */
const canAct = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})
const canRecord = (entry: PassportEntry) => canAct.value && entry.can.record_medical

/**
 * Pending means "slip date entered, no result yet". A passport without a slip date is
 * "not started" and belongs to the Passport list only, so it is never shown here.
 */
const shownList = computed(() => {
  const value = list.value
  if (!value || tab.value.key !== 'pending') return value
  return { ...value, data: value.data.filter((e) => e.medical_status === 'pending') }
})

/** Passports whose medical has not started (no slip date): shown as a hint, not a tab. */
const notStarted = computed(() => workflow.summary?.step2.not_started ?? 0)

function countFor(key: TabKey): number | null {
  const step2 = workflow.summary?.step2
  return step2 ? step2[key] : null
}

/* ---------- Tabs (WAI-ARIA tabs; the selected tab is in ?tab=) ---------- */

const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabButtons')

function selectTab(key: TabKey) {
  if (key === tab.value.key) return
  // Keep the searches; the page belongs to the tab.
  const query: LocationQuery = { ...queryWith({}) }
  if (key === 'pending') delete query.tab
  else query.tab = key
  router.push({ query })
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = TABS[(index + step + TABS.length) % TABS.length]!
  selectTab(next.key)
  tabRefs.value?.[TABS.indexOf(next)]?.focus()
}

/* ---------- Pending: medical date, then Fit / Unfit ---------- */

const NEEDS_DATE = 'Enter the medical date first'

/** The date was saved: update the row in place (Fit / Unfit become available). */
function onDateSaved(updated: PassportEntry) {
  const value = list.value
  if (!value) return
  list.value = { ...value, data: value.data.map((e) => (e.id === updated.id ? updated : e)) }
}

const toast = useToast()
const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmError = ref<string | null>(null)
const confirmTarget = ref<{ entry: PassportEntry; result: MedicalResult } | null>(null)

function askResult(entry: PassportEntry, result: MedicalResult) {
  if (!entry.medical_date) return
  confirmTarget.value = { entry, result }
  confirmError.value = null
  confirmOpen.value = true
}

/** Fit moves the row to the Fit tab; Unfit to the Unfit tab (out of the main lists). */
async function confirmResult() {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  confirmError.value = null
  try {
    await recordMedicalResult(target.entry.id, target.result)
    confirmOpen.value = false
    toast.success(
      target.result === 'fit'
        ? `${target.entry.passport_number} marked FIT. It is now in the Fit tab.`
        : `${target.entry.passport_number} marked UNFIT. It is now in the Unfit tab.`,
    )
    load()
    workflow.refresh()
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) confirmError.value = errorMessage(error)
    else if (status === 403)
      confirmError.value = errorMessage(error, 'You are not allowed to record this result.')
    else if (status !== 401)
      confirmError.value = errorMessage(error, 'Could not save the result. Please try again.')
  } finally {
    confirmBusy.value = false
  }
}

/* ---------- Edit slip ---------- */

const slipOpen = ref(false)
const slipPassport = ref<PassportEntry | null>(null)

function openSlip(entry: PassportEntry) {
  slipPassport.value = entry
  slipOpen.value = true
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-offset-1'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <!-- Config-driven step bar with counts; nothing after Flight (no "Completed"). -->
    <WorkflowStepper active-step="medical" hide-completed />

    <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl">Medical</h1>
    <p class="mt-1 text-sm text-muted">
      Step 2: record fit or unfit results and follow up expiries.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6">
      <div class="-mx-4 overflow-x-auto border-b border-stroke px-4 sm:-mx-6 sm:px-6">
        <div role="tablist" aria-label="Medical status" class="flex min-w-max gap-1">
          <button
            v-for="(t, i) in TABS"
            :id="`medical-tab-${t.key}`"
            ref="tabButtons"
            :key="t.key"
            type="button"
            role="tab"
            :aria-selected="tab.key === t.key"
            :aria-controls="`medical-panel-${t.key}`"
            :tabindex="tab.key === t.key ? 0 : -1"
            class="-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap"
            :class="
              tab.key === t.key
                ? 'border-accent-500 text-primary-900'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-primary-900'
            "
            @click="selectTab(t.key)"
            @keydown="onTabKeydown($event, i)"
          >
            {{ t.label }}
            <span
              class="rounded-full px-2 py-0.5 text-xs tabular-nums"
              :class="
                t.key === 'pending' && countFor(t.key)
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-700'
              "
              data-tab-count
            >
              {{ countFor(t.key) ?? '–' }}
            </span>
          </button>
        </div>
      </div>

      <p
        v-if="tab.key === 'pending' && notStarted > 0"
        class="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
        data-not-started-hint
      >
        <span class="rounded-full bg-white px-2 py-0.5 text-xs font-semibold ring-1 ring-slate-300">
          {{ notStarted }} not started
        </span>
        Passports without a medical slip date are not listed here.
        <RouterLink
          :to="{ name: 'passports' }"
          class="font-semibold text-primary-700 underline underline-offset-2"
        >
          Add their slip from the Passport list
        </RouterLink>
      </p>

      <div
        :id="`medical-panel-${tab.key}`"
        role="tabpanel"
        :aria-labelledby="`medical-tab-${tab.key}`"
        class="pt-5"
      >
        <div role="search" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label :for="searchId" class="block text-sm font-medium text-slate-700">
                Search
              </label>
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
                  v-model="box.model.value"
                  type="text"
                  autocomplete="off"
                  :placeholder="box.placeholder"
                  :class="[inputClass, 'pr-10']"
                  :data-search-box="box.key"
                  @input="box.debounce.run()"
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

        <div class="mt-6 border-t border-stroke pt-2">
          <PassportListBody
            :list="shownList"
            :is-loading="isLoading"
            :load-error="loadError"
            :page-link="pageLink"
            :empty-title="emptyTitle"
            :empty-text="emptyText"
            @retry="load"
          >
            <PassportTable
              :entries="shownList?.data ?? []"
              :current-user-id="auth.user?.id ?? null"
              :columns="tab.columns"
              :custom-columns="tab.key === 'pending' ? ['medical_date'] : []"
              split-name-number
              :default-actions="canAct"
              sticky-actions
            >
              <!-- Pending: the medical date can be entered inline. -->
              <template #cell="{ entry }">
                <MedicalDateCell :entry="entry" :can-edit="canAct" @saved="onDateSaved" />
              </template>
              <template #actions="{ entry }">
                <template v-if="tab.key === 'pending' && canAct">
                  <span
                    v-for="result in ['fit', 'unfit'] as const"
                    :key="result"
                    :title="entry.medical_date ? undefined : NEEDS_DATE"
                    class="inline-flex"
                  >
                    <button
                      v-if="canRecord(entry)"
                      type="button"
                      :class="[
                        actionClass,
                        result === 'fit'
                          ? 'bg-green-700 text-white hover:bg-green-800'
                          : 'bg-red-700 text-white hover:bg-red-800',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      ]"
                      :disabled="!entry.medical_date"
                      :aria-describedby="entry.medical_date ? undefined : `needs-date-${entry.id}`"
                      :data-result="result"
                      @click="askResult(entry, result)"
                    >
                      {{ result === 'fit' ? 'Fit' : 'Unfit'
                      }}<span class="sr-only"> {{ entry.passport_number }}</span>
                    </button>
                  </span>
                  <span v-if="!entry.medical_date" :id="`needs-date-${entry.id}`" class="sr-only">
                    {{ NEEDS_DATE }}
                  </span>
                  <button
                    type="button"
                    :class="[actionClass, 'text-primary-700 hover:bg-primary-50']"
                    data-edit-slip
                    @click="openSlip(entry)"
                  >
                    Edit slip<span class="sr-only"> {{ entry.passport_number }}</span>
                  </button>
                </template>
              </template>
            </PassportTable>
          </PassportListBody>
        </div>
      </div>
    </section>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="
        confirmTarget
          ? `Mark ${confirmTarget.entry.passport_name} as ${confirmTarget.result.toUpperCase()}?`
          : ''
      "
      confirm-label="Confirm"
      :danger="confirmTarget?.result === 'unfit'"
      :busy="confirmBusy"
      :error="confirmError"
      @confirm="confirmResult"
    />

    <MedicalSlipModal v-model:open="slipOpen" :passport="slipPassport" @saved="load" />
  </div>
</template>
