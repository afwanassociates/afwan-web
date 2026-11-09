<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { recordMedicalResult, updateMedicalDate } from '@/api/medical'
import { addDays, businessToday, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { useDateRules } from '@/lib/dateRules'
import { useCountriesStore } from '@/stores/countries'
import type { MedicalResult } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

/**
 * Re-test (the operations head): a new medical with its own date and result. The old result
 * stays in the history. Saving sets the new medical date, then records the result (a fit one
 * with its issue and expiry dates, prefilled like the Fit dialog). If the result fails after
 * the date was saved, saving again records it for that same date.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ passport: PassportEntry | null }>()
const emit = defineEmits<{ saved: [result: MedicalResult] }>()

const uid = useId()
const today = ref(businessToday())
const medicalDate = ref('')
const result = ref<MedicalResult | null>(null)
const issueDate = ref('')
const expiryDate = ref('')
const expiryEdited = ref(false)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const countries = useCountriesStore()
const dateRules = useDateRules(() => props.passport?.company?.country?.code)
const validityDays = computed(() => dateRules.value.medical_validity_days)
/** The medical being replaced: the new one must be after it. */
const lastMedicalDate = computed(() => props.passport?.current_medical?.medical_date ?? null)

const standardExpiry = computed(() => {
  const issue = toApiDate(issueDate.value)
  return issue ? addDays(issue, validityDays.value) : ''
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  await countries.refreshDefaults()
  if (!open.value) return
  today.value = businessToday()
  medicalDate.value = today.value
  result.value = null
  issueDate.value = today.value
  expiryEdited.value = false
  expiryDate.value = standardExpiry.value
  errors.value = {}
  banner.value = null
})

watch(medicalDate, (value) => {
  delete errors.value.medical_date
  // The issue date follows the medical date until it is changed by hand.
  if (value && value <= today.value) issueDate.value = value
})
watch(issueDate, () => {
  delete errors.value.issue_date
  if (!expiryEdited.value) expiryDate.value = standardExpiry.value
})
watch(result, () => delete errors.value.result)

function onExpiryInput(value: string) {
  expiryDate.value = value
  expiryEdited.value = true
  delete errors.value.expiry_date
}

function validate(): boolean {
  const e: Record<string, string> = {}
  const date = toApiDate(medicalDate.value)
  if (!medicalDate.value) e.medical_date = 'Enter the new medical date.'
  else if (!date) e.medical_date = 'Enter a valid date.'
  else if (date > today.value) e.medical_date = 'The medical date cannot be in the future.'
  else if (lastMedicalDate.value && date <= lastMedicalDate.value)
    e.medical_date = `The re-test must be after the last medical (${toDisplayDate(lastMedicalDate.value)}).`
  if (!result.value) e.result = 'Choose the result of the re-test.'
  if (result.value === 'fit') {
    const issue = toApiDate(issueDate.value)
    const expiry = toApiDate(expiryDate.value)
    if (!issueDate.value) e.issue_date = 'Enter the medical issue date.'
    else if (!issue) e.issue_date = 'Enter a valid date.'
    else if (issue > today.value) e.issue_date = 'The issue date cannot be in the future.'
    if (!expiryDate.value) e.expiry_date = 'Enter the expiry date.'
    else if (!expiry) e.expiry_date = 'Enter a valid date.'
    else if (issue && expiry <= issue)
      e.expiry_date = 'The expiry date must be after the issue date.'
  }
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  const passport = props.passport
  if (!passport || isSaving.value || !validate() || !result.value) return
  banner.value = null
  isSaving.value = true
  try {
    const date = toApiDate(medicalDate.value)
    // A retry after a failed result: the date is already saved.
    if (passport.medical_date !== date) await updateMedicalDate(passport.id, date)
    await recordMedicalResult(
      passport.id,
      result.value,
      result.value === 'fit'
        ? { issue_date: toApiDate(issueDate.value), expiry_date: toApiDate(expiryDate.value) }
        : undefined,
    )
    emit('saved', result.value)
    open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      const known = ['medical_date', 'issue_date', 'expiry_date', 'result']
      const other = Object.entries(errors.value).filter(([k]) => !known.includes(k))
      if (other.length > 0 || Object.keys(errors.value).length === 0)
        banner.value = other.map(([, m]) => m).join(' ') || errorMessage(error)
    } else if (status === 403) {
      banner.value = errorMessage(error, 'Only the Operations Head can record a re-test.')
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not save the re-test. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
const resultClass = (value: MedicalResult) =>
  result.value === value
    ? value === 'fit'
      ? 'border-green-700 bg-green-700 text-white'
      : 'border-red-700 bg-red-700 text-white'
    : value === 'fit'
      ? 'border-green-300 bg-white text-green-800 hover:bg-green-50'
      : 'border-red-300 bg-white text-red-800 hover:bg-red-50'
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="passport ? `Medical re-test: ${passport.passport_name}` : 'Medical re-test'"
    :busy="isSaving"
  >
    <form class="space-y-4" novalidate data-retest-dialog @submit.prevent="save">
      <p class="text-sm text-muted">
        The last result
        <template v-if="passport?.current_medical">
          ({{ passport.current_medical.result === 'fit' ? 'Fit' : 'Unfit' }},
          {{ toDisplayDate(passport.current_medical.medical_date) }})
        </template>
        stays in the history. Enter the new medical.
      </p>

      <p
        v-if="banner"
        role="alert"
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        data-retest-banner
      >
        {{ banner }}
      </p>

      <div data-retest-field="medical_date">
        <label :for="`${uid}-date`" class="block text-sm font-medium text-slate-700">
          New medical date<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${uid}-date`"
          v-model="medicalDate"
          type="date"
          required
          :max="today"
          :class="[inputClass, errors.medical_date ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.medical_date ? 'true' : undefined"
          :aria-describedby="errors.medical_date ? `${uid}-date-error` : undefined"
        />
        <p v-if="errors.medical_date" :id="`${uid}-date-error`" class="mt-1 text-sm text-red-700">
          {{ errors.medical_date }}
        </p>
      </div>

      <fieldset data-retest-field="result">
        <legend class="text-sm font-medium text-slate-700">
          Result<span class="text-red-700" aria-hidden="true"> *</span>
        </legend>
        <div class="mt-1 grid grid-cols-2 gap-2">
          <button
            v-for="value in ['fit', 'unfit'] as const"
            :key="value"
            type="button"
            class="flex min-h-12 items-center justify-center rounded-xl border-2 font-bold transition-colors"
            :class="resultClass(value)"
            :aria-pressed="result === value"
            :data-retest-result="value"
            @click="result = value"
          >
            {{ value === 'fit' ? 'Fit' : 'Unfit' }}
          </button>
        </div>
        <p v-if="errors.result" class="mt-1 text-sm text-red-700">{{ errors.result }}</p>
      </fieldset>

      <div v-if="result === 'fit'" class="grid gap-4 sm:grid-cols-2">
        <div data-retest-field="issue_date">
          <label :for="`${uid}-issue`" class="block text-sm font-medium text-slate-700">
            Issue date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${uid}-issue`"
            v-model="issueDate"
            type="date"
            :max="today"
            :class="[inputClass, errors.issue_date ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors.issue_date ? 'true' : undefined"
          />
          <p v-if="errors.issue_date" class="mt-1 text-sm text-red-700">{{ errors.issue_date }}</p>
        </div>
        <div data-retest-field="expiry_date">
          <label :for="`${uid}-expiry`" class="block text-sm font-medium text-slate-700">
            Expiry date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${uid}-expiry`"
            :value="expiryDate"
            type="date"
            :class="[inputClass, errors.expiry_date ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors.expiry_date ? 'true' : undefined"
            @input="onExpiryInput(($event.target as HTMLInputElement).value)"
          />
          <p v-if="errors.expiry_date" class="mt-1 text-sm text-red-700">
            {{ errors.expiry_date }}
          </p>
          <p v-else class="mt-1 text-xs text-muted">Standard validity: {{ validityDays }} days.</p>
        </div>
      </div>

      <div
        class="flex flex-col-reverse gap-3 border-t border-stroke pt-4 sm:flex-row sm:justify-end"
      >
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-accent" :disabled="isSaving" data-retest-save>
          {{ isSaving ? 'Saving…' : 'Save re-test' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
