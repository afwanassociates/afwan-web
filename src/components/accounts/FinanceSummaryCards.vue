<script setup lang="ts">
import { formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import type { FinanceSummary } from '@/types/accounts'

/**
 * The money summary in one line of cards: total received and paid so far (with what the paid
 * total was for: expenses, refunds, owner loans), total expenses (paid directly plus owner loan
 * bills: a loan itself is not spending), closing cash on
 * hand, bank and mobile banking balances, their grand total, and today's opening cash
 * (yesterday's closing cash on hand + bank + mobile banking, worked out by the API) with the
 * starting balance under it.
 * Used on Cash Management (accounts head) and the dashboard (accounts head and admins).
 * `summary` null shows "…" while loading, or "—" when `failed`. Nobody sets the opening: it
 * is worked out; a starting balance saved earlier is shown under it.
 * `variant="dashboard"` draws the passport summary's cards (white, a coloured border and left
 * stripe, centred text); the default is the
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

/** Shared layout of a dashboard card; each card adds its colours. */
const DASHBOARD_CARD =
  'flex min-w-0 flex-col items-center justify-center rounded-xl border border-l-4 bg-white px-3 py-5 text-center shadow-md'

const CARDS: {
  key: string
  label: string
  /** Dashboard card colours (border and left stripe), as on the passport summary. */
  tone: string
  amount: (s: FinanceSummary) => number
  /** A line under the amount (e.g. what Total Paid was for). */
  note?: (s: FinanceSummary) => string | null
}[] = [
  {
    key: 'received',
    label: 'Total Received Amount',
    tone: 'border-green-200 border-l-green-600 text-green-900',
    amount: (s) => s.total_received,
  },
  {
    key: 'paid',
    label: 'Total Paid Amount',
    tone: 'border-red-200 border-l-red-600 text-red-900',
    amount: (s) => s.total_paid,
    // A loan to an owner is money paid, not spending: show what the total was for.
    note: (s) =>
      s.paid_breakdown
        ? `Expenses ৳ ${formatMoney(s.paid_breakdown.expenses)} · Refunds ৳ ${formatMoney(s.paid_breakdown.refunds)} · Owner loans ৳ ${formatMoney(s.paid_breakdown.owner_loans)}`
        : null,
  },
  {
    key: 'expenses',
    label: 'Total Expenses',
    tone: 'border-orange-200 border-l-orange-500 text-orange-900',
    amount: (s) => s.total_expenses ?? 0,
    note: () => 'Paid directly + owner loan bills',
  },
  {
    key: 'cash',
    label: 'Closing Cash on Hand',
    tone: 'border-amber-200 border-l-amber-500 text-amber-900',
    amount: (s) => s.cash_in_hand,
  },
  {
    key: 'bank',
    label: 'Closing Bank Balance',
    tone: 'border-sky-200 border-l-sky-600 text-sky-900',
    amount: (s) => s.bank_balance,
  },
  {
    key: 'mobile',
    label: 'Closing Mobile Banking Balance',
    tone: 'border-violet-200 border-l-violet-600 text-violet-900',
    amount: (s) => s.mobile_banking_balance,
  },
  {
    key: 'total',
    label: 'Grand Total Closing Balance',
    tone: 'border-teal-200 border-l-teal-600 text-teal-900',
    // Worked in paisa so the sum never drifts.
    amount: (s) =>
      Math.round(s.cash_in_hand * 100 + s.bank_balance * 100 + s.mobile_banking_balance * 100) /
      100,
  },
]
</script>

<template>
  <!-- Dashboard: the same cards as the passport summary. -->
  <dl
    v-if="variant === 'dashboard'"
    class="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    data-finance-summary
  >
    <div
      v-for="card in CARDS"
      :key="card.key"
      :class="[DASHBOARD_CARD, card.tone]"
      :data-closing="card.key"
    >
      <dt class="text-xs font-semibold opacity-80 sm:text-sm">{{ card.label }}</dt>
      <dd
        class="mt-1 text-xl font-bold break-words tabular-nums sm:text-2xl"
        :class="{ 'text-red-700': summary && card.amount(summary) < 0 }"
      >
        <template v-if="summary">
          {{ card.amount(summary) < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(card.amount(summary))) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </dd>
      <dd v-if="summary && card.note?.(summary)" class="mt-1 text-xs opacity-80" data-note>
        {{ card.note(summary) }}
      </dd>
    </div>
    <div :class="[DASHBOARD_CARD, 'border-slate-200 border-l-slate-500 text-slate-800']">
      <dt class="text-xs font-semibold opacity-80 sm:text-sm">Today's Opening Cash</dt>
      <dd
        class="mt-1 text-xl font-bold break-words tabular-nums sm:text-2xl"
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
      <dd v-if="summary?.opening_date" class="mt-1 text-xs opacity-80" data-opening>
        Starting balance ৳ {{ formatMoney(summary.opening_balance) }} on
        {{ toDisplayDate(summary.opening_date) }}
      </dd>
    </div>
  </dl>

  <!-- Compact: one line of cards on wide screens; a grid on smaller ones. -->
  <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" data-finance-summary>
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
      <p
        v-if="summary && card.note?.(summary)"
        class="mt-0.5 text-[11px] leading-tight text-muted"
        data-note
      >
        {{ card.note(summary) }}
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
