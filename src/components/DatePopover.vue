<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import { toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'

/**
 * A small popover (not a modal) under its button with one date: Save, and Clear when a date
 * is already saved. `save` / `clear` call the API; their 422 message shows under the field,
 * other errors above it. Esc and a click outside close it; future dates are allowed.
 */
const props = defineProps<{
  /** The button that opened it (the popover is placed under it). */
  anchor: HTMLElement | null
  title: string
  subtitle?: string
  label: string
  /** The saved date (YYYY-MM-DD), if any. */
  value: string | null
  save: (date: string) => Promise<void>
  clear?: () => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()

const inputId = useId()
const panel = useTemplateRef<HTMLFormElement>('panel')
const date = ref(props.value ?? '')
const error = ref('')
const banner = ref('')
const isSaving = ref(false)

/* ---------- Placement (teleported, so the scrolling table cannot clip it) ---------- */

const WIDTH = 280
const style = ref<Record<string, string>>({})

function place() {
  const rect = props.anchor?.getBoundingClientRect()
  if (!rect) return
  const left = Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8))
  style.value = { top: `${rect.bottom + 4}px`, left: `${left}px`, width: `${WIDTH}px` }
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!panel.value?.contains(target) && !props.anchor?.contains(target)) close()
}

onMounted(async () => {
  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  document.addEventListener('pointerdown', onPointerDown)
  await nextTick()
  panel.value?.querySelector<HTMLInputElement>('input')?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
  document.removeEventListener('pointerdown', onPointerDown)
})

function close() {
  if (isSaving.value) return
  emit('close')
  props.anchor?.focus()
}

/* ---------- Saving ---------- */

async function run(action: () => Promise<void>) {
  if (isSaving.value) return
  isSaving.value = true
  error.value = ''
  banner.value = ''
  try {
    await action()
    emit('close')
  } catch (e) {
    const status = errorStatus(e)
    if (status === 422) {
      const first = Object.values(fieldErrors(e))[0]
      if (first) error.value = first
      else banner.value = errorMessage(e)
    } else if (status !== 401) {
      banner.value = errorMessage(e, 'Could not save. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

function onSave() {
  const value = toApiDate(date.value)
  if (!date.value) error.value = `Enter the ${props.label.toLowerCase()}.`
  else if (!value) error.value = 'Enter a valid date.'
  else run(() => props.save(value))
}

function onClear() {
  if (props.clear) run(props.clear)
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-2.5 py-2 text-slate-900 focus:border-primary-600'
</script>

<template>
  <Teleport to="body">
    <form
      ref="panel"
      class="fixed z-50 rounded-xl border border-stroke bg-white p-4 text-left shadow-xl"
      :style="style"
      role="group"
      :aria-label="title"
      novalidate
      data-date-popover
      @submit.prevent="onSave"
      @keydown.esc.stop="close"
    >
      <p class="text-sm font-semibold text-ink">{{ title }}</p>
      <p v-if="subtitle" class="text-xs text-muted">{{ subtitle }}</p>
      <p
        v-if="banner"
        role="alert"
        class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        data-date-banner
      >
        {{ banner }}
      </p>
      <div class="mt-3">
        <label :for="inputId" class="block text-sm font-medium text-slate-700">
          {{ label }}<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="inputId"
          v-model="date"
          type="date"
          required
          :class="[inputClass, error ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? `${inputId}-error` : undefined"
          @input="error = ''"
        />
        <p v-if="!error" class="mt-0.5 text-xs text-muted">
          {{ toDisplayDate(toApiDate(date)) || 'DD-MM-YYYY' }}
        </p>
        <p v-else :id="`${inputId}-error`" class="mt-0.5 text-sm text-red-700" data-date-error>
          {{ error }}
        </p>
      </div>
      <div class="mt-4 flex items-center justify-end gap-2">
        <button
          v-if="value && clear"
          type="button"
          class="mr-auto rounded-full px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
          :disabled="isSaving"
          data-date-clear
          @click="onClear"
        >
          Clear
        </button>
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-full bg-primary-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
          :disabled="isSaving"
          data-date-save
        >
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </Teleport>
</template>
