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
 * Cash Management layout: two rows of four equal cards (low cards, a small icon each, the paid total split
 * into aligned lines, the grand total filled).
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

type Card = {
  key: string
  label: string
  /** Dashboard card colours (border and left stripe), as on the passport summary. */
  tone: string
  /** Cash Management card: the icon's chip colours and its SVG path (24×24, stroked). */
  chip: string
  icon: string
  amount: (s: FinanceSummary) => number
  /** A line under the amount (e.g. what Total Paid was for). */
  note?: (s: FinanceSummary) => string | null
}

const CARDS: Card[] = [
  {
    key: 'received',
    label: 'Total Received Amount',
    tone: 'border-green-200 border-l-green-600 text-green-900',
    chip: 'bg-green-50 text-green-700 ring-green-200',
    icon: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
    amount: (s) => s.total_received,
  },
  {
    key: 'paid',
    label: 'Total Paid Amount',
    tone: 'border-red-200 border-l-red-600 text-red-900',
    chip: 'bg-red-50 text-red-700 ring-red-200',
    icon: 'M12 20V9m0 0-4 4m4-4 4 4M5 4h14',
    amount: (s) => s.total_paid,
    // A loan to an owner is money paid, not spending: show what the total was for.
    note: (s) =>
      s.paid_breakdown
        ? `Expenses ৳ ${formatMoney(s.paid_breakdown.expenses)} · Refunds ৳ ${formatMoney(s.paid_breakdown.refunds)} · Owner loans ৳ ${formatMoney(s.paid_breakdown.owner_loans)} · Recruitment Agent payments ৳ ${formatMoney(s.paid_breakdown.agent_payments ?? 0)}`
        : null,
  },
  {
    key: 'expenses',
    label: 'Total Expenses',
    tone: 'border-orange-200 border-l-orange-500 text-orange-900',
    chip: 'bg-orange-50 text-orange-700 ring-orange-200',
    icon: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Zm3 5h4m-4 4h4m-4 4h2',
    amount: (s) => s.total_expenses ?? 0,
    note: () => 'Paid directly + owner loan bills',
  },
  {
    key: 'cash',
    label: 'Closing Cash on Hand',
    tone: 'border-amber-200 border-l-amber-500 text-amber-900',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    icon: 'M3 7h18v10H3V7Zm9 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v.01M18 14v.01',
    amount: (s) => s.cash_in_hand,
  },
  {
    key: 'bank',
    label: 'Closing Bank Balance',
    tone: 'border-sky-200 border-l-sky-600 text-sky-900',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
    icon: 'M3 10l9-6 9 6M5 10v8m4.5-8v8m5-8v8M19 10v8M3 20h18',
    amount: (s) => s.bank_balance,
  },
  {
    key: 'mobile',
    label: 'Closing Mobile Banking Balance',
    tone: 'border-violet-200 border-l-violet-600 text-violet-900',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
    icon: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
    amount: (s) => s.mobile_banking_balance,
  },
  {
    key: 'total',
    label: 'Grand Total Closing Balance',
    tone: 'border-teal-200 border-l-teal-600 text-teal-900',
    chip: 'bg-white/15 text-white ring-white/30',
    icon: 'M18 5H6l6 7-6 7h12',
    // Worked in paisa so the sum never drifts.
    amount: (s) =>
      Math.round(s.cash_in_hand * 100 + s.bank_balance * 100 + s.mobile_banking_balance * 100) /
      100,
  },
]

/** Today's opening cash on Cash Management, drawn like the other cards. */
const OPENING: Card = {
  key: 'opening',
  label: "Today's Opening Cash",
  tone: '',
  chip: 'bg-slate-100 text-slate-700 ring-slate-200',
  icon: 'M8 3v3m8-3v3M4 8h16M5 5h14v15H5V5Zm4 8h2v2H9v-2Z',
  amount: (s) => s.opening_today,
  note: (s) =>
    s.opening_date
      ? `Starting ৳ ${formatMoney(s.opening_balance)} on ${toDisplayDate(s.opening_date)}`
      : null,
}

/** Cash Management: money in and out with today's opening on the first row, balances on the second. */
const COMPACT_ROWS: Card[] = [...CARDS.slice(0, 3), OPENING, ...CARDS.slice(3)]
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

  <!-- Compact (Cash Management): two short rows of four equal cards, kept low so the table
       below stays in view (two per row on tablets, one on phones). Received, paid, expenses,
       today's opening; then cash, bank, mobile banking and the grand total, filled. -->
  <div
    v-else
    class="grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
    data-finance-summary
  >
    <div
      v-for="card in COMPACT_ROWS"
      :key="card.key"
      class="flex min-w-0 flex-col rounded-xl border px-3 py-2 shadow-sm"
      :class="
        card.key === 'total'
          ? 'border-primary-700 bg-gradient-to-br from-primary-700 to-primary-900 text-white'
          : 'border-stroke bg-white'
      "
      :data-closing="card.key === 'opening' ? undefined : card.key"
    >
      <div class="flex items-center justify-between gap-2">
        <p
          class="truncate text-xs font-semibold"
          :class="card.key === 'total' ? 'text-primary-100' : 'text-slate-600'"
          :title="card.label"
        >
          {{ card.label }}
        </p>
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1"
          :class="card.chip"
          aria-hidden="true"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="card.icon" />
          </svg>
        </span>
      </div>
      <p
        class="text-lg leading-tight font-bold break-words tabular-nums"
        :class="
          summary && card.amount(summary) < 0
            ? card.key === 'total'
              ? 'text-red-200'
              : 'text-red-700'
            : card.key === 'total'
              ? 'text-white'
              : 'text-ink'
        "
        :data-opening-today="card.key === 'opening' ? '' : undefined"
      >
        <template v-if="summary">
          {{ card.amount(summary) < 0 ? '−' : '' }}৳
          {{ formatMoney(Math.abs(card.amount(summary))) }}
        </template>
        <template v-else-if="failed">—</template>
        <template v-else>…</template>
      </p>
      <!-- What the paid total was for, on one line. -->
      <ul
        v-if="card.key === 'paid' && summary?.paid_breakdown"
        class="mt-0.5 flex flex-wrap gap-x-2 text-[11px] leading-tight text-muted tabular-nums"
        data-note
      >
        <li
          v-for="[name, value] in [
            ['Expenses', summary.paid_breakdown.expenses],
            ['Refunds', summary.paid_breakdown.refunds],
            ['Owner loans', summary.paid_breakdown.owner_loans],
            ['Recruitment Agent payments', summary.paid_breakdown.agent_payments ?? 0],
          ] as const"
          :key="name"
        >
          {{ name }} <span class="font-semibold text-slate-700">৳ {{ formatMoney(value) }}</span>
        </li>
      </ul>
      <p
        v-else-if="summary && card.note?.(summary)"
        class="mt-0.5 truncate text-[11px] leading-tight text-muted"
        :title="card.note(summary) ?? undefined"
        :data-note="card.key === 'opening' ? undefined : ''"
        :data-opening="card.key === 'opening' ? '' : undefined"
      >
        {{ card.note(summary) }}
      </p>
    </div>
  </div>
</template>
