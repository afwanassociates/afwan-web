<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { assignAgent, searchAgents } from '@/api/agents'
import { useToast } from '@/composables/useToast'
import { businessToday, toApiDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { AgentSummary } from '@/types/agents'
import type { PassportEntry } from '@/types/passport'

/**
 * Data entry assigns a passport's recruitment agent, or changes it (a reason is required then).
 * It waits for the Operations Head to approve it; the medical slip needs an approved agent.
 * A returned assignment opens pre-filled so it can be corrected and sent again.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ passport: PassportEntry | null }>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const dateId = useId()
const remarkId = useId()

const agent = ref<AgentSummary | null>(null)
const date = ref('')
const remark = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)
const today = businessToday()

/** A change when the passport already has an approved agent. */
const isChange = computed(() => Boolean(props.passport?.recruitment_agent))
const title = computed(() =>
  isChange.value ? 'Change recruitment agent' : 'Assign recruitment agent',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  const returned = props.passport?.agent_return
  agent.value = null
  date.value = returned?.assigned_date ?? today
  remark.value = returned?.remark ?? ''
  errors.value = {}
  banner.value = null
})

watch(agent, () => delete errors.value.recruitment_agent_id)

const subtitle = (a: AgentSummary) => `${a.code} · RL ${a.rl_number}`

async function save() {
  const passport = props.passport
  if (!passport || isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!agent.value) e.recruitment_agent_id = 'Choose the recruitment agent.'
  if (!date.value) e.assigned_date = 'Enter the date the passport went to the agent.'
  else if (!toApiDate(date.value)) e.assigned_date = 'Enter a valid date.'
  else if (date.value > today) e.assigned_date = 'The date cannot be in the future.'
  const text = remark.value.trim().replace(/\s+/g, ' ')
  if (isChange.value && !text) e.remark = 'Enter the reason for changing the agent.'
  errors.value = e
  if (Object.keys(e).length) return

  isSaving.value = true
  try {
    await assignAgent(passport.id, {
      recruitment_agent_id: agent.value!.id,
      assigned_date: toApiDate(date.value)!,
      remark: text || null,
    })
    toast.success(
      `${passport.passport_number}: ${agent.value!.name} sent to the Operations Head for approval.`,
    )
    emit('saved')
    open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = 'Only the data entry team assigns recruitment agents.'
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not save the agent. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
const border = (field: string) => (errors.value[field] ? 'border-red-500' : 'border-slate-300')
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p v-if="passport" class="rounded-xl bg-surface p-3 text-sm">
      <span class="font-semibold text-ink">{{ passport.passport_name }}</span>
      <span class="ml-2 font-mono tracking-wider text-slate-700">{{
        passport.passport_number
      }}</span>
      <span v-if="passport.recruitment_agent" class="mt-1 block text-muted">
        Current agent:
        <span class="font-medium text-ink">{{ passport.recruitment_agent.name }}</span>
        ({{ passport.recruitment_agent.code }})
      </span>
    </p>

    <p
      v-if="passport?.agent_return?.reason"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
      data-return-reason
    >
      <span class="font-semibold">Returned for correction:</span>
      {{ passport.agent_return.reason }}
    </p>

    <p
      v-if="banner"
      role="alert"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>

    <form class="mt-5 space-y-5" novalidate @submit.prevent="save">
      <div data-field="recruitment_agent_id">
        <SearchSelect
          v-model="agent"
          :fetch="searchAgents"
          :subtitle-of="subtitle"
          :label="isChange ? 'New Recruitment Agent' : 'Recruitment Agent'"
          placeholder="Search name, ID or RL number"
          :error="errors.recruitment_agent_id"
          required
        />
      </div>
      <div data-field="assigned_date">
        <label :for="dateId" class="block text-sm font-medium text-slate-700">
          Date sent to the agent<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="dateId"
          v-model="date"
          type="date"
          :max="today"
          :class="[inputClass, border('assigned_date')]"
          :aria-invalid="errors.assigned_date ? 'true' : undefined"
        />
        <p v-if="errors.assigned_date" class="mt-1 text-sm text-red-700">
          {{ errors.assigned_date }}
        </p>
      </div>
      <div data-field="remark">
        <label :for="remarkId" class="block text-sm font-medium text-slate-700">
          {{ isChange ? 'Reason for the change' : 'Remark'
          }}<span v-if="isChange" class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <textarea
          :id="remarkId"
          v-model="remark"
          rows="2"
          maxlength="500"
          :placeholder="isChange ? 'e.g. Slow processing' : 'Optional'"
          :class="[inputClass, border('remark')]"
          :aria-invalid="errors.remark ? 'true' : undefined"
        />
        <p v-if="errors.remark" class="mt-1 text-sm text-red-700">{{ errors.remark }}</p>
      </div>
      <p class="text-xs text-muted">
        The Operations Head approves it (or returns it for correction). The medical slip can be
        added once the agent is approved.
      </p>
      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Sending…' : 'Send for approval' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
