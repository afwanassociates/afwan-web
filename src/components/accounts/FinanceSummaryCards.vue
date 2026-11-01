<script setup lang="ts">
import { formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import type { FinanceSummary } from '@/types/accounts'

/**
 * The money summary in one line of cards: total received and paid so far, closing cash on
 * hand, bank and mobile banking balances, their grand total, and today's opening cash
 * (yesterday's closing, worked out by the API) with the starting balance under it.
 * Used on Cash Management (accounts head) and the dashboard (accounts head and admins).
 * `summary` null shows "…" while loading, or "—" when `failed`. Nobody sets the opening: it
 * is worked out; a starting balance saved earlier is shown under it.
 * `variant="dashboard"` draws coloured tiles like the passport summary; the default is the
 * compact one-line strip of Cash Management.
 */
withDefaults(
  defineProps<{
    summary: FinanceSummary | null
    failed?: boolean
    variant?: 'compact' | 'dashboard'
  }>(),
  { failed: false, variant: 'compact' },
)

const CARDS: {
  key: string
  label: string
  /** Dashboard tile colours, as on the passport summary. */
  tone: string
  amount: (s: FinanceSummary) => number
}[] = [
  {
    key: 'received',
    label: 'Total Received Amount',
    tone: 'border-green-200 bg-green-50 text-green-900',
    amount: (s) => s.total_received,
  },
  {
    key: 'paid',
    label: 'Total Paid Amount',
    tone: 'border-red-200 bg-red-50 text-red-900',
    amount: (s) => s.total_paid,
  },
  {
    key: 'cash',
    label: 'Closing Cash on Hand',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    amount: (s) => s.cash_in_hand,
  },
  {
    key: 'bank',
    label: 'Closing Bank Balance',
    tone: 'border-sky-200 bg-sky-50 text-sky-900',
    amount: (s) => s.bank_balance,
  },
  {
    key: 'mobile',
    label: 'Closing Mobile Banking Balance',
    tone: 'border-violet-200 bg-violet-50 text-violet-900',
    amount: (s) => s.mobile_banking_balance,
  },
  {
    key: 'total',
    label: 'Grand Total Closing Balance',
    // The total stands out: light teal tile, deep teal text and a stronger border.
    tone: 'border-2 border-teal-400 bg-teal-50 text-teal-900',
    // Worked in paisa so the sum never drifts.
    amount: (s) =>
      Math.round(s.cash_in_hand * 100 + s.bank_balance * 100 + s.mobile_banking_balance * 100) /
      100,
  },
]
</script>

<template>
  <!-- Dashboard: coloured tiles, the same look as the passport summary. -->
  <dl
    v-if="variant === 'dashboard'"
    class="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    data-finance-summary
  >
    <div
      v-for="card in CARDS"
      :key="card.key"
      :class="['min-w-0 rounded-xl border p-5 shadow-sm', card.tone]"
      :data-closing="card.key"
    >
      <dt class="text-sm font-medium opacity-80">{{ card.label }}</dt>
      <dd
        class="mt-1 text-2xl font-bold break-words tabular-nums"
        :class="{ 'text-red-700': summary && card.amount(summary) < 0 }"
      >
        <template v-if="summary">
          {{ card.amount(summary) < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(card.amount(summary))) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </dd>
    </div>
    <div
      class="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-900 shadow-sm"
    >
      <dt class="text-sm font-medium opacity-80">Today's Opening Cash</dt>
      <dd
        class="mt-1 text-2xl font-bold break-words tabular-nums"
        :class="{ 'text-red-700': summary && summary.opening_today < 0 }"
        data-opening-today
      >
        <template v-if="summary">
          {{ summary.opening_today < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(summary.opening_today)) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </dd>
      <dd v-if="summary?.opening_date" class="mt-1 text-sm opacity-80" data-opening>
        Starting balance ৳ {{ formatMoney(summary.opening_balance) }} on
        {{ toDisplayDate(summary.opening_date) }}
      </dd>
    </div>
  </dl>

  <!-- Compact: one line of cards on wide screens; a grid on smaller ones. -->
  <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" data-finance-summary>
    <div
      v-for="card in CARDS"
      :key="card.key"
      class="glass-card min-w-0 px-3 py-3"
      :class="{
        'ring-2 ring-accent-400': card.key === 'cash',
        'bg-primary-50 ring-2 ring-primary-600': card.key === 'total',
      }"
      :data-closing="card.key"
    >
      <p class="text-[11px] leading-tight font-semibold tracking-wider text-muted uppercase">
        {{ card.label }}
      </p>
      <p
        class="mt-1 text-base font-bold break-words tabular-nums lg:text-lg"
        :class="summary && card.amount(summary) < 0 ? 'text-red-700' : 'text-ink'"
      >
        <template v-if="summary">
          {{ card.amount(summary) < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(card.amount(summary))) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </p>
    </div>
    <div class="glass-card min-w-0 px-3 py-3">
      <p class="text-[11px] leading-tight font-semibold tracking-wider text-muted uppercase">
        Today's Opening Cash
      </p>
      <p
        class="mt-1 text-base font-bold break-words tabular-nums lg:text-lg"
        :class="summary && summary.opening_today < 0 ? 'text-red-700' : 'text-ink'"
        data-opening-today
      >
        <template v-if="summary">
          {{ summary.opening_today < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(summary.opening_today)) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </p>
      <p
        v-if="summary?.opening_date"
        class="mt-0.5 text-[11px] leading-tight text-muted"
        data-opening
      >
        Starting ৳ {{ formatMoney(summary.opening_balance) }} on
        {{ toDisplayDate(summary.opening_date) }}
      </p>
    </div>
  </div>
</template>
