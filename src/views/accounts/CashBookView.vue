<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import { fetchCashBook } from '@/api/accounts'
import { formatMoney } from '@/lib/accounts'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { CashBook, CashBookKind, CashBookLine } from '@/types/accounts'

/**
 * Accounts › Cash › Cash Book: three books, each with its entries grouped by day, each day with
 * its opening balance, entries (running balance), totals and closing balance:
 * - Hand Cash Book: cash in hand (receipts and payments in cash, deposits out, withdrawals in),
 *   from the cash starting balance;
 * - Bank Book and Mobile Banking Book: receipts and payments by bank (or mobile banking), cash
 *   deposited in, cash withdrawn out; each starts at zero, like its balance on the summary.
 * - All Cash Book: the three together, with a Via column; a deposit or withdrawal only moves
 *   money between them, so it is a contra line (its amount shown, nothing in or out).
 * The book (?book=) and the range live in the URL; the range defaults to this month. Only approved
 * entries count.
 */
const route = useRoute()
const router = useRouter()

const fromId = useId()
const toId = useId()

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

/** The three books and their wording. */
const BOOKS: Record<
  CashBookKind,
  { label: string; money: string; opening: string; closing: string; note: string }
> = {
  cash: {
    label: 'Hand Cash Book',
    money: 'Cash',
    opening: 'Opening cash in hand',
    closing: 'Total / closing cash in hand',
    note: 'Receipts and payments made as cash in hand, deposits (cash out) and withdrawals (cash in). Bank and mobile banking receipts and payments are in their own books.',
  },
  bank: {
    label: 'Bank Book',
    money: 'Money',
    opening: 'Opening bank balance',
    closing: 'Total / closing bank balance',
    note: 'Receipts and payments by bank, cash deposited to a bank (in) and cash withdrawn from a bank (out). All bank accounts together; the bank balance starts at zero.',
  },
  mobile_banking: {
    label: 'Mobile Banking Book',
    money: 'Money',
    opening: 'Opening mobile banking balance',
    closing: 'Total / closing mobile banking balance',
    note: 'Receipts and payments by mobile banking, cash in to a wallet (in) and cash out from a wallet (out). All wallets together; the balance starts at zero.',
  },
  all: {
    label: 'All Cash Book',
    money: 'Money',
    opening: 'Opening balance (cash + bank + mobile banking)',
    closing: 'Total / closing balance (cash + bank + mobile banking)',
    note: 'Cash in hand, bank and mobile banking together. Deposits and withdrawals only move money between them, so they are contra lines: shown, but not counted as money in or out.',
  },
}
const BOOK_KEYS = Object.keys(BOOKS) as CashBookKind[]

/** The book shown: ?book=bank or mobile_banking, else the hand cash book. */
const bookKind = computed<CashBookKind>(() => {
  const value = text(route.query.book)
  return (BOOK_KEYS as string[]).includes(value) ? (value as CashBookKind) : 'cash'
})
const words = computed(() => BOOKS[bookKind.value])
/** The all cash book has a Via column. */
const isAll = computed(() => bookKind.value === 'all')

/** The range stays when switching books. */
function bookLink(kind: CashBookKind) {
  const query: LocationQuery = { ...route.query }
  if (kind === 'cash') delete query.book
  else query.book = kind
  return { query }
}

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
  if (bookKind.value !== 'cash') query.book = bookKind.value
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
    const result = await fetchCashBook({
      book: bookKind.value,
      from: range.value.from,
      to: range.value.to,
    })
    if (id === requestId) book.value = result
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 422
        ? 'The “to” date must be on or after the “from” date.'
        : errorMessage(
            error,
            `Could not load the ${words.value.label.toLowerCase()}. Please try again.`,
          )
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(() => [bookKind.value, range.value.from, range.value.to], load, { immediate: true })

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
      <h2 id="cash-book-title" class="text-lg font-bold text-primary-900">{{ words.label }}</h2>
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

    <nav aria-label="Books" class="mt-4 flex flex-wrap gap-2 print:hidden" data-books>
      <RouterLink
        v-for="kind in BOOK_KEYS"
        :key="kind"
        :to="bookLink(kind)"
        class="rounded-lg px-3 py-1.5 text-sm font-semibold"
        :class="
          bookKind === kind
            ? 'bg-primary-100 text-primary-900 ring-1 ring-primary-600'
            : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
        "
        :aria-current="bookKind === kind ? 'page' : undefined"
        :data-book="kind"
      >
        {{ BOOKS[kind].label }}
      </RouterLink>
    </nav>

    <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <div v-else-if="!book" class="mt-6 animate-pulse space-y-3" data-skeleton>
      <div v-for="n in 5" :key="n" class="h-4 rounded bg-slate-200" />
      <span class="sr-only">Loading the {{ words.label.toLowerCase() }}…</span>
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
            <th v-if="isAll" scope="col" :class="TABLE_TH">Via</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">{{ words.money }} in</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">{{ words.money }} out</th>
            <th scope="col" :class="[TABLE_TH, 'text-right']">Balance</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stroke">
          <tr class="bg-primary-50/50 font-semibold" data-opening-row>
            <td :class="TABLE_TD">{{ range.from ? toDisplayDate(range.from) : '' }}</td>
            <td :class="TABLE_TD" :colspan="isAll ? 5 : 4">
              {{ range.from ? 'Balance brought forward' : words.opening }}
            </td>
            <td :class="[TABLE_TD, 'text-right tabular-nums']">
              {{ formatMoney(book.opening_balance) }}
            </td>
          </tr>
          <tr v-if="book.days.length === 0">
            <td :colspan="isAll ? 7 : 6" class="py-8 text-center text-muted" data-empty>
              No entries{{ range.all ? ' yet' : ' in these dates' }}.
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
              <td v-if="isAll" :class="[TABLE_TD, 'text-xs whitespace-nowrap']" data-via>
                <span
                  class="rounded-full px-2 py-0.5 font-semibold"
                  :class="
                    line.contra ? 'bg-slate-100 text-slate-700' : 'bg-primary-50 text-primary-800'
                  "
                >
                  {{ line.via }}
                </span>
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
              <td :class="TABLE_TD" :colspan="isAll ? 4 : 3">
                {{ toDisplayDate(day.date) }} · opening {{ formatMoney(day.opening) }} → closing
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
            <td :class="TABLE_TD" :colspan="isAll ? 4 : 3">{{ words.closing }}</td>
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
      <p class="mt-3 text-xs text-muted" data-book-note>{{ words.note }}</p>
    </div>
  </section>
</template>
