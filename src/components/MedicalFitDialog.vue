<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { recordMedicalResult } from '@/api/medical'
import { addDays, businessToday, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { MedicalSaveResponse } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

/**
 * "Mark NAME as FIT?": the fit medical's issue date (required, not in the future) and its
 * expiry date (required, after the issue date), prefilled with the issue date plus the
 * standard validity from the settings (GET /defaults). A hint shows when the chosen validity
 * differs from the standard. Saving keeps the passport in Medical → Fit (it is not in Calling
 * until it is marked Online).
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ passport: PassportEntry | null }>()
const emit = defineEmits<{ saved: [response: MedicalSaveResponse] }>()

const issueId = useId()
const expiryId = useId()

const today = ref(businessToday())
const issueDate = ref('')
const expiryDate = ref('')
/** The user typed their own expiry: changing the issue date no longer moves it. */
const expiryEdited = ref(false)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const VALIDITY_DAYS = 90

const standardExpiry = computed(() => {
  const issue = toApiDate(issueDate.value)
  return issue ? addDays(issue, VALIDITY_DAYS) : ''
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  today.value = businessToday()
  const medicalDate = props.passport?.medical_date ?? ''
  issueDate.value = medicalDate && medicalDate <= today.value ? medicalDate : today.value
  expiryDate.value = ''
  expiryEdited.value = false
  errors.value = {}
  banner.value = null
  if (!expiryEdited.value) expiryDate.value = standardExpiry.value
})

watch(issueDate, () => {
  delete errors.value.issue_date
  if (!expiryEdited.value) expiryDate.value = standardExpiry.value
})

function onExpiryInput(value: string) {
  expiryDate.value = value
  expiryEdited.value = true
  delete errors.value.expiry_date
}

/** Shown when the expiry is not the standard validity. */
const validityHint = computed(() => {
  const expiry = toApiDate(expiryDate.value)
  if (!standardExpiry.value || !expiry || expiry === standardExpiry.value) return null
  return `The standard validity is ${VALIDITY_DAYS} days (${toDisplayDate(standardExpiry.value)}). This expiry date is different.`
})

async function save() {
  const passport = props.passport
  if (!passport || isSaving.value) return
  banner.value = null
  const issue = toApiDate(issueDate.value)
  const expiry = toApiDate(expiryDate.value)
  const e: Record<string, string> = {}
  if (!issueDate.value) e.issue_date = 'Enter the medical issue date.'
  else if (!issue) e.issue_date = 'Enter a valid date.'
  else if (issue > today.value) e.issue_date = 'The issue date cannot be in the future.'
  if (!expiryDate.value) e.expiry_date = 'Enter the expiry date.'
  else if (!expiry) e.expiry_date = 'Enter a valid date.'
  else if (issue && expiry <= issue) e.expiry_date = 'The expiry date must be after the issue date.'
  errors.value = e
  if (Object.keys(e).length > 0) return

  isSaving.value = true
  try {
    const response = await recordMedicalResult(passport.id, 'fit', {
      issue_date: issue,
      expiry_date: expiry,
    })
    emit('saved', response)
    open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      const known = ['issue_date', 'expiry_date']
      const other = Object.entries(errors.value).filter(([k]) => !known.includes(k))
      if (other.length > 0 || Object.keys(errors.value).length === 0)
        banner.value = other.map(([, m]) => m).join(' ') || errorMessage(error)
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
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="passport ? `Mark ${passport.passport_name} as FIT?` : 'Mark as FIT?'"
    :busy="isSaving"
  >
    <form class="space-y-4" novalidate data-fit-dialog @submit.prevent="save">
      <p
        v-if="banner"
        role="alert"
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        data-fit-banner
      >
        {{ banner }}
      </p>

      <div data-fit-field="issue_date">
        <label :for="issueId" class="block text-sm font-medium text-slate-700">
          Medical issue date<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="issueId"
          v-model="issueDate"
          type="date"
          required
          :max="today"
          :class="[inputClass, errors.issue_date ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.issue_date ? 'true' : undefined"
          :aria-describedby="errors.issue_date ? `${issueId}-error` : `${issueId}-hint`"
        />
        <p v-if="!errors.issue_date" :id="`${issueId}-hint`" class="mt-1 text-xs text-muted">
          {{ toDisplayDate(toApiDate(issueDate)) || 'DD-MM-YYYY' }} · today or earlier
        </p>
        <p v-else :id="`${issueId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.issue_date }}
        </p>
      </div>

      <div data-fit-field="expiry_date">
        <label :for="expiryId" class="block text-sm font-medium text-slate-700">
          Expiry date<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="expiryId"
          :value="expiryDate"
          type="date"
          required
          :class="[inputClass, errors.expiry_date ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.expiry_date ? 'true' : undefined"
          :aria-describedby="errors.expiry_date ? `${expiryId}-error` : `${expiryId}-hint`"
          @input="onExpiryInput(($event.target as HTMLInputElement).value)"
        />
        <p v-if="!errors.expiry_date" :id="`${expiryId}-hint`" class="mt-1 text-xs text-muted">
          {{ toDisplayDate(toApiDate(expiryDate)) || 'DD-MM-YYYY' }} · after the issue date ·
          standard {{ VALIDITY_DAYS }} days
        </p>
        <p v-else :id="`${expiryId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.expiry_date }}
        </p>
        <p
          v-if="validityHint"
          class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
          data-validity-hint
        >
          {{ validityHint }}
        </p>
      </div>

      <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        The passport moves to the Fit tab. Mark it Online there to send it to Calling / Work Permit.
      </p>

      <div class="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary text-sm" :disabled="isSaving" data-fit-confirm>
          {{ isSaving ? 'Saving…' : 'Confirm' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
