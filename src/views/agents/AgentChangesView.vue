<script setup lang="ts">
import { ref, shallowRef, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { decideAgentChange, listAgentChanges } from '@/api/agents'
import { useAgentBadges } from '@/composables/useAgentBadges'
import { useToast } from '@/composables/useToast'
import { BUCKET_LABELS } from '@/lib/agents'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { AgentAssignment } from '@/types/agents'

/**
 * Agent Changes (the Accounts Head): a passport moved from agent A to agent B. Decide each
 * time whether it still counts (is paid) for A. Until then it does not count for A. A
 * decision can be changed later from the Decided tab.
 */
const toast = useToast()
const badges = useAgentBadges()
const noteId = useId()

const tab = ref<'waiting' | 'decided'>('waiting')
const list = shallowRef<Paginated<AgentAssignment> | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    list.value = await listAgentChanges({ decision: tab.value, per_page: 200 })
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agent changes.')
  }
  badges.refresh()
}
watch(tab, load, { immediate: true })

const target = ref<AgentAssignment | null>(null)
const counts = ref<boolean | null>(null)
const note = ref('')
const dialogOpen = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

function decide(row: AgentAssignment, answer: boolean) {
  target.value = row
  counts.value = answer
  note.value = row.decision_note ?? ''
  error.value = null
  dialogOpen.value = true
}

async function confirm() {
  const row = target.value
  if (!row || counts.value === null) return
  busy.value = true
  error.value = null
  try {
    await decideAgentChange(row.id, counts.value, note.value.trim() || null)
    dialogOpen.value = false
    toast.success(
      `${row.passport?.passport_number}: ${counts.value ? 'counts' : 'does not count'} for ${row.agent?.name}.`,
    )
    load()
  } catch (e) {
    if (errorStatus(e) !== 401) error.value = errorMessage(e, 'Could not save. Please try again.')
  } finally {
    busy.value = false
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
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Recruitment Agent Changes</h1>
    <p class="mt-1 text-sm text-muted">
      Passports moved to another recruitment agent. Decide whether each still counts (is paid) for
      the old agent.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Agent changes">
      <div class="flex flex-wrap gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :class="tabClass(tab === 'waiting')"
          :aria-selected="tab === 'waiting'"
          @click="tab = 'waiting'"
        >
          Waiting
          <span v-if="badges.changes.value" class="ml-1 tabular-nums"
            >({{ badges.changes.value }})</span
          >
        </button>
        <button
          type="button"
          role="tab"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :class="tabClass(tab === 'decided')"
          :aria-selected="tab === 'decided'"
          @click="tab = 'decided'"
        >
          Decided
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>
        <p v-else-if="!list" class="py-8 text-center text-muted">Loading…</p>
        <p v-else-if="list.data.length === 0" class="py-12 text-center font-semibold text-ink">
          {{ tab === 'waiting' ? 'No agent change is waiting for you.' : 'Nothing decided yet.' }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
              <tr>
                <th scope="col" class="py-3 pr-4 font-semibold">Passport</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Old agent</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Had it</th>
                <th scope="col" class="py-3 pr-4 font-semibold">New agent</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Reason</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Stage</th>
                <th scope="col" class="py-3 font-semibold">
                  {{ tab === 'waiting' ? 'Still counts for the old agent?' : 'Decision' }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr v-for="row in list.data" :key="row.id" class="align-top" :data-change="row.id">
                <td class="py-3 pr-4">
                  <RouterLink
                    v-if="row.passport"
                    :to="{ name: 'all-passports', query: { q: row.passport.passport_number } }"
                    class="font-semibold text-primary-900 hover:underline"
                    >{{ row.passport.passport_name }}</RouterLink
                  >
                  <span class="block font-mono text-xs text-slate-600">{{
                    row.passport?.passport_number
                  }}</span>
                </td>
                <td class="py-3 pr-4">
                  <span class="font-medium text-ink">{{ row.agent?.name }}</span>
                  <span class="block text-xs text-muted">RL {{ row.agent?.rl_number }}</span>
                </td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  {{ toDisplayDate(row.assigned_date) }} – {{ toDisplayDate(row.ended_date) }}
                </td>
                <td class="py-3 pr-4">
                  <span class="font-medium text-ink">{{
                    row.replaced_by?.agent?.name ?? '—'
                  }}</span>
                  <span v-if="row.replaced_by?.agent" class="block text-xs text-muted"
                    >RL {{ row.replaced_by.agent.rl_number }}</span
                  >
                </td>
                <td class="py-3 pr-4 break-words">{{ row.replaced_by?.remark || '—' }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  {{ row.passport ? BUCKET_LABELS[row.passport.bucket] : '—' }}
                </td>
                <td class="py-3">
                  <template v-if="tab === 'decided'">
                    <span
                      class="font-semibold"
                      :class="row.count_decision === 'yes' ? 'text-green-800' : 'text-slate-700'"
                      >{{ row.count_decision_label }}</span
                    >
                    <span class="block text-xs text-muted">
                      {{ row.decided_by?.name }}
                      <template v-if="row.decision_note"> · {{ row.decision_note }}</template>
                    </span>
                  </template>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <button
                      v-if="tab === 'waiting' || row.count_decision !== 'yes'"
                      type="button"
                      :class="[actionClass, 'text-green-800']"
                      data-decide-yes
                      @click="decide(row, true)"
                    >
                      {{ tab === 'waiting' ? 'Yes' : 'Change to Yes' }}
                    </button>
                    <button
                      v-if="tab === 'waiting' || row.count_decision !== 'no'"
                      type="button"
                      :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                      data-decide-no
                      @click="decide(row, false)"
                    >
                      {{ tab === 'waiting' ? 'No' : 'Change to No' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <BaseDialog
      v-model:open="dialogOpen"
      :title="counts ? 'Counts for the old agent' : 'Does not count for the old agent'"
      :busy="busy"
    >
      <p
        v-if="error"
        role="alert"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
      >
        {{ error }}
      </p>
      <form class="space-y-4" novalidate @submit.prevent="confirm">
        <p v-if="target" class="text-sm">
          {{ target.passport?.passport_number }}:
          <template v-if="counts">
            it still counts for <strong>{{ target.agent?.name }}</strong> (and for the new agent).
          </template>
          <template v-else>
            it no longer counts for <strong>{{ target.agent?.name }}</strong
            >; only the new agent.
          </template>
        </p>
        <div>
          <label :for="noteId" class="block text-sm font-medium text-slate-700">Note</label>
          <input
            :id="noteId"
            v-model="note"
            type="text"
            maxlength="500"
            placeholder="Optional"
            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600"
          />
        </div>
        <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
            :disabled="busy"
            @click="dialogOpen = false"
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </BaseDialog>
  </div>
</template>
