<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { fetchAgentReport, fetchAgentReportPassports } from '@/api/agents'
import { BUCKET_LABELS, AGENT_STATUS_LABELS } from '@/lib/agents'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { AgentBucket, AgentReport, AgentReportPassport, AgentSummary } from '@/types/agents'

/**
 * Agent report (the Operations Head and the Accounts Head): per recruitment agent, the passports
 * it has now and where they are, step by step from entry to flight. A "No agent" row
 * shows the passports without one. Clicking a row or number lists its passports
 * (?agent=<id>|none&bucket=<bucket>). No money here.
 */
const route = useRoute()
const router = useRouter()

const report = shallowRef<AgentReport | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    report.value = await fetchAgentReport()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agent report.')
  }
}
load()

const BUCKETS: AgentBucket[] = [
  'not_started',
  'medical_pending',
  'fit',
  'unfit',
  'calling',
  'visa',
  'bmet',
  'flight',
  'completed',
  'returned',
]

const totals = computed(() => {
  const r = report.value
  if (!r) return null
  return {
    current: r.agents.reduce((n, a) => n + a.current, 0),
    done: r.agents.reduce((n, a) => n + a.buckets.completed, 0),
    none: r.no_agent.current,
  }
})

/* ---------- One agent's passports ---------- */

const selectedAgent = computed<number | 'none' | null>(() => {
  const value = route.query.agent
  if (value === 'none') return 'none'
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
})
const selectedBucket = computed<AgentBucket | null>(() => {
  const value = route.query.bucket
  return typeof value === 'string' && (BUCKETS as string[]).includes(value)
    ? (value as AgentBucket)
    : null
})

const passports = shallowRef<AgentReportPassport[] | null>(null)
const passportAgent = ref<AgentSummary | null>(null)
const passportsError = ref<string | null>(null)
/** current (the agent's passports now) or all (previous ones too). */
const scope = ref<'current' | 'all'>('current')

watch(
  selectedAgent,
  async (agent) => {
    passports.value = null
    passportsError.value = null
    if (agent === null) return
    try {
      const result = await fetchAgentReportPassports(agent)
      if (selectedAgent.value !== agent) return
      passports.value = result.data
      passportAgent.value = result.agent
    } catch (error) {
      if (errorStatus(error) !== 401)
        passportsError.value = errorMessage(error, 'Could not load the passports.')
    }
  },
  { immediate: true },
)

const shownPassports = computed(() =>
  (passports.value ?? []).filter(
    (p) =>
      (!selectedBucket.value || p.bucket === selectedBucket.value) &&
      (selectedAgent.value === 'none' || scope.value === 'all' || p.assignment?.is_current),
  ),
)

function show(agent: number | 'none', bucket: AgentBucket | null = null) {
  router.replace({ query: { agent: String(agent), ...(bucket ? { bucket } : {}) } })
}

const cellLink =
  'rounded px-1 font-semibold text-primary-700 tabular-nums hover:bg-primary-50 hover:underline'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Recruitment Agent Report</h1>
    <p class="mt-1 text-sm text-muted">
      How many passports each recruitment agent has, and where they are: every step from passport
      entry to flight. Click a number to see the passports.
    </p>

    <div v-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>
    <p v-else-if="!report" class="mt-6 text-muted">Loading the report…</p>

    <template v-else>
      <div v-if="totals" class="mt-6 grid gap-4 sm:grid-cols-3">
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Passports with an agent</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ totals.current }}</p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Flight done</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ totals.done }}</p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Without an agent</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ totals.none }}</p>
        </div>
      </div>

      <section class="glass-card mt-6 overflow-x-auto p-4 sm:p-6" aria-label="Agents">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" class="py-3 pr-4 font-semibold">Agent</th>
              <th scope="col" class="py-3 pr-4 font-semibold">RL No.</th>
              <th scope="col" class="py-3 pr-4 text-right font-semibold">Now</th>
              <th
                v-for="b in BUCKETS"
                :key="b"
                scope="col"
                class="py-3 pr-4 text-right font-semibold whitespace-nowrap"
              >
                {{ BUCKET_LABELS[b] }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stroke">
            <tr
              v-for="a in report.agents"
              :key="a.id"
              :class="{ 'bg-primary-50/60': selectedAgent === a.id }"
              :data-report-agent="a.id"
            >
              <th scope="row" class="py-3 pr-4 text-left">
                <button
                  type="button"
                  class="font-semibold text-primary-900 hover:underline"
                  @click="show(a.id)"
                >
                  {{ a.name }}
                </button>
                <span class="block text-xs font-normal text-muted">
                  {{ a.code }}<template v-if="!a.is_active"> · inactive</template>
                </span>
                <span v-if="a.waiting_decision" class="block text-xs text-amber-800">
                  {{ a.waiting_decision }} change(s) waiting for the Accounts Head
                </span>
              </th>
              <td class="py-3 pr-4 font-mono">{{ a.rl_number }}</td>
              <td class="py-3 pr-4 text-right">
                <button type="button" :class="cellLink" @click="show(a.id)">{{ a.current }}</button>
              </td>
              <td v-for="b in BUCKETS" :key="b" class="py-3 pr-4 text-right">
                <button v-if="a.buckets[b]" type="button" :class="cellLink" @click="show(a.id, b)">
                  {{ a.buckets[b] }}
                </button>
                <span v-else class="text-muted tabular-nums">0</span>
              </td>
            </tr>
            <tr
              class="border-t-2 border-stroke"
              :class="{ 'bg-primary-50/60': selectedAgent === 'none' }"
              data-report-none
            >
              <th scope="row" class="py-3 pr-4 text-left">
                <button
                  type="button"
                  class="font-semibold text-slate-700 hover:underline"
                  @click="show('none')"
                >
                  No agent
                </button>
              </th>
              <td class="py-3 pr-4">—</td>
              <td class="py-3 pr-4 text-right">
                <button type="button" :class="cellLink" @click="show('none')">
                  {{ report.no_agent.current }}
                </button>
              </td>
              <td v-for="b in BUCKETS" :key="b" class="py-3 pr-4 text-right">
                <button
                  v-if="report.no_agent.buckets[b]"
                  type="button"
                  :class="cellLink"
                  @click="show('none', b)"
                >
                  {{ report.no_agent.buckets[b] }}
                </button>
                <span v-else class="text-muted tabular-nums">0</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="report.agents.length === 0" class="py-6 text-center text-muted">
          No recruitment agents yet.
        </p>
      </section>

      <section
        v-if="selectedAgent !== null"
        class="glass-card mt-6 p-4 sm:p-6"
        aria-labelledby="agent-passports-heading"
        data-agent-passports
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="agent-passports-heading" class="text-lg font-semibold text-ink">
            {{ selectedAgent === 'none' ? 'Passports without an agent' : passportAgent?.name }}
            <span v-if="selectedBucket" class="text-sm font-normal text-muted">
              · {{ BUCKET_LABELS[selectedBucket] }}</span
            >
          </h2>
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <label v-if="selectedAgent !== 'none'" class="flex items-center gap-2">
              <input
                type="checkbox"
                :checked="scope === 'all'"
                @change="scope = scope === 'all' ? 'current' : 'all'"
              />
              Include passports moved to another agent
            </label>
            <button
              v-if="selectedBucket"
              type="button"
              class="font-semibold text-primary-700 hover:underline"
              @click="show(selectedAgent)"
            >
              Show all stages
            </button>
            <button
              type="button"
              class="font-semibold text-primary-700 hover:underline"
              @click="router.replace({ query: {} })"
            >
              Close
            </button>
          </div>
        </div>
        <p v-if="passportsError" class="mt-4 text-red-700">{{ passportsError }}</p>
        <p v-else-if="!passports" class="mt-4 text-muted">Loading…</p>
        <p v-else-if="shownPassports.length === 0" class="mt-4 text-muted">No passports.</p>
        <div v-else class="mt-4 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
              <tr>
                <th scope="col" class="py-2 pr-3 text-right font-semibold">No.</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Passport</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Reference</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Company</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Stage</th>
                <template v-if="selectedAgent !== 'none'">
                  <th scope="col" class="py-2 pr-3 font-semibold">From</th>
                  <th scope="col" class="py-2 font-semibold">To</th>
                </template>
                <th v-else scope="col" class="py-2 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr v-for="p in shownPassports" :key="`${p.id}-${p.assignment?.id ?? 0}`">
                <td class="py-2 pr-3 text-right tabular-nums">{{ p.entry_no }}</td>
                <td class="py-2 pr-3">
                  <RouterLink
                    :to="{ name: 'passport-detail', params: { id: p.id } }"
                    class="font-semibold text-primary-900 hover:underline"
                    >{{ p.passport_name }}</RouterLink
                  >
                  <span class="block font-mono text-xs text-slate-600">{{
                    p.passport_number
                  }}</span>
                </td>
                <td class="py-2 pr-3">{{ p.reference ?? '—' }}</td>
                <td class="py-2 pr-3">{{ p.company ?? '—' }}</td>
                <td class="py-2 pr-3 whitespace-nowrap">{{ BUCKET_LABELS[p.bucket] }}</td>
                <template v-if="selectedAgent !== 'none'">
                  <td class="py-2 pr-3 whitespace-nowrap">
                    {{ toDisplayDate(p.assignment?.assigned_date) }}
                  </td>
                  <td class="py-2 whitespace-nowrap">
                    {{
                      p.assignment?.status === 'pending'
                        ? 'Waiting approval'
                        : p.assignment?.is_current
                          ? '(current)'
                          : toDisplayDate(p.assignment?.ended_date)
                    }}
                  </td>
                </template>
                <td v-else class="py-2">
                  {{ p.agent_status ? AGENT_STATUS_LABELS[p.agent_status] : '—' }}
                  <span v-if="p.pending_agent" class="block text-xs text-muted">{{
                    p.pending_agent
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
