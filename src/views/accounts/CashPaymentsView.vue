<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import CashPaymentFormDialog from '@/components/accounts/CashPaymentFormDialog.vue'
import ListPager from '@/components/accounts/ListPager.vue'
import {
  deleteCashPayment,
  fetchParty,
  listCashPayments,
  type CashPaymentPage,
} from '@/api/accounts'
import { useApprovalActions } from '@/composables/useApprovalActions'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { formatMoney, useCashRefresh } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type {
  ApprovalStatus,
  CashPayment,
  CashPaymentType,
  Party,
  PayeeType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Accounts › Cash › Cash Payment: money paid to parties, owners and other payees, in cash or
 * from a bank. Filters live in the URL; the totals cover every matching payment.
 * ?new=1&party=<id> opens the form for that party (the ledger's "Pay cash" button).
 */
const PER_PAGE = 20

const route = useRoute()
const router = useRouter()
const toast = useToast()
const refreshCash = useCashRefresh()

const ids = {
  status: useId(),
  search: useId(),
  from: useId(),
  to: useId(),
  who: useId(),
  type: useId(),
  via: useId(),
}

interface Filters {
  q: string
  status: '' | ApprovalStatus
  from: string
  to: string
  payee_type: '' | PayeeType
  payment_type: '' | CashPaymentType
  payment_method: '' | PaymentMethod
  page: number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const oneOf = <T extends string>(value: string, options: readonly T[]): '' | T =>
  (options as readonly string[]).includes(value) ? (value as T) : ''
const ymd = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')

const filters = computed<Filters>(() => {
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    status: oneOf(text(route.query.status), ['pending', 'approved', 'rejected'] as const),
    from: ymd(text(route.query.from)),
    to: ymd(text(route.query.to)),
    payee_type: oneOf(text(route.query.payee_type), ['client', 'owner', 'other'] as const),
    payment_type: oneOf(text(route.query.payment_type), [
      'refund',
      'loan_repayment',
      'drawing',
      'expense',
    ] as const),
    payment_method: oneOf(text(route.query.payment_method), ['cash', 'bank'] as const),
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

function filterModel<K extends Exclude<keyof Filters, 'page' | 'q'>>(key: K) {
  return computed({
    get: () => filters.value[key],
    set: (value: Filters[K]) =>
      router.replace({ query: queryWith({ [key]: value } as Partial<Filters>) }),
  })
}
const from = filterModel('from')
const status = filterModel('status')
const to = filterModel('to')
const payeeType = filterModel('payee_type')
const paymentType = filterModel('payment_type')
const paymentMethod = filterModel('payment_method')

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

/* ---------- Loading ---------- */

const list = shallowRef<CashPaymentPage | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listCashPayments({
      q: f.q || undefined,
      status: f.status || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      payee_type: f.payee_type || undefined,
      payment_type: f.payment_type || undefined,
      payment_method: f.payment_method || undefined,
      page: f.page,
      per_page: PER_PAGE,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 422
        ? 'The “to” date must be on or after the “from” date.'
        : errorMessage(error, 'Could not load the payments. Please try again.')
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

/* ---------- Approve / return (approvers) ---------- */

const actions = useApprovalActions(load)
const approvalTarget = (entry: { id: number; payment_no: string }) => ({
  type: 'cash-payments' as const,
  id: entry.id,
  label: `Payment ${entry.payment_no}`,
})

/* ---------- Create / edit ---------- */

const formOpen = ref(false)
const editing = ref<CashPayment | null>(null)
const presetParty = ref<Party | null>(null)

function openCreate() {
  editing.value = null
  presetParty.value = null
  formOpen.value = true
}

function openEdit(payment: CashPayment) {
  editing.value = payment
  formOpen.value = true
}

// From the ledger: ?new=1&party=<id> opens the form for that party, then drops the params.
watch(
  () => route.query.new,
  async (value) => {
    if (value !== '1') return
    const partyId = Number(text(route.query.party))
    const rest = { ...route.query }
    delete rest.new
    delete rest.party
    router.replace({ query: rest })
    editing.value = null
    presetParty.value = null
    if (Number.isInteger(partyId) && partyId > 0) {
      try {
        presetParty.value = await fetchParty(partyId)
      } catch {
        // The form opens without a payee.
      }
    }
    formOpen.value = true
  },
  { immediate: true },
)

function onSaved(payment: CashPayment, created: boolean) {
  toast.success(
    created
      ? `Payment ${payment.payment_no} saved for approval: ৳ ${formatMoney(payment.amount)} to ${payment.payee_name}.`
      : `Payment ${payment.payment_no} updated.`,
  )
  load()
  refreshCash()
}

/* ---------- Delete (admins) ---------- */

const deleteTarget = ref<CashPayment | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(payment: CashPayment) {
  deleteTarget.value = payment
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const payment = deleteTarget.value
  if (!payment) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteCashPayment(payment.id)
    deleteOpen.value = false
    toast.success(`Payment ${payment.payment_no} deleted.`)
    load()
    refreshCash()
  } catch (error) {
    if (errorStatus(error) !== 401)
      deleteError.value = errorMessage(error, 'Could not delete the payment. Please try again.')
  } finally {
    deleteBusy.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50'
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h2 class="text-lg font-bold text-primary-900">Cash Payment</h2>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New payment
      </button>
    </div>

    <dl v-if="list" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-totals>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Payments</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">{{ list.meta.totals.count }}</dd>
      </div>
      <div class="glass-card p-4 ring-2 ring-accent-400">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Total paid</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums" data-total-amount>
          ৳ {{ formatMoney(list.meta.totals.amount) }}
        </dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">From cash in hand</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
          ৳ {{ formatMoney(list.meta.totals.cash) }}
        </dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">From bank</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
          ৳ {{ formatMoney(list.meta.totals.bank) }}
        </dd>
      </div>
      <div class="glass-card p-4 ring-1 ring-amber-300" data-pending-total>
        <dt class="text-xs font-semibold tracking-wider text-amber-800 uppercase">
          Waiting approval
        </dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
          {{ list.meta.pending.count }} · ৳ {{ formatMoney(list.meta.pending.amount) }}
        </dd>
      </div>
    </dl>
    <p v-if="list" class="mt-2 text-xs text-muted">Totals count approved entries only.</p>

    <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Cash payments">
      <div role="search" class="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div class="sm:col-span-3 lg:col-span-2">
          <label :for="ids.search" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="ids.search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Payment no, payee or purpose"
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
          <label :for="ids.who" class="block text-sm font-medium text-slate-700">Paid to</label>
          <select :id="ids.who" v-model="payeeType" :class="inputClass" data-payee-type-filter>
            <option value="">All</option>
            <option value="client">Parties</option>
            <option value="owner">Owners</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label :for="ids.type" class="block text-sm font-medium text-slate-700">For</label>
          <select :id="ids.type" v-model="paymentType" :class="inputClass" data-payment-type-filter>
            <option value="">All</option>
            <option value="refund">Refund</option>
            <option value="loan_repayment">Loan repayment</option>
            <option value="drawing">Owner drawing</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div>
          <label :for="ids.via" class="block text-sm font-medium text-slate-700">Paid via</label>
          <select :id="ids.via" v-model="paymentMethod" :class="inputClass" data-method-filter>
            <option value="">All</option>
            <option value="cash">Cash in hand</option>
            <option value="bank">Bank</option>
          </select>
        </div>
        <div>
          <label :for="ids.status" class="block text-sm font-medium text-slate-700">Status</label>
          <select :id="ids.status" v-model="status" :class="inputClass" data-status-filter>
            <option value="">All</option>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Returned</option>
          </select>
        </div>
        <div v-if="hasFilters" class="flex items-end">
          <button
            type="button"
            class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <div v-else-if="!list" class="animate-pulse space-y-3 py-4" data-skeleton>
          <div v-for="n in 6" :key="n" class="h-4 rounded bg-slate-200" />
          <span class="sr-only">Loading payments…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No payments match these filters.' : 'No payments yet.' }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New payment
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Payment no</th>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="TABLE_TH">Paid to</th>
                  <th scope="col" :class="TABLE_TH">For</th>
                  <th scope="col" :class="TABLE_TH">Paid via</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Amount</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                  <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="p in list.data" :key="p.id" class="align-top" :data-payment="p.id">
                  <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                    {{ p.payment_no }}
                  </td>
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(p.date) }}</td>
                  <td :class="TABLE_TD">
                    <RouterLink
                      v-if="p.party"
                      :to="{ name: 'accounts-party-ledger', params: { id: p.party.id } }"
                      class="font-semibold text-primary-800 underline-offset-4 hover:underline"
                    >
                      {{ p.party.name }}
                    </RouterLink>
                    <span v-else class="font-semibold text-ink">{{ p.payee_name }}</span>
                    <span class="block text-xs text-muted">
                      <template v-if="p.party">
                        {{ p.party.code }} · {{ p.payee_type_label }} · {{ p.party.mobile }}
                      </template>
                      <template v-else>Other payee</template>
                    </span>
                    <span v-if="p.note" class="block text-xs text-muted">{{ p.note }}</span>
                  </td>
                  <td :class="TABLE_TD">
                    {{ p.payment_type_label }}
                    <span v-if="p.purpose" class="block text-xs text-muted">{{ p.purpose }}</span>
                  </td>
                  <td :class="TABLE_TD">
                    {{ p.payment_method_label }}
                    <span v-if="p.payment_method === 'bank'" class="block text-xs text-muted">
                      {{ p.bank_name }}, {{ p.bank_branch }}
                    </span>
                  </td>
                  <td
                    :class="[TABLE_TD, 'text-right font-semibold tabular-nums whitespace-nowrap']"
                  >
                    {{ formatMoney(p.amount) }}
                  </td>
                  <td :class="TABLE_TD">
                    <ApprovalBadge
                      :status="p.status"
                      :label="p.status_label"
                      :reason="p.return_reason"
                      :by="p.returned_by"
                    />
                    <span v-if="p.approved_by" class="block text-xs text-muted"
                      >by {{ p.approved_by }}</span
                    >
                  </td>
                  <td class="py-3">
                    <div class="flex justify-end gap-1">
                      <button
                        v-if="p.can.approve"
                        type="button"
                        :class="[actionClass, 'text-green-800 hover:bg-green-50']"
                        :disabled="actions.isBusy(approvalTarget(p))"
                        data-approve
                        @click="actions.approve(approvalTarget(p))"
                      >
                        Approve<span class="sr-only"> {{ p.payment_no }}</span>
                      </button>
                      <button
                        v-if="p.can.send_back"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-return
                        @click="actions.askReturn(approvalTarget(p))"
                      >
                        Return<span class="sr-only"> {{ p.payment_no }}</span>
                      </button>
                      <button
                        v-if="p.can.update"
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(p)"
                      >
                        Edit<span class="sr-only"> {{ p.payment_no }}</span>
                      </button>
                      <button
                        v-if="p.can.delete"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(p)"
                      >
                        Delete<span class="sr-only"> {{ p.payment_no }}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ListPager :meta="list.meta" :page-link="pageLink" />
        </div>
      </div>
    </section>

    <CashPaymentFormDialog
      v-model:open="formOpen"
      :payment="editing"
      :preset-party="presetParty"
      @saved="onSaved"
    />

    <ReturnReasonDialog
      v-model:open="actions.returnOpen.value"
      :title="`Return ${actions.returnTarget.value?.label ?? ''}`"
      :busy="actions.returnBusy.value"
      :error="actions.returnError.value"
      @confirm="actions.confirmReturn"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete payment"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete payment <strong>{{ deleteTarget.payment_no }}</strong> of
        <strong>৳ {{ formatMoney(deleteTarget.amount) }}</strong> to {{ deleteTarget.payee_name }}?
        <template v-if="deleteTarget.party">Its line in the ledger is removed too.</template>
        This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
