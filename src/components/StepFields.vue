<script setup lang="ts">
import { useId } from 'vue'
import { toApiDate, toDisplayDate } from '@/lib/dates'
import { notFutureFor } from '@/lib/workflow'
import type { StepFieldConfig } from '@/types/workflow'

/**
 * Inputs for a step's config fields (text or date), with labels, a DD-MM-YYYY hint under
 * dates, required markers for `status` and error messages. Changes are emitted (`update`).
 */
defineProps<{
  fields: StepFieldConfig[]
  values: Record<string, string>
  errors: Record<string, string>
  /** The status being recorded: decides which fields are required. */
  status: string
  /** Latest allowed date for dates that cannot be in the future (YYYY-MM-DD). */
  today: string
}>()
const emit = defineEmits<{ update: [name: string, value: string] }>()

const idPrefix = useId()

/** The step date never lies in the future; other dates follow their not-future rule. */
const maxFor = (field: StepFieldConfig, status: string, today: string) =>
  field.type === 'date' && (field.name === 'step_date' || notFutureFor(field).includes(status))
    ? today
    : undefined

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-2.5 py-2 text-slate-900 focus:border-primary-600'
</script>

<template>
  <div class="space-y-3">
    <div v-for="field in fields" :key="field.name" :data-step-field="field.name">
      <label :for="`${idPrefix}-${field.name}`" class="block text-sm font-medium text-slate-700">
        {{ field.label
        }}<span v-if="field.required_for.includes(status)" class="text-red-700" aria-hidden="true">
          *</span
        >
      </label>
      <input
        :id="`${idPrefix}-${field.name}`"
        :value="values[field.name] ?? ''"
        @input="emit('update', field.name, ($event.target as HTMLInputElement).value)"
        :type="field.type === 'date' ? 'date' : 'text'"
        autocomplete="off"
        :required="field.required_for.includes(status)"
        :max="maxFor(field, status, today)"
        :maxlength="field.type === 'text' ? (field.max ?? undefined) : undefined"
        :class="[inputClass, errors[field.name] ? 'border-red-500' : 'border-slate-300']"
        :aria-invalid="errors[field.name] ? 'true' : undefined"
        :aria-describedby="errors[field.name] ? `${idPrefix}-${field.name}-error` : undefined"
      />
      <p v-if="field.type === 'date' && !errors[field.name]" class="mt-0.5 text-xs text-muted">
        {{ toDisplayDate(toApiDate(values[field.name] ?? '')) || 'DD-MM-YYYY' }}
      </p>
      <p
        v-if="errors[field.name]"
        :id="`${idPrefix}-${field.name}-error`"
        class="mt-0.5 text-sm text-red-700"
      >
        {{ errors[field.name] }}
      </p>
    </div>
  </div>
</template>
