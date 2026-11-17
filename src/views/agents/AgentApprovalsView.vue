<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import {
  approveAgentAssignment,
  bulkApproveAgentAssignments,
  listAgentApprovals,
  returnAgentAssignment,
} from '@/api/agents'
import { useAgentBadges } from '@/composables/useAgentBadges'
import { useToast } from '@/composables/useToast'
import { BUCKET_LABELS } from '@/lib/agents'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { AgentAssignment, AssignmentStatus } from '@/types/agents'

/**
 * Agent Approvals (the Operations Head): MYGRAM agent assignments and changes sent by data
 * entry. Approve one, several, or return one for correction with a reason. Nobody approves
 * an assignment they made. The Approved and Returned tabs show what was decided.
 */
const toast = useToast()
const badges = useAgentBadges()

const TABS: { key: AssignmentStatus; label: string }[] = [
  { key: 'pending', label: 'Waiting for approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'returned', label: 'Returned' },
]
const tab = ref<AssignmentStatus>('pending')

const list = shallowRef<Paginated<AgentAssignment> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const selected = ref<Set<number>>(new Set())

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    list.value = await listAgentApprovals({ status: tab.value, per_page: 200 })
    selected.value = new Set()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agent approvals.')
  } finally {
    isLoading.value = false
  }
  badges.refresh()
}
watch(tab, load, { immediate: true })

const approvable = computed(() => list.value?.data.filter((row) => row.can.approve) ?? [])
const allSelected = computed(
  () => approvable.value.length > 0 && approvable.value.every((row) => selected.value.has(row.id)),
)

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(approvable.value.map((r) => r.id))
}

const busyId = ref<number | null>(null)
const bulkBusy = ref(false)

async function approve(row: AgentAssignment) {
  busyId.value = row.id
  try {
    await approveAgentAssignment(row.id)
    toast.success(`${row.passport?.passport_number}: ${row.agent?.name} approved.`)
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not approve. Please try again.'))
  } finally {
    busyId.value = null
  }
}

async function approveSelected() {
  if (!selected.value.size) return
  bulkBusy.value = true
  try {
    const result = await bulkApproveAgentAssignments([...selected.value])
    toast.success(
      `${result.updated.length} approved${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.`,
    )
    if (result.skipped.length)
      toast.error(result.skipped.map((s) => `${s.passport_number}: ${s.reason}`).join(' · '))
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not approve. Please try again.'))
  } finally {
    bulkBusy.value = false
  }
}

const returnTarget = ref<AgentAssignment | null>(null)
const returnOpen = ref(false)
const returnBusy = ref(false)
const returnError = ref<string | null>(null)

function askReturn(row: AgentAssignment) {
  returnTarget.value = row
  returnError.value = null
  returnOpen.value = true
}

async function confirmReturn(reason: string) {
  const row = returnTarget.value
  if (!row) return
  returnBusy.value = true
  returnError.value = null
  try {
    await returnAgentAssignment(row.id, reason)
    returnOpen.value = false
    toast.success(`${row.passport?.passport_number}: returned to data entry for correction.`)
    load()
  } catch (error) {
    if (errorStatus(error) !== 401)
      returnError.value = errorMessage(error, 'Could not return it. Please try again.')
  } finally {
    returnBusy.value = false
  }
}

const tabClass = (active: boolean) =>
  active
    ? 'bg-primary-900 text-white'
    : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Agent Approvals</h1>
    <p class="mt-1 text-sm text-muted">
      MYGRAM agents assigned by data entry. A passport needs its agent approved before the medical
      slip.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Agent approvals">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="tabClass(tab === t.key)"
            :aria-selected="tab === t.key"
            :data-tab="t.key"
            @click="tab = t.key"
          >
            {{ t.label }}
            <span v-if="t.key === 'pending' && badges.approvals.value" class="ml-1 tabular-nums"
              >({{ badges.approvals.value }})</span
            >
          </button>
        </div>
        <button
          v-if="tab === 'pending' && approvable.length"
          type="button"
          class="btn btn-primary text-sm"
          :disabled="!selected.size || bulkBusy"
          data-bulk-approve
          @click="approveSelected"
        >
          {{ bulkBusy ? 'Approving…' : `Approve ticked (${selected.size})` }}
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>
        <p v-else-if="!list" class="py-8 text-center text-muted">Loading…</p>
        <p
          v-else-if="list.data.length === 0"
          class="py-12 text-center font-semibold text-ink"
          data-empty
        >
          {{ tab === 'pending' ? 'Nothing is waiting for approval.' : 'Nothing here yet.' }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
              <tr>
                <th v-if="tab === 'pending'" scope="col" class="w-10 py-3 pr-2">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    aria-label="Tick all"
                    @change="toggleAll"
                  />
                </th>
                <th scope="col" class="py-3 pr-4 font-semibold">Passport</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Agent</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Date</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Remark / reason</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Assigned by</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Stage</th>
                <th scope="col" class="py-3 font-semibold">
                  {{ tab === 'pending' ? '' : tab === 'approved' ? 'Approved by' : 'Returned' }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr
                v-for="row in list.data"
                :key="row.id"
                class="align-top"
                :data-assignment="row.id"
              >
                <td v-if="tab === 'pending'" class="py-3 pr-2">
                  <input
                    v-if="row.can.approve"
                    type="checkbox"
                    :checked="selected.has(row.id)"
                    :aria-label="`Tick ${row.passport?.passport_number}`"
                    @change="toggle(row.id)"
                  />
                </td>
                <td class="py-3 pr-4">
                  <RouterLink
                    v-if="row.passport"
                    :to="{ name: 'passport-detail', params: { id: row.passport.id } }"
                    class="font-semibold text-primary-900 hover:underline"
                    >{{ row.passport.passport_name }}</RouterLink
                  >
                  <span class="block font-mono text-xs text-slate-600">{{
                    row.passport?.passport_number
                  }}</span>
                </td>
                <td class="py-3 pr-4">
                  <span class="font-medium text-ink">{{ row.agent?.name }}</span>
                  <span class="block text-xs text-muted"
                    >{{ row.agent?.code }} · RL {{ row.agent?.rl_number }}</span
                  >
                  <span v-if="row.current_agent" class="mt-1 block text-xs text-amber-800">
                    Change from {{ row.current_agent.name }}
                  </span>
                </td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ toDisplayDate(row.assigned_date) }}</td>
                <td class="py-3 pr-4 break-words">{{ row.remark || '—' }}</td>
                <td class="py-3 pr-4">{{ row.assigned_by?.name ?? '—' }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  {{ row.passport ? BUCKET_LABELS[row.passport.bucket] : '—' }}
                </td>
                <td class="py-3">
                  <div v-if="tab === 'pending'" class="flex flex-wrap justify-end gap-1">
                    <template v-if="row.can.approve">
                      <button
                        type="button"
                        :class="[actionClass, 'text-green-800']"
                        :disabled="busyId === row.id"
                        data-approve
                        @click="approve(row)"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-return
                        @click="askReturn(row)"
                      >
                        Return for correction
                      </button>
                    </template>
                    <span v-else class="text-xs text-muted">You made this one</span>
                  </div>
                  <template v-else-if="tab === 'approved'">{{
                    row.approved_by?.name ?? '—'
                  }}</template>
                  <template v-else>
                    {{ row.returned_by?.name ?? '—' }}
                    <span class="block text-xs text-red-700">{{ row.return_reason }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <ReturnReasonDialog
      v-model:open="returnOpen"
      title="Return for correction"
      :busy="returnBusy"
      :error="returnError"
      @confirm="confirmReturn"
    >
      <p v-if="returnTarget" class="text-sm">
        {{ returnTarget.passport?.passport_number }} →
        <strong>{{ returnTarget.agent?.name }}</strong
        >. Data entry sees the reason and sends a corrected one.
      </p>
    </ReturnReasonDialog>
  </div>
</template>
