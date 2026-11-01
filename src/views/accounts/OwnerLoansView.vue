<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { getOwnerLoans } from '@/api/accounts'
import { formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { OwnerLoanReport } from '@/types/accounts'

/**
 * Accounts › Owner loans: the owners' capital (Add cash, less payments to the owner) and
 * every approved loan from an owner with what is repaid and still owed. A loan is open
 * until its approved repayments (Cash payment › Owner › Loan repayment) cover it.
 */
const report = shallowRef<OwnerLoanReport | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

const ownerId = useId()
const statusId = useId()
const ownerFilter = ref<number | ''>('')
const statusFilter = ref<'' | 'open' | 'settled'>('')

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    report.value = await getOwnerLoans()
  } catch (error) {
    if (errorStatus(error) !== 401) {
      loadError.value = errorMessage(error, 'Could not load the owner loans. Please try again.')
    }
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const loans = computed(() =>
  (report.value?.data ?? []).filter(
    (l) =>
      (ownerFilter.value === '' || l.owner.id === ownerFilter.value) &&
      (statusFilter.value === '' || l.status === statusFilter.value),
  ),
)
const hasFilters = computed(() => ownerFilter.value !== '' || statusFilter.value !== '')

function clearFilters() {
  ownerFilter.value = ''
  statusFilter.value = ''
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Owner loans</h1>
        <p class="mt-1 text-sm text-muted">
          Owners' capital, and each loan from an owner until it is fully repaid. Record a loan in
          Cash receive (Company owner › Loan) and repay it in Cash payment (Company owner › Loan
          repayment).
        </p>
      </div>
      <RouterLink :to="{ name: 'accounts-cash-payments' }" class="btn btn-accent">
        Repay a loan
      </RouterLink>
    </div>

    <div
      v-if="loadError"
      role="alert"
      class="glass-card mt-6 space-y-4 p-10 text-center"
      data-error
    >
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <template v-else-if="report">
      <dl class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-summary>
        <div class="glass-card p-4 ring-2 ring-accent-400" data-total-capital>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Total capital</dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(report.summary.total_capital) }}
          </dd>
          <dd v-if="report.summary.owners.length" class="mt-2 space-y-0.5 text-xs text-muted">
            <p
              v-for="o in report.summary.owners"
              :key="o.id"
              class="flex justify-between gap-2"
              :data-owner-capital="o.id"
            >
              <span class="truncate">{{ o.name }}</span>
              <span class="tabular-nums">৳ {{ formatMoney(o.capital) }}</span>
            </p>
          </dd>
        </div>
        <div class="glass-card p-4" data-loans-owed>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Loans owed now</dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(report.summary.loans_owed) }}
          </dd>
          <dd class="mt-2 space-y-0.5 text-xs text-muted">
            <template v-for="o in report.summary.owners" :key="o.id">
              <p v-if="o.loan_owed > 0" class="flex justify-between gap-2">
                <span class="truncate">{{ o.name }}</span>
                <span class="tabular-nums">৳ {{ formatMoney(o.loan_owed) }}</span>
              </p>
            </template>
          </dd>
        </div>
        <div class="glass-card p-4 ring-1 ring-amber-300" data-open-count>
          <dt class="text-xs font-semibold tracking-wider text-amber-800 uppercase">Open loans</dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
            {{ report.summary.open_count }}
          </dd>
        </div>
        <div class="glass-card p-4" data-settled-count>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Settled loans</dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
            {{ report.summary.settled_count }}
          </dd>
        </div>
      </dl>

      <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Owner loans">
        <div role="search" class="flex flex-wrap items-end gap-4">
          <div class="w-full sm:w-60">
            <label :for="ownerId" class="block text-sm font-medium text-slate-700">Owner</label>
            <select :id="ownerId" v-model="ownerFilter" :class="inputClass" data-owner-filter>
              <option value="">All owners</option>
              <option v-for="o in report.summary.owners" :key="o.id" :value="o.id">
                {{ o.name }} ({{ o.code }})
              </option>
            </select>
          </div>
          <div class="w-full sm:w-44">
            <label :for="statusId" class="block text-sm font-medium text-slate-700">Status</label>
            <select :id="statusId" v-model="statusFilter" :class="inputClass" data-status-filter>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="settled">Settled</option>
            </select>
          </div>
          <button
            v-if="hasFilters"
            type="button"
            class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>

        <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
          <div v-if="loans.length === 0" class="py-12 text-center" data-empty>
            <p class="font-semibold text-ink">
              {{ hasFilters ? 'No loans match these filters.' : 'No owner loans yet.' }}
            </p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Loan (receipt no.)</th>
                  <th scope="col" :class="TABLE_TH">Owner</th>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Loan amount</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Repaid</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Still owed</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="l in loans" :key="l.id" class="align-top" :data-loan="l.id">
                  <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                    {{ l.receipt_no }}
                    <span v-if="l.note" class="block font-sans text-xs text-muted">
                      {{ l.note }}
                    </span>
                  </td>
                  <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                    <RouterLink
                      :to="{ name: 'accounts-party-ledger', params: { id: l.owner.id } }"
                      class="text-primary-800 underline-offset-4 hover:underline"
                    >
                      {{ l.owner.name }}
                    </RouterLink>
                    <span class="block font-mono text-xs font-normal text-muted">
                      {{ l.owner.code }}
                    </span>
                  </th>
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(l.date) }}</td>
                  <td :class="[TABLE_TD, 'text-right tabular-nums']">
                    {{ formatMoney(l.amount) }}
                  </td>
                  <td :class="[TABLE_TD, 'text-right tabular-nums']">
                    {{ formatMoney(l.repaid) }}
                    <span
                      v-if="l.pending_repaid > 0"
                      class="block text-xs text-amber-800"
                      data-pending-repaid
                    >
                      + {{ formatMoney(l.pending_repaid) }} waiting approval
                    </span>
                  </td>
                  <td :class="[TABLE_TD, 'text-right font-semibold tabular-nums']" data-still-owed>
                    {{ formatMoney(l.still_owed) }}
                  </td>
                  <td :class="TABLE_TD">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        l.status === 'open'
                          ? 'bg-amber-50 text-amber-800 ring-amber-300'
                          : 'bg-green-50 text-green-800 ring-green-300'
                      "
                      data-status
                    >
                      {{ l.status === 'open' ? 'Open' : 'Settled' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <div v-else class="glass-card mt-6 animate-pulse space-y-3 p-6" data-skeleton>
      <div v-for="n in 4" :key="n" class="h-4 w-2/3 rounded bg-slate-200" />
      <span class="sr-only">Loading owner loans…</span>
    </div>
  </div>
</template>
