<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import { SCAN_ACCEPT, formatFileSize, scanFileError } from '@/api/passportScan'

/**
 * "Passport scan copy" file field for the passport form: one JPG, PNG or PDF up to 5 MB,
 * with name, size, Remove and an image thumbnail. In edit mode it shows the current file
 * name with Replace. Files that fail the client check are not accepted (shown as an error).
 */
const model = defineModel<File | null>({ required: true })
const props = withDefaults(
  defineProps<{
    required?: boolean
    /** Error from the form (e.g. the server's 422 message). */
    error?: string
    /** Edit mode: the passport's current scan file name, if it has one. */
    currentName?: string | null
    /** Upload progress 0–100 while saving, else null. */
    progress?: number | null
    disabled?: boolean
  }>(),
  { required: false, error: undefined, currentName: null, progress: null, disabled: false },
)
const emit = defineEmits<{ clearError: [] }>()

const inputId = useId()
const input = useTemplateRef<HTMLInputElement>('input')
defineExpose({ focus: () => input.value?.focus() })

const localError = ref<string | null>(null)
const shownError = computed(() => localError.value ?? props.error ?? null)

/* Thumbnail for images: an object URL, revoked when the file changes or on unmount. */
const thumbnail = ref<string | null>(null)
watch(
  model,
  (file) => {
    if (thumbnail.value) URL.revokeObjectURL(thumbnail.value)
    thumbnail.value = file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (thumbnail.value) URL.revokeObjectURL(thumbnail.value)
})

function choose() {
  input.value?.click()
}

function onChange(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0] ?? null
  el.value = ''
  if (!file) return
  const problem = scanFileError(file)
  if (problem) {
    localError.value = problem
    return
  }
  localError.value = null
  emit('clearError')
  model.value = file
}

function remove() {
  model.value = null
  localError.value = null
}

const button =
  'inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap disabled:opacity-50'
</script>

<template>
  <div data-field="scan">
    <label :for="inputId" class="block text-sm font-medium text-slate-700">
      Passport scan copy<span v-if="required" class="text-red-700" aria-hidden="true"> *</span>
      <span v-else class="font-normal text-muted"> (optional)</span>
    </label>
    <!-- Visually hidden but focusable, so errors can move focus here. -->
    <input
      :id="inputId"
      ref="input"
      type="file"
      class="sr-only"
      :accept="SCAN_ACCEPT"
      :required="required && !model"
      :disabled="disabled"
      :aria-invalid="shownError ? 'true' : undefined"
      :aria-describedby="`${inputId}-hint${shownError ? ` ${inputId}-error` : ''}`"
      data-scan-file
      @change="onChange"
    />

    <div
      class="mt-1 rounded-xl border-2 border-dashed p-4"
      :class="shownError ? 'border-red-400 bg-red-50/40' : 'border-slate-300'"
    >
      <!-- A chosen file -->
      <div v-if="model" class="flex flex-wrap items-center gap-3" data-scan-chosen>
        <img
          v-if="thumbnail"
          :src="thumbnail"
          alt="Preview of the chosen scan"
          class="h-16 w-16 rounded-lg border border-stroke object-cover"
          data-scan-thumbnail
        />
        <span
          v-else
          class="flex h-16 w-16 items-center justify-center rounded-lg bg-red-50 text-xs font-bold text-red-700"
          aria-hidden="true"
          >PDF</span
        >
        <span class="min-w-0 flex-1">
          <span class="block font-semibold break-all text-ink" data-scan-name>{{
            model.name
          }}</span>
          <span class="text-xs text-muted" data-scan-size>{{ formatFileSize(model.size) }}</span>
        </span>
        <button
          type="button"
          :class="[button, 'text-red-700 hover:bg-red-50']"
          :disabled="disabled"
          data-scan-remove
          @click="remove"
        >
          Remove
        </button>
      </div>

      <!-- Edit mode: the current scan -->
      <div v-else-if="currentName" class="flex flex-wrap items-center gap-3" data-scan-current>
        <span class="min-w-0 flex-1 text-sm">
          <span class="text-muted">Current file: </span>
          <span class="font-semibold break-all text-ink">{{ currentName }}</span>
        </span>
        <button
          type="button"
          :class="[button, 'border border-slate-300 bg-white text-primary-800 hover:bg-primary-50']"
          :disabled="disabled"
          data-scan-replace
          @click="choose"
        >
          Replace
        </button>
      </div>

      <!-- Nothing yet -->
      <div v-else class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          :class="[button, 'bg-primary-900 text-white hover:bg-primary-700']"
          :disabled="disabled"
          data-scan-choose
          @click="choose"
        >
          Choose file
        </button>
        <span class="text-sm text-muted">No file chosen</span>
      </div>

      <div
        v-if="progress !== null"
        class="mt-3"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Uploading the scan"
        data-scan-progress
      >
        <div class="h-2 overflow-hidden rounded-full bg-slate-200">
          <div class="h-full bg-primary-700 transition-all" :style="{ width: `${progress}%` }" />
        </div>
        <p class="mt-1 text-xs text-muted">Uploading… {{ progress }}%</p>
      </div>
    </div>

    <p :id="`${inputId}-hint`" class="mt-1 text-xs text-muted">JPG, PNG or PDF, up to 5 MB.</p>
    <p v-if="shownError" :id="`${inputId}-error`" class="mt-1 text-sm text-red-700" data-scan-error>
      {{ shownError }}
    </p>
  </div>
</template>
