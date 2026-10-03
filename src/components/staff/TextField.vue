<script setup lang="ts">
import { useId } from 'vue'

/** Labelled text input with an optional hint and an error linked via aria-describedby. */
const model = defineModel<string>({ required: true })
withDefaults(
  defineProps<{
    label: string
    type?: string
    autocomplete?: string
    required?: boolean
    hint?: string
    error?: string
  }>(),
  { type: 'text', autocomplete: 'off', required: false, hint: undefined, error: undefined },
)

const id = useId()
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-slate-700">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :autocomplete="autocomplete"
      :required="required"
      class="mt-1 block w-full rounded-lg border bg-white/90 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600"
      :class="error ? 'border-red-500' : 'border-slate-300'"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="
        [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
      "
    />
    <p v-if="hint" :id="`${id}-hint`" class="mt-1 text-xs text-slate-500">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
