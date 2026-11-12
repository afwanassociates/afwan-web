<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { parseAmount } from '@/lib/accounts'

/**
 * Sets a price: a company's standard rate, a reference's rate for a company, or one
 * passport's special price. Empty + Remove (when `removable`) clears it. `showUpdateExisting`
 * offers to re-price passports that already have a price (rates only). The parent saves on
 * `save` and closes the dialog when done; `error` shows a refusal from the API. The default
 * slot adds fields above the price (e.g. choosing the company when adding a rate).
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  title: string
  /** Shown above the field (what this price applies to). */
  description?: string
  value: number | null
  removable?: boolean
  removeLabel?: string
  showUpdateExisting?: boolean
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ save: [price: number | null, updateExisting: boolean] }>()

const id = useId()
const amount = ref('')
const updateExisting = ref(false)
const fieldError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  amount.value = props.value === null ? '' : String(props.value)
  updateExisting.value = false
  fieldError.value = null
})

function submit() {
  const parsed = parseAmount(amount.value, { allowZero: true })
  if (amount.value.trim() === '' || parsed.error) {
    fieldError.value = parsed.error ?? 'Enter the price.'
    return
  }
  fieldError.value = null
  emit('save', parsed.amount ?? 0, updateExisting.value)
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="busy">
    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ error }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p v-if="description" class="text-sm text-muted">{{ description }}</p>
      <!-- Extra fields, e.g. the company when adding a rate. -->
      <slot />
      <div data-field="price">
        <label :for="id" class="block text-sm font-medium text-slate-700">
          Price per passport<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="id"
          v-model="amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="e.g. 45000"
          class="mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 tabular-nums focus:border-primary-600"
          :class="fieldError ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="fieldError ? 'true' : undefined"
          data-price-input
        />
        <p v-if="fieldError" class="mt-1 text-sm text-red-700">{{ fieldError }}</p>
      </div>
      <label v-if="showUpdateExisting" class="flex items-start gap-2 text-sm text-slate-700">
        <input
          v-model="updateExisting"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-slate-300"
          data-update-existing
        />
        <span>
          Also change existing passports
          <span class="block text-xs text-muted">
            Passports without a price always get it. Leave this off to keep the price older
            passports already have. Special prices never change.
          </span>
        </span>
      </label>
      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          v-if="removable"
          type="button"
          class="rounded-full px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
          :disabled="busy"
          data-action="remove"
          @click="emit('save', null, updateExisting)"
        >
          {{ removeLabel ?? 'Remove' }}
        </button>
        <span v-else />
        <div class="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
            :disabled="busy"
            @click="open = false"
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="busy" data-action="save">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </form>
  </BaseDialog>
</template>
