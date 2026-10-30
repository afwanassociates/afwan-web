<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import PassportHistoryTable from '@/components/PassportHistoryTable.vue'
import PassportScanCard from '@/components/PassportScanCard.vue'
import ReturnPassportDialog from '@/components/ReturnPassportDialog.vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import StepTimeline from '@/components/StepTimeline.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { listStepRecords } from '@/api/steps'
import {
  getPassport,
  getPassportHistory,
  undoPassportReturn,
  updateEntryMode,
} from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { businessToday, daysLeft, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { EXPIRING_SOON_DAYS, isMedicalAdmin } from '@/lib/medical'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { PassportEntry, PassportHistoryEvent } from '@/types/passport'
import type { StepRecord } from '@/types/workflow'

/** One passport: its progress, details, current medical and its history (entry to flight). */
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()

const today = businessToday()
const passportId = computed(() => Number(route.params.id))

const passport = ref<PassportEntry | null>(null)
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
 * ---------- Undo the Online mark (the operations head) ----------
 * Before Calling starts, the Online mark can be cleared. Records (medical results, steps) are
 * never deleted, so there is no other undo here. The API refuses everyone else.
 */

type EarlyUndo = { kind: 'mark'; label: string; text: string }

const earlyUndo = computed<EarlyUndo | null>(() => {
  const p = passport.value
  if (!p || p.returned || !isMedicalAdmin(auth.user?.role)) return null
  if (Object.values(stepHistory.value).some((records) => records.length > 0)) return null
  if (p.entry_mode)
    return {
      kind: 'mark',
      label: 'Undo Online mark',
      text: 'Clear the Online mark? The passport goes back to the Medical Fit tab.',
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
    await updateEntryMode(p.id, null)
    earlyUndoOpen.value = false
    toast.success(`${p.passport_number}: Online mark undone.`)
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
            @early-undo="askEarlyUndo"
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
            <MedicalStatusBadge
              :status="passport.medical_status"
              :valid-until="medical?.valid_until"
            />
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
                  medicalDaysLeft !== null && medicalDaysLeft <= EXPIRING_SOON_DAYS
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
