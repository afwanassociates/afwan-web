<script setup lang="ts">
import { computed } from 'vue'
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import StageBadge from '@/components/StageBadge.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { daysLeft, toDisplayDate } from '@/lib/dates'
import { EXPIRING_SOON_DAYS } from '@/lib/medical'
import type { PassportColumn } from '@/lib/passportColumns'
import type { PassportEntry } from '@/types/passport'

/** One cell of PassportTable (shared by the table and the phone cards). */
const props = defineProps<{
  entry: PassportEntry
  column: PassportColumn
  /** YYYY-MM-DD (Dhaka) */
  today: string
  currentUserId: number | null
}>()

const medical = computed(() => props.entry.current_medical)

const waitingDays = computed(() =>
  Math.max(0, -(daysLeft(props.entry.passport_received_date, props.today) ?? 0)),
)

/** Days left of a fit result: from the API, or worked out from valid_until. */
const left = computed(() => {
  const m = medical.value
  if (!m?.valid_until) return null
  return m.days_left ?? daysLeft(m.valid_until, props.today)
})

const enteredBy = computed(() => {
  const id = props.entry.created_by
  if (id === null) return '—'
  return id === props.currentUserId ? 'You' : `Staff #${id}`
})
</script>

<template>
  <template v-if="column === 'reference' && !entry.reference">—</template>
  <template v-else-if="column === 'reference' && entry.reference">
    <span class="inline-flex flex-wrap items-center gap-2">
      {{ entry.reference.name }}
      <span
        class="rounded-full px-2 py-0.5 text-xs font-semibold"
        :class="
          entry.reference.type === 'agency'
            ? 'bg-accent-100 text-accent-800'
            : 'bg-primary-50 text-primary-800'
        "
      >
        {{ entry.reference.type_label }}
      </span>
    </span>
  </template>

  <template v-else-if="column === 'country'">{{ entry.country?.name ?? '—' }}</template>

  <template v-else-if="column === 'company'">
    {{ entry.company.name }}
    <span class="block text-xs text-muted">{{ entry.company.country.name }}</span>
  </template>

  <template v-else-if="column === 'received'">
    <span class="whitespace-nowrap">{{ toDisplayDate(entry.passport_received_date) }}</span>
  </template>

  <template v-else-if="column === 'waiting'">
    <span class="whitespace-nowrap tabular-nums">
      {{ waitingDays }} {{ waitingDays === 1 ? 'day' : 'days' }}
    </span>
  </template>

  <template v-else-if="column === 'medical'">
    <span class="inline-flex flex-wrap items-center gap-2">
      <MedicalStatusBadge :status="entry.medical_status" :valid-until="medical?.valid_until" />
      <WorkflowStepper :steps="entry.workflow.steps" compact />
    </span>
  </template>

  <!-- The medical status only (no step bar): "Not started" grey, "Pending" amber, … -->
  <template v-else-if="column === 'medical_status'">
    <MedicalStatusBadge :status="entry.medical_status" :valid-until="medical?.valid_until" />
  </template>

  <template v-else-if="column === 'slip_date'">
    <span class="whitespace-nowrap">{{ toDisplayDate(entry.medical_slip?.date) || '—' }}</span>
  </template>

  <template v-else-if="column === 'medical_date'">
    <span class="whitespace-nowrap">{{ toDisplayDate(medical?.medical_date) || '—' }}</span>
  </template>

  <template v-else-if="column === 'valid_until'">
    <span class="whitespace-nowrap">{{ toDisplayDate(medical?.valid_until) || '—' }}</span>
  </template>

  <template v-else-if="column === 'days_left'">
    <span
      v-if="left !== null"
      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
      :class="
        left < 0
          ? 'bg-orange-50 text-orange-800'
          : left <= EXPIRING_SOON_DAYS
            ? 'bg-accent-50 text-accent-800'
            : 'bg-green-50 text-green-800'
      "
    >
      <template v-if="left < 0"
        >Expired {{ -left }} {{ -left === 1 ? 'day' : 'days' }} ago</template
      >
      <template v-else>{{ left }} {{ left === 1 ? 'day' : 'days' }} left</template>
    </span>
    <template v-else>—</template>
  </template>

  <template v-else-if="column === 'remarks'">
    <span class="line-clamp-2 break-words">{{ medical?.remarks || '—' }}</span>
  </template>

  <template v-else-if="column === 'stage'">
    <StageBadge :stage="entry.current_stage" :status="entry.stage_status" />
  </template>

  <!-- Passport List: every row is at this stage, so one fixed badge. -->
  <template v-else-if="column === 'passport_entered'">
    <span
      class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-700 ring-1 ring-slate-300"
      data-stage-badge
    >
      <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      Passport entered
    </span>
  </template>

  <template v-else-if="column === 'entered_by'">
    <span class="whitespace-nowrap">{{ enteredBy }}</span>
  </template>
</template>
