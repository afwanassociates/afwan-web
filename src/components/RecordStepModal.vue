<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { isAxiosError } from 'axios'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import PassportExpiryBadge from '@/components/PassportExpiryBadge.vue'
import { getPassport, listPassports } from '@/api/passports'
import { recordStep, updateStepRecord, type StepSaveResponse } from '@/api/steps'
import { useToast } from '@/composables/useToast'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import {
  STEP_REMARKS_MAX,
  stepPayload,
  stepSoftWarnings,
  validateStepForm,
  valuesFromRecord,
  type StepFormValues,
} from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import type { PassportEntry } from '@/types/passport'
import type { StepRecordSummary } from '@/types/workflow'

/**
 * Records or updates one workflow step (3+) for a passport. The form is built from
 * /workflow/config, so a new step needs no new form code. With `record` it updates that
 * record (PATCH); with `withNext`, "Save and next" loads the next passport waiting at the
 * same step.
 */
const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(
  defineProps<{
    passport: PassportEntry | null
    stepKey: string | null
    /** Update this record instead of adding a new one. */
    record?: StepRecordSummary | null
    withNext?: boolean
  }>(),
  { record: null, withNext: false },
)
const emit = defineEmits<{ saved: [response: StepSaveResponse] }>()

const toast = useToast()
const workflow = useWorkflowStore()
const uid = useId()
const today = businessToday()

const current = ref<PassportEntry | null>(null)
const status = ref<string | null>(null)
const values = ref<StepFormValues>({})
const remarks = ref('')
const errors = ref<Record<string, string>>({})
/** Form-level problem: a workflow rule (with its code), 403, network… */
const banner = ref<{ message: string; code?: string } | null>(null)
const isSaving = ref(false)
const isLoadingNext = ref(false)
const configFailed = ref(false)
/** Rejected / Cancelled needs a second, explicit click. */
const confirming = ref(false)
let pendingAction: 'save' | 'next' = 'save'

const step = computed(() => workflow.stepConfig(props.stepKey))
const isUpdate = computed(() => props.record !== null)
const statusLabel = (value: string | null) =>
  step.value?.statuses.find((s) => s.value === value)?.label ?? value ?? ''

const title = computed(() => {
  const label = step.value?.label ?? 'step'
  return isUpdate.value ? `Update ${label}` : `Record ${label}`
})

function resetForm() {
  const s = step.value
  status.value = null
  remarks.value = props.record?.remarks ?? ''
  errors.value = {}
  banner.value = null
  confirming.value = false
  if (!s) {
    values.value = {}
    return
  }
  if (props.record) values.value = valuesFromRecord(s, props.record)
  else {
    const fresh: StepFormValues = {}
    for (const field of s.fields) fresh[field.name] = field.name === 'step_date' ? today : ''
    values.value = fresh
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  current.value = props.passport
  configFailed.value = false
  await workflow.loadConfig()
  if (!step.value) configFailed.value = true
  resetForm()
})

watch(status, () => {
  confirming.value = false
  delete errors.value.status
})

/* ---------- Summary and soft warnings ---------- */

const medicalValidUntil = computed(() => current.value?.current_medical?.valid_until ?? null)

const warnings = computed(() => {
  const p = current.value
  if (!p || !props.stepKey) return []
  const visa = p.workflow.steps.find((s) => s.key === 'visa')?.record
  return stepSoftWarnings({
    stepKey: props.stepKey,
    values: values.value,
    passportExpiry: p.passport_expiry_date,
    visaValidUntil: visa?.valid_until ?? null,
  })
})

const isRequired = (fieldName: string) => {
  const field = step.value?.fields.find((f) => f.name === fieldName)
  return Boolean(status.value && field?.required_for.includes(status.value))
}

/* ---------- Saving ---------- */

const CODE_MESSAGES: Record<string, string> = {
  medical_not_valid: 'Medical expired. Repeat the medical first.',
}

function onSubmit(event: SubmitEvent) {
  const submitter = event.submitter as HTMLButtonElement | null
  requestSave(submitter?.dataset.action === 'next' ? 'next' : 'save')
}

function requestSave(action: 'save' | 'next') {
  const s = step.value
  if (!s || !current.value || isSaving.value) return
  banner.value = null
  errors.value = validateStepForm(s, status.value, values.value, remarks.value, today)
  if (Object.keys(errors.value).length > 0) return
  if (status.value === 'rejected' && !confirming.value) {
    pendingAction = action
    confirming.value = true
    return
  }
  save(action)
}

async function save(action: 'save' | 'next') {
  const s = step.value
  const passport = current.value
  if (!s || !passport || !status.value || !props.stepKey) return
  isSaving.value = true
  const payload = stepPayload(s, status.value, values.value, remarks.value) as never
  try {
    const response = props.record
      ? await updateStepRecord(props.record.id, payload)
      : await recordStep(passport.id, props.stepKey, payload)
    toast.success(`${passport.passport_number}: ${s.label} — ${statusLabel(status.value)}.`)
    for (const warning of response.warnings) toast.warning(warning.message)
    workflow.refresh()
    emit('saved', response)
    if (action === 'next') await loadNext(passport.id)
    else open.value = false
  } catch (error) {
    confirming.value = false
    const code = errorStatus(error)
    const body = isAxiosError(error)
      ? (error.response?.data as { code?: string } | undefined)
      : undefined
    if (code === 422 && body?.code) {
      banner.value = { message: CODE_MESSAGES[body.code] ?? errorMessage(error), code: body.code }
    } else if (code === 422) {
      // "details.airline" → "airline"
      errors.value = Object.fromEntries(
        Object.entries(fieldErrors(error)).map(([key, message]) => [
          key.replace(/^details\./, ''),
          message,
        ]),
      )
      if (Object.keys(errors.value).length === 0) banner.value = { message: errorMessage(error) }
    } else if (code === 403) {
      banner.value = {
        message: isUpdate.value
          ? 'You can only edit your own records, and only before a later step is recorded.'
          : errorMessage(error, 'You are not allowed to record this step.'),
      }
    } else if (code !== 401) {
      banner.value = { message: errorMessage(error, 'Could not save. Please try again.') }
    }
  } finally {
    isSaving.value = false
  }
}

/** The next passport waiting at this step (oldest received first), or close when none. */
async function loadNext(savedId: number) {
  isLoadingNext.value = true
  try {
    const page = await listPassports({
      stage: props.stepKey ?? undefined,
      stage_status: 'waiting',
      sort: 'passport_received_date',
      direction: 'asc',
      per_page: 5,
    })
    const next = page.data.find((p) => p.id !== savedId)
    if (!next) {
      toast.success('No more passports are waiting at this step.')
      open.value = false
      return
    }
    current.value = await getPassport(next.id)
    resetForm()
    await nextTick()
    document.getElementById(`${uid}-status`)?.querySelector('button')?.focus()
  } catch (error) {
    banner.value = { message: errorMessage(error, 'Saved, but could not load the next passport.') }
  } finally {
    isLoadingNext.value = false
  }
}

const busy = computed(() => isSaving.value || isLoadingNext.value)

const STATUS_CLASS: Record<string, { on: string; off: string }> = {
  completed: {
    on: 'border-green-700 bg-green-700 text-white',
    off: 'border-green-300 bg-white text-green-800 hover:bg-green-50',
  },
  in_process: {
    on: 'border-blue-700 bg-blue-700 text-white',
    off: 'border-blue-300 bg-white text-blue-800 hover:bg-blue-50',
  },
  rejected: {
    on: 'border-red-700 bg-red-700 text-white',
    off: 'border-red-300 bg-white text-red-800 hover:bg-red-50',
  },
}
const statusClass = (value: string) => {
  const c = STATUS_CLASS[value] ?? STATUS_CLASS.in_process!
  return status.value === value ? c.on : c.off
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="busy">
    <!-- Passport summary -->
    <dl
      v-if="current"
      class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-surface p-4 text-sm"
      data-passport-summary
    >
      <dt class="text-muted">Name</dt>
      <dd class="font-semibold text-ink">{{ current.passport_name }}</dd>
      <dt class="text-muted">Number</dt>
      <dd class="font-mono tracking-wider text-ink">{{ current.passport_number }}</dd>
      <dt class="text-muted">Country</dt>
      <dd class="text-ink">{{ current.country?.name ?? '—' }}</dd>
      <dt class="text-muted">Company</dt>
      <dd class="text-ink">{{ current.company.name }}</dd>
      <dt class="text-muted">Passport expiry</dt>
      <dd class="flex flex-wrap items-center gap-2 text-ink">
        {{ toDisplayDate(current.passport_expiry_date) || '—' }}
        <PassportExpiryBadge :expiry-date="current.passport_expiry_date" />
      </dd>
      <dt class="text-muted">Medical valid until</dt>
      <dd class="text-ink">{{ toDisplayDate(medicalValidUntil) || '—' }}</dd>
    </dl>

    <p v-if="configFailed" role="alert" class="mt-4 text-sm text-red-700">
      Could not load this step's settings. Close and try again.
    </p>

    <div
      v-if="banner"
      role="alert"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
      :data-code="banner.code"
    >
      {{ banner.message }}
      <RouterLink
        v-if="banner.code === 'medical_not_valid' && current"
        :to="{ name: 'passport-detail', params: { id: current.id } }"
        class="ml-1 underline underline-offset-2"
      >
        Record the medical
      </RouterLink>
    </div>

    <form v-if="step" class="mt-5 space-y-5" novalidate @submit.prevent="onSubmit">
      <!-- Status -->
      <fieldset
        :id="`${uid}-status`"
        :aria-describedby="errors.status ? `${uid}-status-error` : undefined"
      >
        <legend class="text-sm font-medium text-slate-700">
          Status<span class="text-red-700" aria-hidden="true"> *</span>
        </legend>
        <div
          class="mt-1 grid gap-2"
          :class="
            step.statuses.length >= 3
              ? 'grid-cols-3'
              : step.statuses.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-1'
          "
        >
          <button
            v-for="option in step.statuses"
            :key="option.value"
            type="button"
            class="flex min-h-12 items-center justify-center rounded-xl border-2 px-2 text-center font-bold transition-colors"
            :class="statusClass(option.value)"
            :aria-pressed="status === option.value"
            :data-status="option.value"
            @click="status = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <p v-if="errors.status" :id="`${uid}-status-error`" class="mt-1 text-sm text-red-700">
          {{ errors.status }}
        </p>
      </fieldset>

      <!-- Fields from the config -->
      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="field in step.fields" :key="field.name" :data-field="field.name">
          <label :for="`${uid}-${field.name}`" class="block text-sm font-medium text-slate-700">
            {{ field.label
            }}<span v-if="isRequired(field.name)" class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${uid}-${field.name}`"
            v-model="values[field.name]"
            :type="field.type === 'date' ? 'date' : 'text'"
            :maxlength="field.type === 'text' ? (field.max ?? undefined) : undefined"
            :max="field.name === 'step_date' ? today : undefined"
            autocomplete="off"
            :class="[inputClass, errors[field.name] ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors[field.name] ? 'true' : undefined"
            :aria-required="isRequired(field.name) ? 'true' : undefined"
            :aria-describedby="
              errors[field.name]
                ? `${uid}-${field.name}-error`
                : field.type === 'date'
                  ? `${uid}-${field.name}-hint`
                  : undefined
            "
          />
          <p
            v-if="field.type === 'date' && !errors[field.name]"
            :id="`${uid}-${field.name}-hint`"
            class="mt-1 text-xs text-muted"
          >
            {{ toDisplayDate(values[field.name]) || 'DD-MM-YYYY' }}
          </p>
          <p
            v-if="errors[field.name]"
            :id="`${uid}-${field.name}-error`"
            class="mt-1 text-sm text-red-700"
          >
            {{ errors[field.name] }}
          </p>
        </div>
      </div>

      <!-- Remarks -->
      <div>
        <label :for="`${uid}-remarks`" class="block text-sm font-medium text-slate-700">
          Remarks <span class="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          :id="`${uid}-remarks`"
          v-model="remarks"
          rows="2"
          :maxlength="STEP_REMARKS_MAX"
          :class="[inputClass, errors.remarks ? 'border-red-500' : 'border-slate-300']"
          :aria-describedby="`${uid}-remarks-count`"
        />
        <p :id="`${uid}-remarks-count`" class="mt-1 text-right text-xs text-muted tabular-nums">
          {{ remarks.length }} / {{ STEP_REMARKS_MAX }}
        </p>
        <p v-if="errors.remarks" class="mt-1 text-sm text-red-700">{{ errors.remarks }}</p>
      </div>

      <!-- Soft warnings (never blocking) -->
      <ul
        v-if="warnings.length"
        class="space-y-1 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2.5 text-sm text-accent-900"
        role="status"
        data-warnings
      >
        <li v-for="warning in warnings" :key="warning" class="flex gap-2">
          <span aria-hidden="true">⚠</span>{{ warning }}
        </li>
      </ul>

      <!-- Rejected / Cancelled confirmation -->
      <div
        v-if="confirming"
        role="alert"
        class="rounded-xl border-2 border-red-300 bg-red-50 p-4"
        data-confirm-rejected
      >
        <p class="font-semibold text-red-900">
          Mark {{ step.label }} as “{{ statusLabel(status) }}” for {{ current?.passport_number }}?
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn border-red-700 bg-red-700 text-sm text-white hover:bg-red-800"
            :disabled="busy"
            data-confirm
            @click="save(pendingAction)"
          >
            {{ isSaving ? 'Saving…' : `Yes, ${statusLabel(status).toLowerCase()}` }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
            :disabled="busy"
            @click="confirming = false"
          >
            Go back
          </button>
        </div>
      </div>

      <div
        v-else
        class="flex flex-col-reverse gap-3 border-t border-stroke pt-4 sm:flex-row sm:justify-end"
      >
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="busy"
          @click="open = false"
        >
          Cancel
        </button>
        <button
          v-if="withNext && !isUpdate"
          type="submit"
          data-action="next"
          class="btn btn-white"
          :disabled="busy"
        >
          {{ isLoadingNext ? 'Loading next…' : 'Save and next' }}
        </button>
        <button type="submit" data-action="save" class="btn btn-accent" :disabled="busy">
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
