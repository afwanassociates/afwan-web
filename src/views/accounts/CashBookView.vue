<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import { fetchCashBook } from '@/api/accounts'
import { formatMoney } from '@/lib/accounts'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { CashBook, CashBookLine } from '@/types/accounts'

/**
 * Accounts › Cash › Cash Book: every cash-in-hand entry grouped by day, each day with its
 * opening balance, entries (running balance), totals and closing balance. The range lives in
 * the URL and defaults to this month. Bank receipts and payments are not cash in hand.
 */
const route = useRoute()
const router = useRouter()

const fromId = useId()
const toId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

/** This month so far, unless ?all=1 or a range is given. */
const range = computed(() => {
  if (text(route.query.all) === '1') return { from: '', to: '', all: true }
  const from = text(route.query.from)
  const to = text(route.query.to)
  if (isYmd(from) || isYmd(to))
    return { from: isYmd(from) ? from : '', to: isYmd(to) ? to : '', all: false }
  const today = businessToday()
  return { from: `${today.slice(0, 8)}01`, to: today, all: false }
})

function setRange(changes: Partial<{ from: string; to: string }>) {
  const next = { from: range.value.from, to: range.value.to, ...changes }
  const query: LocationQuery = {}
  if (next.from) query.from = next.from
  if (next.to) query.to = next.to
  if (!next.from && !next.to) query.all = '1'
  router.replace({ query })
}

const from = computed({ get: () => range.value.from, set: (v: string) => setRange({ from: v }) })
const to = computed({ get: () => range.value.to, set: (v: string) => setRange({ to: v }) })

function today() {
  const day = businessToday()
  setRange({ from: day, to: day })
}

const book = shallowRef<CashBook | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchCashBook({ from: range.value.from, to: range.value.to })
    if (id === requestId) book.value = result
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 422
        ? 'The “to” date must be on or after the “from” date.'
        : errorMessage(error, 'Could not load the cash book. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(() => [range.value.from, range.value.to], load, { immediate: true })

/** The page that holds an entry, searched by its voucher number. */
function entryLink(line: CashBookLine) {
  const name = {
    receipt: 'accounts-cash-receipts',
    payment: 'accounts-cash-payments',
    transfer: 'accounts-cash-transfers',
  }[line.kind]
  return { name, query: { q: line.reference } }
}

function print() {
  window.print()
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const amount = (value: number) => (value ? formatMoney(value) : '')
</script>

<template>
  <section class="glass-card p-4 sm:p-6" aria-labelledby="cash-book-title">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h2 id="cash-book-title" class="text-lg font-bold text-primary-900">Cash Book</h2>
      <div role="search" class="flex flex-wrap items-end gap-4 print:hidden">
        <div class="w-full sm:w-44">
          <label :for="fromId" class="block text-sm font-medium text-slate-700">From</label>
          <input :id="fromId" v-model.lazy="from" type="date" :class="inputClass" data-from />
        </div>
        <div class="w-full sm:w-44">
          <label :for="toId" class="block text-sm font-medium text-slate-700">To</label>
          <input :id="toId" v-model.lazy="to" type="date" :class="inputClass" data-to />
        </div>
        <button
          type="button"
          class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          data-today
          @click="today"
        >
          Today
        </button>
        <button
          v-if="!range.all"
          type="button"
          class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          data-all
          @click="setRange({ from: '', to: '' })"
        >
          All dates
        </button>
        <button
          type="button"
          class="mb-0.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50"
          @click="print"
        >
          Print
        </button>
      </div>
    </div>

    <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <div v-else-if="!book" class="mt-6 animate-pulse space-y-3" data-skeleton>
      <div v-for="n in 5" :key="n" class="h-4 rounded bg-slate-200" />
      <span class="sr-only">Loading the cash book…</span>
    </div>

    <div
      v-else
      class="mt-6 overflow-x-auto border-t border-stroke pt-2"
      :class="{ 'opacity-60': isLoading }"
      :aria-busy="isLoading"
    >
      <table class="w-full text-left text-sm" data-cash-book>
        <thead :class="TABLE_HEAD">
          <tr>
            <th scope="col" :class="TABLE_TH">Date</th>
            <th scope="col" :class="TABLE_TH">Voucher</th>
            <th scope="col" :class="TABLE_TH">Particulars</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">Cash in</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">Cash out</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">Balance</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stroke">
          <tr class="bg-primary-50/50 font-semibold" data-opening-row>
            <td :class="TABLE_TD">{{ range.from ? toDisplayDate(range.from) : '' }}</td>
            <td :class="TABLE_TD" colspan="4">
              {{ range.from ? 'Balance brought forward' : 'Opening cash in hand' }}
            </td>
            <td :class="[TABLE_TD, 'text-right tabular-nums']">
              {{ formatMoney(book.opening_balance) }}
            </td>
          </tr>
          <tr v-if="book.days.length === 0">
            <td colspan="6" class="py-8 text-center text-muted" data-empty>
              No cash entries{{ range.all ? ' yet' : ' in these dates' }}.
            </td>
          </tr>
          <template v-for="day in book.days" :key="day.date">
            <tr
              v-for="(line, i) in day.lines"
              :key="`${line.kind}-${line.id}`"
              :data-line="`${line.kind}-${line.id}`"
            >
              <td :class="[TABLE_TD, 'whitespace-nowrap']">
                <template v-if="i === 0">{{ toDisplayDate(day.date) }}</template>
              </td>
              <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                <RouterLink
                  :to="entryLink(line)"
                  class="text-primary-800 underline-offset-4 hover:underline print:no-underline"
                >
                  {{ line.reference }}
                </RouterLink>
              </td>
              <td :class="TABLE_TD">
                <RouterLink
                  v-if="line.party_id"
                  :to="{ name: 'accounts-party-ledger', params: { id: line.party_id } }"
                  class="font-medium text-primary-800 underline-offset-4 hover:underline print:no-underline"
                >
                  {{ line.particulars }}
                </RouterLink>
                <span v-else class="font-medium">{{ line.particulars }}</span>
                <span v-if="line.detail" class="block text-xs text-muted">{{ line.detail }}</span>
              </td>
              <td :class="[TABLE_TD, 'text-right tabular-nums text-green-800']">
                {{ amount(line.in) }}
              </td>
              <td :class="[TABLE_TD, 'text-right tabular-nums text-red-800']">
                {{ amount(line.out) }}
              </td>
              <td :class="[TABLE_TD, 'text-right tabular-nums']">
                {{ formatMoney(line.balance) }}
              </td>
            </tr>
            <tr class="bg-slate-50 text-xs font-semibold" :data-day-total="day.date">
              <td :class="TABLE_TD" colspan="3">
                {{ toDisplayDate(day.date) }} · opening {{ formatMoney(day.opening) }} → closing
                cash
              </td>
              <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ formatMoney(day.in) }}</td>
              <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ formatMoney(day.out) }}</td>
              <td :class="[TABLE_TD, 'text-right tabular-nums']" data-day-closing>
                {{ formatMoney(day.closing) }}
              </td>
            </tr>
          </template>
        </tbody>
        <tfoot class="border-t-2 border-stroke font-semibold">
          <tr>
            <td :class="TABLE_TD" colspan="3">Total / closing cash in hand</td>
            <td :class="[TABLE_TD, 'text-right tabular-nums']" data-total-in>
              {{ formatMoney(book.totals.in) }}
            </td>
            <td :class="[TABLE_TD, 'text-right tabular-nums']" data-total-out>
              {{ formatMoney(book.totals.out) }}
            </td>
            <td :class="[TABLE_TD, 'text-right tabular-nums']" data-closing>
              {{ formatMoney(book.closing_balance) }}
            </td>
          </tr>
        </tfoot>
      </table>
      <p class="mt-3 text-xs text-muted">
        Only cash in hand is shown here. Receipts and payments through a bank go to the bank book.
      </p>
    </div>
  </section>
</template>
