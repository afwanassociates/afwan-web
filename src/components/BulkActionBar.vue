<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import { businessToday, toApiDate, toDisplayDate } from '@/lib/dates'

/** A date the bulk action needs, entered once for every selected passport. */
export interface BulkField {
  name: string
  label: string
  /** Prefilled with today (Dhaka). */
  defaultToday?: boolean
  /** Cannot be in the future. */
  notFuture?: boolean
  /** Must be after this other field (e.g. the expired date after the issue date). */
  after?: string
}

/** One action of the bar, e.g. "Training done" or "Visa issued". */
export interface BulkAction {
  key: string
  label: string
  fields: BulkField[]
}

/**
 * The bar above a step list when passports are selected: "12 selected", the action, its
 * date(s) and Apply. It checks the dates here (required, not in the future, after); the
 * page asks for confirmation and saves.
 */
const props = defineProps<{
  count: number
  actions: BulkAction[]
  busy?: boolean
}>()
const emit = defineEmits<{
  apply: [action: BulkAction, values: Record<string, string>]
  clear: []
}>()

const actionId = useId()
const fieldId = (name: string) => `${actionId}-${name}`

const actionKey = ref(props.actions[0]?.key ?? '')
const action = computed(
  () => props.actions.find((a) => a.key === actionKey.value) ?? props.actions[0],
)
const values = reactive<Record<string, string>>({})
const errors = ref<Record<string, string>>({})

/** A new action (or a new step page): its dates start fresh. */
function reset() {
  errors.value = {}
  for (const key of Object.keys(values)) delete values[key]
  for (const field of action.value?.fields ?? []) {
    values[field.name] = field.defaultToday ? businessToday() : ''
  }
}

watch(
  () => props.actions.map((a) => a.key).join(','),
  () => {
    if (!props.actions.some((a) => a.key === actionKey.value))
      actionKey.value = props.actions[0]?.key ?? ''
    reset()
  },
  { immediate: true },
)
watch(actionKey, reset)

function apply() {
  const current = action.value
  if (!current || props.busy) return
  const today = businessToday()
  const e: Record<string, string> = {}
  const dates: Record<string, string> = {}
  for (const field of current.fields) {
    const raw = (values[field.name] ?? '').trim()
    const date = toApiDate(raw)
    if (!raw) e[field.name] = `Enter the ${field.label.toLowerCase()}.`
    else if (!date) e[field.name] = 'Enter a valid date.'
    else if (field.notFuture && date > today) e[field.name] = 'The date cannot be in the future.'
    else dates[field.name] = date
  }
  for (const field of current.fields) {
    const other = field.after ? current.fields.find((f) => f.name === field.after) : undefined
    if (other && dates[field.name] && dates[other.name] && dates[field.name]! <= dates[other.name]!)
      e[field.name] =
        `Must be after the ${other.label.toLowerCase()} (${toDisplayDate(dates[other.name])}).`
  }
  errors.value = e
  if (Object.keys(e).length === 0) emit('apply', current, dates)
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-600'
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3"
    role="region"
    aria-label="Bulk update"
    data-bulk-bar
  >
    <p class="self-center text-sm font-semibold text-primary-900" data-bulk-count>
      {{ count }} selected
    </p>
    <div>
      <label :for="actionId" class="block text-xs font-medium text-slate-700">Action</label>
      <select
        :id="actionId"
        v-model="actionKey"
        :class="[inputClass, 'border-slate-300']"
        :disabled="busy"
        data-bulk-action
      >
        <option v-for="a in actions" :key="a.key" :value="a.key">{{ a.label }}</option>
      </select>
    </div>
    <div v-for="field in action?.fields ?? []" :key="field.name">
      <label :for="fieldId(field.name)" class="block text-xs font-medium text-slate-700">
        {{ field.label }}
      </label>
      <input
        :id="fieldId(field.name)"
        v-model="values[field.name]"
        type="date"
        :max="field.notFuture ? businessToday() : undefined"
        :class="[inputClass, errors[field.name] ? 'border-red-500' : 'border-slate-300']"
        :disabled="busy"
        :aria-invalid="errors[field.name] ? 'true' : undefined"
        :aria-describedby="errors[field.name] ? `${fieldId(field.name)}-error` : undefined"
        :data-bulk-field="field.name"
      />
      <p
        v-if="errors[field.name]"
        :id="`${fieldId(field.name)}-error`"
        class="mt-1 max-w-56 text-xs text-red-700"
      >
        {{ errors[field.name] }}
      </p>
    </div>
    <button
      type="button"
      class="btn btn-primary text-sm"
      :disabled="busy || !action"
      data-bulk-apply
      @click="apply"
    >
      {{ busy ? 'Saving…' : `Apply to ${count}` }}
    </button>
    <button
      type="button"
      class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
      :disabled="busy"
      data-bulk-clear
      @click="emit('clear')"
    >
      Clear selection
    </button>
  </div>
</template>
