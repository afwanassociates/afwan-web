<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { listAgentPayments } from '@/api/agents'
import { formatMoney } from '@/lib/accounts'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { AgentPaymentsRow } from '@/types/agents'

/**
 * Agent payments (the accounts team): what the company paid each recruitment agent. Agents have
 * no rate and are paid in part payments only, so there is no due: the counted passports,
 * the total paid and the average paid per counted passport.
 */
const rows = shallowRef<AgentPaymentsRow[] | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    rows.value = await listAgentPayments()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agent payments.')
  }
}
load()

const totals = computed(() =>
  (rows.value ?? []).reduce(
    (t, r) => ({
      counted: t.counted + r.counted_passports,
      paid: t.paid + r.total_paid,
      pending: t.pending + r.pending_amount,
    }),
    { counted: 0, paid: 0, pending: 0 },
  ),
)
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Recruitment Agent Payments</h1>
    <p class="mt-1 text-sm text-muted">
      Part payments to recruitment agents (recorded in Cash Management → Payment, "Paid to: MYGRAM
      agent"). Agents never pay the company.
    </p>

    <div v-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>
    <p v-else-if="!rows" class="mt-6 text-muted">Loading…</p>
    <template v-else>
      <div class="mt-6 grid gap-4 sm:grid-cols-3">
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Counted passports</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ totals.counted }}</p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Total paid</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(totals.paid) }}
          </p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Pending approval</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(totals.pending) }}
          </p>
        </div>
      </div>

      <section class="glass-card mt-6 overflow-x-auto p-4 sm:p-6" aria-label="Agents">
        <p v-if="rows.length === 0" class="py-8 text-center text-muted">
          No recruitment agents yet.
        </p>
        <table v-else class="w-full text-left text-sm">
          <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" class="py-3 pr-4 font-semibold">Agent</th>
              <th scope="col" class="py-3 pr-4 font-semibold">RL No.</th>
              <th scope="col" class="py-3 pr-4 text-right font-semibold">Counted passports</th>
              <th scope="col" class="py-3 pr-4 text-right font-semibold">Total paid</th>
              <th scope="col" class="py-3 pr-4 text-right font-semibold">Pending approval</th>
              <th scope="col" class="py-3 text-right font-semibold">Average per passport</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stroke">
            <tr v-for="r in rows" :key="r.id" :data-agent-payments="r.id">
              <th scope="row" class="py-3 pr-4 text-left">
                <RouterLink
                  :to="{ name: 'accounts-agent-ledger', params: { id: r.id } }"
                  class="font-semibold text-primary-900 hover:underline"
                  >{{ r.name }}</RouterLink
                >
                <span class="block text-xs font-normal text-muted"
                  >{{ r.code }}<template v-if="!r.is_active"> · inactive</template></span
                >
              </th>
              <td class="py-3 pr-4 font-mono">{{ r.rl_number }}</td>
              <td class="py-3 pr-4 text-right tabular-nums">{{ r.counted_passports }}</td>
              <td class="py-3 pr-4 text-right font-semibold tabular-nums">
                ৳ {{ formatMoney(r.total_paid) }}
              </td>
              <td class="py-3 pr-4 text-right tabular-nums">
                <template v-if="r.pending_count"
                  >৳ {{ formatMoney(r.pending_amount) }} ({{ r.pending_count }})</template
                >
                <template v-else>—</template>
              </td>
              <td class="py-3 text-right tabular-nums">
                {{
                  r.average_per_passport === null ? '—' : `৳ ${formatMoney(r.average_per_passport)}`
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
