<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CashPaymentFormDialog from '@/components/accounts/CashPaymentFormDialog.vue'
import CashReceiptFormDialog from '@/components/accounts/CashReceiptFormDialog.vue'
import OwnerLoanBillDialog from '@/components/accounts/OwnerLoanBillDialog.vue'
import { deleteOwnerLoanBill, getOwnerLoans } from '@/api/accounts'
import { useToast } from '@/composables/useToast'
import { formatMoney } from '@/lib/accounts'
import { openBillCopy } from '@/lib/billCopy'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type {
  ApprovalStatus,
  CashPayment,
  CashReceipt,
  OwnerLoan,
  OwnerLoanBill,
  OwnerLoanReport,
} from '@/types/accounts'

/**
 * Accounts › Owner loans: money the company lends an owner (Cash payment › Company owner ›
 * Owner loan, from cash in hand, a bank or mobile banking) and how the owner settles it:
 * company bills they paid with it (each with a copy of the bill; no money moves) or money they
 * give back (Cash receive › Company owner › Loan return; back into cash, bank or wallet). A
 * loan is open until approved bills and returns cover it. Capital is separate: money an owner
 * puts into the company.
 */
const toast = useToast()

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

/** What may still be settled: outstanding less returns and bills waiting for approval. */
const available = (l: OwnerLoan) =>
  Math.max(0, Math.round((l.outstanding - l.pending_returned - l.pending_billed) * 100) / 100)

/* ---------- Details (bills and returns of a loan) ---------- */

const expanded = ref(new Set<number>())
function toggle(loanId: number) {
  const next = new Set(expanded.value)
  if (next.has(loanId)) next.delete(loanId)
  else next.add(loanId)
  expanded.value = next
}

/* ---------- Give a loan (a cash payment to an owner) ---------- */

const loanFormOpen = ref(false)

function onLoanSaved(payment: CashPayment) {
  toast.success(
    `Owner loan ${payment.payment_no} of ৳ ${formatMoney(payment.amount)} to ${payment.payee_name} saved for approval.`,
  )
}

/* ---------- Settle with a bill ---------- */

const billOpen = ref(false)
const billLoan = ref<OwnerLoan | null>(null)
const billEditing = ref<OwnerLoanBill | null>(null)

function addBill(loan: OwnerLoan) {
  billLoan.value = loan
  billEditing.value = null
  billOpen.value = true
}

function editBill(loan: OwnerLoan, bill: OwnerLoanBill) {
  billLoan.value = loan
  billEditing.value = bill
  billOpen.value = true
}

function onBillSaved(bill: OwnerLoanBill, created: boolean) {
  toast.success(
    created
      ? `Bill of ৳ ${formatMoney(bill.amount)} saved for approval.`
      : `Bill “${bill.purpose}” updated.`,
  )
  expanded.value = new Set([...expanded.value, bill.owner_loan_id])
  load()
}

async function viewCopy(bill: OwnerLoanBill) {
  const error = await openBillCopy(bill.id)
  if (error) toast.error(error)
}

const deleteTarget = ref<OwnerLoanBill | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(bill: OwnerLoanBill) {
  deleteTarget.value = bill
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const bill = deleteTarget.value
  if (!bill) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteOwnerLoanBill(bill.id)
    deleteOpen.value = false
    toast.success(`Bill “${bill.purpose}” deleted.`)
    load()
  } catch (error) {
    if (errorStatus(error) !== 401)
      deleteError.value = errorMessage(error, 'Could not delete the bill. Please try again.')
  } finally {
    deleteBusy.value = false
  }
}

/* ---------- Return money (a loan return cash receipt) ---------- */

const returnOpen = ref(false)
const returnLoan = ref<OwnerLoan | null>(null)
const returnOwner = computed(() =>
  returnLoan.value ? { ...returnLoan.value.owner, type: 'owner' as const } : null,
)

function returnMoney(loan: OwnerLoan) {
  returnLoan.value = loan
  returnOpen.value = true
}

function onReturnSaved(receipt: CashReceipt) {
  toast.success(
    `Loan return ${receipt.receipt_no} of ৳ ${formatMoney(receipt.amount)} saved for approval.`,
  )
  if (returnLoan.value) expanded.value = new Set([...expanded.value, returnLoan.value.id])
  load()
}

const STATUS_BADGE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-300',
  approved: 'bg-green-50 text-green-800 ring-green-300',
  rejected: 'bg-red-50 text-red-800 ring-red-300',
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Owner loans</h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Money the company lends an owner (from cash, bank or mobile banking). The owner settles it
          by showing company bills paid with it (with a bill copy) or by returning the money.
          Capital is separate.
        </p>
      </div>
      <button type="button" class="btn btn-accent" data-give-loan @click="loanFormOpen = true">
        Give owner loan
      </button>
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
        <div class="glass-card p-4" data-total-capital>
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
        <div class="glass-card p-4 ring-2 ring-accent-400" data-loans-outstanding>
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">
            Owners owe the company
          </dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
            ৳ {{ formatMoney(report.summary.loans_outstanding) }}
          </dd>
          <dd class="mt-2 space-y-0.5 text-xs text-muted">
            <template v-for="o in report.summary.owners" :key="o.id">
              <p v-if="o.loan_outstanding > 0" class="flex justify-between gap-2">
                <span class="truncate">{{ o.name }}</span>
                <span class="tabular-nums">৳ {{ formatMoney(o.loan_outstanding) }}</span>
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
            <p v-if="!hasFilters" class="mt-1 text-sm text-muted">
              A loan shows here once it is approved.
            </p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Loan</th>
                  <th scope="col" :class="TABLE_TH">Owner</th>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Loan amount</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Bills</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Returned</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Outstanding</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                  <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <template v-for="l in loans" :key="l.id">
                  <tr class="align-top" :data-loan="l.id">
                    <td :class="[TABLE_TD, 'whitespace-nowrap']">
                      <span class="font-mono text-xs">{{ l.payment_no }}</span>
                      <span class="block text-xs text-muted">{{ l.payment_method_label }}</span>
                      <span v-if="l.note" class="block text-xs text-muted">{{ l.note }}</span>
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
                    <td :class="[TABLE_TD, 'text-right font-semibold tabular-nums']">
                      {{ formatMoney(l.amount) }}
                    </td>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']" data-billed>
                      {{ formatMoney(l.billed) }}
                      <span v-if="l.pending_billed > 0" class="block text-xs text-amber-800">
                        + {{ formatMoney(l.pending_billed) }} waiting
                      </span>
                    </td>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']" data-returned>
                      {{ formatMoney(l.returned) }}
                      <span v-if="l.pending_returned > 0" class="block text-xs text-amber-800">
                        + {{ formatMoney(l.pending_returned) }} waiting
                      </span>
                    </td>
                    <td
                      :class="[TABLE_TD, 'text-right font-semibold tabular-nums']"
                      data-outstanding
                    >
                      {{ formatMoney(l.outstanding) }}
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
                    <td class="py-3 text-right whitespace-nowrap">
                      <template v-if="available(l) > 0">
                        <button
                          type="button"
                          :class="[actionClass, 'text-primary-800']"
                          data-add-bill
                          @click="addBill(l)"
                        >
                          Add bill
                        </button>
                        <button
                          type="button"
                          :class="[actionClass, 'text-primary-800']"
                          data-return-money
                          @click="returnMoney(l)"
                        >
                          Return money
                        </button>
                      </template>
                      <button
                        v-if="l.bills.length || l.returns.length"
                        type="button"
                        :class="[actionClass, 'text-muted']"
                        :aria-expanded="expanded.has(l.id)"
                        data-toggle
                        @click="toggle(l.id)"
                      >
                        {{ expanded.has(l.id) ? 'Hide' : 'Details' }} ({{
                          l.bills.length + l.returns.length
                        }})
                      </button>
                    </td>
                  </tr>

                  <tr v-if="expanded.has(l.id)" class="bg-slate-50/70" :data-details="l.id">
                    <td colspan="9" class="px-4 py-3">
                      <div class="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h3 class="text-xs font-semibold tracking-wider text-muted uppercase">
                            Bills the owner paid
                          </h3>
                          <p v-if="!l.bills.length" class="mt-1 text-xs text-muted">None yet.</p>
                          <ul v-else class="mt-1 space-y-2">
                            <li
                              v-for="b in l.bills"
                              :key="b.id"
                              class="rounded-lg bg-white p-2 ring-1 ring-stroke"
                              :data-bill="b.id"
                            >
                              <div class="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p class="font-medium text-ink">{{ b.purpose }}</p>
                                  <p class="text-xs text-muted">
                                    {{ toDisplayDate(b.date) }} · {{ b.expense_category_label
                                    }}<template v-if="b.bill_no"> · Bill {{ b.bill_no }}</template>
                                  </p>
                                  <p v-if="b.return_reason" class="text-xs text-red-800">
                                    Returned: {{ b.return_reason
                                    }}<template v-if="b.returned_by">
                                      ({{ b.returned_by }})</template
                                    >
                                  </p>
                                </div>
                                <div class="text-right">
                                  <p class="font-semibold tabular-nums">
                                    ৳ {{ formatMoney(b.amount) }}
                                  </p>
                                  <span
                                    class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                                    :class="STATUS_BADGE[b.status]"
                                  >
                                    {{ b.status_label }}
                                  </span>
                                </div>
                              </div>
                              <div class="mt-1 flex flex-wrap gap-1">
                                <button
                                  v-if="b.has_copy"
                                  type="button"
                                  :class="[actionClass, 'text-primary-800']"
                                  data-view-copy
                                  @click="viewCopy(b)"
                                >
                                  View bill copy
                                </button>
                                <button
                                  v-if="b.can.update"
                                  type="button"
                                  :class="[actionClass, 'text-primary-800']"
                                  data-edit-bill
                                  @click="editBill(l, b)"
                                >
                                  Edit
                                </button>
                                <button
                                  v-if="b.can.delete"
                                  type="button"
                                  :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                                  data-delete-bill
                                  @click="askDelete(b)"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h3 class="text-xs font-semibold tracking-wider text-muted uppercase">
                            Money returned
                          </h3>
                          <p v-if="!l.returns.length" class="mt-1 text-xs text-muted">None yet.</p>
                          <ul v-else class="mt-1 space-y-1">
                            <li
                              v-for="r in l.returns"
                              :key="r.id"
                              class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 ring-1 ring-stroke"
                              :data-return="r.id"
                            >
                              <span>
                                <span class="font-mono text-xs">{{ r.receipt_no }}</span>
                                <span class="block text-xs text-muted">
                                  {{ toDisplayDate(r.date) }} · {{ r.payment_method_label }}
                                </span>
                              </span>
                              <span class="text-right">
                                <span class="block font-semibold tabular-nums">
                                  ৳ {{ formatMoney(r.amount) }}
                                </span>
                                <span
                                  class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                                  :class="STATUS_BADGE[r.status]"
                                >
                                  {{ r.status_label }}
                                </span>
                              </span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
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

    <CashPaymentFormDialog
      v-model:open="loanFormOpen"
      :payment="null"
      preset-payee-type="owner"
      @saved="onLoanSaved"
    />
    <OwnerLoanBillDialog
      v-model:open="billOpen"
      :loan="billLoan"
      :bill="billEditing"
      @saved="onBillSaved"
    />
    <CashReceiptFormDialog
      v-model:open="returnOpen"
      :receipt="null"
      :preset-party="returnOwner"
      :preset-loan-id="returnLoan?.id ?? null"
      @saved="onReturnSaved"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete loan bill"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete the bill <strong>{{ deleteTarget.purpose }}</strong> of
        <strong>৳ {{ formatMoney(deleteTarget.amount) }}</strong
        >, with its copy? Its line in the owner's ledger is removed too. This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
