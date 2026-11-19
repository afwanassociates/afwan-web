<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import CashPaymentFormDialog from '@/components/accounts/CashPaymentFormDialog.vue'
import { fetchAgentLedger, type AgentLedger } from '@/api/agents'
import { useToast } from '@/composables/useToast'
import { formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { CashPayment } from '@/types/accounts'

/**
 * One recruitment agent's ledger (the accounts team): approved part payments with a running
 * total, payments waiting for approval, and "Pay agent" (a cash payment to this agent).
 */
const route = useRoute()
const toast = useToast()
const agentId = computed(() => Number(route.params.id))

const ledger = shallowRef<AgentLedger | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    ledger.value = await fetchAgentLedger(agentId.value)
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value =
        errorStatus(error) === 404
          ? 'This agent was not found.'
          : errorMessage(error, 'Could not load the agent ledger.')
  }
}
watch(agentId, load, { immediate: true })

const payOpen = ref(false)
function onPaid(payment: CashPayment) {
  toast.success(`Payment ${payment.payment_no} saved. It counts once approved.`)
  load()
}

const method = (p: CashPayment) =>
  p.payment_method_label +
  (p.bank_name ? ` · ${p.bank_name}` : '') +
  (p.mobile_provider_label ? ` · ${p.mobile_provider_label}` : '')
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <RouterLink
      :to="{ name: 'accounts-agent-payments' }"
      class="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"
    >
      <span aria-hidden="true">←</span> Agent Payments
    </RouterLink>

    <div v-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>
    <p v-else-if="!ledger" class="mt-6 text-muted">Loading…</p>

    <template v-else>
      <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">{{ ledger.agent.name }}</h1>
          <p class="text-sm text-muted">
            {{ ledger.agent.code }} · RL <span class="font-mono">{{ ledger.agent.rl_number }}</span>
            <template v-if="ledger.agent.phone"> · {{ ledger.agent.phone }}</template>
            <template v-if="!ledger.agent.is_active"> · inactive</template>
          </p>
        </div>
        <button
          v-if="ledger.agent.is_active"
          type="button"
          class="btn btn-accent"
          data-pay-agent
          @click="payOpen = true"
        >
          Pay agent
        </button>
      </div>

      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Counted passports</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            {{ ledger.counted_passports }}
          </p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Total paid</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(ledger.total_paid) }}
          </p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Pending approval</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(ledger.pending_amount) }}
          </p>
          <p class="text-xs text-muted">{{ ledger.pending_count }} payment(s)</p>
        </div>
        <div class="glass-card p-4">
          <p class="text-sm text-muted">Average paid per counted passport</p>
          <p class="mt-1 text-2xl font-bold text-ink tabular-nums">
            {{
              ledger.average_per_passport === null
                ? '—'
                : `৳ ${formatMoney(ledger.average_per_passport)}`
            }}
          </p>
        </div>
      </div>
      <p class="mt-2 text-xs text-muted">
        No rate is set for agents, so there is no due or balance: only what was paid.
      </p>

      <section class="glass-card mt-6 overflow-x-auto p-4 sm:p-6" aria-labelledby="paid-heading">
        <h2 id="paid-heading" class="text-lg font-semibold text-ink">Payments</h2>
        <p v-if="ledger.payments.length === 0" class="mt-4 text-sm text-muted">
          No approved payment yet.
        </p>
        <table v-else class="mt-4 w-full text-left text-sm">
          <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" class="py-2 pr-3 font-semibold">Date</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Payment no.</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Paid via</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Description</th>
              <th scope="col" class="py-2 pr-3 text-right font-semibold">Amount</th>
              <th scope="col" class="py-2 text-right font-semibold">Total paid</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stroke">
            <tr v-for="p in ledger.payments" :key="p.id">
              <td class="py-2 pr-3 whitespace-nowrap">{{ toDisplayDate(p.date) }}</td>
              <td class="py-2 pr-3 font-mono">{{ p.payment_no }}</td>
              <td class="py-2 pr-3">{{ method(p) }}</td>
              <td class="py-2 pr-3 break-words">{{ p.note || '—' }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">৳ {{ formatMoney(p.amount) }}</td>
              <td class="py-2 text-right font-semibold tabular-nums">
                ৳ {{ formatMoney(p.running_total) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        v-if="ledger.pending_payments.length"
        class="glass-card mt-6 overflow-x-auto p-4 sm:p-6"
        aria-labelledby="pending-heading"
      >
        <h2 id="pending-heading" class="text-lg font-semibold text-ink">Waiting for approval</h2>
        <table class="mt-4 w-full text-left text-sm">
          <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" class="py-2 pr-3 font-semibold">Date</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Payment no.</th>
              <th scope="col" class="py-2 pr-3 font-semibold">Paid via</th>
              <th scope="col" class="py-2 pr-3 text-right font-semibold">Amount</th>
              <th scope="col" class="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stroke">
            <tr v-for="p in ledger.pending_payments" :key="p.id">
              <td class="py-2 pr-3 whitespace-nowrap">{{ toDisplayDate(p.date) }}</td>
              <td class="py-2 pr-3 font-mono">{{ p.payment_no }}</td>
              <td class="py-2 pr-3">{{ method(p) }}</td>
              <td class="py-2 pr-3 text-right tabular-nums">৳ {{ formatMoney(p.amount) }}</td>
              <td class="py-2"><ApprovalBadge :status="p.status" :label="p.status_label" /></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <CashPaymentFormDialog
      v-model:open="payOpen"
      :payment="null"
      preset-payee-type="agent"
      :preset-agent="ledger?.agent ?? null"
      @saved="onPaid"
    />
  </div>
</template>
