<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import ListPager from '@/components/accounts/ListPager.vue'
import { downloadExpensesCsv, listExpenses } from '@/api/accounts'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { EXPENSE_CATEGORIES, formatMoney } from '@/lib/accounts'
import { openBillCopy } from '@/lib/billCopy'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { Expense, ExpenseCategory, ExpenseSource, ExpenseTotals } from '@/types/accounts'
import type { Paginated } from '@/types/auth'

/**
 * Cash Management › Expenses: what the company spent, by category. Expense payments (paid
 * directly from cash, bank or mobile banking) and approved owner loan bills (company bills an
 * owner paid with a loan the company gave them). A loan itself is not spending: it becomes
 * spending only as the owner shows bills. Filters live in the URL; Export CSV downloads every
 * matching expense.
 */
const PER_PAGE = 20

const route = useRoute()
const router = useRouter()
const toast = useToast()

const ids = { search: useId(), from: useId(), to: useId(), category: useId(), source: useId() }

interface Filters {
  q: string
  from: string
  to: string
  category: '' | ExpenseCategory
  source: '' | ExpenseSource
  page: number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const ymd = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')
const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value) as string[]

const filters = computed<Filters>(() => {
  const page = Number(text(route.query.page))
  const category = text(route.query.category)
  const source = text(route.query.source)
  return {
    q: text(route.query.q).trim(),
    from: ymd(text(route.query.from)),
    to: ymd(text(route.query.to)),
    category: CATEGORY_VALUES.includes(category) ? (category as ExpenseCategory) : '',
    source: source === 'direct' || source === 'owner_loan' ? source : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
const hasFilters = computed(() =>
  Object.entries(filters.value).some(([key, value]) => key !== 'page' && Boolean(value)),
)

function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const result: LocationQuery = {}
  for (const [key, value] of Object.entries(next)) {
    if (key === 'page') {
      if (Number(value) > 1) result.page = String(value)
    } else if (value) result[key] = String(value)
  }
  return result
}

/** A select / date bound to one URL filter. */
function filterModel<K extends 'from' | 'to' | 'category' | 'source'>(key: K) {
  return computed({
    get: () => filters.value[key],
    set: (value: Filters[K]) =>
      router.replace({ query: queryWith({ [key]: value } as Partial<Filters>) }),
  })
}
const from = filterModel('from')
const to = filterModel('to')
const category = filterModel('category')
const source = filterModel('source')

const search = ref(filters.value.q)
const debounced = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)

function clearFilters() {
  search.value = ''
  debounced.cancel()
  router.replace({ query: {} })
}

/** Click a category total to show only that category (click again to show all). */
function pickCategory(value: ExpenseCategory) {
  category.value = category.value === value ? '' : value
}

/* ---------- Loading ---------- */

const list = shallowRef<(Paginated<Expense> & { meta: { totals: ExpenseTotals } }) | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

const apiFilters = () => {
  const f = filters.value
  return {
    q: f.q || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    category: f.category || undefined,
    source: f.source || undefined,
  }
}

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listExpenses({
      ...apiFilters(),
      page: filters.value.page,
      per_page: PER_PAGE,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 422
        ? 'The “to” date must be on or after the “from” date.'
        : errorMessage(error, 'Could not load the expenses. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(filters.value),
  () => {
    if (search.value.trim() !== filters.value.q) search.value = filters.value.q
    load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...filters.value, page }) })

/* ---------- Export and bill copies ---------- */

const isExporting = ref(false)

async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const fileName = await downloadExpensesCsv(apiFilters())
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    if (errorStatus(error) !== 401)
      toast.error(errorMessage(error, 'Could not download the expenses. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

async function viewCopy(expense: Expense) {
  const error = await openBillCopy(expense.id)
  if (error) toast.error(error)
}

const totals = computed(() => list.value?.meta.totals ?? null)

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <section class="mt-4" aria-labelledby="expenses-heading">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="expenses-heading" class="text-lg font-bold text-primary-900">Expenses</h2>
        <p class="mt-0.5 max-w-3xl text-xs text-muted">
          What the company spent: expenses paid directly, and company bills owners paid with a loan.
          A loan to an owner is not an expense; only the bills shown for it are. Approved entries
          only.
        </p>
      </div>
      <button
        type="button"
        class="rounded-full px-4 py-2 text-sm font-semibold text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50 disabled:opacity-50"
        :disabled="isExporting || !totals?.count"
        data-export
        @click="exportCsv"
      >
        {{ isExporting ? 'Downloading…' : 'Export CSV' }}
      </button>
    </div>

    <!-- Totals of every matching expense (all pages). -->
    <div v-if="totals" class="glass-card mt-4 p-4" data-totals>
      <dl class="grid gap-3 sm:grid-cols-3">
        <div>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Total expenses</dt>
          <dd class="mt-1 text-xl font-bold text-ink tabular-nums" data-total>
            ৳ {{ formatMoney(totals.amount) }}
          </dd>
          <dd class="text-xs text-muted">
            {{ totals.count }} {{ totals.count === 1 ? 'expense' : 'expenses' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Paid directly</dt>
          <dd class="mt-1 text-lg font-semibold text-ink tabular-nums" data-total-direct>
            ৳ {{ formatMoney(totals.direct) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">
            Owner loan bills
          </dt>
          <dd class="mt-1 text-lg font-semibold text-ink tabular-nums" data-total-owner-loan>
            ৳ {{ formatMoney(totals.owner_loan) }}
          </dd>
        </div>
      </dl>
      <div
        v-if="totals.by_category.length"
        class="mt-4 border-t border-stroke pt-3"
        data-by-category
      >
        <p class="text-xs font-semibold tracking-wider text-muted uppercase">By category</p>
        <ul class="mt-2 flex flex-wrap gap-2">
          <li v-for="c in totals.by_category" :key="c.category">
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-sm ring-1"
              :class="
                category === c.category
                  ? 'bg-primary-900 text-white ring-primary-900'
                  : 'bg-white text-ink ring-slate-300 hover:bg-primary-50'
              "
              :aria-pressed="category === c.category"
              :data-category="c.category"
              @click="pickCategory(c.category)"
            >
              {{ c.label }}
              <span class="ml-1 font-semibold tabular-nums">৳ {{ formatMoney(c.amount) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div class="glass-card mt-4 p-4 sm:p-6">
      <div
        role="search"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]"
      >
        <div>
          <label :for="ids.search" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="ids.search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Description, bill no., paid to, CP no."
            :class="inputClass"
            data-search
            @input="debounced.run()"
          />
        </div>
        <div>
          <label :for="ids.from" class="block text-sm font-medium text-slate-700">From</label>
          <input :id="ids.from" v-model.lazy="from" type="date" :class="inputClass" data-from />
        </div>
        <div>
          <label :for="ids.to" class="block text-sm font-medium text-slate-700">To</label>
          <input :id="ids.to" v-model.lazy="to" type="date" :class="inputClass" data-to />
        </div>
        <div>
          <label :for="ids.category" class="block text-sm font-medium text-slate-700">
            Category
          </label>
          <select :id="ids.category" v-model="category" :class="inputClass" data-category-filter>
            <option value="">All</option>
            <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </div>
        <div>
          <label :for="ids.source" class="block text-sm font-medium text-slate-700">Source</label>
          <select :id="ids.source" v-model="source" :class="inputClass" data-source-filter>
            <option value="">All</option>
            <option value="direct">Paid directly</option>
            <option value="owner_loan">Owner loan bills</option>
          </select>
        </div>
      </div>
      <button
        v-if="hasFilters"
        type="button"
        class="mt-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
        @click="clearFilters"
      >
        Clear filters
      </button>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-3 py-10 text-center" data-error>
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <div v-else-if="list && list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No expenses match these filters.' : 'No expenses yet.' }}
          </p>
        </div>

        <div v-else-if="list" :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="TABLE_TH">Category</th>
                  <th scope="col" :class="TABLE_TH">Description</th>
                  <th scope="col" :class="TABLE_TH">Bill no.</th>
                  <th scope="col" :class="TABLE_TH">Source</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="e in list.data" :key="e.key" class="align-top" :data-expense="e.key">
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(e.date) }}</td>
                  <td :class="TABLE_TD">{{ e.expense_category_label }}</td>
                  <td :class="TABLE_TD">
                    {{ e.purpose ?? '—' }}
                    <span v-if="e.paid_to" class="block text-xs text-muted">
                      {{ e.source === 'owner_loan' ? 'Paid by' : 'Paid to' }} {{ e.paid_to }}
                    </span>
                  </td>
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">
                    {{ e.bill_no ?? '—' }}
                    <button
                      v-if="e.has_copy"
                      type="button"
                      class="block text-xs font-semibold text-primary-700 underline-offset-4 hover:underline"
                      data-view-copy
                      @click="viewCopy(e)"
                    >
                      View copy
                    </button>
                  </td>
                  <td :class="TABLE_TD">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
                      :class="
                        e.source === 'owner_loan'
                          ? 'bg-violet-50 text-violet-800 ring-violet-300'
                          : 'bg-slate-50 text-slate-700 ring-slate-300'
                      "
                      data-source
                    >
                      {{ e.source_label }}
                    </span>
                    <span class="mt-0.5 block text-xs text-muted">
                      {{ e.source === 'direct' ? `${e.reference} · ` : ''
                      }}{{ e.payment_method_label }}
                    </span>
                  </td>
                  <td :class="[TABLE_TD, 'text-right font-semibold tabular-nums']">
                    {{ formatMoney(e.amount) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ListPager :meta="list.meta" :page-link="pageLink" />
        </div>

        <div v-else class="animate-pulse space-y-3 py-6" data-skeleton>
          <div v-for="n in 4" :key="n" class="h-4 w-2/3 rounded bg-slate-200" />
          <span class="sr-only">Loading expenses…</span>
        </div>
      </div>
    </div>
  </section>
</template>
