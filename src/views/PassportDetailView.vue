<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalRetestDialog from '@/components/MedicalRetestDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import PassportHistoryTable from '@/components/PassportHistoryTable.vue'
import PassportScanCard from '@/components/PassportScanCard.vue'
import RecordStepModal from '@/components/RecordStepModal.vue'
import ReturnPassportDialog from '@/components/ReturnPassportDialog.vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import StepTimeline from '@/components/StepTimeline.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import PassportAgentCard from '@/components/agents/PassportAgentCard.vue'
import { undoAgentApproval } from '@/api/agents'
import { cancelMedicalResult, updateMedicalSlip } from '@/api/medical'
import {
  clearFlightBooking,
  listStepRecords,
  undoFlightConfirm,
  undoStep,
  undoStepAction,
} from '@/api/steps'
import {
  getPassport,
  getPassportHistory,
  undoPassportReturn,
  updateEntryMode,
} from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { businessToday, daysLeft, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { useDateRules } from '@/lib/dateRules'
import { isMedicalAdmin } from '@/lib/medical'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { PassportEntry, PassportHistoryEvent } from '@/types/passport'
import type { MedicalResult } from '@/types/medical'
import type { StepRecord } from '@/types/workflow'

/** One passport: its progress, details, current medical and its history (entry to flight). */
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()

const today = businessToday()
const passportId = computed(() => Number(route.params.id))

const passport = ref<PassportEntry | null>(null)
/** Settings → Date rules for the passport's company country. */
const dateRules = useDateRules(() => passport.value?.company?.country?.code)
const history = ref<PassportHistoryEvent[]>([])
/** Steps 3+ history, grouped by step key. */
const stepHistory = ref<Record<string, StepRecord[]>>({})
workflow.loadConfig()
const isLoading = ref(false)
const loadError = ref<string | null>(null)

async function load() {
  const id = passportId.value
  if (!id) return
  isLoading.value = true
  loadError.value = null
  try {
    const [entry, events, steps] = await Promise.all([
      getPassport(id),
      getPassportHistory(id),
      listStepRecords(id),
    ])
    if (passportId.value !== id) return
    passport.value = entry
    history.value = events
    stepHistory.value = steps
  } catch (error) {
    loadError.value =
      errorStatus(error) === 404
        ? 'This passport was not found. It may have been deleted.'
        : errorMessage(error, 'Could not load this passport.')
  } finally {
    isLoading.value = false
  }
}

watch(passportId, load, { immediate: true })

/** After any medical or step change: this page, the step bar and the sidebar badges. */
function afterChange() {
  load()
  workflow.refresh()
}

/*
 * ---------- Early undos (the operations head) ----------
 * Pending medical (slip entered, no result yet): back to the Passport Entry list, clearing the
 * slip, medical date and centre. Before Calling starts: clear the Online mark, then cancel the
 * medical result (back to Medical → Pending; the result stays in the history as cancelled).
 * Step records are never deleted, so there is no other undo here. The API refuses everyone else.
 */

type EarlyUndo = { kind: 'agent' | 'mark' | 'slip' | 'result'; label: string; text: string }

const earlyUndo = computed<EarlyUndo | null>(() => {
  const p = passport.value
  if (!p || p.returned || !isMedicalAdmin(auth.user?.role)) return null
  if (Object.values(stepHistory.value).some((records) => records.length > 0)) return null
  // Before the medical slip: undo the agent approval (back to waiting for approval).
  if (p.can.undo_agent_approval)
    return {
      kind: 'agent',
      label: 'Undo agent approval',
      text: `Undo the approval of ${p.recruitment_agent?.name ?? 'the agent'}? It goes back to Waiting for approval: approve it again, or return it to data entry to choose another agent. The passport can't go to Medical until an agent is approved. This stays in the agent history.`,
    }
  if (p.medical_status === 'pending')
    return {
      kind: 'slip',
      label: 'Back to Passport Entry',
      text: 'Send this passport back to the Passport Entry list? The medical slip, medical date and medical centre are cleared; add a new slip to send it to Medical again.',
    }
  if (p.entry_mode)
    return {
      kind: 'mark',
      label: 'Undo Online mark',
      text: 'Clear the Online mark? The passport goes back to the Medical Fit tab.',
    }
  if (p.can.cancel_medical_result)
    return {
      kind: 'result',
      label: 'Undo medical result',
      text: `Cancel the ${p.current_medical?.result === 'unfit' ? 'UNFIT' : 'FIT'} result? The passport goes back to Medical → Pending so the right result can be entered. The cancelled result stays in the history.`,
    }
  return null
})

const earlyUndoOpen = ref(false)
const earlyUndoBusy = ref(false)
const earlyUndoError = ref<string | null>(null)

function askEarlyUndo() {
  earlyUndoError.value = null
  earlyUndoOpen.value = true
}

async function confirmEarlyUndo() {
  const p = passport.value
  const undo = earlyUndo.value
  if (!p || !undo) return
  earlyUndoBusy.value = true
  earlyUndoError.value = null
  try {
    if (undo.kind === 'agent') {
      await undoAgentApproval(p.id)
    } else if (undo.kind === 'slip') {
      await updateMedicalSlip(p.id, { medical_slip_date: null, medical_center_id: null })
    } else if (undo.kind === 'result') {
      await cancelMedicalResult(p.id)
    } else {
      await updateEntryMode(p.id, null)
    }
    earlyUndoOpen.value = false
    toast.success(
      undo.kind === 'agent'
        ? `${p.passport_number}: agent approval undone, waiting for approval again.`
        : undo.kind === 'slip'
          ? `${p.passport_number}: back on the Passport Entry list.`
          : undo.kind === 'result'
            ? `${p.passport_number}: medical result cancelled, back to Medical Pending.`
            : `${p.passport_number}: Online mark undone.`,
    )
    afterChange()
  } catch (error) {
    const code = errorStatus(error)
    if (code === 403) earlyUndoError.value = 'Only the Operations Head can undo a step.'
    else if (code !== 401)
      earlyUndoError.value = errorMessage(error, 'Could not undo. Please try again.')
  } finally {
    earlyUndoBusy.value = false
  }
}

/* ---------- Derived ---------- */

const medical = computed(() => passport.value?.current_medical ?? null)
const isUnfit = computed(() => passport.value?.medical_status === 'unfit')

/** The real name of who entered it (from the API), else the user's number. */
const enteredBy = computed(() => {
  const id = passport.value?.created_by
  if (id === null || id === undefined) return '—'
  return passport.value?.entered_by?.name ?? `Staff #${id}`
})

const medicalDaysLeft = computed(() => {
  const m = medical.value
  if (!m?.valid_until) return null
  return m.days_left ?? daysLeft(m.valid_until, today)
})

/**
 * The only medical action here: "Add medical slip" for a passport whose medical has not
 * started. The medical date and the Fit / Unfit result are entered on the Medical page.
 */
const medicalAction = computed(() => {
  const p = passport.value
  if (!p?.can.record_medical || p.medical_status !== 'not_started') return null
  return { label: 'Add medical slip', class: 'btn-accent' }
})

const backLink = computed(() =>
  passport.value?.returned
    ? { to: { name: 'returned-passports' }, label: 'Returned Passports' }
    : isUnfit.value
      ? { to: { name: 'medical', query: { tab: 'unfit' } }, label: 'Medical · Unfit' }
      : { to: { name: 'passports' }, label: 'Passport Entry List' },
)

/* ---------- Return to the owner (the operations head) ---------- */

const returnOpen = ref(false)
const undoReturnOpen = ref(false)
const undoReturnBusy = ref(false)
const undoReturnError = ref<string | null>(null)

/** "Returned on 28-10-2026 to Rahim (017…)". */
const returnedText = computed(() => {
  const r = passport.value?.returned
  return r
    ? `Returned on ${toDisplayDate(r.return_date)} to ${r.receiver_name} (${r.receiver_phone})`
    : ''
})

function askUndoReturn() {
  undoReturnError.value = null
  undoReturnOpen.value = true
}

async function confirmUndoReturn() {
  const p = passport.value
  if (!p) return
  undoReturnBusy.value = true
  undoReturnError.value = null
  try {
    await undoPassportReturn(p.id)
    undoReturnOpen.value = false
    toast.success(`${p.passport_number}: return undone. It is back in the workflow.`)
    afterChange()
  } catch (error) {
    const code = errorStatus(error)
    if (code === 403) undoReturnError.value = 'Only the Operations Head can undo a return.'
    else if (code !== 401)
      undoReturnError.value = errorMessage(error, 'Could not undo the return. Please try again.')
  } finally {
    undoReturnBusy.value = false
  }
}

/* ---------- Correct a step record, undo its last action (Calling onwards) ---------- */

type StepButton = { key: string; label: string; tone: 'edit' | 'undo' }

/** The flight's own undo actions (its booking and confirmation have their own endpoints). */
const FLIGHT_CONFIRM = 'confirm'
const FLIGHT_BOOKING = 'booking'
/** Calling and Visa: one undo of their latest action (POST …/undo-step/{step}). */
const STEP_UNDO = 'undo-step'

/**
 * Per step, the buttons under its latest record. "Edit" when the API allows it (the operations
 * head on any record; data entry on their own, before a later step). The undos are the
 * operations head's: a BMET action (Training / Finger while in progress, the clearance once
 * cleared and the flight not confirmed), the flight confirmation, or the booking date, and
 * Calling / Visa (their latest action) while no later step has a record.
 */
const stepActions = computed<Record<string, StepButton[]>>(() => {
  const p = passport.value
  const out: Record<string, StepButton[]> = {}
  if (!p || p.returned) return out
  const isHead = isMedicalAdmin(auth.user?.role)
  for (const [key, records] of Object.entries(stepHistory.value)) {
    const latest = records[0]
    if (!latest) continue
    const config = workflow.stepConfig(key)
    const buttons: StepButton[] = []
    if (latest.can?.update)
      buttons.push({ key: 'edit', label: `Edit ${config?.short_label ?? key}`, tone: 'edit' })
    if (isHead && config?.actions?.length) {
      const complete = config.actions[config.actions.length - 1]!
      const nextDone = Object.entries(stepHistory.value).some(
        ([other, list]) => other !== key && isAfter(other, key) && list[0]?.status === 'completed',
      )
      if (latest.status === 'completed' && !nextDone)
        buttons.push({
          key: complete.key,
          label: `Undo ${actionName(complete.label)}`,
          tone: 'undo',
        })
      if (latest.status === 'in_process')
        for (const action of config.actions.slice(0, -1))
          if (latest.details?.[action.field])
            buttons.push({
              key: action.key,
              label: `Undo ${actionName(action.label)}`,
              tone: 'undo',
            })
    }
    if (isHead && (key === 'calling' || key === 'visa')) {
      const laterRecords = Object.entries(stepHistory.value).some(
        ([other, list]) => other !== key && isAfter(other, key) && list.length > 0,
      )
      if (!laterRecords)
        buttons.push({
          key: STEP_UNDO,
          label:
            key === 'calling'
              ? 'Undo calling'
              : latest.status === 'completed'
                ? 'Undo visa issued'
                : latest.status === 'rejected'
                  ? 'Undo visa rejected'
                  : 'Undo visa submitted',
          tone: 'undo',
        })
    }
    if (isHead && key === 'flight') {
      if (latest.status === 'completed')
        buttons.push({ key: FLIGHT_CONFIRM, label: 'Undo flight', tone: 'undo' })
      else if (latest.details?.booking_date)
        buttons.push({ key: FLIGHT_BOOKING, label: 'Clear booking date', tone: 'undo' })
    }
    if (buttons.length) out[key] = buttons
  }
  return out
})

/** Whether step `a` comes after step `b` in the passport's workflow. */
function isAfter(a: string, b: string) {
  const order = passport.value?.workflow.steps.map((step) => step.key) ?? []
  return order.indexOf(a) > order.indexOf(b)
}

/** "Training done" → "Training", "BMET clearance done" → "BMET clearance". */
const actionName = (label: string) => label.replace(/\s+done$/i, '')

const editOpen = ref(false)
const editStepKey = ref<string | null>(null)
const editRecord = ref<StepRecord | null>(null)

const stepUndoOpen = ref(false)
const stepUndoBusy = ref(false)
const stepUndoError = ref<string | null>(null)
const stepUndo = ref<{ stepKey: string; button: StepButton } | null>(null)

function onStepAction(stepKey: string, actionKey: string) {
  const button = stepActions.value[stepKey]?.find((b) => b.key === actionKey)
  if (!button) return
  if (button.tone === 'edit') {
    editStepKey.value = stepKey
    editRecord.value = stepHistory.value[stepKey]?.[0] ?? null
    editOpen.value = true
    return
  }
  stepUndo.value = { stepKey, button }
  stepUndoError.value = null
  stepUndoOpen.value = true
}

const stepUndoText = computed(() => {
  const u = stepUndo.value
  if (!u) return ''
  if (u.stepKey === 'flight' && u.button.key === FLIGHT_CONFIRM)
    return 'The flight goes back to Flight Pending; its booking date is kept.'
  if (u.stepKey === 'flight') return 'The flight booking date is cleared.'
  if (u.button.key === STEP_UNDO)
    return u.stepKey === 'calling'
      ? 'The calling permit is cancelled; the passport goes back to Calling Pending. It stays in the history as cancelled.'
      : u.button.label === 'Undo visa submitted'
        ? 'The visa submission is cancelled; the passport goes back to waiting for the visa. It stays in the history as cancelled.'
        : 'The visa result is cleared; the visa goes back to Submitted.'
  return `${u.button.label.replace(/^Undo /, '')} is cleared; the step goes back to in progress (or pending when nothing is left).`
})

async function confirmStepUndo() {
  const p = passport.value
  const u = stepUndo.value
  if (!p || !u) return
  stepUndoBusy.value = true
  stepUndoError.value = null
  try {
    if (u.stepKey === 'flight' && u.button.key === FLIGHT_CONFIRM) await undoFlightConfirm(p.id)
    else if (u.stepKey === 'flight' && u.button.key === FLIGHT_BOOKING)
      await clearFlightBooking(p.id)
    else if (u.button.key === STEP_UNDO) await undoStep(p.id, u.stepKey as 'calling' | 'visa')
    else await undoStepAction(p.id, u.stepKey, u.button.key)
    stepUndoOpen.value = false
    toast.success(`${p.passport_number}: ${u.button.label.replace(/^Undo /, '')} undone.`)
    afterChange()
  } catch (error) {
    const code = errorStatus(error)
    if (code === 403) stepUndoError.value = 'Only the Operations Head can undo a step.'
    else if (code !== 401)
      stepUndoError.value = errorMessage(error, 'Could not undo. Please try again.')
  } finally {
    stepUndoBusy.value = false
  }
}

/* ---------- Medical re-test (the operations head) ---------- */

/**
 * After a result (fit, expired or unfit), before Calling has a record: a new medical date
 * and result. The old result stays in the history.
 */
const canRetest = computed(() => {
  const p = passport.value
  if (!p || p.returned || !p.current_medical || !isMedicalAdmin(auth.user?.role)) return false
  return !Object.values(stepHistory.value).some((records) => records.length > 0)
})
const retestOpen = ref(false)

function onRetestSaved(result: MedicalResult) {
  const p = passport.value
  toast.success(
    `${p?.passport_number ?? 'Passport'}: re-test saved (${result === 'fit' ? 'Fit' : 'Unfit'}).`,
  )
  afterChange()
}

/* ---------- Medical slip ---------- */

const slipModalOpen = ref(false)

function openRecord() {
  slipModalOpen.value = true
}

const dt = 'text-muted'
const dd = 'font-medium text-ink'
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <WorkflowStepper :active-step="passport?.current_stage ?? null" hide-completed />

    <RouterLink
      :to="backLink.to"
      class="mt-6 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary-700 hover:underline"
    >
      <span aria-hidden="true">←</span> {{ backLink.label }}
    </RouterLink>

    <p v-if="isLoading && !passport" class="mt-6 text-muted" role="status">Loading the passport…</p>

    <div v-else-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <template v-else-if="passport">
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold break-words text-primary-900 sm:text-3xl">
            {{ passport.passport_name }}
          </h1>
          <p class="font-mono tracking-wider text-slate-700">{{ passport.passport_number }}</p>
          <p class="mt-1 text-sm text-muted" data-entry-no>
            Entry no.
            <span class="font-semibold text-ink tabular-nums">{{ passport.entry_no }}</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="medicalAction"
            type="button"
            class="btn text-sm"
            :class="medicalAction.class"
            data-medical-action
            @click="openRecord"
          >
            {{ medicalAction.label }}
          </button>
          <button
            v-if="passport.can.return"
            type="button"
            class="btn btn-primary text-sm"
            data-return-passport
            @click="returnOpen = true"
          >
            Return passport
          </button>
          <button
            v-if="passport.can.undo_return"
            type="button"
            class="btn text-sm"
            data-undo-return
            @click="askUndoReturn"
          >
            Undo return
          </button>
        </div>
      </div>

      <!-- Returned to its owner: out of every working list -->
      <section
        v-if="passport.returned"
        class="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
        data-returned
      >
        <p class="font-semibold">{{ returnedText }}</p>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Was at</dt>
          <dd class="font-medium">{{ passport.returned.stage_label }}</dd>
          <template v-if="passport.returned.receiver_id_no">
            <dt>NID / Passport no.</dt>
            <dd class="font-medium">{{ passport.returned.receiver_id_no }}</dd>
          </template>
          <template v-if="passport.returned.remarks">
            <dt>Remarks</dt>
            <dd class="font-medium break-words">{{ passport.returned.remarks }}</dd>
          </template>
          <dt>Returned by</dt>
          <dd class="font-medium">{{ passport.returned.returned_by?.name ?? '—' }}</dd>
        </dl>
      </section>

      <!-- Date warnings from the API (never blocking) -->
      <ul
        v-if="passport.warnings?.length"
        class="mt-6 space-y-1 rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 text-sm text-accent-900"
        role="status"
        data-passport-warnings
      >
        <li v-for="warning in passport.warnings" :key="warning.code" class="flex gap-2">
          <span aria-hidden="true">⚠</span>{{ warning.message }}
        </li>
      </ul>

      <!-- This passport's progress -->
      <section class="glass-card mt-6 p-5" aria-label="Progress">
        <WorkflowStepper :steps="passport.workflow.steps" />
      </section>

      <!-- Step timeline -->
      <section class="glass-card mt-6 p-5 sm:p-6" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" class="text-lg font-semibold text-ink">Steps</h2>
        <div class="mt-4">
          <StepTimeline
            :passport="passport"
            :history="stepHistory"
            :role="auth.user?.role"
            :user-id="auth.user?.id ?? null"
            :early-undo="earlyUndo"
            :step-actions="stepActions"
            @early-undo="askEarlyUndo"
            @step-action="onStepAction"
          />
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Passport summary -->
        <section class="glass-card p-5 sm:p-6" aria-labelledby="passport-heading">
          <h2 id="passport-heading" class="text-lg font-semibold text-ink">Passport</h2>
          <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt :class="dt">Name</dt>
            <dd :class="dd">{{ passport.passport_name }}</dd>
            <dt :class="dt">Number</dt>
            <dd :class="[dd, 'font-mono tracking-wider']">{{ passport.passport_number }}</dd>
            <dt :class="dt">Country</dt>
            <dd :class="dd">{{ passport.country?.name ?? '—' }}</dd>
            <dt :class="dt">Date of birth</dt>
            <dd :class="dd">{{ toDisplayDate(passport.date_of_birth) || '—' }}</dd>
            <dt :class="dt">Expiry date</dt>
            <dd :class="dd">{{ toDisplayDate(passport.passport_expiry_date) || '—' }}</dd>
            <dt :class="dt">Father's name</dt>
            <dd :class="dd" data-father-name>{{ passport.father_name || '—' }}</dd>
            <dt :class="dt">Mother's name</dt>
            <dd :class="dd">{{ passport.mother_name || '—' }}</dd>
            <dt :class="dt">Permanent address</dt>
            <dd :class="dd">{{ passport.permanent_address || '—' }}</dd>
            <dt :class="dt">Reference</dt>
            <dd :class="dd">
              <template v-if="passport.reference">
                {{ passport.reference.name }}
                <span class="text-xs font-normal text-muted"
                  >({{ passport.reference.type_label }})</span
                >
              </template>
              <template v-else>—</template>
            </dd>
            <dt :class="dt">Company</dt>
            <dd :class="dd">
              {{ passport.company.name }}
              <span class="text-xs font-normal text-muted"
                >({{ passport.company.country.name }})</span
              >
            </dd>
            <dt :class="dt">Received</dt>
            <dd :class="dd">{{ toDisplayDate(passport.passport_received_date) }}</dd>
            <dt :class="dt">Entered by</dt>
            <dd :class="dd">{{ enteredBy }}</dd>
          </dl>
        </section>

        <!-- Current medical -->
        <section
          class="glass-card p-5 sm:p-6"
          aria-labelledby="medical-heading"
          data-current-medical
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="medical-heading" class="text-lg font-semibold text-ink">Current medical</h2>
            <div class="flex flex-wrap items-center gap-2">
              <MedicalStatusBadge
                :status="passport.medical_status"
                :valid-until="medical?.valid_until"
              />
              <button
                v-if="canRetest"
                type="button"
                class="rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-primary-700 hover:bg-primary-50"
                data-retest
                @click="retestOpen = true"
              >
                Re-test
              </button>
            </div>
          </div>
          <dl
            v-if="passport.medical_slip?.date"
            class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b border-stroke pb-3 text-sm"
            data-medical-slip
          >
            <dt :class="dt">Medical slip date</dt>
            <dd :class="dd">{{ toDisplayDate(passport.medical_slip.date) }}</dd>
            <dt :class="dt">Medical center</dt>
            <dd :class="dd">{{ passport.medical_slip.medical_center?.name ?? '—' }}</dd>
          </dl>
          <p v-if="!medical" class="mt-4 text-sm text-muted">
            {{
              passport.medical_status === 'not_started'
                ? 'Medical not started: add the medical slip first.'
                : 'No medical has been recorded yet.'
            }}
          </p>
          <dl v-else class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt :class="dt">Result</dt>
            <dd :class="dd">{{ medical.result === 'fit' ? 'Fit' : 'Unfit' }}</dd>
            <dt :class="dt">Medical date</dt>
            <dd :class="dd">{{ toDisplayDate(medical.medical_date) }}</dd>
            <template v-if="medical.valid_until">
              <dt :class="dt">Valid until</dt>
              <dd :class="dd">{{ toDisplayDate(medical.valid_until) }}</dd>
              <dt :class="dt">Days left</dt>
              <dd
                :class="[
                  dd,
                  medicalDaysLeft !== null &&
                  medicalDaysLeft <= dateRules.medical_expiring_soon_days
                    ? 'text-accent-800'
                    : '',
                ]"
              >
                <template v-if="medicalDaysLeft === null">—</template>
                <template v-else-if="medicalDaysLeft < 0">
                  Expired {{ -medicalDaysLeft }} days ago
                </template>
                <template v-else>{{ medicalDaysLeft }}</template>
              </dd>
            </template>
            <dt :class="dt">Recorded by</dt>
            <dd :class="dd">{{ medical.recorded_by?.name ?? '—' }}</dd>
            <dt :class="dt">Remarks</dt>
            <dd :class="[dd, 'font-normal break-words']">{{ medical.remarks || '—' }}</dd>
          </dl>
        </section>
      </div>

      <!-- recruitment agent: assigned by data entry, approved by the Operations Head -->
      <div class="mt-6">
        <PassportAgentCard :passport="passport" @changed="afterChange" />
      </div>

      <!-- Passport scan copy (shared card; loads the file through the API) -->
      <div class="mt-6">
        <PassportScanCard :passport="passport" @updated="afterChange" />
      </div>

      <!-- History -->
      <section class="glass-card mt-6 p-5 sm:p-6" aria-labelledby="history-heading">
        <h2 id="history-heading" class="text-lg font-semibold text-ink">Passport history</h2>
        <p class="mt-1 text-sm text-muted">Everything recorded, from entry to flight.</p>
        <div class="mt-2">
          <PassportHistoryTable :events="history" />
        </div>
      </section>
    </template>

    <MedicalSlipModal v-model:open="slipModalOpen" :passport="passport" @saved="afterChange" />

    <MedicalRetestDialog v-model:open="retestOpen" :passport="passport" @saved="onRetestSaved" />

    <RecordStepModal
      v-model:open="editOpen"
      :passport="passport"
      :step-key="editStepKey"
      :record="editRecord"
      @saved="afterChange"
    />

    <ConfirmDialog
      v-model:open="stepUndoOpen"
      :title="stepUndo?.button.label ?? 'Undo'"
      confirm-label="Undo"
      danger
      :busy="stepUndoBusy"
      :error="stepUndoError"
      @confirm="confirmStepUndo"
    >
      <p>{{ stepUndoText }}</p>
    </ConfirmDialog>

    <ReturnPassportDialog v-model:open="returnOpen" :passport="passport" @returned="afterChange" />

    <ConfirmDialog
      v-model:open="undoReturnOpen"
      title="Undo return"
      confirm-label="Undo return"
      :busy="undoReturnBusy"
      :error="undoReturnError"
      @confirm="confirmUndoReturn"
    >
      <p v-if="passport?.returned">
        Bring <strong>{{ passport.passport_name }}</strong> back into the workflow? It goes back to
        {{ passport.returned.stage_label }}, exactly where it was. The return stays in the history.
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      v-model:open="earlyUndoOpen"
      :title="earlyUndo?.label ?? 'Undo'"
      confirm-label="Undo"
      danger
      :busy="earlyUndoBusy"
      :error="earlyUndoError"
      @confirm="confirmEarlyUndo"
    >
      <p v-if="earlyUndo">{{ earlyUndo.text }}</p>
    </ConfirmDialog>
  </div>
</template>
