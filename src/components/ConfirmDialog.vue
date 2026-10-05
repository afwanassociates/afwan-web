<script setup lang="ts">
import BaseDialog from '@/components/staff/BaseDialog.vue'

/** Yes/no confirmation. The parent runs the action on `confirm` and closes it when done. */
const open = defineModel<boolean>('open', { required: true })
withDefaults(
  defineProps<{
    title: string
    confirmLabel?: string
    /** Red confirm button for destructive actions. */
    danger?: boolean
    busy?: boolean
    error?: string | null
  }>(),
  { confirmLabel: 'Confirm', danger: false, busy: false, error: null },
)
defineEmits<{ confirm: [] }>()
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
    <div class="text-slate-700">
      <slot />
    </div>
    <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
        :disabled="busy"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn"
        :class="danger ? 'border-red-700 bg-red-700 text-white hover:bg-red-800' : 'btn-primary'"
        :disabled="busy"
        @click="$emit('confirm')"
      >
        {{ busy ? 'Working…' : confirmLabel }}
      </button>
    </div>
  </BaseDialog>
</template>
