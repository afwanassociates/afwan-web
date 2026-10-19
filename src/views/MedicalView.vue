<script setup lang="ts">
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportTable from '@/components/PassportTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalDateCell from '@/components/MedicalDateCell.vue'
import MedicalFitDialog from '@/components/MedicalFitDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import type { PassportColumn } from '@/lib/passportColumns'
import { searchCompanies } from '@/api/companies'
import { searchMedicalCenters } from '@/api/medicalCenters'
import { recordMedicalResult } from '@/api/medical'
import { listPassports, updateEntryMode } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus, firstFieldError } from '@/lib/errors'
import { ADMIN_ROLES, canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalCenterSummary, MedicalResult, MedicalStatus } from '@/types/medical'
import type { PassportPage } from '@/api/passports'
import type { CompanySummary, EntryMode, PassportEntry } from '@/types/passport'

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
/**
 * Fit and Expiring soon list only passports not marked yet: the result's dates and the medical
 * slip date. Marking one Online (the row's only button) sends it to Calling / Work
 * Permit, so it leaves these tabs.
 */
const MARK_COLUMNS: PassportColumn[] = [
  'reference',
  'company',
  'medical_center',
  'issue_date',
  'days_left',
]
/** Tabs whose rows are marked Online. */
const MARK_TABS: TabKey[] = ['fit', 'expiring_soon']

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
    columns: MARK_COLUMNS,
    emptyTitle: 'No fit passports waiting to be marked.',
  },
  {
    key: 'expiring_soon',
    label: 'Expiring soon',
    status: 'expiring_soon',
    columns: MARK_COLUMNS,
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
const OLD_KEYS = ['sort', 'company_id', 'company_name', 'company_country_code', 'company']

const searchId = useId()
const referenceId = useId()
const medicalDateFromId = useId()
const medicalDateToId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  const companyId = Number(text(route.query.company_id))
  const medicalCenterId = Number(text(route.query.medical_center_id))
  return {
    q: text(route.query.q).trim(),
    company_id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    reference: text(route.query.reference).trim(),
    medical_center_id: Number.isInteger(medicalCenterId) && medicalCenterId > 0 ? medicalCenterId : null,
    medical_date_from: text(route.query.medical_date_from).trim(),
    medical_date_to: text(route.query.medical_date_to).trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() => {
  const f = filters.value
  const base = Boolean(f.q || f.company_id)
  const pendingOnly = tab.value.key === 'pending' &&
    Boolean(f.medical_center_id || f.medical_date_from || f.medical_date_to)
  const nonPendingOnly = tab.value.key !== 'pending' && Boolean(f.reference)
  return base || pendingOnly || nonPendingOnly
})

/** The current query (the tab is kept) with `changes`; a search change goes back to page 1. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  const set = (key: string, value: string | number | null) => {
    if (!value || value === 1) delete query[key]
    else query[key] = String(value)
  }
  set('q', next.q)
  set('company_id', next.company_id)
  if (next.reference) query.reference = next.reference
  else delete query.reference
  set('medical_center_id', next.medical_center_id)
  if (next.medical_date_from) query.medical_date_from = next.medical_date_from
  else delete query.medical_date_from
  if (next.medical_date_to) query.medical_date_to = next.medical_date_to
  else delete query.medical_date_to
  set('page', next.page)
  return query
}

/* ---------- The searches ---------- */

const search = ref(filters.value.q)
const selectedCompany = ref<CompanySummary | null>(null)
const reference = ref(filters.value.reference)
const selectedMedicalCenter = ref<MedicalCenterSummary | null>(null)
const medicalDateFrom = ref(filters.value.medical_date_from)
const medicalDateTo = ref(filters.value.medical_date_to)

const debouncedSearch = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)
const debouncedReference = useDebounce(
  () => router.replace({ query: queryWith({ reference: reference.value.trim() }) }),
  300,
)

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  router.replace({ query: queryWith({ company_id: value?.id ?? null }) })
}

function onMedicalCenterSelected(value: MedicalCenterSummary | null) {
  selectedMedicalCenter.value = value
  router.replace({ query: queryWith({ medical_center_id: value?.id ?? null }) })
}

function applyDateFilters() {
  router.replace({
    query: queryWith({
      medical_date_from: medicalDateFrom.value,
      medical_date_to: medicalDateTo.value,
    }),
  })
}

function clearFilters() {
  search.value = ''
  selectedCompany.value = null
  reference.value = ''
  selectedMedicalCenter.value = null
  medicalDateFrom.value = ''
  medicalDateTo.value = ''
  debouncedSearch.cancel()
  debouncedReference.cancel()
  router.replace({
    query: queryWith({ q: '', company_id: null, reference: '', medical_center_id: null, medical_date_from: '', medical_date_to: '' }),
  })
}

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (!f.company_id && selectedCompany.value) selectedCompany.value = null
  if (f.reference !== reference.value.trim()) reference.value = f.reference
  if (!f.medical_center_id && selectedMedicalCenter.value) selectedMedicalCenter.value = null
  if (f.medical_date_from !== medicalDateFrom.value) medicalDateFrom.value = f.medical_date_from
  if (f.medical_date_to !== medicalDateTo.value) medicalDateTo.value = f.medical_date_to
})

/* ---------- Loading ---------- */

const list = shallowRef<PassportPage | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

const showMarks = computed(() => MARK_TABS.includes(tab.value.key))

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
      company_id: f.company_id ?? undefined,
      ...(tab.value.key === 'pending' ? {
        medical_center_id: f.medical_center_id ?? undefined,
        medical_date_from: f.medical_date_from || undefined,
        medical_date_to: f.medical_date_to || undefined,
      } : {
        reference: f.reference || undefined,
      }),
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
    ? 'Check the name or passport number, company, medical centre and date searches, or clear them.'
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
  const base: LocationQuery = { ...queryWith({}) }
  if (key !== 'pending') {
    // Clear pending-only filters when leaving pending.
    delete base.medical_center_id
    delete base.medical_date_from
    delete base.medical_date_to
    selectedMedicalCenter.value = null
    medicalDateFrom.value = ''
    medicalDateTo.value = ''
  } else {
    // Clear non-pending filters when entering pending.
    delete base.reference
    reference.value = ''
    debouncedReference.cancel()
  }
  if (key === 'pending') delete base.tab
  else base.tab = key
  router.push({ query: base })
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

const fitOpen = ref(false)
const fitPassport = ref<PassportEntry | null>(null)

/** Fit: issue and expiry dates first; the passport then waits on the Fit tab for its mark. */
function onFitSaved() {
  const entry = fitPassport.value
  toast.success(
    `${entry?.passport_number ?? 'Passport'}: Moved to Fit - mark Online to send it to Calling`,
  )
  load()
  workflow.refresh()
}

function askResult(entry: PassportEntry, result: MedicalResult) {
  if (!entry.medical_date) return
  if (result === 'fit') {
    fitPassport.value = entry
    fitOpen.value = true
    return
  }
  confirmTarget.value = { entry, result }
  confirmError.value = null
  confirmOpen.value = true
}

/** Unfit (a simple confirm) moves the row to the Unfit tab, out of the main lists. */
async function confirmResult() {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  confirmError.value = null
  try {
    await recordMedicalResult(target.entry.id, target.result)
    confirmOpen.value = false
    toast.success(`${target.entry.passport_number} marked UNFIT. It is now in the Unfit tab.`)
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

/* ---------- Fit / Expiring soon: mark Online ---------- */

/**
 * The only mark. The API sends no label before a passport is marked, so the button uses the
 * API's wording; the toast uses the label the API returns once it is marked.
 */
const ONLINE: { value: EntryMode; label: string } = { value: 'online', label: 'Online' }
/** How long the "Undo" toast stays. */
const UNDO_MS = 6000
/** Undo (clearing the Online mark) is for admin and super_admin only; the API refuses others. */
const canUndo = computed(() => !!auth.user && ADMIN_ROLES.includes(auth.user.role))

/** Passports with a mark request running (no double clicks). */
const marking = ref(new Set<number>())

function setMarking(id: number, on: boolean) {
  const next = new Set(marking.value)
  if (on) next.add(id)
  else next.delete(id)
  marking.value = next
}

/** After a mark or its undo: the list, the tab counts and the step bar / sidebar counts. */
function afterMarkChange() {
  load()
  workflow.refresh()
}

/**
 * Marks the passport: the row leaves the tab at once (optimistic) and the passport moves to
 * Calling / Work Permit. On an error the row comes back. The toast offers admins Undo for a while.
 */
async function mark(entry: PassportEntry, mode: EntryMode) {
  if (marking.value.has(entry.id) || !list.value) return
  setMarking(entry.id, true)
  const before = list.value
  list.value = { ...before, data: before.data.filter((e) => e.id !== entry.id) }
  try {
    const updated = await updateEntryMode(entry.id, mode)
    const label = updated.entry_mode?.label ?? ONLINE.label
    toast.success(`${entry.passport_number}: Moved to Calling / Work Permit (${label})`, {
      duration: UNDO_MS,
      ...(canUndo.value ? { action: { label: 'Undo', run: () => undoMark(entry) } } : {}),
    })
    afterMarkChange()
  } catch (error) {
    // Roll back: the row returns where it was.
    if (list.value && !list.value.data.some((e) => e.id === entry.id)) list.value = before
    const status = errorStatus(error)
    if (status === 403) toast.error('You are not allowed to mark passports Online.')
    else if (status !== 401)
      toast.error(
        firstFieldError(error, 'entry_mode') ??
          errorMessage(error, 'Could not save the mark. Please try again.'),
      )
  } finally {
    setMarking(entry.id, false)
  }
}

/** Undo: clears the mark (entry_mode null), which puts the passport back on the Fit tab. */
async function undoMark(entry: PassportEntry) {
  try {
    await updateEntryMode(entry.id, null)
    toast.success(`${entry.passport_number}: back on the Fit tab.`)
  } catch (error) {
    toast.error(
      firstFieldError(error, 'entry_mode') ??
        errorMessage(error, 'Could not undo the mark. Please try again.'),
    )
  } finally {
    afterMarkChange()
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
          Add their slip from the Passport Entry List
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
            <SearchSelect
              :model-value="selectedCompany"
              :fetch="searchCompanies"
              label="Filter by company"
              placeholder="Search company…"
              none-label="All companies"
              clearable
              data-company-filter
              @update:model-value="onCompanySelected"
            />
            <template v-if="tab.key === 'pending'">
              <SearchSelect
                :model-value="selectedMedicalCenter"
                :fetch="searchMedicalCenters"
                label="Filter by medical centre"
                placeholder="Search medical centre…"
                none-label="All centres"
                clearable
                data-medical-center-filter
                @update:model-value="onMedicalCenterSelected"
              />
              <div>
                <label :for="medicalDateFromId" class="block text-sm font-medium text-slate-700">
                  Medical date from
                </label>
                <input
                  :id="medicalDateFromId"
                  v-model="medicalDateFrom"
                  type="date"
                  :max="medicalDateTo || undefined"
                  :class="inputClass"
                  data-medical-date-from
                  @change="applyDateFilters"
                />
              </div>
              <div>
                <label :for="medicalDateToId" class="block text-sm font-medium text-slate-700">
                  Medical date to
                </label>
                <input
                  :id="medicalDateToId"
                  v-model="medicalDateTo"
                  type="date"
                  :min="medicalDateFrom || undefined"
                  :class="inputClass"
                  data-medical-date-to
                  @change="applyDateFilters"
                />
              </div>
            </template>
            <template v-else>
              <div class="relative">
                <label :for="referenceId" class="block text-sm font-medium text-slate-700">
                  Search reference
                </label>
                <input
                  :id="referenceId"
                  v-model="reference"
                  type="text"
                  autocomplete="off"
                  placeholder="Reference name"
                  :class="[inputClass, 'pr-10']"
                  data-reference-search
                  @input="debouncedReference.run()"
                />
                <button
                  v-if="reference"
                  type="button"
                  class="absolute bottom-0 right-1.5 mb-2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  data-clear-reference
                  @click="reference = ''; debouncedReference.cancel(); router.replace({ query: queryWith({ reference: '' }) })"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  <span class="sr-only">Clear reference search</span>
                </button>
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
              :default-actions="canAct && !showMarks"
              sticky-actions
            >
              <!-- Pending: the medical date can be entered inline. -->
              <template #cell="{ entry, column }">
                <MedicalDateCell
                  v-if="column === 'medical_date'"
                  :entry="entry"
                  :can-edit="canAct"
                  @saved="onDateSaved"
                />
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
                <!-- Fit / Expiring soon: the only action is the Online mark. -->
                <template v-else-if="showMarks && canAct">
                  <button
                    type="button"
                    :class="[
                      actionClass,
                      'bg-primary-900 text-white hover:bg-primary-700',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    ]"
                    :disabled="marking.has(entry.id)"
                    :data-mark="ONLINE.value"
                    @click="mark(entry, ONLINE.value)"
                  >
                    {{ ONLINE.label }}<span class="sr-only">{{ ` ${entry.passport_number}` }}</span>
                  </button>
                </template>
              </template>
            </PassportTable>
          </PassportListBody>
        </div>
      </div>
    </section>

    <MedicalFitDialog v-model:open="fitOpen" :passport="fitPassport" @saved="onFitSaved" />

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
