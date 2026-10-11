<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import {
  SCAN_ACCEPT,
  SCAN_TOO_LARGE_FOR_SERVER,
  fetchPassportScan,
  formatFileSize,
  scanFileError,
  uploadPassportScan,
} from '@/api/passportScan'
import { useToast } from '@/composables/useToast'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, firstFieldError } from '@/lib/errors'
import { canAccessArea } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import type { PassportEntry } from '@/types/passport'

/**
 * "Passport scan copy" for a passport's details page (one shared card). The file is fetched
 * through the API as a Blob with the session cookie and shown from an object URL, which is
 * revoked when replaced or on unmount. Never a public URL. Images preview inline (click for
 * a lightbox); PDFs are embedded with an "Open PDF" button. data_entry, admin and
 * super_admin may upload or replace it.
 */
const props = defineProps<{ passport: PassportEntry }>()
const emit = defineEmits<{ updated: [passport: PassportEntry] }>()

const auth = useAuthStore()
const toast = useToast()
const headingId = useId()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const canEdit = computed(() => {
  const role = auth.user?.role
  return role !== undefined && canAccessArea(role, 'data_entry')
})

const hasScan = computed(() => props.passport.has_scan === true)
const mime = computed(() => props.passport.scan_mime ?? '')
const isImage = computed(() => mime.value.startsWith('image/'))
const isPdf = computed(() => mime.value === 'application/pdf')
const fileName = computed(() => props.passport.scan_original_name || 'passport-scan')

/* ---------- Loading the file ---------- */

const objectUrl = ref<string | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const forbidden = ref(false)
/** The API says there is no file (404), even if has_scan said so: show the empty state. */
const missing = ref(false)
let requestId = 0

function revoke() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = null
}

async function load() {
  const id = ++requestId
  revoke()
  loadError.value = null
  forbidden.value = false
  missing.value = false
  if (!hasScan.value) return
  isLoading.value = true
  try {
    const blob = await fetchPassportScan(props.passport.id)
    if (id !== requestId) return
    objectUrl.value = URL.createObjectURL(blob)
  } catch (error) {
    if (id !== requestId) return
    const status = errorStatus(error)
    if (status === 403) forbidden.value = true
    else if (status === 404) missing.value = true
    else if (status !== 401) loadError.value = 'Could not load the scan copy.'
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

// Reload when the passport changes or its scan is replaced.
watch(() => [props.passport.id, props.passport.has_scan, props.passport.scan_uploaded_at], load, {
  immediate: true,
})
onBeforeUnmount(() => {
  requestId++
  revoke()
})

/* ---------- Upload / replace ---------- */

const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref<string | null>(null)

function chooseFile() {
  uploadError.value = null
  fileInput.value?.click()
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const problem = scanFileError(file)
  if (problem) {
    uploadError.value = problem
    return
  }
  isUploading.value = true
  uploadError.value = null
  try {
    uploadProgress.value = 0
    const updated = await uploadPassportScan(
      props.passport.id,
      file,
      (percent) => (uploadProgress.value = percent),
    )
    toast.success(hasScan.value && !missing.value ? 'Scan copy replaced.' : 'Scan copy uploaded.')
    emit('updated', updated)
  } catch (error) {
    const status = errorStatus(error)
    uploadError.value =
      status === 413
        ? SCAN_TOO_LARGE_FOR_SERVER
        : status === 422
          ? (firstFieldError(error, 'scan') ?? errorMessage(error))
          : status === 403
            ? 'You are not allowed to change the scan copy.'
            : errorMessage(error, 'Could not upload the scan copy. Please try again.')
  } finally {
    isUploading.value = false
  }
}

/* ---------- Download (?download=1, as a file with its original name) ---------- */

const isDownloading = ref(false)

async function download() {
  if (isDownloading.value) return
  isDownloading.value = true
  try {
    const blob = await fetchPassportScan(props.passport.id, true)
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = fileName.value
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch (error) {
    toast.error(
      errorStatus(error) === 403
        ? "You don't have permission to view the scan"
        : 'Could not download the scan copy. Please try again.',
    )
  } finally {
    isDownloading.value = false
  }
}

/* ---------- Display helpers ---------- */

const lightboxOpen = ref(false)

const meta = computed(() => {
  const at = props.passport.scan_uploaded_at
  const uploaded = at ? toDisplayDate(businessToday(new Date(at))) : ''
  return [
    fileName.value,
    formatFileSize(props.passport.scan_size),
    uploaded && `uploaded ${uploaded}`,
  ]
    .filter(Boolean)
    .join(' · ')
})

const smallButton =
  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap'
</script>

<template>
  <section class="glass-card p-5 sm:p-6" :aria-labelledby="headingId" data-scan-card>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 :id="headingId" class="text-lg font-semibold text-ink">Passport scan copy</h2>
      <div v-if="hasScan && !forbidden && !missing" class="flex flex-wrap gap-2">
        <button
          v-if="objectUrl"
          type="button"
          :class="[
            smallButton,
            'border border-slate-300 bg-white text-primary-800 hover:bg-primary-50',
          ]"
          :disabled="isDownloading"
          data-scan-download
          @click="download"
        >
          {{ isDownloading ? 'Downloading…' : 'Download' }}
        </button>
        <button
          v-if="canEdit"
          type="button"
          :class="[smallButton, 'bg-primary-900 text-white hover:bg-primary-700']"
          :disabled="isUploading"
          data-scan-replace
          @click="chooseFile"
        >
          {{ isUploading ? `Uploading… ${uploadProgress}%` : 'Replace' }}
        </button>
      </div>
    </div>

    <input
      v-if="canEdit"
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="SCAN_ACCEPT"
      data-scan-input
      @change="onFileChosen"
    />

    <p
      v-if="uploadError"
      role="alert"
      class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      data-scan-upload-error
    >
      {{ uploadError }}
    </p>

    <!-- No scan yet -->
    <div
      v-if="!hasScan || missing"
      class="mt-4 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center"
      data-scan-empty
    >
      <p class="font-semibold text-ink">No scan copy uploaded</p>
      <p class="mt-1 text-sm text-muted">JPG, PNG or PDF, up to 5 MB.</p>
      <button
        v-if="canEdit"
        type="button"
        :class="[smallButton, 'mt-4 bg-accent-400 text-primary-950 hover:bg-accent-500']"
        :disabled="isUploading"
        data-scan-upload
        @click="chooseFile"
      >
        {{ isUploading ? `Uploading… ${uploadProgress}%` : 'Upload' }}
      </button>
    </div>

    <!-- Not allowed to view -->
    <p
      v-else-if="forbidden"
      class="mt-4 rounded-xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-700"
      data-scan-forbidden
    >
      You don't have permission to view the scan
    </p>

    <!-- Loading -->
    <div v-else-if="isLoading" class="mt-4 animate-pulse" aria-busy="true" data-scan-skeleton>
      <div class="h-56 rounded-xl bg-slate-200" />
      <div class="mt-3 h-4 w-1/2 rounded bg-slate-200" />
      <span class="sr-only">Loading the scan copy…</span>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" role="alert" class="mt-4 space-y-3 py-6 text-center" data-scan-error>
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" data-scan-retry @click="load">
        Retry
      </button>
    </div>

    <!-- The scan -->
    <template v-else-if="objectUrl">
      <button
        v-if="isImage"
        type="button"
        class="mt-4 block w-full overflow-hidden rounded-xl border border-stroke bg-slate-50"
        data-scan-image-button
        @click="lightboxOpen = true"
      >
        <img
          :src="objectUrl"
          :alt="`Passport scan copy of ${passport.passport_name}`"
          class="mx-auto max-h-80 w-auto object-contain"
          data-scan-image
        />
        <span class="sr-only">Open full size</span>
      </button>
      <div v-else-if="isPdf" class="mt-4" data-scan-pdf>
        <object
          :data="objectUrl"
          type="application/pdf"
          class="h-96 w-full rounded-xl border border-stroke"
          :aria-label="`Passport scan copy of ${passport.passport_name} (PDF)`"
        >
          <p class="p-4 text-sm text-muted">This browser cannot show the PDF here.</p>
        </object>
        <a
          :href="objectUrl"
          target="_blank"
          rel="noopener"
          :class="[
            smallButton,
            'mt-3 border border-slate-300 bg-white text-primary-800 hover:bg-primary-50',
          ]"
          data-scan-open-pdf
        >
          Open PDF
        </a>
      </div>
      <p v-else class="mt-4 text-sm text-muted">Preview not available for this file type.</p>
      <p class="mt-3 text-xs break-all text-muted" data-scan-meta>{{ meta }}</p>
    </template>

    <BaseDialog
      v-if="isImage && objectUrl"
      v-model:open="lightboxOpen"
      title="Passport scan copy"
      wide
    >
      <img
        :src="objectUrl"
        :alt="`Passport scan copy of ${passport.passport_name}, full size`"
        class="mx-auto max-h-[80vh] w-auto"
        data-scan-full
      />
    </BaseDialog>
  </section>
</template>
