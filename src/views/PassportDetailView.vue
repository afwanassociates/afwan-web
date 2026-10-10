<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MedicalHistoryTable from '@/components/MedicalHistoryTable.vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import RecordMedicalModal from '@/components/RecordMedicalModal.vue'
import RecordStepModal from '@/components/RecordStepModal.vue'
import StepTimeline from '@/components/StepTimeline.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { deleteMedical, listMedicals } from '@/api/medical'
import { deleteStepRecord, listStepRecords } from '@/api/steps'
import { getPassport } from '@/api/passports'
import { useToast } from '@/composables/useToast'
import { businessToday, daysLeft, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { EXPIRING_SOON_DAYS, isMedicalAdmin } from '@/lib/medical'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalRecord } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'
import type { StepRecord, StepRecordSummary } from '@/types/workflow'

/** One passport: its progress, details, current medical and medical history. */
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const workflow = useWorkflowStore()

const today = businessToday()
const passportId = computed(() => Number(route.params.id))

const passport = ref<PassportEntry | null>(null)
const history = ref<MedicalRecord[]>([])
/** Steps 3+ history, grouped by step key. */
const stepHistory = ref<Record<string, StepRecord[]>>({})
workflow.loadConfig()
const isLoading = ref(false)
const loadError = ref<string | null>(null)

async function load() {
  const id = passportId.value
  if (!id) return
  isLoading.value = true
  loadError.value = null
  try {
    const [entry, records, steps] = await Promise.all([
      getPassport(id),
      listMedicals(id),
      listStepRecords(id),
    ])
    if (passportId.value !== id) return
    passport.value = entry
    history.value = records
    stepHistory.value = steps
  } catch (error) {
    loadError.value =
      errorStatus(error) === 404
        ? 'This passport was not found. It may have been deleted.'
        : errorMessage(error, 'Could not load this passport.')
  } finally {
    isLoading.value = false
  }
}

watch(passportId, load, { immediate: true })

/** After any medical or step change: this page, the step bar and the sidebar badges. */
function afterChange() {
  load()
  workflow.refresh()
}

/* ---------- Steps 3+: record, update, edit, undo ---------- */

const stepModalOpen = ref(false)
const stepModalKey = ref<string | null>(null)
const stepModalRecord = ref<StepRecordSummary | null>(null)

function openStep(stepKey: string, record: StepRecordSummary | null) {
  stepModalKey.value = stepKey
  stepModalRecord.value = record
  stepModalOpen.value = true
}

const undoTarget = ref<StepRecord | null>(null)
const undoOpen = ref(false)
const undoBusy = ref(false)
const undoError = ref<string | null>(null)

function askUndo(record: StepRecord) {
  undoTarget.value = record
  undoError.value = null
  undoOpen.value = true
}

async function confirmUndo() {
  const record = undoTarget.value
  if (!record) return
  undoBusy.value = true
  undoError.value = null
  try {
    await deleteStepRecord(record.id)
    undoOpen.value = false
    toast.success(`${record.step_label}: ${record.status_label} undone.`)
    afterChange()
  } catch (error) {
    const code = errorStatus(error)
    if (code === 403) undoError.value = 'Only admins can undo a step.'
    else if (code === 404) {
      undoOpen.value = false
      afterChange()
    } else if (code !== 401)
      undoError.value = errorMessage(error, 'Could not undo the step. Please try again.')
  } finally {
    undoBusy.value = false
  }
}

/* ---------- Derived ---------- */

const medical = computed(() => passport.value?.current_medical ?? null)
const isUnfit = computed(() => passport.value?.medical_status === 'unfit')

const enteredBy = computed(() => {
  const id = passport.value?.created_by
  if (id === null || id === undefined) return '—'
  return id === auth.user?.id ? 'You' : `Staff #${id}`
})

const medicalDaysLeft = computed(() => {
  const m = medical.value
  if (!m?.valid_until) return null
  return m.days_left ?? daysLeft(m.valid_until, today)
})

/** The main medical action, following the API's rules (re-test is for admins only). */
const medicalAction = computed(() => {
  const p = passport.value
  if (!p?.can.record_medical) return null
  switch (p.medical_status) {
    case 'pending':
      return { label: 'Record medical', class: 'btn-accent' }
    case 'unfit':
      return isMedicalAdmin(auth.user?.role) ? { label: 'Re-test', class: 'btn-primary' } : null
    case 'expired':
      return { label: 'Repeat medical', class: 'btn-accent' }
    default:
      return { label: 'Repeat medical', class: 'btn-white' }
  }
})

const backLink = computed(() =>
  isUnfit.value
    ? { to: { name: 'medical', query: { tab: 'unfit' } }, label: 'Medical · Unfit' }
    : { to: { name: 'passports' }, label: 'Passport list' },
)

/* ---------- Record / edit / delete medical ---------- */

const modalOpen = ref(false)
const editing = ref<MedicalRecord | null>(null)

function openRecord() {
  editing.value = null
  modalOpen.value = true
}

function openEdit(record: MedicalRecord) {
  editing.value = record
  modalOpen.value = true
}

const deleteTarget = ref<MedicalRecord | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(record: MedicalRecord) {
  deleteTarget.value = record
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const record = deleteTarget.value
  if (!record) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteMedical(record.id)
    deleteOpen.value = false
    toast.success(`Medical of ${toDisplayDate(record.medical_date)} deleted.`)
    afterChange()
  } catch (error) {
    const status = errorStatus(error)
    if (status === 403) deleteError.value = 'Only admins can delete medical records.'
    else if (status === 404) {
      deleteOpen.value = false
      afterChange()
    } else if (status !== 401)
      deleteError.value = errorMessage(error, 'Could not delete the record. Please try again.')
  } finally {
    deleteBusy.value = false
  }
}

const dt = 'text-muted'
const dd = 'font-medium text-ink'
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <WorkflowStepper :active-step="passport?.current_stage ?? null" />

    <RouterLink
      :to="backLink.to"
      class="mt-6 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary-700 hover:underline"
    >
      <span aria-hidden="true">←</span> {{ backLink.label }}
    </RouterLink>

    <p v-if="isLoading && !passport" class="mt-6 text-muted" role="status">Loading the passport…</p>

    <div v-else-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <template v-else-if="passport">
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold break-words text-primary-900 sm:text-3xl">
            {{ passport.passport_name }}
          </h1>
          <p class="font-mono tracking-wider text-slate-700">{{ passport.passport_number }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            v-if="passport.can.update"
            :to="{ name: 'passport-edit', params: { id: passport.id } }"
            class="btn btn-white text-sm"
          >
            Edit passport
          </RouterLink>
          <button
            v-if="medicalAction"
            type="button"
            class="btn text-sm"
            :class="medicalAction.class"
            data-medical-action
            @click="openRecord"
          >
            {{ medicalAction.label }}
          </button>
        </div>
      </div>

      <!-- Date warnings from the API (never blocking) -->
      <ul
        v-if="passport.warnings?.length"
        class="mt-6 space-y-1 rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 text-sm text-accent-900"
        role="status"
        data-passport-warnings
      >
        <li v-for="warning in passport.warnings" :key="warning.code" class="flex gap-2">
          <span aria-hidden="true">⚠</span>{{ warning.message }}
        </li>
      </ul>

      <!-- This passport's progress -->
      <section class="glass-card mt-6 p-5" aria-label="Progress">
        <WorkflowStepper :steps="passport.workflow.steps" />
      </section>

      <!-- Step timeline -->
      <section class="glass-card mt-6 p-5 sm:p-6" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" class="text-lg font-semibold text-ink">Steps</h2>
        <div class="mt-4">
          <StepTimeline
            :passport="passport"
            :history="stepHistory"
            :role="auth.user?.role"
            :user-id="auth.user?.id ?? null"
            @record="openStep"
            @edit="openStep"
            @undo="askUndo"
          />
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <!-- Passport summary -->
        <section class="glass-card p-5 sm:p-6" aria-labelledby="passport-heading">
          <h2 id="passport-heading" class="text-lg font-semibold text-ink">Passport</h2>
          <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt :class="dt">Name</dt>
            <dd :class="dd">{{ passport.passport_name }}</dd>
            <dt :class="dt">Number</dt>
            <dd :class="[dd, 'font-mono tracking-wider']">{{ passport.passport_number }}</dd>
            <dt :class="dt">Country</dt>
            <dd :class="dd">{{ passport.country?.name ?? '—' }}</dd>
            <dt :class="dt">Date of birth</dt>
            <dd :class="dd">{{ toDisplayDate(passport.date_of_birth) || '—' }}</dd>
            <dt :class="dt">Expiry date</dt>
            <dd :class="dd">{{ toDisplayDate(passport.passport_expiry_date) || '—' }}</dd>
            <dt :class="dt">Reference</dt>
            <dd :class="dd">
              {{ passport.reference.name }}
              <span class="text-xs font-normal text-muted"
                >({{ passport.reference.type_label }})</span
              >
            </dd>
            <dt :class="dt">Company</dt>
            <dd :class="dd">
              {{ passport.company.name }}
              <span class="text-xs font-normal text-muted"
                >({{ passport.company.country.name }})</span
              >
            </dd>
            <dt :class="dt">Received</dt>
            <dd :class="dd">{{ toDisplayDate(passport.passport_received_date) }}</dd>
            <dt :class="dt">Entered by</dt>
            <dd :class="dd">{{ enteredBy }}</dd>
          </dl>
        </section>

        <!-- Current medical -->
        <section
          class="glass-card p-5 sm:p-6"
          aria-labelledby="medical-heading"
          data-current-medical
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="medical-heading" class="text-lg font-semibold text-ink">Current medical</h2>
            <MedicalStatusBadge
              :status="passport.medical_status"
              :valid-until="medical?.valid_until"
            />
          </div>
          <p v-if="!medical" class="mt-4 text-sm text-muted">No medical has been recorded yet.</p>
          <dl v-else class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt :class="dt">Result</dt>
            <dd :class="dd">{{ medical.result === 'fit' ? 'Fit' : 'Unfit' }}</dd>
            <dt :class="dt">Medical date</dt>
            <dd :class="dd">{{ toDisplayDate(medical.medical_date) }}</dd>
            <template v-if="medical.valid_until">
              <dt :class="dt">Valid until</dt>
              <dd :class="dd">{{ toDisplayDate(medical.valid_until) }}</dd>
              <dt :class="dt">Days left</dt>
              <dd
                :class="[
                  dd,
                  medicalDaysLeft !== null && medicalDaysLeft <= EXPIRING_SOON_DAYS
                    ? 'text-accent-800'
                    : '',
                ]"
              >
                <template v-if="medicalDaysLeft === null">—</template>
                <template v-else-if="medicalDaysLeft < 0">
                  Expired {{ -medicalDaysLeft }} days ago
                </template>
                <template v-else>{{ medicalDaysLeft }}</template>
              </dd>
            </template>
            <dt :class="dt">Medical center</dt>
            <dd :class="dd">{{ medical.medical_center?.name ?? '—' }}</dd>
            <dt :class="dt">Medical slip no</dt>
            <dd :class="[dd, 'font-mono']">{{ medical.slip_no || '—' }}</dd>
            <dt :class="dt">Medical slip date</dt>
            <dd :class="dd">{{ toDisplayDate(medical.slip_date) || '—' }}</dd>
            <dt :class="dt">Recorded by</dt>
            <dd :class="dd">{{ medical.recorded_by?.name ?? '—' }}</dd>
            <dt :class="dt">Remarks</dt>
            <dd :class="[dd, 'font-normal break-words']">{{ medical.remarks || '—' }}</dd>
          </dl>
        </section>
      </div>

      <!-- History -->
      <section class="glass-card mt-6 p-5 sm:p-6" aria-labelledby="history-heading">
        <h2 id="history-heading" class="text-lg font-semibold text-ink">Medical history</h2>
        <div class="mt-2">
          <MedicalHistoryTable
            :records="history"
            :role="auth.user?.role"
            @edit="openEdit"
            @delete="askDelete"
          />
        </div>
      </section>
    </template>

    <RecordMedicalModal
      v-model:open="modalOpen"
      :passport="passport"
      :record="editing"
      @saved="afterChange"
    />

    <RecordStepModal
      v-model:open="stepModalOpen"
      :passport="passport"
      :step-key="stepModalKey"
      :record="stepModalRecord"
      @saved="afterChange"
    />

    <ConfirmDialog
      v-model:open="undoOpen"
      title="Undo latest step"
      confirm-label="Undo"
      danger
      :busy="undoBusy"
      :error="undoError"
      @confirm="confirmUndo"
    >
      <p v-if="undoTarget">
        Remove the <strong>{{ undoTarget.step_label }}</strong> record “{{
          undoTarget.status_label
        }}” of {{ toDisplayDate(undoTarget.step_date) }}? The passport goes back to that step.
      </p>
    </ConfirmDialog>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete medical record"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete the {{ deleteTarget.result === 'fit' ? 'fit' : 'unfit' }} medical of
        <strong>{{ toDisplayDate(deleteTarget.medical_date) }}</strong
        >? The passport's medical status will follow its remaining records.
      </p>
    </ConfirmDialog>
  </div>
</template>
