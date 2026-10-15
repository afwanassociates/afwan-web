<script setup lang="ts">
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import StepResultDialog from '@/components/StepResultDialog.vue'
import StepStartPopover from '@/components/StepStartPopover.vue'
import TopModal from '@/components/TopModal.vue'
import DatePopover from '@/components/DatePopover.vue'
import PassportListBody from '@/components/PassportListBody.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { searchCompanies } from '@/api/companies'
import {
  bookFlight,
  clearFlightBooking,
  confirmFlight,
  deleteStepRecord,
  listStepPassports,
  markStepAction,
  undoStepAction,
  startStep,
  undoFlightConfirm,
} from '@/api/steps'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { businessToday, daysLeft, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { staffTitle } from '@/lib/pageTitle'
import { ADMIN_ROLES, canAccessArea } from '@/lib/roles'
import { STICKY_ACTIONS, TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import { finalStatuses, isRecordStep, statusLabel } from '@/lib/workflow'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { CompanySummary } from '@/types/passport'
import type {
  StepAction,
  StepConfig,
  StepFieldConfig,
  StepListResponse,
  StepListRow,
  StepListTab,
} from '@/types/workflow'

/**
 * One page per workflow step (Calling, Visa, BMET, Flight, …), built like the Medical page
 * and driven by the route's step key and GET /workflow/config: labels, statuses and fields.
 * Tabs come from the config (calling: Pending, Permitted; visa: Pending, Visa issued,
 * Rejected; BMET: Pending, BMET cleared; flight: Pending, Flight confirmed). Tab, the three
 * searches and the page live in the URL; the API decides the order and counts of each tab.
 */
const PER_PAGE = 15
/** Column titles that read better than the generic one (by step key). */
const PREVIOUS_EXPIRY_LABEL: Record<string, string> = { visa: 'Calling expiry' }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workflow = useWorkflowStore()
const toast = useToast()
workflow.load()
workflow.loadConfig()

const searchId = useId()
const blockedId = useId()
const referenceId = useId()
const receiveDateFromId = useId()
const receiveDateToId = useId()
const bookingDateFromId = useId()
const bookingDateToId = useId()

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
  const companyId = Number(text(route.query.company_id))
  return {
    tab: text(route.query.tab),
    q: text(route.query.q).trim(),
    company_id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    reference: text(route.query.reference).trim(),
    receive_date_from: text(route.query.receive_date_from).trim(),
    receive_date_to: text(route.query.receive_date_to).trim(),
    booking_date_from: text(route.query.booking_date_from).trim(),
    booking_date_to: text(route.query.booking_date_to).trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
type Filters = typeof filters.value

const hasFilters = computed(() =>
  Boolean(
    filters.value.q || filters.value.company_id || filters.value.reference ||
    (activeTab.value === 'permitted' && (filters.value.receive_date_from || filters.value.receive_date_to)) ||
    (stepKey.value === 'flight' && (isPendingTab.value || activeTab.value === 'confirmed') && (filters.value.booking_date_from || filters.value.booking_date_to)),
  ),
)

function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  if (next.tab && next.tab !== defaultTab.value) query.tab = next.tab
  if (next.q) query.q = next.q
  if (next.company_id) query.company_id = String(next.company_id)
  if (next.reference) query.reference = next.reference
  if (next.receive_date_from) query.receive_date_from = next.receive_date_from
  else delete query.receive_date_from
  if (next.receive_date_to) query.receive_date_to = next.receive_date_to
  else delete query.receive_date_to
  if (next.booking_date_from) query.booking_date_from = next.booking_date_from
  else delete query.booking_date_from
  if (next.booking_date_to) query.booking_date_to = next.booking_date_to
  else delete query.booking_date_to
  if (next.page > 1) query.page = String(next.page)
  return query
}

const search = ref(filters.value.q)
const selectedCompany = ref<CompanySummary | null>(null)
const reference = ref(filters.value.reference)
const receiveDateFrom = ref(filters.value.receive_date_from)
const receiveDateTo = ref(filters.value.receive_date_to)
const bookingDateFrom = ref(filters.value.booking_date_from)
const bookingDateTo = ref(filters.value.booking_date_to)

/** All at once, so quick typing in two boxes cannot lose one. */
function applySearches() {
  router.replace({
    query: queryWith({
      q: search.value.trim(),
      reference: reference.value.trim(),
    }),
  })
}
const debouncedSearch = useDebounce(applySearches, 300)
const debouncedReference = useDebounce(applySearches, 300)

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  router.replace({ query: queryWith({ company_id: value?.id ?? null }) })
}

function clearBox(key: 'reference') {
  reference.value = ''
  debouncedReference.cancel()
  router.replace({ query: queryWith({ reference: '' }) })
}

function clearFilters() {
  search.value = ''
  selectedCompany.value = null
  reference.value = ''
  receiveDateFrom.value = ''
  receiveDateTo.value = ''
  bookingDateFrom.value = ''
  bookingDateTo.value = ''
  debouncedSearch.cancel()
  debouncedReference.cancel()
  router.replace({ query: queryWith({ q: '', company_id: null, reference: '', receive_date_from: '', receive_date_to: '', booking_date_from: '', booking_date_to: '' }) })
}

const searchBoxes = [
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
  if (!f.company_id && selectedCompany.value) selectedCompany.value = null
  if (f.reference !== reference.value.trim()) reference.value = f.reference
  if (f.receive_date_from !== receiveDateFrom.value) receiveDateFrom.value = f.receive_date_from
  if (f.receive_date_to !== receiveDateTo.value) receiveDateTo.value = f.receive_date_to
  if (f.booking_date_from !== bookingDateFrom.value) bookingDateFrom.value = f.booking_date_from
  if (f.booking_date_to !== bookingDateTo.value) bookingDateTo.value = f.booking_date_to
})

/* ---------- Tabs ---------- */

/** The config's tabs (Pending alone if it sends none). */
const tabs = computed<{ key: StepListTab; label: string }[]>(() => {
  const s = step.value
  if (!s) return []
  return s.tabs?.length ? s.tabs : [{ key: 'pending', label: 'Pending' }]
})

/** Pending opens first when the step has it; else the first tab. */
const defaultTab = computed<StepListTab>(() =>
  tabs.value.some((t) => t.key === 'pending') ? 'pending' : (tabs.value[0]?.key ?? 'pending'),
)
/** The tab in the URL, or the default one. */
const activeTab = computed<StepListTab>(() =>
  tabs.value.some((t) => t.key === filters.value.tab) ? filters.value.tab : defaultTab.value,
)
const isPendingTab = computed(() => activeTab.value === 'pending')
/**
 * A step with a booking date (flight): it runs alongside the step before (BMET) once the
 * visa is issued; the booking is saved any time, the confirm needs both.
 */
const isBookingStepConfig = (s: StepConfig) => s.fields.some((f) => f.phase === 'booking')
const isBookingStep = computed(() => (step.value ? isBookingStepConfig(step.value) : false))
const bookingField = computed(() => step.value?.fields.find((f) => f.phase === 'booking'))
const confirmField = computed(() => step.value?.fields.find((f) => f.phase === 'confirm'))

/**
 * No "in process" tab (every step now): started passports stay in Pending with their date,
 * and the result is entered there (visa).
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
  company_id: f.company_id ?? undefined,
  reference: f.reference || undefined,
  ...(activeTab.value === 'permitted' ? {
    receive_date_from: f.receive_date_from || undefined,
    receive_date_to: f.receive_date_to || undefined,
  } : {}),
  ...(stepKey.value === 'flight' && (isPendingTab.value || activeTab.value === 'confirmed') ? {
    booking_date_from: f.booking_date_from || undefined,
    booking_date_to: f.booking_date_to || undefined,
  } : {}),
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

/** The step's own fields as columns, in config order (the step date first).
 * On the visa issued tab, step_date (Visa submitted date) is hidden.
 */
const fieldColumns = computed<StepFieldConfig[]>(() => {
  const fields = step.value?.fields ?? []
  const ordered = [
    ...fields.filter((f) => f.name === 'step_date'),
    ...fields.filter((f) => f.name !== 'step_date'),
  ]
  if (stepKey.value === 'visa' && activeTab.value === 'issued')
    return ordered.filter((f) => f.name !== 'step_date')
  return ordered
})

function fieldValue(row: StepListRow, field: StepFieldConfig): string {
  const record = row.record
  if (!record) return '-'
  if (field.name === 'step_date' && record.submitted_date)
    return toDisplayDate(record.submitted_date) || record.submitted_date
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

/**
 * Pending of a later step whose passports arrive already started (visa, submitted from the
 * Calling page): the step before's expiry (the calling permit) is shown next to them.
 */
/** The visa's expiry: BMET Pending and Flight Pending. */
const showVisaExpiry = computed(
  () => isPendingTab.value && (isMilestoneStep.value || isBookingStep.value),
)

/** Calling expiry on Visa Pending only (not on Issued or Rejected). */
const showPreviousExpiry = computed(
  () => previousExpiry.value !== null && isPendingTab.value,
)
const previousExpiry = computed(() => {
  const prev = previousStep.value
  if (
    !startedInPending.value ||
    isFirstStep.value ||
    isMilestoneStep.value ||
    isBookingStep.value ||
    !prev
  )
    return null
  if (!prev.fields.some((f) => f.name === 'valid_until')) return null
  return PREVIOUS_EXPIRY_LABEL[stepKey.value] ?? `${prev.short_label} expiry`
})

/**
 * The step whose finished passports arrive here: the one before, or for a step running
 * alongside it (flight next to BMET) the one before that (visa: "an issued visa").
 */
const sourceStep = computed(() => {
  const steps = recordSteps.value
  const index = steps.findIndex((st) => st.key === stepKey.value)
  return (isBookingStep.value ? steps[index - 2] : steps[index - 1]) ?? null
})

/* ---------- Actions ---------- */

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
 * gets "Update calling" (the permit dates). Not flight, which has its booking and confirm.
 */
const singleUpdate = computed(
  () => startedInPending.value && singleOutcome.value && !isBookingStep.value,
)
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
    !isMilestoneStep.value &&
    (isPendingTab.value || activeTab.value === 'rejected' || isHandOverTab.value),
)

/** In Pending: started (in process) rows get the result (visa). */
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
    // Calling: "Moved to Permitted".
    afterSave(target.row, `Moved to ${statusLabel(s, 'completed')}`)
    return
  }
  // Apply again: "Submitted" reads "Visa submitted".
  const started = statusLabel(s, 'in_process')
  afterSave(
    target.row,
    started.toLowerCase().includes(s.short_label.toLowerCase())
      ? `${started}.`
      : `${s.short_label} ${started.toLowerCase()}.`,
  )
}

function onResultSaved() {
  const row = resultRow.value
  const s = step.value
  if (!row || !s) return
  const label = statusLabel(s, resultValue.value)
  // Visa issued: "Moved to Visa issued - now in BMET Clearance and Flight".
  afterSave(
    row,
    resultValue.value === 'completed' && receivingSteps.value.length
      ? `Moved to ${label} - now in ${receivingSteps.value.map((st) => st.label).join(' and ')}`
      : `${s.short_label}: ${label}.`,
  )
}

/* ---------- Milestone actions (BMET: Training, Finger, then BMET clearance) ---------- */

/** Where a finished passport goes: the next step and a step running alongside it (flight). */
const receivingSteps = computed(() => {
  const steps = recordSteps.value
  const index = steps.findIndex((st) => st.key === stepKey.value)
  const next = steps[index + 1]
  const after = steps[index + 2]
  return [next, after && isBookingStepConfig(after) ? after : undefined].filter(
    (st): st is StepConfig => !!st,
  )
})

const actions = computed(() => step.value?.actions ?? [])
const isMilestoneStep = computed(() => actions.value.length > 0)
/** The last action completes the step (BMET clearance); it needs the others first. */
const completeAction = computed(() => actions.value[actions.value.length - 1] ?? null)
const milestoneActions = computed(() => actions.value.slice(0, -1))
/** "Training" from "Training done". */
const actionName = (a: StepAction) => a.label.replace(/\s+done$/i, '')
/** When the action was done: the row's `<action>_date`. */
const actionDate = (row: StepListRow, a: StepAction) =>
  ((row as unknown as Record<string, unknown>)[`${a.key}_date`] as string | null | undefined) ??
  null
const isComplete = (a: StepAction) => a.key === completeAction.value?.key
/** "Training and finger must be done first". */
const blockedHint = computed(() => {
  const names = milestoneActions.value.map((a) => actionName(a).toLowerCase()).join(' and ')
  return `${names.charAt(0).toUpperCase()}${names.slice(1)} must be done first`
})
const isBlocked = (row: StepListRow, a: StepAction) =>
  isComplete(a) && milestoneActions.value.some((m) => !actionDate(row, m))

/** Rows with a request running: their buttons wait (no double clicks). */
const busyRows = ref(new Set<number>())
const setBusy = (id: number, on: boolean) => {
  const next = new Set(busyRows.value)
  if (on) next.add(id)
  else next.delete(id)
  busyRows.value = next
}

/**
 * Marks an action done (today in Dhaka, or `date` to correct it). The row changes at once
 * (the last action takes it off Pending) and comes back on an error. A new mark gets a toast
 * with Undo.
 */
async function markAction(row: StepListRow, a: StepAction, date?: string) {
  const s = step.value
  const current = list.value
  if (!s || !current || busyRows.value.has(row.id)) return
  setBusy(row.id, true)
  const done = date ?? businessToday()
  const name = actionName(a)
  list.value = {
    ...current,
    data:
      isComplete(a) && !date
        ? current.data.filter((r) => r.id !== row.id)
        : current.data.map((r) => (r.id === row.id ? { ...r, [`${a.key}_date`]: done } : r)),
  }
  try {
    await markStepAction(row.id, s.key, a.key, date)
    if (date) {
      toast.success(`${row.passport_number}: ${name} date changed to ${toDisplayDate(date)}.`)
    } else {
      const cleared = tabs.value[tabs.value.length - 1]?.label ?? statusLabel(s, 'completed')
      const next = nextStep.value
      const nextTab = next?.tabs?.find((t) => t.key === 'pending')?.label ?? 'Pending'
      toast.success(
        `${row.passport_number}: ${
          isComplete(a) && next ? `Moved to ${cleared} - now in ${next.label} ${nextTab}` : a.label
        }`,
        { duration: UNDO_MS, action: { label: 'Undo', run: () => undoAction(row, a) } },
      )
    }
  } catch (error) {
    list.value = current
    if (errorStatus(error) !== 401)
      toast.error(
        errorStatus(error) === 422
          ? (Object.values(fieldErrors(error))[0] ?? errorMessage(error))
          : errorMessage(error, 'Could not save. Please try again.'),
      )
  } finally {
    setBusy(row.id, false)
    load()
    workflow.refresh()
  }
}

async function undoAction(row: StepListRow, a: StepAction) {
  const s = step.value
  if (!s) return
  setBusy(row.id, true)
  try {
    await undoStepAction(row.id, s.key, a.key)
    toast.success(`${row.passport_number}: ${actionName(a)} undone.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not undo. Please try again.'))
  } finally {
    setBusy(row.id, false)
    load()
    workflow.refresh()
  }
}

/** The pencil: correct an action's date in a small top modal (not in the future). */
const dateEdit = ref<{ row: StepListRow; action: StepAction; value: string; error: string } | null>(
  null,
)
function openDateEdit(row: StepListRow, a: StepAction) {
  dateEdit.value = { row, action: a, value: actionDate(row, a) ?? businessToday(), error: '' }
}
function saveDateEdit() {
  const edit = dateEdit.value
  if (!edit) return
  const date = toApiDate(edit.value)
  if (!edit.value) edit.error = 'Enter the date.'
  else if (!date) edit.error = 'Enter a valid date.'
  else if (date > businessToday()) edit.error = 'The date cannot be in the future.'
  else {
    dateEdit.value = null
    markAction(edit.row, edit.action, date)
  }
}

/* ---------- Undo ---------- */

const UNDO_MS = 6000

/* ---------- Flight: booking date and one-click confirm ---------- */

/** The booking popover (under its button). */
const booking = ref<{ row: StepListRow; anchor: HTMLElement | null } | null>(null)
function openBooking(row: StepListRow, event: Event) {
  booking.value = { row, anchor: event.currentTarget as HTMLElement }
}

async function saveBooking(row: StepListRow, date: string) {
  await bookFlight(row.id, date)
  toast.success(
    `${row.passport_number}: ${bookingField.value?.label ?? 'Booking date'} ${toDisplayDate(date)} saved.`,
  )
  load()
  workflow.refresh()
}

async function clearBooking(row: StepListRow) {
  await clearFlightBooking(row.id)
  toast.success(`${row.passport_number}: ${bookingField.value?.label ?? 'Booking date'} cleared.`)
  load()
  workflow.refresh()
}

/** What the confirm still needs, from the row's `missing`. */
function confirmHint(row: StepListRow): string | undefined {
  if (row.can_confirm) return undefined
  const missing = row.missing ?? []
  const bmet = missing.includes('bmet')
  const date = missing.includes('booking_date')
  if (bmet && date) return 'BMET clearance and flight booking date are required'
  if (bmet) return 'BMET clearance must be done first'
  if (date) return 'Enter the flight booking date first'
  return 'This flight cannot be confirmed yet'
}

/**
 * One click: the row leaves Pending at once and comes back on an error (the API's message in
 * a toast). The toast "Flight confirmed" offers Undo (the booking date is kept).
 */
async function markConfirm(row: StepListRow) {
  const current = list.value
  if (!current || !row.can_confirm || busyRows.value.has(row.id)) return
  setBusy(row.id, true)
  list.value = { ...current, data: current.data.filter((r) => r.id !== row.id) }
  try {
    const response = await confirmFlight(row.id)
    toast.success(`${row.passport_number}: ${statusLabel(step.value!, 'completed')}`, {
      duration: UNDO_MS,
      action: { label: 'Undo', run: () => undoConfirm(row) },
    })
    for (const w of response.warnings ?? []) toast.warning(w.message)
  } catch (error) {
    list.value = current
    if (errorStatus(error) !== 401)
      toast.error(
        errorStatus(error) === 422
          ? (Object.values(fieldErrors(error))[0] ?? errorMessage(error))
          : errorMessage(error, 'Could not confirm the flight. Please try again.'),
      )
  } finally {
    setBusy(row.id, false)
    load()
    workflow.refresh()
  }
}

async function undoConfirm(row: StepListRow) {
  setBusy(row.id, true)
  try {
    await undoFlightConfirm(row.id)
    toast.success(`${row.passport_number}: back in Pending.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not undo. Please try again.'))
  } finally {
    setBusy(row.id, false)
    load()
    workflow.refresh()
  }
}

/* ---------- Permitted → the next step (optimistic, with Undo for admins) ---------- */

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
    : isBookingStep.value && !isPendingTab.value
      ? `No confirmed ${step.value?.short_label.toLowerCase() ?? 'step'}s yet.`
      : isMilestoneStep.value && !isPendingTab.value
        ? `No ${(statusLabel(step.value!, 'completed').split(' ').pop() ?? 'done').toLowerCase()} passports yet.`
        : isPendingTab.value
          ? `No passports are waiting for ${step.value?.label ?? 'this step'}.`
          : `No passports in "${tabs.value.find((t) => t.key === activeTab.value)?.label ?? ''}".`,
)
const emptyText = computed(() =>
  hasFilters.value
    ? 'Check the name or passport number, company and reference searches, or clear them.'
    : isPendingTab.value && (isMilestoneStep.value || isBookingStep.value) && sourceStep.value
      ? `Passports with an issued ${sourceStep.value.short_label.toLowerCase()} appear here.`
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
              <!-- Permitted tab only: receive date range filter -->
              <template v-if="activeTab === 'permitted' && stepKey === 'calling'">
                <div>
                  <label :for="receiveDateFromId" class="block text-sm font-medium text-slate-700">Receive date from</label>
                  <input
                    :id="receiveDateFromId"
                    v-model="receiveDateFrom"
                    type="date"
                    :max="receiveDateTo || undefined"
                    :class="inputClass"
                    data-receive-date-from
                    @change="router.replace({ query: queryWith({ receive_date_from: receiveDateFrom, receive_date_to: receiveDateTo }) })"
                  />
                </div>
                <div>
                  <label :for="receiveDateToId" class="block text-sm font-medium text-slate-700">Receive date to</label>
                  <input
                    :id="receiveDateToId"
                    v-model="receiveDateTo"
                    type="date"
                    :min="receiveDateFrom || undefined"
                    :class="inputClass"
                    data-receive-date-to
                    @change="router.replace({ query: queryWith({ receive_date_from: receiveDateFrom, receive_date_to: receiveDateTo }) })"
                  />
                </div>
              </template>
              <!-- Flight pending + confirmed tabs: booking date range filter -->
              <template v-if="stepKey === 'flight' && (isPendingTab || activeTab === 'confirmed')">
                <div>
                  <label :for="bookingDateFromId" class="block text-sm font-medium text-slate-700">Flight date from</label>
                  <input
                    :id="bookingDateFromId"
                    v-model="bookingDateFrom"
                    type="date"
                    :max="bookingDateTo || undefined"
                    :class="inputClass"
                    data-booking-date-from
                    @change="router.replace({ query: queryWith({ booking_date_from: bookingDateFrom, booking_date_to: bookingDateTo }) })"
                  />
                </div>
                <div>
                  <label :for="bookingDateToId" class="block text-sm font-medium text-slate-700">Flight date to</label>
                  <input
                    :id="bookingDateToId"
                    v-model="bookingDateTo"
                    type="date"
                    :min="bookingDateFrom || undefined"
                    :class="inputClass"
                    data-booking-date-to
                    @change="router.replace({ query: queryWith({ booking_date_from: bookingDateFrom, booking_date_to: bookingDateTo }) })"
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
                      <th
                        v-if="showPreviousExpiry"
                        scope="col"
                        :class="th"
                        data-column="previous_expiry"
                      >
                        {{ previousExpiry }}
                      </th>
                      <th
                        v-if="showVisaExpiry"
                        scope="col"
                        :class="th"
                        data-column="visa_valid_until"
                      >
                        Visa expired date
                      </th>
                      <!-- BMET: one column per action (Pending), or its date (BMET cleared) -->
                      <template v-if="isMilestoneStep">
                        <th
                          v-for="a in actions"
                          :key="a.key"
                          scope="col"
                          :class="th"
                          :data-column="a.key"
                        >
                          {{ isPendingTab ? actionName(a) : `${actionName(a)} date` }}
                        </th>
                      </template>
                      <!-- Flight Pending: BMET status and the booking date -->
                      <template v-else-if="isBookingStep && isPendingTab">
                        <th scope="col" :class="th" data-column="bmet_status">BMET status</th>
                        <th scope="col" :class="th" data-column="booking_date">
                          {{ bookingField?.label }}
                        </th>
                      </template>
                      <template v-else-if="isPendingTab && startedInPending">
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
                      <!-- Flight confirmed: the booking date only -->
                      <template v-else-if="isBookingStep">
                        <th scope="col" :class="th" data-column="booking_date">
                          {{ bookingField?.label }}
                        </th>
                        <th scope="col" :class="th" data-column="passport_done">Flight done</th>
                      </template>
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
                      <td
                        v-if="showPreviousExpiry"
                        class="py-3 pr-4 whitespace-nowrap text-slate-800"
                        :class="expiryTone(row.previous_record?.valid_until)"
                        data-cell="previous_expiry"
                      >
                        {{ toDisplayDate(row.previous_record?.valid_until) || '-' }}
                      </td>
                      <td
                        v-if="showVisaExpiry"
                        class="py-3 pr-4 whitespace-nowrap text-slate-800"
                        :class="expiryTone(row.visa_valid_until)"
                        data-cell="visa_valid_until"
                      >
                        {{ toDisplayDate(row.visa_valid_until) || '-' }}
                      </td>
                      <!-- BMET Pending: each action done (date, pencil) or "Mark done" -->
                      <template v-if="isMilestoneStep && isPendingTab">
                        <td
                          v-for="a in actions"
                          :key="a.key"
                          class="py-3 pr-4 whitespace-nowrap"
                          :data-cell="a.key"
                        >
                          <span
                            v-if="actionDate(row, a)"
                            class="inline-flex items-center gap-1 font-medium text-green-700"
                            data-action-done
                          >
                            <svg
                              class="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="3"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                            <span class="sr-only">Done</span>
                            {{ toDisplayDate(actionDate(row, a)) }}
                            <button
                              v-if="canAct && !isComplete(a)"
                              type="button"
                              class="rounded-full p-1 text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                              :disabled="busyRows.has(row.id)"
                              data-action-edit
                              @click="openDateEdit(row, a)"
                            >
                              <svg
                                class="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
                              </svg>
                              <span class="sr-only">{{
                                `Change the ${actionName(a).toLowerCase()} date of ${row.passport_number}`
                              }}</span>
                            </button>
                          </span>
                          <span
                            v-else-if="canAct"
                            class="inline-block"
                            :title="isBlocked(row, a) ? blockedHint : undefined"
                          >
                            <button
                              type="button"
                              :class="[
                                actionClass,
                                isComplete(a)
                                  ? 'bg-green-700 text-white hover:bg-green-800'
                                  : 'bg-primary-900 text-white hover:bg-primary-700',
                                'disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600',
                              ]"
                              :disabled="isBlocked(row, a) || busyRows.has(row.id)"
                              :aria-describedby="isBlocked(row, a) ? blockedId : undefined"
                              :data-action="a.key"
                              @click="markAction(row, a)"
                            >
                              Mark done<span class="sr-only">{{
                                ` ${actionName(a).toLowerCase()} ${row.passport_number}`
                              }}</span>
                            </button>
                          </span>
                          <span v-else class="font-medium text-amber-700" data-action-pending>
                            Pending
                          </span>
                        </td>
                      </template>
                      <!-- BMET cleared: the dates, read-only -->
                      <template v-else-if="isMilestoneStep">
                        <td
                          v-for="a in actions"
                          :key="a.key"
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          :data-cell="a.key"
                        >
                          {{ toDisplayDate(actionDate(row, a)) || '-' }}
                        </td>
                      </template>
                      <!-- Flight Pending: BMET cleared (date) or pending; the booking date -->
                      <template v-else-if="isBookingStep && isPendingTab">
                        <td class="py-3 pr-4 whitespace-nowrap" data-cell="bmet_status">
                          <span
                            v-if="row.bmet_cleared"
                            class="font-medium text-green-700"
                            data-bmet="cleared"
                          >
                            Cleared {{ toDisplayDate(row.clearance_date) }}
                          </span>
                          <span v-else class="font-medium text-amber-700" data-bmet="pending">
                            Pending
                          </span>
                        </td>
                        <td
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          data-cell="booking_date"
                        >
                          {{ toDisplayDate(row.booking_date) || '-' }}
                        </td>
                      </template>
                      <!-- Pending (visa): the start date, once entered -->
                      <template v-else-if="isPendingTab && startedInPending">
                        <td
                          v-for="field in startColumns"
                          :key="field.name"
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          :data-cell="field.name"
                        >
                          {{ isStarted(row) ? fieldValue(row, field) : '-' }}
                        </td>
                      </template>
                      <!-- Flight confirmed: the booking date only, read-only -->
                      <template v-else-if="isBookingStep">
                        <td
                          class="py-3 pr-4 whitespace-nowrap text-slate-800"
                          data-cell="booking_date"
                        >
                          {{ toDisplayDate(row.booking_date) || '-' }}
                        </td>
                        <td class="py-3 pr-4 whitespace-nowrap" data-cell="passport_done">
                          <span class="inline-flex items-center gap-1 font-medium text-green-700">
                            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                            Done
                          </span>
                        </td>
                      </template>
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
                          <!-- Flight Pending: the booking date (any time), then the one-click confirm -->
                          <template v-if="isBookingStep && isPendingTab">
                            <button
                              v-if="!row.booking_date"
                              type="button"
                              :class="[
                                actionClass,
                                'border border-primary-300 bg-white text-primary-800 hover:bg-primary-50',
                              ]"
                              :disabled="busyRows.has(row.id)"
                              data-booking
                              @click="openBooking(row, $event)"
                            >
                              {{ bookingField?.label
                              }}<span class="sr-only">{{ ` for ${row.passport_number}` }}</span>
                            </button>
                            <button
                              v-else
                              type="button"
                              class="rounded-full p-2 text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                              :disabled="busyRows.has(row.id)"
                              data-booking
                              data-booking-edit
                              @click="openBooking(row, $event)"
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
                                <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
                              </svg>
                              <span class="sr-only">{{
                                `Change the ${(bookingField?.label ?? 'booking date').toLowerCase()} of ${row.passport_number}`
                              }}</span>
                            </button>
                            <span class="inline-block" :title="confirmHint(row)">
                              <button
                                type="button"
                                :class="[
                                  actionClass,
                                  'bg-green-700 text-white hover:bg-green-800',
                                  'disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600',
                                ]"
                                :disabled="!row.can_confirm || busyRows.has(row.id)"
                                :aria-describedby="
                                  row.can_confirm ? undefined : `${blockedId}-${row.id}`
                                "
                                data-confirm
                                @click="markConfirm(row)"
                              >
                                Mark flight confirm<span class="sr-only">{{
                                  ` ${row.passport_number}`
                                }}</span>
                              </button>
                              <span
                                v-if="!row.can_confirm"
                                :id="`${blockedId}-${row.id}`"
                                class="sr-only"
                                >{{ confirmHint(row) }}</span
                              >
                            </span>
                          </template>
                          <!-- Calling Pending: one "Update calling" (the permit dates) -->
                          <button
                            v-else-if="isPendingTab && singleUpdate"
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
                          <!-- Visa Pending (submitted): the results -->
                          <template v-else-if="isPendingTab && isStarted(row)">
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
      <span :id="blockedId" class="sr-only">{{ blockedHint }}</span>
      <DatePopover
        v-if="booking"
        :key="`booking-${booking.row.id}`"
        :anchor="booking.anchor"
        :title="bookingField?.label ?? 'Booking date'"
        :subtitle="`${booking.row.passport_name} · ${booking.row.passport_number}`"
        :label="bookingField?.label ?? 'Booking date'"
        :value="booking.row.booking_date ?? null"
        :save="(date) => saveBooking(booking!.row, date)"
        :clear="() => clearBooking(booking!.row)"
        @close="booking = null"
      />
      <TopModal
        v-if="dateEdit"
        :title="`${actionName(dateEdit.action)} date`"
        :subtitle="`${dateEdit.row.passport_name} · ${dateEdit.row.passport_number}`"
        @close="dateEdit = null"
      >
        <form novalidate data-action-date-form @submit.prevent="saveDateEdit">
          <label :for="`${blockedId}-date`" class="block text-sm font-medium text-slate-700">
            {{ actionName(dateEdit.action) }} date<span class="text-red-700" aria-hidden="true">
              *</span
            >
          </label>
          <input
            :id="`${blockedId}-date`"
            v-model="dateEdit.value"
            type="date"
            required
            :max="businessToday()"
            :class="[inputClass, dateEdit.error ? 'border-red-500' : '']"
            :aria-invalid="dateEdit.error ? 'true' : undefined"
          />
          <p v-if="dateEdit.error" class="mt-1 text-sm text-red-700" data-action-date-error>
            {{ dateEdit.error }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              @click="dateEdit = null"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-full bg-primary-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
              data-action-date-save
            >
              Save
            </button>
          </div>
        </form>
      </TopModal>
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
