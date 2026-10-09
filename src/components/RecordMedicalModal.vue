<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { fetchMedicalQueue, recordMedical, updateMedical } from '@/api/medical'
import { getPassport } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { addDays, businessToday, daysLeft, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import {
  MEDICAL_VALIDITY_MONTHS,
  REMARKS_MAX,
  medicalDateWarnings,
  validUntilFor,
} from '@/lib/medical'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalRecord, MedicalResult, MedicalSaveResponse } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

/**
 * Records a medical result for a passport (first medical, repeat or re-test), or edits an
 * existing record when `record` is given. With `withNext`, "Save and next pending" loads
 * the next passport from the medical queue into the same dialog.
 */
const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(
  defineProps<{
    passport: PassportEntry | null
    /** Edit this record (PATCH) instead of adding a new one. */
    record?: MedicalRecord | null
    /** Offer "Save and next pending" (opened from the Pending tab). */
    withNext?: boolean
  }>(),
  { record: null, withNext: false },
)
const emit = defineEmits<{ saved: [response: MedicalSaveResponse] }>()

const toast = useToast()
const workflow = useWorkflowStore()

const dateId = useId()
const remarksId = useId()
const resultLabelId = useId()

const today = businessToday()
const oldestAllowed = addDays(today, -365)

/** The passport being recorded (changes with "Save and next pending"). */
const current = ref<PassportEntry | null>(null)
const medicalDate = ref(today)
const result = ref<MedicalResult | null>(null)
const remarks = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)
const isLoadingNext = ref(false)
/** Unfit needs a second, explicit click. */
const confirmingUnfit = ref(false)
let pendingAction: SaveAction = 'save'

const dateInput = useTemplateRef<HTMLInputElement>('dateInput')

const isEdit = computed(() => props.record !== null)

const title = computed(() => {
  if (isEdit.value) return 'Edit medical'
  const status = current.value?.medical_status
  if (status === 'unfit') return 'Re-test'
  if (status === 'fit' || status === 'expiring_soon' || status === 'expired')
    return 'Repeat medical'
  return 'Record medical'
})

function resetForm(keepDate = false) {
  if (!keepDate) medicalDate.value = props.record?.medical_date ?? today
  result.value = props.record?.result ?? null
  remarks.value = props.record?.remarks ?? ''
  errors.value = {}
  banner.value = null
  confirmingUnfit.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) return
  current.value = props.passport
  resetForm()
})

watch(result, () => {
  confirmingUnfit.value = false
  delete errors.value.result
})

/* ---------- Live feedback ---------- */

const validDate = computed(() => toApiDate(medicalDate.value))

const validUntilPreview = computed(() =>
  result.value === 'fit' && validDate.value ? validUntilFor(validDate.value) : null,
)

const warnings = computed(() => {
  const passport = current.value
  if (!passport || !validDate.value) return []
  return medicalDateWarnings({
    medicalDate: validDate.value,
    validUntil: validUntilPreview.value,
    passportReceivedDate: passport.passport_received_date,
    passportExpiryDate: passport.passport_expiry_date,
    today,
  })
})

const expiryChip = computed(() => {
  const expiry = current.value?.passport_expiry_date
  if (!expiry) return { text: 'Not set', class: 'bg-slate-100 text-slate-700' }
  const left = daysLeft(expiry, today) ?? 0
  if (left < 0) return { text: 'Expired', class: 'bg-red-50 text-red-800' }
  if (left <= 180) return { text: 'Expires soon', class: 'bg-accent-50 text-accent-800' }
  return { text: 'Valid', class: 'bg-green-50 text-green-800' }
})

/* ---------- Saving ---------- */

type SaveAction = 'save' | 'next'

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!medicalDate.value) e.medical_date = 'Enter the medical date.'
  else if (!validDate.value) e.medical_date = 'Enter a valid date.'
  else if (validDate.value > today) e.medical_date = 'The medical date cannot be in the future.'
  else if (validDate.value < oldestAllowed)
    e.medical_date = 'The medical date cannot be more than 1 year ago.'
  if (!result.value) e.result = 'Choose Fit or Unfit.'
  if (remarks.value.length > REMARKS_MAX)
    e.remarks = `The remarks must be at most ${REMARKS_MAX} characters.`
  errors.value = e
  return Object.keys(e).length === 0
}

function onSubmit(event: SubmitEvent) {
  const submitter = event.submitter as HTMLButtonElement | null
  requestSave(submitter?.dataset.action === 'next' ? 'next' : 'save')
}

function requestSave(action: SaveAction) {
  if (isSaving.value || !current.value) return
  banner.value = null
  if (!validate()) {
    if (errors.value.medical_date) dateInput.value?.focus()
    return
  }
  // Marking unfit removes the passport from the Passport List: ask once more.
  if (result.value === 'unfit' && !confirmingUnfit.value) {
    pendingAction = action
    confirmingUnfit.value = true
    return
  }
  save(action)
}

function confirmUnfit() {
  save(pendingAction)
}

async function save(action: SaveAction) {
  const passport = current.value
  if (!passport || !result.value) return
  isSaving.value = true
  const payload = {
    medical_date: validDate.value,
    result: result.value,
    remarks: remarks.value.trim() || null,
  }
  try {
    const response = props.record
      ? await updateMedical(props.record.id, payload)
      : await recordMedical(passport.id, payload)

    const what = result.value === 'fit' ? 'Fit' : 'Unfit'
    toast.success(`${passport.passport_number}: medical saved (${what}).`)
    for (const warning of response.warnings) toast.warning(warning.message)
    workflow.refresh()
    emit('saved', response)

    if (action === 'next') await loadNextPending(passport.id)
    else open.value = false
  } catch (error) {
    confirmingUnfit.value = false
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = isEdit.value
        ? 'You can only edit medical records you entered.'
        : passport.medical_status === 'unfit'
          ? 'Only admins can re-test an unfit passport.'
          : errorMessage(error, 'You are not allowed to record a medical for this passport.')
    } else if (status !== 401) {
      // Network or server error: keep everything the user typed.
      banner.value = errorMessage(error, 'Could not save the medical. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

/** Moves to the oldest passport still waiting for a medical, or closes when none are left. */
async function loadNextPending(savedId: number) {
  isLoadingNext.value = true
  try {
    const queue = await fetchMedicalQueue({ per_page: 5 })
    const next = queue.data.find((item) => item.id !== savedId)
    if (!next) {
      toast.success('No more passports are waiting for a medical.')
      open.value = false
      return
    }
    current.value = await getPassport(next.id)
    // Same medical date for the batch; result and remarks start empty again.
    resetForm(true)
    await nextTick()
    dateInput.value?.focus()
  } catch (error) {
    banner.value = errorMessage(error, 'Saved, but could not load the next pending passport.')
  } finally {
    isLoadingNext.value = false
  }
}

const busy = computed(() => isSaving.value || isLoadingNext.value)

const resultButtonClass = (value: MedicalResult) => {
  const selected = result.value === value
  if (value === 'fit')
    return selected
      ? 'border-green-700 bg-green-700 text-white'
      : 'border-green-300 bg-white text-green-800 hover:bg-green-50'
  return selected
    ? 'border-red-700 bg-red-700 text-white'
    : 'border-red-300 bg-white text-red-800 hover:bg-red-50'
}
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
      <dt class="text-muted">Expiry</dt>
      <dd class="flex flex-wrap items-center gap-2 text-ink">
        {{ toDisplayDate(current.passport_expiry_date) || '—' }}
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="expiryChip.class">
          {{ expiryChip.text }}
        </span>
      </dd>
    </dl>

    <p
      v-if="banner"
      role="alert"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>

    <form class="mt-5 space-y-5" novalidate @submit.prevent="onSubmit">
      <!-- Medical date -->
      <div>
        <label :for="dateId" class="block text-sm font-medium text-slate-700">
          Medical date<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="dateId"
          ref="dateInput"
          v-model="medicalDate"
          type="date"
          required
          :min="oldestAllowed"
          :max="today"
          class="mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600"
          :class="errors.medical_date ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="errors.medical_date ? 'true' : undefined"
          :aria-describedby="`${dateId}-hint${errors.medical_date ? ` ${dateId}-error` : ''}`"
        />
        <p :id="`${dateId}-hint`" class="mt-1 text-xs text-muted">
          {{ toDisplayDate(validDate) || 'DD-MM-YYYY' }} · within the last 12 months
        </p>
        <p v-if="errors.medical_date" :id="`${dateId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.medical_date }}
        </p>
      </div>

      <!-- Result -->
      <fieldset :aria-describedby="errors.result ? `${resultLabelId}-error` : undefined">
        <legend :id="resultLabelId" class="text-sm font-medium text-slate-700">
          Result<span class="text-red-700" aria-hidden="true"> *</span>
        </legend>
        <div class="mt-1 grid grid-cols-2 gap-3">
          <button
            v-for="value in ['fit', 'unfit'] as const"
            :key="value"
            type="button"
            class="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 text-lg font-bold transition-colors"
            :class="resultButtonClass(value)"
            :aria-pressed="result === value"
            :data-result="value"
            @click="result = value"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="value === 'fit' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6 6l12 12M18 6L6 18'" />
            </svg>
            {{ value === 'fit' ? 'Fit' : 'Unfit' }}
          </button>
        </div>
        <p v-if="errors.result" :id="`${resultLabelId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.result }}
        </p>

        <p
          v-if="validUntilPreview"
          class="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"
          data-preview
        >
          Valid until <strong>{{ toDisplayDate(validUntilPreview) }}</strong> ({{
            MEDICAL_VALIDITY_MONTHS
          }}
          months)
        </p>
        <p
          v-if="result === 'unfit'"
          class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900"
          data-unfit-notice
        >
          This passport will move to the Unfit list and disappear from the Passport List.
        </p>
      </fieldset>

      <!-- Remarks -->
      <div>
        <label :for="remarksId" class="block text-sm font-medium text-slate-700">
          Remarks <span class="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          :id="remarksId"
          v-model="remarks"
          rows="3"
          :maxlength="REMARKS_MAX"
          class="mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600"
          :class="errors.remarks ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="errors.remarks ? 'true' : undefined"
          :aria-describedby="`${remarksId}-hint${errors.remarks ? ` ${remarksId}-error` : ''}`"
        />
        <p :id="`${remarksId}-hint`" class="mt-1 flex justify-between gap-3 text-xs text-muted">
          <span>Add the reason for unfit results.</span>
          <span class="tabular-nums" aria-live="polite"
            >{{ remarks.length }} / {{ REMARKS_MAX }}</span
          >
        </p>
        <p v-if="errors.remarks" :id="`${remarksId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.remarks }}
        </p>
      </div>

      <!-- Soft warnings: shown, never blocking -->
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

      <!-- Unfit confirmation -->
      <div
        v-if="confirmingUnfit"
        role="alert"
        class="rounded-xl border-2 border-red-300 bg-red-50 p-4"
        data-confirm-unfit
      >
        <p class="font-semibold text-red-900">Mark {{ current?.passport_number }} as unfit?</p>
        <p class="mt-1 text-sm text-red-900">
          It will move to the Unfit Passports list and leave the Passport List.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn border-red-700 bg-red-700 text-sm text-white hover:bg-red-800"
            :disabled="busy"
            data-confirm
            @click="confirmUnfit"
          >
            {{ isSaving ? 'Saving…' : 'Yes, mark as unfit' }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
            :disabled="busy"
            @click="confirmingUnfit = false"
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
          v-if="withNext && !isEdit"
          type="submit"
          data-action="next"
          class="btn btn-white"
          :disabled="busy"
        >
          {{ isLoadingNext ? 'Loading next…' : 'Save and next pending' }}
        </button>
        <button type="submit" data-action="save" class="btn btn-accent" :disabled="busy">
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
