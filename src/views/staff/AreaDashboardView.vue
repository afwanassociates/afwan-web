<script setup lang="ts">
import { ref } from 'vue'
import { fetchReportSummary } from '@/api/reports'
import { errorMessage } from '@/lib/errors'
import type { CompanyCounts } from '@/types/report'

/* ---------- Passport summary cards (same counts as the company report) ---------- */

/** One card per count, each with its own colour. */
const SUMMARY_CARDS: { key: keyof CompanyCounts; label: string; tone: string }[] = [
  { key: 'total', label: 'Total', tone: 'border-primary-200 bg-primary-50 text-primary-900' },
  { key: 'not_started', label: 'Not started', tone: 'border-slate-200 bg-slate-50 text-slate-800' },
  {
    key: 'medical_pending',
    label: 'Medical pending',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  { key: 'medical_fit', label: 'Medical fit', tone: 'border-green-200 bg-green-50 text-green-900' },
  { key: 'medical_unfit', label: 'Unfit', tone: 'border-red-200 bg-red-50 text-red-900' },
  { key: 'calling_done', label: 'Calling', tone: 'border-sky-200 bg-sky-50 text-sky-900' },
  { key: 'visa_done', label: 'Visa', tone: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
  { key: 'bmet_done', label: 'BMET', tone: 'border-violet-200 bg-violet-50 text-violet-900' },
  {
    key: 'flight_done',
    label: 'Flight done',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  {
    key: 'in_process',
    label: 'In process',
    tone: 'border-orange-200 bg-orange-50 text-orange-900',
  },
  { key: 'returned', label: 'Returned', tone: 'border-slate-200 bg-slate-50 text-slate-900' },
]

const summary = ref<CompanyCounts | null>(null)
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
  <section aria-labelledby="summary-heading" :aria-busy="isSummaryLoading">
    <h1 id="summary-heading" class="text-2xl font-bold text-primary-900 sm:text-3xl">
      Passport summary
    </h1>
    <p class="mt-1 text-sm text-muted">Every passport, across all companies.</p>

    <div v-if="summaryError" role="alert" class="mt-4 space-y-3">
      <p class="text-red-700">{{ summaryError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="loadSummary">Try again</button>
    </div>

    <dl
      v-else
      class="mt-6 grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      data-summary
    >
      <div
        v-for="card in SUMMARY_CARDS"
        :key="card.key"
        :class="['rounded-xl border p-5 shadow-sm', card.tone]"
        :data-card="card.key"
      >
        <dt class="text-sm font-medium opacity-80">{{ card.label }}</dt>
        <dd class="mt-1 text-3xl font-bold tabular-nums">
          {{ summary ? summary[card.key] : isSummaryLoading ? '…' : '—' }}
        </dd>
      </div>
    </dl>
  </section>
</template>
