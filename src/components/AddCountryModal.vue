<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createCountry } from '@/api/countries'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { AdminCountry } from '@/types/country'

/** Admin "Add country" dialog: a 2-letter code (uppercased as typed) and a name. */
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [country: AdminCountry] }>()

const NAME_MAX = 100

const codeId = useId()
const nameId = useId()

const code = ref('')
const name = ref('')
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  code.value = ''
  name.value = ''
  errors.value = {}
  formError.value = null
})

function onCodeInput(event: Event) {
  const el = event.target as HTMLInputElement
  code.value = el.value
    .replace(/[^a-z]/gi, '')
    .toUpperCase()
    .slice(0, 2)
  el.value = code.value
}

async function onSubmit() {
  errors.value = {}
  formError.value = null
  const trimmedName = name.value.trim().replace(/\s+/g, ' ')
  if (!/^[A-Z]{2}$/.test(code.value))
    errors.value.code = 'The country code must be exactly 2 letters.'
  if (!trimmedName) errors.value.name = 'Enter the country name.'
  else if (trimmedName.length > NAME_MAX)
    errors.value.name = `The country name must be at most ${NAME_MAX} characters.`
  if (Object.keys(errors.value).length > 0) return

  isSaving.value = true
  try {
    const country = await createCountry({ code: code.value, name: trimmedName })
    emit('saved', country)
    open.value = false
  } catch (error) {
    errors.value = fieldErrors(error)
    if (Object.keys(errors.value).length === 0) {
      formError.value =
        errorStatus(error) === 403
          ? 'Only admins can add countries.'
          : errorMessage(error, 'Could not add the country. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" title="Add country" :busy="isSaving">
    <p
      v-if="formError"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ formError }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="onSubmit">
      <div>
        <label :for="codeId" class="block text-sm font-medium text-slate-700">
          Code<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="codeId"
          :value="code"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          required
          autofocus
          maxlength="2"
          :class="[
            inputClass,
            'w-24 font-mono tracking-widest uppercase',
            errors.code ? 'border-red-500' : 'border-slate-300',
          ]"
          :aria-invalid="errors.code ? 'true' : undefined"
          :aria-describedby="`${codeId}-hint${errors.code ? ` ${codeId}-error` : ''}`"
          @input="onCodeInput"
        />
        <p :id="`${codeId}-hint`" class="mt-1 text-xs text-muted">
          2 letters (ISO 3166-1), e.g. MY.
        </p>
        <p v-if="errors.code" :id="`${codeId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.code }}
        </p>
      </div>

      <div>
        <label :for="nameId" class="block text-sm font-medium text-slate-700">
          Name<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="nameId"
          v-model="name"
          type="text"
          autocomplete="off"
          required
          :maxlength="NAME_MAX"
          :class="[inputClass, errors.name ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? `${nameId}-error` : undefined"
        />
        <p v-if="errors.name" :id="`${nameId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.name }}
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
        <button type="submit" class="btn btn-primary" :disabled="isSaving">
          {{ isSaving ? 'Saving…' : 'Add country' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
