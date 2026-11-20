<script setup lang="ts">
import { usePerPage } from '@/composables/usePerPage'
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportTable from '@/components/PassportTable.vue'
import ReturnPassportDialog from '@/components/ReturnPassportDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalFitDialog from '@/components/MedicalFitDialog.vue'
import MedicalRetestDialog from '@/components/MedicalRetestDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import AgentFilterBar from '@/components/agents/AgentFilterBar.vue'
import RowMenu from '@/components/RowMenu.vue'
import type { PassportColumn } from '@/lib/passportColumns'
import { searchCompanies } from '@/api/companies'
import { searchMedicalCenters } from '@/api/medicalCenters'
import { cancelMedicalResult, recordMedicalResult } from '@/api/medical'
import { listPassports, updateEntryMode } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { toDisplayDate } from '@/lib/dates'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus, firstFieldError } from '@/lib/errors'
import { PASSPORT_MANAGER_ROLES, canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalCenterSummary, MedicalResult, MedicalStatus } from '@/types/medical'
import type { PassportPage } from '@/api/passports'
import type { AgentTabCounts } from '@/types/agents'
import { usePageHeading } from '@/composables/usePageHeading'
import type { CompanySummary, EntryMode, PassportEntry } from '@/types/passport'

/** Rows per page (the dropdown by the pagination): reload from page 1 when it changes. */
const perPage = usePerPage(() => load())

/**
 * Step 2: Medical. One tab per medical status. The tab and the searches (name / passport
 * number and Filter by company on every tab; medical centre and medical date range on
 * Pending; reference on the result tabs; combined with AND) live in the URL. No sorting: the API's
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
  'recruitment_agent',
  'medical_center',
  'issue_date',
  'days_left',
]
/** Tabs whose rows are marked Online. */
const MARK_TABS: TabKey[] = ['fit', 'expiring_soon']

const MEDICAL_COLUMNS: PassportColumn[] = [
  'reference',
  'company',
  'recruitment_agent',
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
    columns: [
      'reference',
      'company',
      'recruitment_agent',
      'medical_center',
      'slip_date',
      'medical_date',
      'received',
    ],
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

const SUBTITLE = 'Step 2: record fit or unfit results and follow up expiries.'
usePageHeading(() => ({ title: 'Medical', subtitle: SUBTITLE }))
workflow.load()

const tab = computed<Tab>(() => TABS.find((t) => t.key === route.query.tab) ?? TABS[0]!)

/** Query keys of older versions of this page; ignored and dropped from the URL. */
// Not company_id: it is the current company filter, and an "old" key here would stop the
// list from loading (the watcher below only rewrites the URL when it sees one).
const OLD_KEYS = ['sort', 'company_name', 'company_country_code', 'company']

const searchId = useId()
const referenceId = useId()
const medicalDateFromId = useId()
const medicalDateToId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  const companyId = Number(text(route.query.company_id))
  const medicalCenterId = Number(text(route.query.medical_center_id))
  const agentText = text(route.query.agent)
  const agentId = Number(agentText)
  return {
    /** The agent-wise tab: null (all agents), an agent id, or 'none' (no approved agent). */
    agent: (agentText === 'none'
      ? 'none'
      : Number.isInteger(agentId) && agentId > 0
        ? agentId
        : null) as number | 'none' | null,
    q: text(route.query.q).trim(),
    company_id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    reference: text(route.query.reference).trim(),
    medical_center_id:
      Number.isInteger(medicalCenterId) && medicalCenterId > 0 ? medicalCenterId : null,
    medical_date_from: text(route.query.medical_date_from).trim(),
    medical_date_to: text(route.query.medical_date_to).trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() => {
  const f = filters.value
  const base = Boolean(f.q || f.company_id || f.agent !== null)
  const pendingOnly =
    tab.value.key === 'pending' &&
    Boolean(f.medical_center_id || f.medical_date_from || f.medical_date_to)
  const nonPendingOnly = tab.value.key !== 'pending' && Boolean(f.reference)
  return base || pendingOnly || nonPendingOnly
})

/** How many search fields are in use (not the agent): shown on the Search filter button. */
const searchCount = computed(() => {
  const f = filters.value
  const pending = tab.value.key === 'pending'
  return [
    f.q,
    f.company_id,
    pending ? f.medical_center_id : null,
    pending ? f.medical_date_from || f.medical_date_to : null,
    pending ? null : f.reference,
  ].filter(Boolean).length
})

/** The search fields are shown on demand (Filters button); open while any is in use. */
const filtersOpen = ref(searchCount.value > 0)

/** The current query (the tab is kept) with `changes`; a search change goes back to page 1. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  const set = (key: string, value: string | number | null) => {
    if (!value || value === 1) delete query[key]
    else query[key] = String(value)
  }
  if (next.agent !== null) query.agent = String(next.agent)
  else delete query.agent
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
    query: queryWith({
      q: '',
      company_id: null,
      reference: '',
      medical_center_id: null,
      medical_date_from: '',
      medical_date_to: '',
    }),
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

function clearReference() {
  reference.value = ''
  debouncedReference.cancel()
  router.replace({ query: queryWith({ reference: '' }) })
}

/** The agent-wise tabs of the current Medical tab (from the same response). */
const agentCounts = shallowRef<AgentTabCounts | null>(null)
const agentFilter = computed({
  get: () => filters.value.agent,
  set: (agent: number | 'none' | null) => {
    router.replace({ query: queryWith({ agent }) })
  },
})

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
      recruitment_agent_id: f.agent ?? undefined,
      with_agent_counts: 1,
      ...(tab.value.key === 'pending'
        ? {
            medical_center_id: f.medical_center_id ?? undefined,
            medical_date_from: f.medical_date_from || undefined,
            medical_date_to: f.medical_date_to || undefined,
          }
        : {
            reference: f.reference || undefined,
          }),
      page: f.page,
      per_page: perPage.value,
    })
    if (id !== requestId) return
    const { current_page, last_page } = result.meta
    if (result.data.length === 0 && current_page > last_page && last_page >= 1) {
      router.replace({ query: queryWith({ ...f, page: last_page }) })
      return
    }
    list.value = result
    agentCounts.value = result.agent_counts ?? null
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

/** Data entry and the operations head may act; everyone else only reads. */
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

/* ---------- Pending: Fit / Unfit (the medical date is entered with the medical slip) ---------- */

const NEEDS_DATE = 'Add the medical date first (⋯ → Edit slip)'

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
    resultUndo(entry),
  )
  load()
  workflow.refresh()
}

/* ---------- Undo / cancel a result (the operations head, until Calling starts) ---------- */

/** The toast's Undo for a result just recorded: the operations head only. */
function resultUndo(entry: PassportEntry | null) {
  return entry && canUndo.value
    ? { duration: UNDO_MS, action: { label: 'Undo', run: () => cancelResult(entry) } }
    : undefined
}

/** Back to Medical → Pending; the cancelled result stays in the passport history. */
async function cancelResult(entry: PassportEntry) {
  try {
    await cancelMedicalResult(entry.id)
    toast.success(`${entry.passport_number}: result cancelled, back to Pending.`)
    load()
    workflow.refresh()
  } catch (error) {
    if (errorStatus(error) !== 401)
      toast.error(errorMessage(error, 'Could not cancel the result. Please try again.'))
  }
}

const cancelOpen = ref(false)
const cancelTarget = shallowRef<PassportEntry | null>(null)
const cancelBusy = ref(false)

function askCancel(entry: PassportEntry) {
  cancelTarget.value = entry
  cancelOpen.value = true
}

async function confirmCancel() {
  const entry = cancelTarget.value
  if (!entry) return
  cancelBusy.value = true
  await cancelResult(entry)
  cancelBusy.value = false
  cancelOpen.value = false
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
    toast.success(
      `${target.entry.passport_number} marked UNFIT. It is now in the Unfit tab.`,
      resultUndo(target.entry),
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

/* ---------- Fit / Expiring soon: mark Online ---------- */

/**
 * The only mark. The API sends no label before a passport is marked, so the button uses the
 * API's wording; the toast uses the label the API returns once it is marked.
 */
const ONLINE: { value: EntryMode; label: string } = { value: 'online', label: 'Online' }
/** How long the "Undo" toast stays. */
const UNDO_MS = 6000
/** Undo (clearing the Online mark) is for the operations head only; the API refuses others. */
const canUndo = computed(() => !!auth.user && PASSPORT_MANAGER_ROLES.includes(auth.user.role))

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

/* ---------- Re-test (the operations head; Unfit and Expired tabs) ---------- */

/** Tabs whose passports have a result to re-test (Fit / Expiring soon go on to Online). */
const RETEST_TABS: TabKey[] = ['unfit', 'expired']
const canRetest = (entry: PassportEntry) =>
  canUndo.value && RETEST_TABS.includes(tab.value.key) && !!entry.current_medical

const retestOpen = ref(false)
const retestPassport = ref<PassportEntry | null>(null)

function askRetest(entry: PassportEntry) {
  retestPassport.value = entry
  retestOpen.value = true
}

/** The re-test result moves the row (a fit one to the Fit tab, an unfit one stays). */
function onRetestSaved(result: MedicalResult) {
  const entry = retestPassport.value
  toast.success(
    result === 'fit'
      ? `${entry?.passport_number ?? 'Passport'}: re-test Fit. It is now in the Fit tab - mark it Online to send it to Calling.`
      : `${entry?.passport_number ?? 'Passport'}: re-test Unfit. It stays in the Unfit tab.`,
  )
  load()
  workflow.refresh()
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

/* ---------- Return (the operations head, any tab) ---------- */

const returnTarget = ref<PassportEntry | null>(null)
const returnOpen = ref(false)

function askReturn(entry: PassportEntry) {
  returnTarget.value = entry
  returnOpen.value = true
}

function afterReturn() {
  load()
  workflow.refresh()
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <!-- Config-driven step bar with counts; nothing after Flight (no "Completed"). -->
    <WorkflowStepper active-step="medical" hide-completed />

    <!-- The title and description show in the header bar; this heading is for screen readers. -->
    <h1 class="sr-only">Medical</h1>

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

      <div
        :id="`medical-panel-${tab.key}`"
        role="tabpanel"
        :aria-labelledby="`medical-tab-${tab.key}`"
        class="pt-5"
      >
        <!-- The agent cards, then the Search filter button (shows the search fields) -->
        <AgentFilterBar v-model="agentFilter" :counts="agentCounts" class="mb-3" />
        <div class="flex flex-wrap items-center gap-3" data-filter-bar>
          <button
            type="button"
            class="btn btn-primary text-sm"
            :aria-expanded="filtersOpen"
            aria-controls="medical-filters"
            data-filters-toggle
            @click="filtersOpen = !filtersOpen"
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
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Search filter
            <span
              v-if="searchCount"
              class="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-primary-900"
              data-filters-count
              >{{ searchCount }}</span
            >
          </button>
          <button
            v-if="hasFilters"
            type="button"
            class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
            @click="clearFilters"
          >
            Clear searches
          </button>
        </div>

        <div v-show="filtersOpen" id="medical-filters" role="search" class="mt-4 space-y-4">
          <!-- Pending: one row on wide screens (search · company · centre · date range) -->
          <div
            class="grid gap-4 sm:grid-cols-2"
            :class="tab.key === 'pending' ? 'lg:grid-cols-12' : 'lg:grid-cols-3'"
          >
            <div :class="tab.key === 'pending' ? 'lg:col-span-3' : ''">
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
              :class="tab.key === 'pending' ? 'lg:col-span-3' : ''"
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
                class="lg:col-span-2"
                :model-value="selectedMedicalCenter"
                :fetch="searchMedicalCenters"
                label="Filter by medical centre"
                placeholder="Search medical centre…"
                none-label="All centres"
                clearable
                data-medical-center-filter
                @update:model-value="onMedicalCenterSelected"
              />
              <!-- Medical date range: from – to in one field -->
              <fieldset class="sm:col-span-2 lg:col-span-4">
                <legend class="block text-sm font-medium text-slate-700">Medical date</legend>
                <div class="flex items-center gap-2">
                  <label :for="medicalDateFromId" class="sr-only">Medical date from</label>
                  <input
                    :id="medicalDateFromId"
                    v-model="medicalDateFrom"
                    type="date"
                    :max="medicalDateTo || undefined"
                    :class="[inputClass, 'min-w-0']"
                    data-medical-date-from
                    @change="applyDateFilters"
                  />
                  <span class="mt-1 text-slate-500" aria-hidden="true">–</span>
                  <label :for="medicalDateToId" class="sr-only">Medical date to</label>
                  <input
                    :id="medicalDateToId"
                    v-model="medicalDateTo"
                    type="date"
                    :min="medicalDateFrom || undefined"
                    :class="[inputClass, 'min-w-0']"
                    data-medical-date-to
                    @change="applyDateFilters"
                  />
                </div>
              </fieldset>
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
            </template>
          </div>
        </div>

        <div class="mt-5 border-t border-stroke pt-2">
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
              show-entry-no
              :default-actions="false"
              sticky-actions
            >
              <!-- Pending: the medical date (entered in the medical slip modal) -->
              <template #cell="{ entry, column }">
                <span
                  v-if="column === 'medical_date'"
                  class="whitespace-nowrap"
                  :class="{ 'text-muted': !entry.medical_date }"
                  data-medical-date
                  >{{ entry.medical_date ? toDisplayDate(entry.medical_date) : 'Not added' }}</span
                >
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
                <!-- Unfit / Expired: a re-test (the operations head) and Edit. -->
                <template v-else-if="canAct">
                  <button
                    v-if="canRetest(entry)"
                    type="button"
                    :class="[actionClass, 'bg-primary-900 text-white hover:bg-primary-700']"
                    :data-retest="entry.id"
                    @click="askRetest(entry)"
                  >
                    Re-test<span class="sr-only"> {{ entry.passport_number }}</span>
                  </button>
                  <RouterLink
                    v-if="entry.can.update"
                    :to="{ name: 'passport-edit', params: { id: entry.id } }"
                    :class="[actionClass, 'text-primary-700 hover:bg-primary-50']"
                  >
                    Edit<span class="sr-only"> passport {{ entry.passport_number }}</span>
                  </RouterLink>
                </template>
                <!-- More actions: Edit slip (Pending) and Return to owner -->
                <RowMenu
                  v-if="
                    (tab.key === 'pending' && canAct) ||
                    entry.can.return ||
                    entry.can.cancel_medical_result
                  "
                  :label="`More actions for ${entry.passport_number}`"
                >
                  <button
                    v-if="tab.key === 'pending' && canAct"
                    type="button"
                    role="menuitem"
                    class="block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-slate-50 text-primary-800"
                    data-edit-slip
                    @click="openSlip(entry)"
                  >
                    Edit slip
                  </button>
                  <button
                    v-if="tab.key !== 'pending' && entry.can.cancel_medical_result"
                    type="button"
                    role="menuitem"
                    class="block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-slate-50 text-red-800"
                    data-cancel-result
                    @click="askCancel(entry)"
                  >
                    Cancel result (back to Pending)
                  </button>
                  <button
                    v-if="entry.can.return"
                    type="button"
                    role="menuitem"
                    class="block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-slate-50 text-amber-800"
                    :data-return-action="entry.id"
                    @click="askReturn(entry)"
                  >
                    Return to owner
                  </button>
                </RowMenu>
              </template>
            </PassportTable>
          </PassportListBody>
        </div>
      </div>
    </section>

    <MedicalFitDialog v-model:open="fitOpen" :passport="fitPassport" @saved="onFitSaved" />

    <MedicalRetestDialog
      v-model:open="retestOpen"
      :passport="retestPassport"
      @saved="onRetestSaved"
    />

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

    <ConfirmDialog
      v-model:open="cancelOpen"
      :title="
        cancelTarget
          ? `Cancel the ${cancelTarget.current_medical?.result === 'unfit' ? 'UNFIT' : 'FIT'} result of ${cancelTarget.passport_name}?`
          : ''
      "
      confirm-label="Cancel result"
      danger
      :busy="cancelBusy"
      @confirm="confirmCancel"
    >
      The passport goes back to Medical → Pending so the right result can be entered. The cancelled
      result stays in the passport history.
    </ConfirmDialog>

    <MedicalSlipModal v-model:open="slipOpen" :passport="slipPassport" @saved="load" />

    <ReturnPassportDialog
      v-model:open="returnOpen"
      :passport="returnTarget"
      @returned="afterReturn"
    />
  </div>
</template>
