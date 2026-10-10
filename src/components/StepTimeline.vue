<script setup lang="ts">
import { computed } from 'vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import ValidityBadge from '@/components/ValidityBadge.vue'
import { toDisplayDate } from '@/lib/dates'
import { STEP_STATE_TEXT, isMedicalAdmin, stepTone } from '@/lib/medical'
import { TONE_BADGE } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import type { Role } from '@/types/auth'
import type { StepState } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'
import type { StepRecord, StepRecordSummary } from '@/types/workflow'

/**
 * A passport's steps as a vertical timeline: each step's state, latest record and older
 * records (collapsed). Buttons follow the API's rules: record / update the current step,
 * edit records the user may change, and "Undo latest step" for admins.
 */
const props = defineProps<{
  passport: PassportEntry
  /** GET /passports/{id}/steps, grouped by step key (newest first). */
  history: Record<string, StepRecord[]>
  role: Role | undefined
  userId: number | null
}>()
defineEmits<{
  record: [stepKey: string, record: StepRecordSummary | null]
  edit: [stepKey: string, record: StepRecord]
  undo: [record: StepRecord]
}>()

const workflow = useWorkflowStore()

/** The newest record of the furthest step that has records: what "undo" removes. */
const latestRecord = computed<StepRecord | null>(() => {
  const keys = props.passport.workflow.steps.map((s) => s.key)
  for (const key of [...keys].reverse()) {
    const first = props.history[key]?.[0]
    if (first) return first
  }
  return null
})

const isAdmin = computed(() => isMedicalAdmin(props.role))

/** data_entry: only their own records (the API also checks that no later step exists). */
const canEdit = (record: StepRecord) =>
  record.can.update && (isAdmin.value || record.recorded_by?.id === props.userId)

const canUndo = (record: StepRecord) =>
  isAdmin.value && record.can.delete && record.id === latestRecord.value?.id

function currentAction(stepKey: string): { label: string; update: boolean } | null {
  if (props.passport.current_stage !== stepKey) return null
  switch (props.passport.stage_status) {
    case 'waiting':
      return { label: 'Record', update: false }
    case 'in_process':
      return { label: 'Update status', update: true }
    case 'rejected':
      return { label: 'Record again', update: false }
    default:
      return null
  }
}

/** Labelled extra fields of a record (e.g. the flight's airline), from the step config. */
function detailsOf(stepKey: string, record: StepRecordSummary) {
  const fields = workflow.stepConfig(stepKey)?.fields.filter((f) => f.in_details) ?? []
  return fields
    .map((f) => {
      const value = record.details?.[f.name]
      return { label: f.label, value: value && f.type === 'date' ? toDisplayDate(value) : value }
    })
    .filter((d) => d.value)
}

/** The current medical's centre and slip, when recorded. */
const medicalDetails = computed(() => {
  const m = props.passport.current_medical
  if (!m) return []
  return [
    { label: 'Medical center', value: m.medical_center?.name, mono: false },
    { label: 'Medical slip no', value: m.slip_no, mono: true },
    { label: 'Medical slip date', value: toDisplayDate(m.slip_date), mono: false },
  ].filter((d) => d.value)
})

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
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
          :class="TONE_BADGE[stepTone(step.state)]"
        >
          {{ STEP_STATE_TEXT[step.state] ?? step.state }}
        </span>
        <button
          v-if="currentAction(step.key)"
          type="button"
          :class="[smallButton, 'ml-auto bg-primary-900 text-white hover:bg-primary-700']"
          :data-step-action="currentAction(step.key)!.label"
          @click="
            $emit(
              'record',
              step.key,
              currentAction(step.key)!.update
                ? (history[step.key]?.[0] ?? step.record ?? null)
                : null,
            )
          "
        >
          {{ currentAction(step.key)!.label }}
        </button>
      </div>

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
              <dt class="text-muted">Date</dt>
              <dd class="text-ink">{{ toDisplayDate(record.step_date) }}</dd>
              <template v-if="record.valid_until">
                <dt class="text-muted">Valid until</dt>
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
            <div v-if="canEdit(record) || canUndo(record)" class="mt-2 -ml-2 flex flex-wrap gap-1">
              <button
                v-if="canEdit(record)"
                type="button"
                :class="[smallButton, 'text-primary-700 hover:bg-primary-50']"
                data-edit-record
                @click="$emit('edit', step.key, record)"
              >
                Edit<span class="sr-only"> {{ step.label }} record</span>
              </button>
              <button
                v-if="canUndo(record)"
                type="button"
                :class="[smallButton, 'text-red-700 hover:bg-red-50']"
                data-undo
                @click="$emit('undo', record)"
              >
                Undo latest step
              </button>
            </div>
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
              · {{ toDisplayDate(record.step_date) }}
              <span v-if="record.reference_no" class="font-mono">· {{ record.reference_no }}</span>
              <span class="text-muted"> · {{ record.recorded_by?.name ?? '—' }}</span>
              <p v-if="record.remarks" class="mt-1 break-words text-muted">{{ record.remarks }}</p>
              <button
                v-if="canEdit(record)"
                type="button"
                :class="[smallButton, '-ml-3 text-primary-700 hover:bg-primary-50']"
                data-edit-record
                @click="$emit('edit', step.key, record)"
              >
                Edit<span class="sr-only"> earlier {{ step.label }} record</span>
              </button>
            </li>
          </ul>
        </details>
      </template>
    </li>
  </ol>
</template>
