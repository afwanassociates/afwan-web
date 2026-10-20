<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'

/**
 * Asks why an entry is returned to its preparer. The parent sends it on `confirm` and closes
 * the dialog when done; `error` shows a refusal from the API.
 */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ confirm: [reason: string] }>()

const id = useId()
const reason = ref('')
const missing = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    reason.value = ''
    missing.value = false
  }
})

function submit() {
  const text = reason.value.trim().replace(/\s+/g, ' ')
  missing.value = !text
  if (text) emit('confirm', text)
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
      <slot />
      <div data-field="reason">
        <label :for="id" class="block text-sm font-medium text-slate-700">
          Reason<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <textarea
          :id="id"
          v-model="reason"
          rows="3"
          maxlength="500"
          placeholder="e.g. Amount does not match the bank slip"
          class="mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600"
          :class="missing ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="missing ? 'true' : undefined"
        />
        <p v-if="missing" class="mt-1 text-sm text-red-700">
          Write why it is returned, so the preparer can fix it.
        </p>
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
          {{ busy ? 'Returning…' : 'Return to preparer' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
