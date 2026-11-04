<script setup lang="ts">
import { computed, ref } from 'vue'
import { fetchFinanceSummary } from '@/api/accounts'
import { fetchReportSummary } from '@/api/reports'
import FinanceSummaryCards from '@/components/accounts/FinanceSummaryCards.vue'
import { FINANCE_SUMMARY_ROLES } from '@/lib/accounts'
import { activePassportCount } from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import type { FinanceSummary } from '@/types/accounts'
import type { CompanyCounts } from '@/types/report'

/* ---------- Accounts summary (accounts head, admin, super admin): first ---------- */

const auth = useAuthStore()
const showFinance = computed(() => !!auth.user && FINANCE_SUMMARY_ROLES.includes(auth.user.role))
const finance = ref<FinanceSummary | null>(null)
const financeFailed = ref(false)

async function loadFinance() {
  if (!showFinance.value) return
  financeFailed.value = false
  try {
    finance.value = await fetchFinanceSummary()
  } catch {
    financeFailed.value = true
  }
}

loadFinance()

/* ---------- Passport summary cards (same counts as the company report) ---------- */

/** The counts sent by the API, plus every passport with the returned ones (the API's total). */
type SummaryKey = keyof CompanyCounts | 'with_returned'

/**
 * One card per count, each with its own colour: a white card with a thin border and a thick
 * left stripe in that colour (the shared layout is in the template). Unfit and Returned are red:
 * those passports have left the process. Full class names, so Tailwind finds them.
 */
const SUMMARY_CARDS: { key: SummaryKey; label: string; tone: string }[] = [
  {
    key: 'total',
    label: 'Total',
    tone: 'border-primary-200 border-l-primary-600 text-primary-900',
  },
  {
    key: 'not_started',
    label: 'Not started',
    tone: 'border-slate-200 border-l-slate-500 text-slate-800',
  },
  {
    key: 'medical_pending',
    label: 'Medical pending',
    tone: 'border-amber-200 border-l-amber-500 text-amber-900',
  },
  {
    key: 'medical_fit',
    label: 'Medical fit',
    tone: 'border-green-200 border-l-green-600 text-green-900',
  },
  { key: 'medical_unfit', label: 'Unfit', tone: 'border-red-200 border-l-red-600 text-red-900' },
  { key: 'calling_done', label: 'Calling', tone: 'border-sky-200 border-l-sky-600 text-sky-900' },
  {
    key: 'visa_done',
    label: 'Visa',
    tone: 'border-indigo-200 border-l-indigo-600 text-indigo-900',
  },
  {
    key: 'bmet_done',
    label: 'BMET',
    tone: 'border-violet-200 border-l-violet-600 text-violet-900',
  },
  {
    key: 'flight_done',
    label: 'Flight done',
    tone: 'border-emerald-200 border-l-emerald-600 text-emerald-900',
  },
  {
    key: 'in_process',
    label: 'In process',
    tone: 'border-orange-200 border-l-orange-500 text-orange-900',
  },
  { key: 'returned', label: 'Returned', tone: 'border-red-200 border-l-red-600 text-red-900' },
  {
    key: 'with_returned',
    label: 'Total process with returned',
    tone: 'border-primary-200 border-l-primary-600 text-primary-900',
  },
]

const summary = ref<CompanyCounts | null>(null)

/** 65000 → "65,000" (lakh grouping, as the money amounts). */
const formatCount = (value: number) => value.toLocaleString('en-IN')

/** Total leaves returned passports out; Total with returned is the API's total (every passport). */
const count = (c: CompanyCounts, key: SummaryKey) =>
  key === 'total' ? activePassportCount(c) : key === 'with_returned' ? c.total : c[key]
const summaryError = ref<string | null>(null)
const isSummaryLoading = ref(false)

async function loadSummary() {
  isSummaryLoading.value = true
  summaryError.value = null
  try {
    summary.value = await fetchReportSummary()
  } catch (e) {
    summaryError.value = errorMessage(e, 'Could not load the passport summary.')
  } finally {
    isSummaryLoading.value = false
  }
}

loadSummary()
</script>

<template>
  <section v-if="showFinance" aria-labelledby="finance-heading" class="mb-10" data-finance>
    <h2 id="finance-heading" class="text-lg font-bold text-primary-900 sm:text-xl">
      Accounts summary
    </h2>
    <p class="mt-0.5 text-xs text-muted sm:text-sm">Approved entries up to today.</p>
    <FinanceSummaryCards
      class="mt-4"
      variant="dashboard"
      :summary="finance"
      :failed="financeFailed"
    />
  </section>

  <section aria-labelledby="summary-heading" :aria-busy="isSummaryLoading">
    <h1 id="summary-heading" class="text-lg font-bold text-primary-900 sm:text-xl">
      Passport summary
    </h1>
    <p class="mt-0.5 text-xs text-muted sm:text-sm">Every passport, across all companies.</p>

    <div v-if="summaryError" role="alert" class="mt-4 space-y-3">
      <p class="text-red-700">{{ summaryError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="loadSummary">Try again</button>
    </div>

    <dl
      v-else
      class="mt-4 grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      data-summary
    >
      <div
        v-for="card in SUMMARY_CARDS"
        :key="card.key"
        :class="[
          'flex flex-col items-center justify-center rounded-xl border border-l-4 bg-white px-3 py-5 text-center shadow-md',
          card.tone,
        ]"
        :data-card="card.key"
      >
        <dt class="text-xs font-semibold opacity-80 sm:text-sm">{{ card.label }}</dt>
        <dd class="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
          {{ summary ? formatCount(count(summary, card.key)) : isSummaryLoading ? '…' : '—' }}
        </dd>
      </div>
    </dl>
  </section>
</template>
