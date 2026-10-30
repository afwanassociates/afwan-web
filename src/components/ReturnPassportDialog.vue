<script setup lang="ts">
import { reactive, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import TextField from '@/components/staff/TextField.vue'
import { returnPassport } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { PassportEntry } from '@/types/passport'

/** The passport being returned: any list row with these fields will do. */
export interface ReturnTarget {
  id: number
  passport_name: string
  passport_number: string
  reference?: { name: string } | null
}

/**
 * Return a passport to its owner (the operations head, at any step). The reference is shown
 * read-only; the receiver's name, phone and the return date are required. Saves on its own
 * and emits `returned` with the updated passport.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ passport: ReturnTarget | null }>()
const emit = defineEmits<{ returned: [passport: PassportEntry] }>()

const toast = useToast()
const remarksId = useId()
const dateId = useId()
const today = businessToday()

const form = reactive({
  return_date: today,
  receiver_name: '',
  receiver_phone: '',
  receiver_id_no: '',
  remarks: '',
})
const errors = ref<Record<string, string>>({})
const error = ref<string | null>(null)
const busy = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, {
    return_date: today,
    receiver_name: '',
    receiver_phone: '',
    receiver_id_no: '',
    remarks: '',
  })
  errors.value = {}
  error.value = null
})

function validate(): boolean {
  const next: Record<string, string> = {}
  if (!form.receiver_name.trim())
    next.receiver_name = 'Enter the name of the person collecting the passport.'
  if (!form.receiver_phone.trim()) next.receiver_phone = 'Enter the receiver’s phone number.'
  if (!form.return_date) next.return_date = 'Enter the return date.'
  else if (form.return_date > today) next.return_date = 'The return date cannot be in the future.'
  errors.value = next
  return Object.keys(next).length === 0
}

async function submit() {
  const passport = props.passport
  if (!passport || !validate()) return
  busy.value = true
  error.value = null
  try {
    const updated = await returnPassport(passport.id, {
      return_date: form.return_date,
      receiver_name: form.receiver_name.trim(),
      receiver_phone: form.receiver_phone.trim(),
      receiver_id_no: form.receiver_id_no.trim() || null,
      remarks: form.remarks.trim() || null,
    })
    open.value = false
    toast.success(
      `${passport.passport_number} returned to ${updated.returned?.receiver_name ?? form.receiver_name.trim()} on ${toDisplayDate(form.return_date)}.`,
    )
    emit('returned', updated)
  } catch (e) {
    const status = errorStatus(e)
    if (status === 422) {
      errors.value = fieldErrors(e)
      if (Object.keys(errors.value).length === 0) error.value = errorMessage(e)
    } else if (status === 403) error.value = 'Only the Operations Head can return a passport.'
    else if (status !== 401)
      error.value = errorMessage(e, 'Could not return the passport. Please try again.')
  } finally {
    busy.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white/90 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" title="Return passport" :busy="busy">
    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ error }}
    </p>
    <form v-if="passport" class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm text-slate-700">
        <strong>{{ passport.passport_name }}</strong>
        (<span class="font-mono">{{ passport.passport_number }}</span
        >) leaves every working list. No step can be recorded on it until the return is undone.
      </p>
      <div data-field="reference">
        <p class="block text-sm font-medium text-slate-700">Reference</p>
        <p class="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">
          {{ passport.reference?.name ?? 'No reference' }}
        </p>
      </div>
      <TextField
        v-model="form.receiver_name"
        label="Receiver name *"
        autocomplete="off"
        required
        :error="errors.receiver_name"
        data-field="receiver_name"
      />
      <TextField
        v-model="form.receiver_phone"
        label="Receiver phone *"
        type="tel"
        required
        :error="errors.receiver_phone"
        data-field="receiver_phone"
      />
      <TextField
        v-model="form.receiver_id_no"
        label="Receiver NID / Passport no."
        hint="Optional"
        :error="errors.receiver_id_no"
        data-field="receiver_id_no"
      />
      <div data-field="return_date">
        <label :for="dateId" class="block text-sm font-medium text-slate-700">Return date *</label>
        <input
          :id="dateId"
          v-model="form.return_date"
          type="date"
          :max="today"
          required
          :class="[inputClass, errors.return_date ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.return_date ? 'true' : undefined"
        />
        <p v-if="errors.return_date" class="mt-1 text-sm text-red-700">{{ errors.return_date }}</p>
      </div>
      <div data-field="remarks">
        <label :for="remarksId" class="block text-sm font-medium text-slate-700">Remarks</label>
        <textarea
          :id="remarksId"
          v-model="form.remarks"
          rows="2"
          maxlength="500"
          :class="[inputClass, errors.remarks ? 'border-red-500' : 'border-slate-300']"
        />
        <p v-if="errors.remarks" class="mt-1 text-sm text-red-700">{{ errors.remarks }}</p>
      </div>
      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="busy"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="busy" data-action="return">
          {{ busy ? 'Returning…' : 'Return passport' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
