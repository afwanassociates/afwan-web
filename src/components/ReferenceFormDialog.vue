<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createAdminReference, updateAdminReference } from '@/api/references'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { Reference, ReferenceType } from '@/types/passport'

/**
 * Create / edit form for a reference (the operations head): a client party. Type, name and
 * phone required, an RL number for an agency, notes optional. `reference` null creates a new
 * one (always active; references are (de)activated from the list).
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ reference: Reference | null }>()
const emit = defineEmits<{ saved: [reference: Reference, created: boolean] }>()

/** Same limits as the API (StoreReferenceRequest). */
const NAME_MAX = 150
const PHONE_MAX = 30
const NOTES_MAX = 2000
const RL_MAX = 50
const PHONE_PATTERN = /^\+?[0-9][0-9 -]{5,28}$/

const TYPES: { value: ReferenceType; label: string }[] = [
  { value: 'person', label: 'Person' },
  { value: 'agency', label: 'Agency' },
]

const fieldId = useId()

const type = ref<ReferenceType>('person')
const name = ref('')
const phone = ref('')
const rlNumber = ref('')
const notes = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.reference !== null)

watch(open, (isOpen) => {
  if (!isOpen) return
  const r = props.reference
  type.value = r?.type ?? 'person'
  name.value = r?.name ?? ''
  phone.value = r?.phone ?? ''
  rlNumber.value = r?.rl_number ?? ''
  notes.value = r?.notes ?? ''
  errors.value = {}
  banner.value = null
})

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  const trimmedName = name.value.trim().replace(/\s+/g, ' ')
  if (!trimmedName) e.name = 'Enter the reference name.'
  else if (trimmedName.length > NAME_MAX)
    e.name = `The reference name must be at most ${NAME_MAX} characters.`
  const trimmedPhone = phone.value.trim()
  if (!trimmedPhone) e.phone = 'Enter the phone number.'
  else if (trimmedPhone.length > PHONE_MAX)
    e.phone = `The phone number must be at most ${PHONE_MAX} characters.`
  else if (!PHONE_PATTERN.test(trimmedPhone))
    e.phone = 'Enter a valid phone number (digits, spaces or dashes, optional +).'
  const isAgency = type.value === 'agency'
  const trimmedRl = rlNumber.value.trim()
  if (isAgency && !trimmedRl) e.rl_number = 'Enter the RL number of the agency.'
  else if (isAgency && trimmedRl.length > RL_MAX)
    e.rl_number = `The RL number must be at most ${RL_MAX} characters.`
  if (notes.value.trim().length > NOTES_MAX)
    e.notes = `The notes must be at most ${NOTES_MAX} characters.`
  errors.value = e
  if (Object.keys(errors.value).length > 0) return

  const payload = {
    type: type.value,
    name: trimmedName,
    phone: trimmedPhone,
    rl_number: isAgency ? trimmedRl : null,
    notes: notes.value.trim() || null,
  }
  isSaving.value = true
  try {
    const saved = props.reference
      ? await updateAdminReference(props.reference.id, payload)
      : await createAdminReference(payload)
    emit('saved', saved, !props.reference)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'Only the operations head can manage references.'
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the reference. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="isEdit ? 'Edit reference' : 'New reference'"
    :busy="isSaving"
  >
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <fieldset data-field="type">
        <legend class="block text-sm font-medium text-slate-700">
          Type<span class="text-red-700" aria-hidden="true"> *</span>
        </legend>
        <div class="mt-2 flex gap-6">
          <label v-for="t in TYPES" :key="t.value" class="flex items-center gap-2 text-sm">
            <input
              v-model="type"
              type="radio"
              :name="`${fieldId}-type`"
              :value="t.value"
              class="h-4 w-4 accent-primary-700"
            />
            {{ t.label }}
          </label>
        </div>
        <p v-if="errors.type" class="mt-1 text-sm text-red-700">{{ errors.type }}</p>
      </fieldset>

      <div data-field="name">
        <label :for="`${fieldId}-name`" class="block text-sm font-medium text-slate-700">
          Name<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${fieldId}-name`"
          v-model="name"
          type="text"
          autocomplete="off"
          required
          :maxlength="NAME_MAX"
          :class="[inputClass, errors.name ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? `${fieldId}-name-error` : undefined"
        />
        <p v-if="errors.name" :id="`${fieldId}-name-error`" class="mt-1 text-sm text-red-700">
          {{ errors.name }}
        </p>
      </div>

      <div v-if="type === 'agency'" data-field="rl_number">
        <label :for="`${fieldId}-rl`" class="block text-sm font-medium text-slate-700">
          RL number<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${fieldId}-rl`"
          v-model="rlNumber"
          type="text"
          autocomplete="off"
          required
          :maxlength="RL_MAX"
          :class="[inputClass, errors.rl_number ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.rl_number ? 'true' : undefined"
          :aria-describedby="errors.rl_number ? `${fieldId}-rl-error` : undefined"
        />
        <p v-if="errors.rl_number" :id="`${fieldId}-rl-error`" class="mt-1 text-sm text-red-700">
          {{ errors.rl_number }}
        </p>
      </div>

      <div data-field="phone">
        <label :for="`${fieldId}-phone`" class="block text-sm font-medium text-slate-700">
          Phone<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${fieldId}-phone`"
          v-model="phone"
          type="tel"
          autocomplete="off"
          required
          :maxlength="PHONE_MAX"
          :class="[inputClass, errors.phone ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.phone ? 'true' : undefined"
          :aria-describedby="errors.phone ? `${fieldId}-phone-error` : undefined"
        />
        <p v-if="errors.phone" :id="`${fieldId}-phone-error`" class="mt-1 text-sm text-red-700">
          {{ errors.phone }}
        </p>
      </div>

      <div data-field="notes">
        <label :for="`${fieldId}-notes`" class="block text-sm font-medium text-slate-700">
          Notes
        </label>
        <textarea
          :id="`${fieldId}-notes`"
          v-model="notes"
          rows="3"
          :maxlength="NOTES_MAX"
          :class="[inputClass, errors.notes ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.notes ? 'true' : undefined"
          :aria-describedby="errors.notes ? `${fieldId}-notes-error` : undefined"
        />
        <p v-if="errors.notes" :id="`${fieldId}-notes-error`" class="mt-1 text-sm text-red-700">
          {{ errors.notes }}
        </p>
      </div>

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create reference' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
