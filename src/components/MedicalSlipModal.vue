<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import QuickAddModal, { type QuickAddValues } from '@/components/QuickAddModal.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { updateMedicalSlip } from '@/api/medical'
import { createMedicalCenter, searchMedicalCenters } from '@/api/medicalCenters'
import { useToast } from '@/composables/useToast'
import { toApiDate, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { isMedicalAdmin } from '@/lib/medical'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalCenterSummary } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

/**
 * Adds or edits a passport's medical slip ("MYGRAM"): date (required), number and medical
 * centre. Saving the date moves a "not started" passport into Medical → Pending.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  passport: PassportEntry | null
  /** Replaces the default success toast (e.g. "Moved to Medical Pending"). */
  successMessage?: string
}>()
const emit = defineEmits<{ saved: [passport: PassportEntry] }>()

const SLIP_NO_MAX = 50

const toast = useToast()
const auth = useAuthStore()
const workflow = useWorkflowStore()

const dateId = useId()
const noId = useId()

const slipDate = ref('')
const slipNo = ref('')
const center = ref<MedicalCenterSummary | null>(null)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => Boolean(props.passport?.medical_slip?.date))
const title = computed(() => (isEdit.value ? 'Edit medical slip' : 'Add medical slip'))

watch(open, (isOpen) => {
  if (!isOpen) return
  const slip = props.passport?.medical_slip
  slipDate.value = slip?.date ?? ''
  slipNo.value = slip?.no ?? ''
  center.value = slip?.medical_center ?? null
  errors.value = {}
  banner.value = null
})

watch(slipDate, () => delete errors.value.medical_slip_date)
watch(slipNo, () => delete errors.value.medical_slip_no)
watch(center, () => delete errors.value.medical_center_id)

/* ---------- Medical centre (admins may add a new one) ---------- */

const fetchCenters = (q: string) => searchMedicalCenters(q)
const canAddCenter = computed(() => isMedicalAdmin(auth.user?.role))
const centerModalOpen = ref(false)
const centerQuery = ref('')

function openCenterModal(query: string) {
  centerQuery.value = query
  centerModalOpen.value = true
}

const saveCenter = (values: QuickAddValues) => createMedicalCenter(values.name)

function onCenterAdded(item: MedicalCenterSummary) {
  center.value = item
  toast.success(`Medical center “${item.name}” added.`)
}

/* ---------- Saving ---------- */

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!slipDate.value) e.medical_slip_date = 'Enter the medical slip date.'
  else if (!toApiDate(slipDate.value)) e.medical_slip_date = 'Enter a valid date.'
  if (slipNo.value.trim().length > SLIP_NO_MAX)
    e.medical_slip_no = `The medical slip no must be at most ${SLIP_NO_MAX} characters.`
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  const passport = props.passport
  if (!passport || isSaving.value) return
  banner.value = null
  if (!validate()) return
  isSaving.value = true
  try {
    const updated = await updateMedicalSlip(passport.id, {
      medical_slip_date: toApiDate(slipDate.value),
      medical_slip_no: slipNo.value.trim() || null,
      medical_center_id: center.value?.id ?? null,
    })
    toast.success(
      props.successMessage ??
        (passport.medical_status === 'not_started'
          ? `${passport.passport_number}: medical slip saved. It is now in Medical → Pending.`
          : `${passport.passport_number}: medical slip updated.`),
    )
    workflow.refresh()
    emit('saved', updated)
    open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = errorMessage(error, 'You are not allowed to change this medical slip.')
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not save the medical slip. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p v-if="passport" class="rounded-xl bg-surface p-3 text-sm" data-slip-passport>
      <span class="font-semibold text-ink">{{ passport.passport_name }}</span>
      <span class="ml-2 font-mono tracking-wider text-slate-700">{{
        passport.passport_number
      }}</span>
    </p>

    <p
      v-if="banner"
      role="alert"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>

    <form class="mt-5 space-y-5" novalidate @submit.prevent="save">
      <div data-field="medical_slip_date">
        <label :for="dateId" class="block text-sm font-medium text-slate-700">
          Medical slip date (MYGRAM)<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="dateId"
          v-model="slipDate"
          type="date"
          required
          :class="[inputClass, errors.medical_slip_date ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.medical_slip_date ? 'true' : undefined"
          :aria-describedby="`${dateId}-hint${errors.medical_slip_date ? ` ${dateId}-error` : ''}`"
        />
        <p :id="`${dateId}-hint`" class="mt-1 text-xs text-muted">
          {{ toDisplayDate(toApiDate(slipDate)) || 'DD-MM-YYYY' }}
        </p>
        <p
          v-if="errors.medical_slip_date"
          :id="`${dateId}-error`"
          class="mt-1 text-sm text-red-700"
        >
          {{ errors.medical_slip_date }}
        </p>
      </div>

      <div data-field="medical_slip_no">
        <label :for="noId" class="block text-sm font-medium text-slate-700">
          Medical slip no <span class="font-normal text-muted">(optional)</span>
        </label>
        <input
          :id="noId"
          v-model="slipNo"
          type="text"
          autocomplete="off"
          :maxlength="SLIP_NO_MAX"
          :class="[inputClass, errors.medical_slip_no ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.medical_slip_no ? 'true' : undefined"
          :aria-describedby="errors.medical_slip_no ? `${noId}-error` : undefined"
        />
        <p v-if="errors.medical_slip_no" :id="`${noId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.medical_slip_no }}
        </p>
      </div>

      <SearchSelect
        v-model="center"
        :fetch="fetchCenters"
        label="Medical center"
        placeholder="Search medical center…"
        :add-label="canAddCenter ? 'Add new medical center' : undefined"
        :error="errors.medical_center_id"
        clearable
        data-field="medical_center"
        @add="openCenterModal"
      />

      <div
        class="flex flex-col-reverse gap-3 border-t border-stroke pt-4 sm:flex-row sm:justify-end"
      >
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-accent" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Saving…' : 'Save slip' }}
        </button>
      </div>
    </form>
  </BaseDialog>

  <!-- Outside the slip dialog's form: forms cannot be nested. -->
  <QuickAddModal
    v-model:open="centerModalOpen"
    title="Add new medical center"
    name-label="Medical center name"
    :initial-name="centerQuery"
    :save="saveCenter"
    @saved="onCenterAdded"
  />
</template>
