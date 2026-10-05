<script setup lang="ts">
import { useId } from 'vue'
import type { ReferenceType } from '@/types/passport'

/** Two-button "Person | Agency" toggle. */
const model = defineModel<ReferenceType>({ required: true })
withDefaults(defineProps<{ label?: string }>(), { label: 'Reference type' })

const labelId = useId()

const options: { value: ReferenceType; label: string }[] = [
  { value: 'person', label: 'Person' },
  { value: 'agency', label: 'Agency' },
]
</script>

<template>
  <div>
    <span :id="labelId" class="block text-sm font-medium text-slate-700">{{ label }}</span>
    <div
      role="group"
      :aria-labelledby="labelId"
      class="mt-1 inline-flex rounded-full border border-slate-300 bg-white p-1"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="min-h-9 rounded-full px-5 text-sm font-semibold transition-colors"
        :class="
          model === option.value
            ? 'bg-primary-900 text-white'
            : 'text-primary-900 hover:bg-primary-50'
        "
        :aria-pressed="model === option.value"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
