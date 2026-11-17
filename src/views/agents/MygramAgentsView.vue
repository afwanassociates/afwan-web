<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId } from 'vue'
import { RouterLink } from 'vue-router'
import AgentFormDialog from '@/components/agents/AgentFormDialog.vue'
import { listAgents, updateAgent } from '@/api/agents'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { MygramAgent } from '@/types/agents'

/**
 * MYGRAM agents (the Operations Head): the partner agents passports go to for the MYGRAM /
 * medical slip. Add, edit, (de)activate; never deleted. Shows each agent's current passports
 * and the passports that count for it.
 */
const toast = useToast()
const searchId = useId()

const agents = shallowRef<MygramAgent[] | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const search = ref('')

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    agents.value = await listAgents()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agents. Please try again.')
  } finally {
    isLoading.value = false
  }
}
load()

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!agents.value || !q) return agents.value ?? []
  return agents.value.filter((a) =>
    [a.name, a.code, a.rl_number, a.phone ?? ''].some((v) => v.toLowerCase().includes(q)),
  )
})

const formOpen = ref(false)
const editing = ref<MygramAgent | null>(null)

async function openForm(agent: MygramAgent | null) {
  editing.value = agent
  await nextTick()
  formOpen.value = true
}

function onSaved(agent: MygramAgent, created: boolean) {
  toast.success(
    created ? `Agent “${agent.name}” (${agent.code}) added.` : `Agent “${agent.name}” saved.`,
  )
  load()
}

const busyId = ref<number | null>(null)
async function setActive(agent: MygramAgent, active: boolean) {
  busyId.value = agent.id
  try {
    await updateAgent(agent.id, { is_active: active })
    toast.success(
      active ? `Agent “${agent.name}” activated.` : `Agent “${agent.name}” deactivated.`,
    )
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not change the agent. Please try again.'))
  } finally {
    busyId.value = null
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">MYGRAM Agents</h1>
        <p class="mt-1 text-sm text-muted">
          Partner agents with their RL number. Data entry assigns passports to them; you approve.
          <RouterLink
            :to="{ name: 'agent-report' }"
            class="font-semibold text-primary-700 underline underline-offset-2"
            >Agent report</RouterLink
          >
        </p>
      </div>
      <button type="button" class="btn btn-accent" data-create @click="openForm(null)">
        New agent
      </button>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="MYGRAM agents">
      <div class="w-full sm:w-72" role="search">
        <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
        <input
          :id="searchId"
          v-model="search"
          type="search"
          autocomplete="off"
          placeholder="Name, ID, RL number or phone"
          :class="inputClass"
        />
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>
        <p v-else-if="!agents" class="py-8 text-center text-muted">Loading agents…</p>
        <div v-else-if="shown.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ agents.length ? 'No agents match this search.' : 'No MYGRAM agents yet.' }}
          </p>
          <button
            v-if="!agents.length"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openForm(null)"
          >
            New agent
          </button>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
              <tr>
                <th scope="col" class="py-3 pr-4 font-semibold">ID</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Agent</th>
                <th scope="col" class="py-3 pr-4 font-semibold">RL number</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Phone</th>
                <th scope="col" class="py-3 pr-4 text-right font-semibold">Passports now</th>
                <th scope="col" class="py-3 pr-4 text-right font-semibold">Counted</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Status</th>
                <th scope="col" class="py-3 font-semibold"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr v-for="a in shown" :key="a.id" class="align-top" :data-agent="a.id">
                <td class="py-3 pr-4 font-mono">{{ a.code }}</td>
                <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                  {{ a.name }}
                  <span v-if="a.address" class="block text-xs font-normal text-muted">{{
                    a.address
                  }}</span>
                </th>
                <td class="py-3 pr-4 font-mono">{{ a.rl_number }}</td>
                <td class="py-3 pr-4">{{ a.phone || '—' }}</td>
                <td class="py-3 pr-4 text-right tabular-nums">
                  <RouterLink
                    :to="{ name: 'agent-report', query: { agent: a.id } }"
                    class="font-semibold text-primary-700 hover:underline"
                    >{{ a.current_count ?? 0 }}</RouterLink
                  >
                </td>
                <td class="py-3 pr-4 text-right tabular-nums">{{ a.counted_count ?? 0 }}</td>
                <td class="py-3 pr-4">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                    :class="
                      a.is_active
                        ? 'bg-green-50 text-green-800 ring-green-300'
                        : 'bg-slate-100 text-slate-700 ring-slate-300'
                    "
                  >
                    {{ a.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="py-3">
                  <div class="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      :class="[actionClass, 'text-primary-700']"
                      @click="openForm(a)"
                    >
                      Edit<span class="sr-only"> {{ a.name }}</span>
                    </button>
                    <button
                      type="button"
                      :class="[actionClass, a.is_active ? 'text-amber-800' : 'text-green-800']"
                      :disabled="busyId === a.id"
                      @click="setActive(a, !a.is_active)"
                    >
                      {{ a.is_active ? 'Deactivate' : 'Activate'
                      }}<span class="sr-only"> {{ a.name }}</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <AgentFormDialog v-model:open="formOpen" :agent="editing" @saved="onSaved" />
  </div>
</template>
