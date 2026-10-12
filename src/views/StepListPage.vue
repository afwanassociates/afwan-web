<script setup lang="ts">
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import StepResultDialog from '@/components/StepResultDialog.vue'
import StepStartPopover from '@/components/StepStartPopover.vue'
import EntryModeBadge from '@/components/EntryModeBadge.vue'
import PassportListBody from '@/components/PassportListBody.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { deleteStepRecord, listStepPassports, startStep } from '@/api/steps'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { businessToday, daysLeft, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { staffTitle } from '@/lib/pageTitle'
import { ADMIN_ROLES, canAccessArea } from '@/lib/roles'
import { STICKY_ACTIONS, TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import { finalStatuses, isRecordStep, statusLabel } from '@/lib/workflow'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { StepFieldConfig, StepListResponse, StepListRow, StepListTab } from '@/types/workflow'

/**
 * One page per workflow step (Calling, Visa, BMET, Flight, …), built like the Medical page
 * and driven by the route's step key and GET /workflow/config: labels, statuses and fields.
 * A new step needs only config. Tabs come from the config (calling: Pending, Permitted; the
 * others Pending, then one per status). Tab, the three searches and the page live in the URL;
 * the API decides the order of each tab.
 */
const PER_PAGE = 15
/** Tabs for an API that does not send them yet. */
const DEFAULT_TAB_KEYS = ['pending', 'in_process', 'completed', 'rejected']
/** Column titles that read better than the generic one (by step key). */
const PREVIOUS_EXPIRY_LABEL: Record<string, string> = { visa: 'Calling permit expiry' }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workflow = useWorkflowStore()
const toast = useToast()
workflow.load()
workflow.loadConfig()

const searchId = useId()
const companyId = useId()
const referenceId = useId()

const stepKey = computed(() => String(route.params.step ?? ''))
const step = computed(() => {
  const s = workflow.stepConfig(stepKey.value)
  return s && isRecordStep(s) ? s : null
})
/** The config has loaded but has no such step. */
const unknownStep = computed(() => workflow.config !== null && step.value === null)

/**
 * The first recorded step (Calling / Work Permit): its passports carry the Online
 * mark from the Medical Fit tab (a "Mode" column), and only marked ones are pending.
 */
const recordSteps = computed(() =>
  [...(workflow.config?.steps ?? [])]
    .filter((s) => s.enabled && isRecordStep(s))
    .sort((a, b) => a.order - b.order),
)
const firstRecordStep = computed(() => recordSteps.value[0]?.key ?? null)
const isFirstStep = computed(() => firstRecordStep.value === stepKey.value)
/** The next recorded step (calling → visa). */
const nextStep = computed(() => {
  const steps = recordSteps.value
  const index = steps.findIndex((s) => s.key === stepKey.value)
  return index >= 0 ? (steps[index + 1] ?? null) : null
})

/** The step before this one (for the Pending tab's "<step> done" column). */
const previousStep = computed(() => {
  const steps = [...(workflow.config?.steps ?? [])]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
  const index = steps.findIndex((s) => s.key === stepKey.value)
  return index > 0 ? steps[index - 1]! : null
})

/** data_entry, admin and super_admin act; accounts (and anyone else) only read. */
const canAct = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})

/** The browser tab title is the step's name, e.g. "Visa | Staff portal | …". */
watch(
  () => step.value?.label,
  (label) => {
    if (label) document.title = staffTitle(label)
  },
  { immediate: true },
)

/* ---------- URL state: tab, searches, page ---------- */

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const filters = computed(() => {
  const page = Number(text(route.query.page))
  return {
    /** As written in the URL; `activeTab` is the checked one. */
    tab: text(route.query.tab),
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

function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  if (next.tab && next.tab !== tabs.value[0]?.key) query.tab = next.tab
  if (next.q) query.q = next.q
  if (next.company) query.company = next.company
  if (next.reference) query.reference = next.reference
  if (next.page > 1) query.page = String(next.page)
  return query
}

const search = ref(filters.value.q)
const company = ref(filters.value.company)
const reference = ref(filters.value.reference)

/** All three at once, so quick typing in two boxes cannot lose one. */
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

function clearBox(key: 'company' | 'reference') {
  if (key === 'company') {
    company.value = ''
    debouncedCompany.cancel()
  } else {
    reference.value = ''
    debouncedReference.cancel()
  }
  router.replace({ query: queryWith({ [key]: '' }) })
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

const searchBoxes = [
  {
    key: 'company' as const,
    id: companyId,
    label: 'Search company',
    placeholder: 'Company name',
    model: company,
    debounce: debouncedCompany,
  },
  {
    key: 'reference' as const,
    id: referenceId,
    label: 'Search reference',
    placeholder: 'Reference name',
    model: reference,
    debounce: debouncedReference,
  },
]

watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (f.company !== company.value.trim()) company.value = f.company
  if (f.reference !== reference.value.trim()) reference.value = f.reference
})

/* ---------- Tabs ---------- */

/** The config's tabs; for an older API: Pending, then one per status. */
const tabs = computed<{ key: StepListTab; label: string }[]>(() => {
  const s = step.value
  if (!s) return []
  if (s.tabs?.length) return s.tabs
  return [
    { key: 'pending', label: 'Pending' },
    ...s.statuses
      .filter((st) => DEFAULT_TAB_KEYS.includes(st.value))
      .map((st) => ({ key: st.value, label: st.label })),
  ]
})

/** The tab in the URL, or the first one. */
const activeTab = computed<StepListTab>(() => {
  const keys = tabs.value.map((t) => t.key)
  return keys.includes(filters.value.tab) ? filters.value.tab : (keys[0] ?? 'pending')
})
const isPendingTab = computed(() => activeTab.value === tabs.value[0]?.key)

/**
 * No "in process" tab (calling): started passports stay in Pending with their date, and the
 * result is entered there.
 */
const startedInPending = computed(() => !tabs.value.some((t) => t.key === 'in_process'))
/** One outcome only (calling: Permitted): its result is a "details" form, no reject. */
const singleOutcome = computed(() => (step.value ? finalStatuses(step.value).length === 1 : false))

const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabButtons')

function selectTab(key: StepListTab) {
  if (key === activeTab.value) return
  router.push({ query: queryWith({ tab: key }) })
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!move) return
  event.preventDefault()
  const list = tabs.value
  const next = list[(index + move + list.length) % list.length]!
  selectTab(next.key)
  tabRefs.value?.[list.indexOf(next)]?.focus()
}

/* ---------- Loading: the list and the tab counts ---------- */

const list = shallowRef<StepListResponse | null>(null)
const counts = ref<Record<StepListTab, number | undefined>>({})
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

const apiFilters = (f: Filters) => ({
  search: f.q || undefined,
  company: f.company || undefined,
  reference: f.reference || undefined,
})

async function load() {
  const key = stepKey.value
  if (!step.value) return
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listStepPassports(key, {
      tab: activeTab.value,
      ...apiFilters(f),
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
    // The API counts every tab (with the same searches); nothing is counted here.
    counts.value = result.tab_counts ?? {}
  } catch (error) {
    if (id !== requestId) return
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the passports. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => [stepKey.value, step.value !== null, activeTab.value, JSON.stringify(filters.value)],
  ([key], old) => {
    if (route.name !== 'step-page') return
    if (old && old[0] !== key) {
      list.value = null
      counts.value = {}
    }
    load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

/* ---------- Columns ---------- */

/** The step's own fields as columns, in config order (the step date first). */
const fieldColumns = computed<StepFieldConfig[]>(() => {
  const fields = step.value?.fields ?? []
  return [
    ...fields.filter((f) => f.name === 'step_date'),
    ...fields.filter((f) => f.name !== 'step_date'),
  ]
})

function fieldValue(row: StepListRow, field: StepFieldConfig): string {
  // "-" when missing (e.g. old records without a field), as on the Medical page.
  const record = row.record
  if (!record) return '-'
  const raw = field.in_details
    ? record.details?.[field.name]
    : (record as unknown as Record<string, unknown>)[field.name]
  if (typeof raw !== 'string' || !raw) return '-'
  return field.type === 'date' ? toDisplayDate(raw) || raw : raw
}

/** Pending, when started passports stay there (calling): the start fields (the calling date). */
const startColumns = computed(() =>
  fieldColumns.value.filter((f) => (f.phase ?? 'start') === 'start'),
)

/**
 * A valid-until (expiry) date: amber within the step's warning days, red once passed
 * (Dhaka calendar date).
 */
function expiryClass(row: StepListRow, field: StepFieldConfig): string | undefined {
  return field.name === 'valid_until' ? expiryTone(row.record?.valid_until) : undefined
}

/** Amber within the warning days, red once passed (Dhaka date); nothing otherwise. */
function expiryTone(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const left = daysLeft(value, businessToday())
  if (left === null) return undefined
  if (left < 0) return 'font-semibold text-red-700'
  if (left <= (step.value?.warning_days ?? 30)) return 'font-semibold text-amber-700'
  return undefined
}

/** The Online mark: on the step after the first recorded step (visa), not on Calling itself. */
const showMode = computed(
  () => previousStep.value !== null && previousStep.value.key === firstRecordStep.value,
)

/**
 * Pending of a later step whose passports arrive already started (visa, submitted from the
 * Calling page): the step before's expiry (the calling permit) is shown next to them.
 */
const previousExpiry = computed(() => {
  const prev = previousStep.value
  if (!startedInPending.value || isFirstStep.value || !prev) return null
  if (!prev.fields.some((f) => f.name === 'valid_until')) return null
  return PREVIOUS_EXPIRY_LABEL[stepKey.value] ?? `${prev.short_label} expiry`
})

const previousDoneLabel = computed(() =>
  previousStep.value ? `${previousStep.value.short_label} done` : 'Ready since',
)

/* ---------- Actions ---------- */

/** "Enter calling date": short labels like "BMET" keep their capitals. */
const startLabel = computed(() => {
  const short = step.value?.short_label ?? ''
  return `Enter ${short === short.toUpperCase() ? short : short.toLowerCase()} date`
})

type PopoverMode = 'start' | 'again' | 'update'
const start = ref<{
  row: StepListRow
  anchor: HTMLElement | null
  mode: PopoverMode
  /** "next": the next step's start, saved optimistically by this page (calling → visa). */
  next?: boolean
} | null>(null)

function openStart(row: StepListRow, event: Event, mode: PopoverMode, next = false) {
  start.value = { row, anchor: event.currentTarget as HTMLElement, mode, next }
}

/**
 * Saved in one update (calling): no "in process" tab and one outcome, so every Pending row
 * gets "Update calling" (the date and, all or none, the permit dates).
 */
const singleUpdate = computed(() => startedInPending.value && singleOutcome.value)
const updateLabel = computed(() => {
  const short = step.value?.short_label ?? ''
  return `Update ${short === short.toUpperCase() ? short : short.toLowerCase()}`
})

/** The next step's start date, e.g. "visa submitted date" (entered on the Permitted tab). */
const nextStartLabel = computed(() => {
  const next = nextStep.value
  const field = next?.fields.find((f) => f.name === 'step_date')
  return next ? (field?.label ?? `${next.short_label} date`).toLowerCase() : ''
})
/** The Permitted tab (calling) starts the next step. */
const isHandOverTab = computed(
  () => singleUpdate.value && !isPendingTab.value && nextStep.value !== null,
)

/** Tabs with row actions (for those who may act). */
const tabHasActions = computed(
  () =>
    canAct.value &&
    (isPendingTab.value ||
      activeTab.value === 'in_process' ||
      activeTab.value === 'rejected' ||
      isHandOverTab.value),
)

/** In Pending: started (in process) rows get the result; the others the start. */
const isStarted = (row: StepListRow) => row.record?.status === 'in_process'

const resultOpen = ref(false)
const resultRow = ref<StepListRow | null>(null)
const resultValue = ref<'completed' | 'rejected'>('completed')

function openResult(row: StepListRow, result: 'completed' | 'rejected') {
  resultRow.value = row
  resultValue.value = result
  resultOpen.value = true
}

/**
 * After any action: the list, the tab counts, the step bar and the sidebar counts.
 * (The popover and the dialog show the API warnings themselves.)
 */
function afterSave(row: StepListRow, message: string) {
  toast.success(`${row.passport_number}: ${message}`)
  load()
  workflow.refresh()
}

function onStarted() {
  const target = start.value
  const s = step.value
  if (!target || !s) return
  if (target.mode === 'update') {
    afterSave(target.row, `Moved to ${statusLabel(s, 'completed')}`)
    return
  }
  const started = statusLabel(s, 'in_process')
  // "Calling date entered" already names the step; "Submitted" reads "Visa submitted".
  afterSave(
    target.row,
    started.toLowerCase().includes(s.short_label.toLowerCase())
      ? `${started}.`
      : `${s.short_label} ${started.toLowerCase()}.`,
  )
}

function onResultSaved() {
  const row = resultRow.value
  if (!row || !step.value) return
  afterSave(row, `${step.value.short_label}: ${statusLabel(step.value, resultValue.value)}.`)
}

/* ---------- Permitted → the next step (optimistic, with Undo for admins) ---------- */

const UNDO_MS = 6000
/** Only admins may delete a step record, so only they get Undo. */
const canUndo = computed(() => !!auth.user && ADMIN_ROLES.includes(auth.user.role))

/**
 * Starts the next step (calling → visa) from the Permitted tab: the row leaves at once and
 * comes back on an error. The toast offers Undo to admins (deleting the new record).
 */
async function startNext(row: StepListRow, payload: Record<string, unknown>) {
  const next = nextStep.value
  const current = list.value
  if (!next || !current) return
  list.value = { ...current, data: current.data.filter((r) => r.id !== row.id) }
  try {
    const response = await startStep(row.id, next.key, payload)
    const tab = next.tabs?.[0]?.label ?? 'Pending'
    toast.success(`${row.passport_number}: Moved to ${next.short_label} (${tab})`, {
      duration: UNDO_MS,
      ...(canUndo.value && response.data?.id
        ? { action: { label: 'Undo', run: () => undoNext(row, response.data.id) } }
        : {}),
    })
    for (const w of response.warnings) toast.warning(w.message)
  } catch (error) {
    if (list.value && !list.value.data.some((r) => r.id === row.id)) list.value = current
    const status = errorStatus(error)
    if (status !== 401)
      toast.error(
        status === 422
          ? (Object.values(fieldErrors(error))[0] ?? errorMessage(error))
          : errorMessage(error, 'Could not save. Please try again.'),
      )
  } finally {
    load()
    workflow.refresh()
  }
}

async function undoNext(row: StepListRow, recordId: number) {
  try {
    await deleteStepRecord(recordId)
    toast.success(
      `${row.passport_number}: back on ${tabs.value.find((t) => t.key === activeTab.value)?.label ?? 'this tab'}.`,
    )
  } catch (error) {
    toast.error(errorMessage(error, 'Could not undo. Please try again.'))
  } finally {
    load()
    workflow.refresh()
  }
}

const emptyTitle = computed(() =>
  hasFilters.value
    ? 'No passports match these searches.'
    : isPendingTab.value
      ? `No passports are waiting for ${step.value?.label ?? 'this step'}.`
      : `No passports in "${tabs.value.find((t) => t.key === activeTab.value)?.label ?? ''}".`,
)
const emptyText = computed(() =>
  hasFilters.value
    ? 'Check the name or passport number, company and reference searches, or clear them.'
    : isPendingTab.value && isFirstStep.value
      ? 'Mark passports Online on the Medical Fit tab to see them here.'
      : isPendingTab.value && previousExpiry.value && previousStep.value
        ? `Enter the ${(step.value?.fields.find((f) => f.name === 'step_date')?.label ?? 'date').toLowerCase()} on the ${previousStep.value.label} page (${previousStep.value.tabs?.[previousStep.value.tabs.length - 1]?.label ?? 'last'} tab) to see passports here.`
        : undefined,
)

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-offset-1'
const th = TABLE_TH
const STICKY = STICKY_ACTIONS
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <!-- Config-driven step bar with counts; nothing after the final step. -->
    <WorkflowStepper :active-step="stepKey" hide-completed />

    <div v-if="unknownStep" class="glass-card mt-6 p-8 text-center" role="alert" data-unknown-step>
      <p class="font-semibold text-ink">This step does not exist.</p>
      <RouterLink
        :to="{ name: 'medical' }"
        class="mt-3 inline-block font-semibold text-primary-700"
      >
        Go to Medical
      </RouterLink>
    </div>

    <template v-else-if="step">
      <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl" data-step-title>
        {{ step.label }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        Step {{ step.order }}: start the step, then record its result.
      </p>

      <section class="glass-card mt-6 p-4 sm:p-6">
        <div class="-mx-4 overflow-x-auto border-b border-stroke px-4 sm:-mx-6 sm:px-6">
          <div role="tablist" :aria-label="`${step.label} status`" class="flex min-w-max gap-1">
            <button
              v-for="(t, i) in tabs"
              :id="`step-tab-${t.key}`"
              ref="tabButtons"
              :key="t.key"
              type="button"
              role="tab"
              :aria-selected="activeTab === t.key"
              :aria-controls="`step-panel-${t.key}`"
              :tabindex="activeTab === t.key ? 0 : -1"
              class="-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap"
              :class="
                activeTab === t.key
                  ? 'border-accent-500 text-primary-900'
                  : 'border-transparent text-muted hover:border-slate-300 hover:text-primary-900'
              "
              :data-tab="t.key"
              @click="selectTab(t.key)"
              @keydown="onTabKeydown($event, i)"
            >
              {{ t.label }}
              <span
                class="rounded-full px-2 py-0.5 text-xs tabular-nums"
                :class="
                  t.key === 'pending' && counts.pending
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                "
                data-tab-count
              >
                {{ counts[t.key] ?? '–' }}
              </span>
            </button>
          </div>
        </div>

        <div
          :id="`step-panel-${activeTab}`"
          role="tabpanel"
          :aria-labelledby="`step-tab-${activeTab}`"
          class="pt-5"
        >
          <!-- Search: name / passport number, company and reference (combined with the tab) -->
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
                    @keydown.esc="clearBox(box.key)"
                  />
                  <button
                    v-if="box.model.value"
                    type="button"
                    class="absolute top-1/2 right-1.5 mt-0.5 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    :data-clear="box.key"
                    @click="clearBox(box.key)"
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

          <!-- Same list body as the Medical page: loading, error, empty and pagination -->
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
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm" data-step-table>
                  <thead :class="TABLE_HEAD">
                    <tr>
                      <th scope="col" :class="th">Passport name</th>
                      <th scope="col" :class="th">Passport number</th>
                      <th scope="col" :class="th">Reference</th>
                      <th scope="col" :class="th">Company</th>
                      <th v-if="showMode" scope="col" :class="th" data-column="mode">Mode</th>
                      <th
                        v-if="isPendingTab && previousExpiry"
                        scope="col"
                        :class="th"
                        data-column="previous_expiry"
                      >
                        {{ previousExpiry }}
                      </th>
                      <template v-if="isPendingTab && startedInPending">
                        <th
                          v-for="field in startColumns"
                          :key="field.name"
                          scope="col"
                          :class="th"
                          :data-column="field.name"
                        >
                          {{ field.label }}
                        </th>
                      </template>
                      <th v-else-if="isPendingTab" scope="col" :class="th">
                        {{ previousDoneLabel }}
                      </th>
                      <template v-else>
                        <th
                          v-for="field in fieldColumns"
                          :key="field.name"
                          scope="col"
                          :class="th"
                          :data-column="field.name"
                        >
                          {{ field.label }}
                        </th>
                      </template>
                      <th v-if="tabHasActions" scope="col" :class="[th, STICKY]">
                        <span class="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-stroke">
                    <tr
                      v-for="row in list?.data ?? []"
                      :key="row.id"
                      class="align-middle"
                      :data-row="row.id"
                    >
                      <td class="py-3 pr-4" data-cell="passport_name">
                        <RouterLink
                          :to="{ name: 'passport-detail', params: { id: row.id } }"
                          class="font-semibold text-primary-900 underline-offset-4 hover:underline"
                        >
                          {{ row.passport_name }}
                        </RouterLink>
                      </td>
                      <td
                        class="py-3 pr-4 font-mono tracking-wider whitespace-nowrap text-slate-800"
                        data-cell="passport_number"
                      >
                        {{ row.passport_number }}
                      </td>
                      <td :class="TABLE_TD">{{ row.reference?.name ?? '—' }}</td>
                      <td :class="TABLE_TD">{{ row.company.name }}</td>
                      <td v-if="showMode" :class="TABLE_TD" data-cell="mode">
                        <EntryModeBadge v-if="row.entry_mode" :mode="row.entry_mode" />
                        <template v-else>—</template>
                      </td>
                      <td
                        v-if="isPendingTab && previousExpiry"
                        class="py-3 pr-4 whitespace-nowrap text-slate-800"
                        :class="expiryTone(row.previous_record?.valid_until)"
                        data-cell="previous_expiry"
                      >
                        {{ toDisplayDate(row.previous_record?.valid_until) || '-' }}
                      </td>
                      <!-- Pending (calling, visa): the start date, once entered -->
                      <template v-if="isPendingTab && startedInPending">
                        <td
                          v-for="field in startColumns"
                          :key="field.name"
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          :data-cell="field.name"
                        >
                          {{ isStarted(row) ? fieldValue(row, field) : '-' }}
                        </td>
                      </template>
                      <td
                        v-else-if="isPendingTab"
                        class="py-3 pr-4 whitespace-nowrap text-slate-800"
                        data-cell="previous_done"
                      >
                        {{ toDisplayDate(row.previous_step_completed_on) || '—' }}
                      </td>
                      <template v-else>
                        <td
                          v-for="field in fieldColumns"
                          :key="field.name"
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          :class="expiryClass(row, field)"
                          :data-cell="field.name"
                        >
                          {{ fieldValue(row, field) }}
                        </td>
                      </template>
                      <td v-if="tabHasActions" class="py-3" :class="STICKY" data-actions>
                        <div class="flex flex-wrap justify-end gap-1">
                          <!-- Calling Pending: one "Update calling" (the date and the permit together) -->
                          <button
                            v-if="isPendingTab && singleUpdate"
                            type="button"
                            :class="[actionClass, 'bg-primary-900 text-white hover:bg-primary-700']"
                            data-step-update
                            @click="openStart(row, $event, 'update')"
                          >
                            {{ updateLabel
                            }}<span class="sr-only">{{ ` for ${row.passport_number}` }}</span>
                          </button>
                          <!-- Calling Permitted: the next step's start (visa submitted date) -->
                          <button
                            v-else-if="isHandOverTab"
                            type="button"
                            :class="[actionClass, 'bg-green-700 text-white hover:bg-green-800']"
                            data-step-next
                            @click="openStart(row, $event, 'start', true)"
                          >
                            Enter {{ nextStartLabel
                            }}<span class="sr-only">{{ ` for ${row.passport_number}` }}</span>
                          </button>
                          <!-- Started (visa Pending, or an "in process" tab): the results -->
                          <template
                            v-else-if="
                              (isPendingTab && isStarted(row)) || activeTab === 'in_process'
                            "
                          >
                            <button
                              v-for="final in finalStatuses(step)"
                              :key="final.value"
                              type="button"
                              :class="[
                                actionClass,
                                final.value === 'completed'
                                  ? 'bg-green-700 text-white hover:bg-green-800'
                                  : 'bg-red-700 text-white hover:bg-red-800',
                              ]"
                              :data-step-result="final.value"
                              @click="openResult(row, final.value)"
                            >
                              {{ final.label
                              }}<span class="sr-only">{{ ` ${row.passport_number}` }}</span>
                            </button>
                          </template>
                          <!-- Pending, not started (BMET, Flight): the start -->
                          <button
                            v-else-if="isPendingTab && !startedInPending"
                            type="button"
                            :class="[actionClass, 'bg-primary-900 text-white hover:bg-primary-700']"
                            data-step-start
                            @click="openStart(row, $event, 'start')"
                          >
                            {{ startLabel
                            }}<span class="sr-only">{{ ` for ${row.passport_number}` }}</span>
                          </button>
                          <button
                            v-else-if="activeTab === 'rejected'"
                            type="button"
                            :class="[
                              actionClass,
                              'bg-accent-400 text-primary-950 hover:bg-accent-500',
                            ]"
                            data-step-again
                            @click="openStart(row, $event, 'again')"
                          >
                            Apply again<span class="sr-only">{{ ` ${row.passport_number}` }}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </PassportListBody>
          </div>
        </div>
      </section>

      <StepStartPopover
        v-if="start && start.next && nextStep"
        :key="`next-${start.row.id}`"
        :step="nextStep"
        :row="start.row"
        :anchor="start.anchor"
        mode="start"
        :heading="`Enter ${nextStartLabel}`"
        optimistic
        modal
        @submitted="(payload) => start && startNext(start.row, payload)"
        @close="start = null"
      />
      <StepStartPopover
        v-else-if="start"
        :key="`${start.row.id}-${start.mode}`"
        :step="step"
        :row="start.row"
        :anchor="start.anchor"
        :mode="start.mode"
        :heading="start.mode === 'update' ? updateLabel : undefined"
        :modal="start.mode === 'update'"
        @saved="onStarted"
        @close="start = null"
      />
      <StepResultDialog
        v-model:open="resultOpen"
        :step="step"
        :row="resultRow"
        :result="resultValue"
        @saved="onResultSaved"
      />
    </template>

    <div v-else class="mt-6 animate-pulse space-y-3" data-skeleton>
      <div class="h-8 w-1/3 rounded bg-slate-200" />
      <div class="h-64 rounded-2xl bg-slate-200" />
      <span class="sr-only">Loading the step…</span>
    </div>
  </div>
</template>
