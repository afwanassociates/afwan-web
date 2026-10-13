<script setup lang="ts">
import {
  Teleport,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
} from 'vue'
import StepFields from '@/components/StepFields.vue'
import TopModal from '@/components/TopModal.vue'
import {
  startStep,
  updateCalling,
  type CallingUpdatePayload,
  type StepSaveResponse,
} from '@/api/steps'
import { businessToday, toApiDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { stepPayload, stepWithPhase, validateStepForm } from '@/lib/workflow'
import type { StepConfig, StepListRow, WorkflowWarning } from '@/types/workflow'

/**
 * One step action as a small popover under its button, or (`modal`) a top-aligned TopModal:
 * - start / again: the step date (required, not in the future) and the other "start" fields;
 *   saving creates the in-process record ("again" after a rejection keeps the old one);
 * - update (calling): the "result" fields (the permit dates), all required, in one request;
 *   saving completes the step.
 * With `optimistic`, it only checks the values and emits `submitted` (the page saves and can
 * undo); otherwise it saves itself and shows API warnings without blocking.
 */
const props = defineProps<{
  step: StepConfig
  row: StepListRow
  /** The button that opened it (the popover is placed under it). */
  anchor: HTMLElement | null
  mode: 'start' | 'again' | 'update'
  /** Popover title (e.g. "Update calling"); defaults by mode. */
  heading?: string
  /** Emit the checked values (`submitted`) instead of saving. */
  optimistic?: boolean
  /** A top-aligned modal instead of the popover under the button. */
  modal?: boolean
}>()
const emit = defineEmits<{
  close: []
  saved: [response: StepSaveResponse]
  submitted: [payload: Record<string, unknown>]
}>()

const panel = useTemplateRef<HTMLFormElement>('panel')
const today = businessToday()

const isUpdate = computed(() => props.mode === 'update')

/** Start: the step date first, then the other start fields. Update: the result fields. */
const startStepConfig = computed(() => {
  if (isUpdate.value) return stepWithPhase(props.step, 'result')
  const start = stepWithPhase(props.step, 'start')
  const date = start.fields.filter((f) => f.name === 'step_date')
  return { ...start, fields: [...date, ...start.fields.filter((f) => f.name !== 'step_date')] }
})
/** The status the values are checked for: update completes the step (all required). */
const checkStatus = computed(() => (isUpdate.value ? 'completed' : 'in_process'))

const values = reactive<Record<string, string>>(
  Object.fromEntries(startStepConfig.value.fields.map((f) => [f.name, ''])),
)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const warnings = ref<WorkflowWarning[]>([])
const isSaving = ref(false)

const title = computed(
  () =>
    props.heading ??
    (props.mode === 'again'
      ? `Apply again: ${props.step.label}`
      : `${props.step.label}: ${props.row.passport_number}`),
)

/* ---------- Placement (teleported, so the scrolling table cannot clip it) ---------- */

const WIDTH = 300
const style = ref<Record<string, string>>({})

function place() {
  if (props.modal) return
  const rect = props.anchor?.getBoundingClientRect()
  if (!rect) return
  const left = Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8))
  style.value = { top: `${rect.bottom + 4}px`, left: `${left}px`, width: `${WIDTH}px` }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!panel.value?.contains(target) && !props.anchor?.contains(target)) close()
}

// The modal handles its own focus, Esc and outside clicks.
onMounted(async () => {
  if (props.modal) return
  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  document.addEventListener('pointerdown', onPointerDown)
  await nextTick()
  panel.value?.querySelector<HTMLInputElement>('input')?.focus()
})
onBeforeUnmount(() => {
  if (props.modal) return
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
  document.removeEventListener('pointerdown', onPointerDown)
})

function close() {
  if (isSaving.value) return
  emit('close')
  if (!props.modal) props.anchor?.focus()
}

/* ---------- Saving ---------- */

function check(): boolean {
  const e = validateStepForm(
    startStepConfig.value,
    checkStatus.value,
    values,
    '',
    today,
    props.step.fields,
  )
  errors.value = e
  return Object.keys(e).length === 0
}

/** Update: the filled fields, flat, as the API takes them (dates as YYYY-MM-DD). */
function updatePayload(): Record<string, string> {
  const payload: Record<string, string> = {}
  for (const field of startStepConfig.value.fields) {
    const raw = (values[field.name] ?? '').trim()
    const value = field.type === 'date' ? toApiDate(raw) : raw
    if (value) payload[field.name] = value
  }
  return payload
}

async function save() {
  if (isSaving.value) return
  banner.value = null
  if (!check()) return
  if (props.optimistic) {
    emit('submitted', stepPayload(startStepConfig.value, 'in_process', values, ''))
    emit('close')
    return
  }
  isSaving.value = true
  try {
    const response = isUpdate.value
      ? await updateCalling(
          props.row.id,
          props.step.key,
          updatePayload() as unknown as CallingUpdatePayload,
        )
      : await startStep(
          props.row.id,
          props.step.key,
          stepPayload(startStepConfig.value, 'in_process', values, ''),
        )
    emit('saved', response)
    if (response.warnings.length > 0) warnings.value = response.warnings
    else emit('close')
  } catch (error) {
    if (errorStatus(error) === 422) {
      const server = fieldErrors(error)
      // Fields inside `details` come back as "details.issue_date".
      errors.value = Object.fromEntries(
        Object.entries(server).map(([key, message]) => [key.replace(/^details\./, ''), message]),
      )
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = errorMessage(error, 'You are not allowed to record this step.')
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <component
    :is="modal ? TopModal : Teleport"
    v-bind="
      modal
        ? { title, subtitle: row.passport_name, busy: isSaving, returnFocus: anchor }
        : { to: 'body' }
    "
    @close="close"
  >
    <form
      ref="panel"
      :class="
        modal ? '' : 'fixed z-50 rounded-xl border border-stroke bg-white p-4 text-left shadow-xl'
      "
      :style="modal ? undefined : style"
      :role="modal ? undefined : 'group'"
      :aria-label="modal ? undefined : title"
      novalidate
      data-step-start-popover
      @submit.prevent="save"
      @keydown.esc.stop="close"
    >
      <template v-if="!modal">
        <p class="text-sm font-semibold text-ink">{{ title }}</p>
        <p class="text-xs text-muted">{{ row.passport_name }}</p>
      </template>

      <!-- Saved, with warnings: shown, never blocking -->
      <template v-if="warnings.length">
        <ul
          class="mt-3 space-y-1 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2 text-sm text-accent-900"
          role="status"
          data-step-warnings
        >
          <li v-for="w in warnings" :key="w.code" class="flex gap-2">
            <span aria-hidden="true">⚠</span>{{ w.message }}
          </li>
        </ul>
        <p class="mt-2 text-sm text-green-800">Saved. You can continue.</p>
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            class="rounded-full bg-primary-900 px-4 py-1.5 text-sm font-semibold text-white"
            data-warnings-ok
            @click="emit('close')"
          >
            OK
          </button>
        </div>
      </template>

      <template v-else>
        <p
          v-if="banner"
          role="alert"
          class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          data-step-banner
        >
          {{ banner }}
        </p>
        <div :class="modal ? '' : 'mt-3'">
          <StepFields
            :fields="startStepConfig.fields"
            :values="values"
            :errors="errors"
            :status="checkStatus"
            :today="today"
            @update="(name, value) => (values[name] = value)"
          />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            :disabled="isSaving"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-full bg-primary-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
            :disabled="isSaving"
            data-step-start-save
          >
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </template>
    </form>
  </component>
</template>
