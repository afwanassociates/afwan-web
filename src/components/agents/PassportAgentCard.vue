<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AgentStatusBadge from '@/components/agents/AgentStatusBadge.vue'
import AssignAgentDialog from '@/components/agents/AssignAgentDialog.vue'
import { listAgentAssignments } from '@/api/agents'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import type { AgentAssignment } from '@/types/agents'
import type { PassportEntry } from '@/types/passport'

/**
 * The passport's recruitment agent: the approved agent, what waits for the Operations Head or was
 * returned for correction, the Assign / Change button (data entry) and the full history
 * (returned and replaced assignments included).
 */
const props = defineProps<{ passport: PassportEntry }>()
const emit = defineEmits<{ changed: [] }>()

const history = ref<AgentAssignment[]>([])
const historyError = ref<string | null>(null)
const dialogOpen = ref(false)

async function loadHistory() {
  historyError.value = null
  try {
    history.value = await listAgentAssignments(props.passport.id)
  } catch (error) {
    historyError.value = errorMessage(error, 'Could not load the agent history.')
  }
}

watch(
  () => [props.passport.id, props.passport.updated_at, props.passport.agent_status] as const,
  loadHistory,
  { immediate: true },
)

const status = computed(() => props.passport.agent_status ?? 'none')
const canAssign = computed(
  () => Boolean(props.passport.can.assign_agent) && status.value !== 'pending',
)
const buttonLabel = computed(() =>
  status.value === 'returned'
    ? 'Correct and send again'
    : props.passport.recruitment_agent
      ? 'Change agent'
      : 'Assign agent',
)

function onSaved() {
  emit('changed')
  loadHistory()
}

const countLabel = (row: AgentAssignment) => {
  if (row.status !== 'approved') return '—'
  if (row.is_current) return row.counted ? 'Yes' : 'No'
  if (row.count_decision === 'waiting') return 'Waiting'
  return row.count_decision === 'yes' ? 'Yes' : 'No'
}

const dt = 'text-muted'
const dd = 'font-medium text-ink'
</script>

<template>
  <section class="glass-card p-5 sm:p-6" aria-labelledby="agent-heading" data-agent-card>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="agent-heading" class="text-lg font-semibold text-ink">Recruitment Agent</h2>
      <div class="flex flex-wrap items-center gap-2">
        <AgentStatusBadge :status="status" />
        <button
          v-if="canAssign"
          type="button"
          class="btn btn-accent text-sm"
          data-assign-agent
          @click="dialogOpen = true"
        >
          {{ buttonLabel }}
        </button>
      </div>
    </div>

    <dl
      v-if="passport.recruitment_agent"
      class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"
      data-current-agent
    >
      <dt :class="dt">Agent</dt>
      <dd :class="dd">
        {{ passport.recruitment_agent.name }}
        <span class="text-xs font-normal text-muted">({{ passport.recruitment_agent.code }})</span>
      </dd>
      <dt :class="dt">RL number</dt>
      <dd :class="[dd, 'font-mono']">{{ passport.recruitment_agent.rl_number }}</dd>
      <dt :class="dt">Since</dt>
      <dd :class="dd">{{ toDisplayDate(passport.recruitment_agent.assigned_date) }}</dd>
    </dl>
    <p v-else-if="status !== 'pending'" class="mt-4 text-sm text-muted">
      No approved agent yet. The passport can't move to the next step until the Operations Head
      approves its recruitment agent.
    </p>

    <p
      v-if="passport.agent_pending"
      class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
      role="status"
      data-agent-pending
    >
      <span class="font-semibold">Waiting for the Operations Head:</span>
      {{ passport.agent_pending.agent.name }} ({{ passport.agent_pending.agent.code }}) from
      {{ toDisplayDate(passport.agent_pending.assigned_date) }}
      <template v-if="passport.agent_pending.remark">
        · {{ passport.agent_pending.remark }}</template
      >
    </p>
    <p
      v-if="passport.agent_return"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
      role="status"
      data-agent-returned
    >
      <span class="font-semibold">Returned for correction:</span>
      {{ passport.agent_return.reason }}
    </p>

    <div v-if="history.length" class="mt-5 border-t border-stroke pt-4">
      <h3 class="text-sm font-semibold text-ink">History</h3>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-sm" data-agent-history>
          <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" class="py-2 pr-3 font-semibold">Agent</th>
              <th scope="col" class="py-2 pr-3 font-semibold">RL No.</th>
              <th scope="col" class="py-2 pr-3 font-semibold">From</th>
              <th scope="col" class="py-2 pr-3 font-semibold">To</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Reason</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Assigned by</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Approved by</th>
              <th scope="col" class="py-2 font-semibold">Counted</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stroke">
            <tr
              v-for="row in history"
              :key="row.id"
              class="align-top"
              :data-history-row="row.status"
            >
              <td class="py-2 pr-3 font-medium text-ink">{{ row.agent?.name }}</td>
              <td class="py-2 pr-3 font-mono">{{ row.agent?.rl_number }}</td>
              <td class="py-2 pr-3 whitespace-nowrap">{{ toDisplayDate(row.assigned_date) }}</td>
              <td class="py-2 pr-3 whitespace-nowrap">
                <template v-if="row.status === 'returned'">
                  <span class="font-semibold text-red-700">Returned</span>
                  <span class="block text-xs text-red-700">{{ row.return_reason }}</span>
                </template>
                <span v-else-if="row.status === 'pending'" class="text-amber-800">Waiting</span>
                <template v-else-if="row.is_current">(current)</template>
                <template v-else>{{ toDisplayDate(row.ended_date) }}</template>
              </td>
              <td class="py-2 pr-3 break-words">{{ row.remark || '—' }}</td>
              <td class="py-2 pr-3">{{ row.assigned_by?.name ?? '—' }}</td>
              <td class="py-2 pr-3">
                {{
                  row.approved_by?.name ??
                  (row.status === 'returned' ? row.returned_by?.name : '—') ??
                  '—'
                }}
              </td>
              <td class="py-2">
                {{ countLabel(row) }}
                <span v-if="row.decision_note" class="block text-xs text-muted">{{
                  row.decision_note
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <p v-if="historyError" class="mt-3 text-sm text-red-700">{{ historyError }}</p>

    <AssignAgentDialog v-model:open="dialogOpen" :passport="passport" @saved="onSaved" />
  </section>
</template>
