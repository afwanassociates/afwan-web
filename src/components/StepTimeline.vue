<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import EntryModeBadge from '@/components/EntryModeBadge.vue'
import LatestStatusText from '@/components/LatestStatusText.vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import ValidityBadge from '@/components/ValidityBadge.vue'
import { toDisplayDate } from '@/lib/dates'
import { STEP_STATE_TEXT, stepTone } from '@/lib/medical'
import { TONE_BADGE } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import type { Role } from '@/types/auth'
import type { StepState } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'
import type { StepRecord, StepRecordSummary } from '@/types/workflow'

/**
 * A passport's steps as a vertical timeline: each step's state, latest record and older
 * records (collapsed). Read-only: steps are recorded and changed on their own pages. Records
 * are never deleted; the operations head's "Undo Online mark" sits in the first recorded step
 * (where the Online badge is).
 */
const props = defineProps<{
  passport: PassportEntry
  /** GET /passports/{id}/steps, grouped by step key (newest first). */
  history: Record<string, StepRecord[]>
  role: Role | undefined
  userId: number | null
  /** The operations head, before any step record: the Online mark to undo. */
  earlyUndo?: { kind: 'mark'; label: string } | null
}>()
defineEmits<{ earlyUndo: [] }>()

const workflow = useWorkflowStore()

/** A recorded step (Calling onwards) the passport has reached and not finished: link to its page. */
const showsPageLink = (step: { key: string; state: StepState }) =>
  step.key !== 'passport' &&
  step.key !== 'medical' &&
  step.state !== 'locked' &&
  props.history[step.key]?.[0]?.status !== 'completed'

/** Labels that read better here than the config's (the calling permit's expiry). */
const TIMELINE_LABEL: Record<string, Record<string, string>> = {
  calling: { valid_until: 'Calling expiry' },
}

/** A field's label from the step config (e.g. visa: "Visa submitted date", "Expired date"). */
const fieldLabel = (stepKey: string, name: string, fallback: string) =>
  TIMELINE_LABEL[stepKey]?.[name] ??
  workflow.stepConfig(stepKey)?.fields.find((f) => f.name === name)?.label ??
  fallback

/**
 * The record's own date row, unless a detail already shows that date under the step's own
 * label (flight: the record's date is its "Flight date").
 */
function showsStepDate(stepKey: string, record: StepRecordSummary) {
  if (!record.step_date) return false
  // BMET in progress: its date is the first milestone's, not the clearance date.
  if (workflow.stepConfig(stepKey)?.actions?.length && record.status !== 'completed') return false
  if (workflow.stepConfig(stepKey)?.fields.some((f) => f.name === 'step_date')) return true
  const shown = toDisplayDate(record.step_date)
  return !detailsOf(stepKey, record).some((d) => d.value === shown)
}

/**
 * The date under the step's date label. When that field is a start field (visa: "Visa
 * submitted date"), it is the date the step started, also once the result redated the record.
 */
function recordDate(stepKey: string, record: StepRecordSummary) {
  const field = workflow.stepConfig(stepKey)?.fields.find((f) => f.name === 'step_date')
  const started = record.details?.start_date
  return toDisplayDate(field?.phase === 'start' && started ? started : record.step_date)
}

/** The record's own date: from the config, else "<Step> date" (calling's older records). */
const dateLabel = (stepKey: string) => {
  const short = workflow.stepConfig(stepKey)?.short_label
  return fieldLabel(stepKey, 'step_date', short ? `${short} date` : 'Date')
}

/** Labelled extra fields of a record (e.g. the flight's booking date), from the step config. */
function detailsOf(stepKey: string, record: StepRecordSummary) {
  const fields = workflow.stepConfig(stepKey)?.fields.filter((f) => f.in_details) ?? []
  return fields
    .map((f) => {
      const value = record.details?.[f.name]
      return { label: f.label, value: value && f.type === 'date' ? toDisplayDate(value) : value }
    })
    .filter((d) => d.value)
}

/** The passport's medical slip (MYGRAM) and centre, when entered. */
const medicalDetails = computed(() => {
  const slip = props.passport.medical_slip
  if (!slip) return []
  return [
    { label: 'Medical slip date', value: toDisplayDate(slip.date), mono: false },
    { label: 'Medical center', value: slip.medical_center?.name, mono: false },
  ].filter((d) => d.value)
})

/**
 * The step that shows the latest status line: its stage, or the last step once the passport
 * is done (stage "completed": "Flight confirmed (DD-MM-YYYY)").
 */
const statusStep = computed(() => {
  const stage = props.passport.latest_status?.stage
  const steps = props.passport.workflow.steps
  return stage === 'completed' ? steps[steps.length - 1]?.key : stage
})

/** The first step after Passport and Medical (Calling / Work Permit). */
const firstRecordStep = computed(
  () => props.passport.workflow.steps.find((s) => s.key !== 'passport' && s.key !== 'medical')?.key,
)

const markerClass = (state: StepState) =>
  ({
    success: 'bg-green-600 ring-green-200',
    warning: 'bg-amber-500 ring-amber-200',
    danger: 'bg-red-600 ring-red-200',
    muted: 'bg-slate-300 ring-slate-100',
    info: 'bg-blue-600 ring-blue-200',
  })[stepTone(state)]

const smallButton =
  'rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-offset-1'
</script>

<template>
  <ol class="relative space-y-6 border-l-2 border-stroke pl-6" data-timeline>
    <li
      v-for="(step, i) in passport.workflow.steps"
      :key="step.key"
      class="relative"
      :data-timeline-step="step.key"
    >
      <span
        class="absolute top-1 -left-[31px] h-4 w-4 rounded-full ring-4"
        :class="markerClass(step.state)"
        aria-hidden="true"
      />
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-semibold text-ink">{{ i + 1 }}. {{ step.label }}</h3>
        <!-- Calling / Work Permit (the first recorded step): the Online mark -->
        <EntryModeBadge
          v-if="step.key === firstRecordStep && passport.entry_mode"
          :mode="passport.entry_mode"
        />
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
          :class="TONE_BADGE[stepTone(step.state)]"
        >
          {{ STEP_STATE_TEXT[step.state] ?? step.state }}
        </span>
        <RouterLink
          v-if="showsPageLink(step)"
          :to="{ name: 'step-page', params: { step: step.key } }"
          class="ml-auto text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          data-step-page-link
        >
          Open {{ step.label }} page
        </RouterLink>
      </div>

      <!-- The step the passport is at: the API's status text with its date -->
      <p
        v-if="passport.latest_status && statusStep === step.key && i > 1"
        class="mt-1 text-sm"
        data-timeline-status
      >
        <LatestStatusText :latest-status="passport.latest_status" />
      </p>

      <!-- Step 1: the passport itself -->
      <p v-if="i === 0" class="mt-1 text-sm text-muted">
        Received {{ toDisplayDate(passport.passport_received_date) }}
      </p>

      <!-- Step 2: the medical (full details in the Current medical card) -->
      <p v-else-if="step.key === 'medical'" class="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <MedicalStatusBadge
          :status="passport.medical_status"
          :valid-until="passport.current_medical?.valid_until"
        />
        <span v-if="passport.current_medical" class="text-muted">
          {{ toDisplayDate(passport.current_medical.medical_date) }}
        </span>
      </p>
      <dl
        v-if="step.key === 'medical' && medicalDetails.length"
        class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-stroke bg-white p-3 text-sm"
        data-medical-details
      >
        <template v-for="d in medicalDetails" :key="d.label">
          <dt class="text-muted">{{ d.label }}</dt>
          <dd class="text-ink" :class="{ 'font-mono': d.mono }">{{ d.value }}</dd>
        </template>
      </dl>

      <!-- Steps 3+: records -->
      <template v-else>
        <p v-if="!(history[step.key]?.length ?? 0)" class="mt-1 text-sm text-muted">
          Nothing recorded yet.
        </p>
        <template v-for="(record, r) in history[step.key] ?? []" :key="record.id">
          <div
            v-if="r === 0"
            class="mt-2 rounded-xl border border-stroke bg-white p-3 text-sm"
            data-latest-record
          >
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt class="text-muted">Status</dt>
              <dd class="font-semibold text-ink">{{ record.status_label }}</dd>
              <template v-if="record.reference_no">
                <dt class="text-muted">Reference</dt>
                <dd class="font-mono text-ink">{{ record.reference_no }}</dd>
              </template>
              <template v-if="showsStepDate(step.key, record)">
                <dt class="text-muted">{{ dateLabel(step.key) }}</dt>
                <dd class="text-ink">{{ recordDate(step.key, record) }}</dd>
              </template>
              <template v-if="record.valid_until">
                <dt class="text-muted">{{ fieldLabel(step.key, 'valid_until', 'Valid until') }}</dt>
                <dd class="flex flex-wrap items-center gap-2 text-ink">
                  {{ toDisplayDate(record.valid_until) }}
                  <ValidityBadge :status="record.validity_status" :days-left="record.days_left" />
                </dd>
              </template>
              <template v-for="d in detailsOf(step.key, record)" :key="d.label">
                <dt class="text-muted">{{ d.label }}</dt>
                <dd class="text-ink">{{ d.value }}</dd>
              </template>
              <dt class="text-muted">Recorded by</dt>
              <dd class="text-ink">{{ record.recorded_by?.name ?? '—' }}</dd>
              <template v-if="record.remarks">
                <dt class="text-muted">Remarks</dt>
                <dd class="break-words text-ink">{{ record.remarks }}</dd>
              </template>
            </dl>
          </div>
        </template>

        <details
          v-if="(history[step.key]?.length ?? 0) > 1"
          class="mt-2 text-sm"
          data-older-records
        >
          <summary class="cursor-pointer font-semibold text-primary-700">
            Earlier records ({{ (history[step.key]?.length ?? 1) - 1 }})
          </summary>
          <ul class="mt-2 space-y-2">
            <li
              v-for="record in (history[step.key] ?? []).slice(1)"
              :key="record.id"
              class="rounded-lg bg-surface p-2.5"
            >
              <span class="font-semibold text-ink">{{ record.status_label }}</span>
              <template v-if="record.step_date">· {{ toDisplayDate(record.step_date) }}</template>
              <span v-if="record.reference_no" class="font-mono">· {{ record.reference_no }}</span>
              <span class="text-muted"> · {{ record.recorded_by?.name ?? '—' }}</span>
              <p v-if="record.remarks" class="mt-1 break-words text-muted">{{ record.remarks }}</p>
            </li>
          </ul>
        </details>
      </template>

      <!-- The operations head: undo the Online mark (by its badge) -->
      <div v-if="earlyUndo && step.key === firstRecordStep" class="mt-2 -ml-2 flex flex-wrap gap-1">
        <button
          type="button"
          :class="[smallButton, 'text-red-700 hover:bg-red-50']"
          data-early-undo
          @click="$emit('earlyUndo')"
        >
          {{ earlyUndo.label }}
        </button>
      </div>
    </li>
  </ol>
</template>
