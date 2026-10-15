<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import TopModal from '@/components/TopModal.vue'
import StepFields from '@/components/StepFields.vue'
import { recordStepResult, type StepSaveResponse } from '@/api/steps'
import { addMonthsNoOverflow, businessToday, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { statusLabel, stepResultPayload, stepWithPhase, validateStepForm } from '@/lib/workflow'
import type { StepConfig, StepListRow, WorkflowWarning } from '@/types/workflow'

/**
 * A small top modal for a step's result ("Mark NAME as Visa issued?"): the step's "result"
 * fields that apply to it, in config order. The result is dated by its first required date
 * field (visa issued: the Issue date); without one (rejected) a Result date is asked (today
 * in Dhaka by default, not in the future). Confirm and Cancel. API warnings are shown
 * without blocking.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  step: StepConfig
  row: StepListRow | null
  result: 'completed' | 'rejected'
}>()
const emit = defineEmits<{ saved: [response: StepSaveResponse] }>()

const dateId = useId()

/** Result fields for this result: those it requires, and all of them for the completed one. */
const resultFields = computed(() =>
  stepWithPhase(props.step, 'result').fields.filter(
    (f) => props.result === 'completed' || f.required_for.includes(props.result),
  ),
)

/** The required date field that dates the result (visa issued: issue_date), if any. */
const dateField = computed(
  () =>
    resultFields.value.find((f) => f.type === 'date' && f.required_for.includes(props.result)) ??
    null,
)

const today = ref(businessToday())
const resultDate = ref(today.value)
const values = reactive<Record<string, string>>({})
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const warnings = ref<WorkflowWarning[]>([])
const isSaving = ref(false)

const RESULT_VALIDITY_MONTHS = 3

/** Whether the user has manually edited valid_until (stops auto-fill). */
const validUntilEdited = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  today.value = businessToday()
  resultDate.value = today.value
  for (const key of Object.keys(values)) delete values[key]
  for (const field of resultFields.value) values[field.name] = ''
  validUntilEdited.value = false
  errors.value = {}
  banner.value = null
  warnings.value = []
})

function onFieldUpdate(name: string, value: string) {
  values[name] = value
  if (name === 'valid_until') {
    validUntilEdited.value = true
    return
  }
  if (name === 'issue_date' && !validUntilEdited.value && 'valid_until' in values) {
    const issue = toApiDate(value)
    if (issue) values.valid_until = addMonthsNoOverflow(issue, RESULT_VALIDITY_MONTHS)
  }
}

const label = computed(() => statusLabel(props.step, props.result))
const title = computed(() =>
  props.row ? `Mark ${props.row.passport_name} as ${label.value}?` : label.value,
)

async function confirm() {
  const row = props.row
  if (!row || isSaving.value) return
  banner.value = null
  const own = dateField.value
  const date = toApiDate(own ? (values[own.name] ?? '') : resultDate.value)
  const e = validateStepForm(
    { ...props.step, fields: resultFields.value },
    props.result,
    { ...values, step_date: date },
    '',
    today.value,
  )
  if (own) {
    // Its own field is checked above (required, not in the future).
  } else if (!resultDate.value) e.result_date = 'Enter the result date.'
  else if (!date) e.result_date = 'Enter a valid date.'
  else if (date > today.value) e.result_date = 'The result date cannot be in the future.'
  errors.value = e
  if (Object.keys(e).length > 0) return

  isSaving.value = true
  try {
    const response = await recordStepResult(
      row.id,
      props.step.key,
      stepResultPayload(props.step, props.result, date, values),
    )
    emit('saved', response)
    if (response.warnings.length > 0) warnings.value = response.warnings
    else open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      const server = fieldErrors(error)
      errors.value = Object.fromEntries(
        Object.entries(server).map(([key, message]) => [
          key === 'step_date' || key === 'result_date'
            ? (dateField.value?.name ?? 'result_date')
            : key.replace(/^details\./, ''),
          message,
        ]),
      )
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = errorMessage(error, 'You are not allowed to record this result.')
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not save the result. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-2.5 py-2 text-slate-900 focus:border-primary-600'
</script>

<template>
  <TopModal v-if="open" :title="title" :busy="isSaving" @close="open = false">
    <div data-step-result-dialog :data-result="result">
      <template v-if="warnings.length">
        <ul
          class="space-y-1 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2 text-sm text-accent-900"
          role="status"
          data-step-warnings
        >
          <li v-for="w in warnings" :key="w.code" class="flex gap-2">
            <span aria-hidden="true">⚠</span>{{ w.message }}
          </li>
        </ul>
        <p class="mt-2 text-sm text-green-800">Saved. You can continue.</p>
        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="btn btn-primary text-sm"
            data-warnings-ok
            @click="open = false"
          >
            OK
          </button>
        </div>
      </template>

      <form v-else class="space-y-3" novalidate @submit.prevent="confirm">
        <p
          v-if="banner"
          role="alert"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          data-step-banner
        >
          {{ banner }}
        </p>

        <div v-if="!dateField" data-step-field="result_date">
          <label :for="dateId" class="block text-sm font-medium text-slate-700">
            Result date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="dateId"
            v-model="resultDate"
            type="date"
            required
            :max="today"
            :class="[inputClass, errors.result_date ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors.result_date ? 'true' : undefined"
            :aria-describedby="errors.result_date ? `${dateId}-error` : undefined"
          />
          <p v-if="!errors.result_date" class="mt-0.5 text-xs text-muted">
            {{ toDisplayDate(toApiDate(resultDate)) || 'DD-MM-YYYY' }}
          </p>
          <p v-else :id="`${dateId}-error`" class="mt-0.5 text-sm text-red-700">
            {{ errors.result_date }}
          </p>
        </div>

        <StepFields
          v-if="resultFields.length"
          :fields="resultFields"
          :values="values"
          :errors="errors"
          :status="result"
          :today="today"
          @update="onFieldUpdate"
        />

        <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-full px-5 py-2 font-semibold text-primary-800 hover:bg-primary-50"
            :disabled="isSaving"
            @click="open = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn text-sm"
            :class="
              result === 'rejected'
                ? 'border-red-700 bg-red-700 text-white hover:bg-red-800'
                : 'btn-primary'
            "
            :disabled="isSaving"
            data-step-result-confirm
          >
            {{ isSaving ? 'Saving…' : 'Confirm' }}
          </button>
        </div>
      </form>
    </div>
  </TopModal>
</template>
