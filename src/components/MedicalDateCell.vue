<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import { updateMedicalDate } from '@/api/medical'
import { useToast } from '@/composables/useToast'
import { businessToday, toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { PassportEntry } from '@/types/passport'

/**
 * The Medical page's "Medical date" cell for a pending passport: the date (with a small
 * edit icon), or an "Enter medical date" button. Either opens a small inline popover with
 * one required date (today or earlier, Dhaka calendar). Read-only without `canEdit`.
 */
const props = defineProps<{ entry: PassportEntry; canEdit: boolean }>()
const emit = defineEmits<{ saved: [passport: PassportEntry] }>()

const toast = useToast()
const inputId = useId()
const panelId = useId()

const root = useTemplateRef<HTMLElement>('root')
const panel = useTemplateRef<HTMLElement>('panel')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const input = useTemplateRef<HTMLInputElement>('input')

/**
 * The popover is rendered at the end of <body> (the table scrolls sideways and would clip
 * it) and placed under its button, kept inside the window.
 */
const PANEL_WIDTH = 256
const panelStyle = ref<Record<string, string>>({})

function placePanel() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
  panelStyle.value = { top: `${rect.bottom + 4}px`, left: `${left}px`, width: `${PANEL_WIDTH}px` }
}

const date = computed(() => props.entry.medical_date ?? null)
const isOpen = ref(false)
const value = ref('')
const error = ref<string | null>(null)
const isSaving = ref(false)
const today = ref(businessToday())

async function open() {
  today.value = businessToday()
  value.value = date.value ?? ''
  error.value = null
  placePanel()
  isOpen.value = true
  await nextTick()
  input.value?.focus()
}

function close(returnFocus = true) {
  if (isSaving.value) return
  isOpen.value = false
  if (returnFocus) nextTick(() => trigger.value?.focus())
}

async function save() {
  const picked = toApiDate(value.value)
  if (!value.value) error.value = 'Enter the medical date.'
  else if (!picked) error.value = 'Enter a valid date.'
  else if (picked > today.value) error.value = 'The medical date cannot be in the future.'
  else error.value = null
  if (error.value) {
    input.value?.focus()
    return
  }
  isSaving.value = true
  try {
    const updated = await updateMedicalDate(props.entry.id, picked)
    toast.success(`${props.entry.passport_number}: medical date ${toDisplayDate(picked)} saved.`)
    isSaving.value = false
    close()
    emit('saved', updated)
  } catch (e) {
    error.value =
      errorStatus(e) === 422
        ? (fieldErrors(e).medical_date ?? errorMessage(e))
        : errorMessage(e, 'Could not save the medical date. Please try again.')
  } finally {
    isSaving.value = false
  }
}

/* Close on a click outside (the popover is not modal); follow the button on scroll/resize. */
function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (isOpen.value && !root.value?.contains(target) && !panel.value?.contains(target)) close(false)
}
function listen(on: boolean) {
  if (on) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    window.removeEventListener('resize', placePanel)
    window.removeEventListener('scroll', placePanel, true)
  }
}
watch(isOpen, listen)
onBeforeUnmount(() => listen(false))
</script>

<template>
  <span ref="root" class="relative inline-flex items-center gap-1" data-medical-date-cell>
    <span v-if="date" class="whitespace-nowrap" data-medical-date>{{ toDisplayDate(date) }}</span>
    <span v-else-if="!canEdit" data-medical-date>-</span>

    <template v-if="canEdit">
      <button
        v-if="date"
        ref="trigger"
        type="button"
        class="rounded-full p-1.5 text-primary-700 hover:bg-primary-50"
        :aria-expanded="isOpen"
        :aria-controls="panelId"
        data-edit-medical-date
        @click="isOpen ? close() : open()"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
        </svg>
        <span class="sr-only">Change the medical date of {{ entry.passport_number }}</span>
      </button>
      <button
        v-else
        ref="trigger"
        type="button"
        class="rounded-full border border-primary-300 bg-white px-3 py-1 text-sm font-semibold whitespace-nowrap text-primary-800 hover:bg-primary-50"
        :aria-expanded="isOpen"
        :aria-controls="panelId"
        data-enter-medical-date
        @click="isOpen ? close() : open()"
      >
        Enter medical date<span class="sr-only"> for {{ entry.passport_number }}</span>
      </button>
    </template>

    <!-- Inline popover (not a modal): one required date -->
    <Teleport to="body">
      <form
        v-if="isOpen"
        :id="panelId"
        ref="panel"
        class="fixed z-50 rounded-xl border border-stroke bg-white p-3 text-left shadow-xl"
        :style="panelStyle"
        role="group"
        :aria-label="`Medical date for ${entry.passport_number}`"
        novalidate
        data-medical-date-popover
        @submit.prevent="save"
        @keydown.esc.stop="close()"
      >
        <label :for="inputId" class="block text-sm font-medium text-slate-700">
          Medical date<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="inputId"
          ref="input"
          v-model="value"
          type="date"
          required
          :max="today"
          class="mt-1 block w-full rounded-lg border bg-white px-2 py-2 text-slate-900 focus:border-primary-600"
          :class="error ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="`${inputId}-hint${error ? ` ${inputId}-error` : ''}`"
        />
        <p :id="`${inputId}-hint`" class="mt-1 text-xs text-muted">
          {{ toDisplayDate(toApiDate(value)) || 'DD-MM-YYYY' }} · today or earlier
        </p>
        <p v-if="error" :id="`${inputId}-error`" class="mt-1 text-sm text-red-700" role="alert">
          {{ error }}
        </p>
        <div class="mt-3 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-sm font-semibold text-primary-800 hover:bg-primary-50"
            :disabled="isSaving"
            @click="close()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-full bg-primary-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
            :disabled="isSaving"
            data-save-medical-date
          >
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </Teleport>
  </span>
</template>
