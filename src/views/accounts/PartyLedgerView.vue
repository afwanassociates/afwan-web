<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import PartyTransactionDialog from '@/components/accounts/PartyTransactionDialog.vue'
import { deletePartyTransaction, fetchPartyLedger } from '@/api/accounts'
import { useApprovalActions } from '@/composables/useApprovalActions'
import { useToast } from '@/composables/useToast'
import { balanceClass, formatBalance, formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { staffTitle } from '@/lib/pageTitle'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { LedgerLine, PartyLedger, PendingLedgerLine } from '@/types/accounts'

/**
 * Accounts › Party ledger: the party's details and totals, then every ledger line in a date
 * range with debit, credit and running balance. Receivables are entered here by hand; the
 * other lines (refunds included) come from cash receipts and payments and are changed there.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const fromId = useId()
const toId = useId()

const partyId = computed(() => Number(route.params.id))
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const range = computed(() => {
  const from = text(route.query.from)
  const to = text(route.query.to)
  return { from: isYmd(from) ? from : '', to: isYmd(to) ? to : '' }
})

function setRange(changes: Partial<{ from: string; to: string }>) {
  const next = { ...range.value, ...changes }
  const query: LocationQuery = {}
  if (next.from) query.from = next.from
  if (next.to) query.to = next.to
  router.replace({ query })
}

const from = computed({ get: () => range.value.from, set: (v: string) => setRange({ from: v }) })
const to = computed({ get: () => range.value.to, set: (v: string) => setRange({ to: v }) })

/* ---------- Loading ---------- */

const ledger = shallowRef<PartyLedger | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchPartyLedger(partyId.value, {
      from: range.value.from,
      to: range.value.to,
    })
    if (id === requestId) {
      ledger.value = result
      document.title = staffTitle(`${result.party.code} ${result.party.name} | Ledger`)
    }
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 404
        ? 'This party does not exist.'
        : errorStatus(error) === 422
          ? 'The “to” date must be on or after the “from” date.'
          : errorMessage(error, 'Could not load the ledger. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(() => [partyId.value, range.value.from, range.value.to], load, { immediate: true })

const party = computed(() => ledger.value?.party ?? null)
const isOwner = computed(() => party.value?.type === 'owner')

/** The summary cards: what the party list shows, for all time. */
const cards = computed(() => {
  const p = party.value
  if (!p?.totals) return []
  const opening = p.opening_balance_type === 'payable' ? -p.opening_balance : p.opening_balance
  const rows = [{ key: 'opening', label: 'Opening balance', value: formatBalance(opening) }]
  if (isOwner.value) {
    rows.push(
      { key: 'capital', label: 'Capital', value: formatMoney(p.totals.capital) },
      { key: 'drawing', label: 'Drawing', value: formatMoney(p.totals.drawing) },
    )
  } else {
    rows.push(
      { key: 'receivable', label: 'Receivable', value: formatMoney(p.totals.receivable) },
      { key: 'payment', label: 'Payment', value: formatMoney(p.totals.payment) },
      { key: 'refund', label: 'Refund', value: formatMoney(p.totals.refund) },
    )
  }
  // Loans taken from them, less what was repaid.
  rows.push({
    key: 'loan',
    label: 'Loan balance',
    value: formatMoney(p.totals.loan - p.totals.loan_repayment),
  })
  return rows
})

/* ---------- Hand-entered lines ---------- */

const dialogOpen = ref(false)
const editingLine = ref<LedgerLine | PendingLedgerLine | null>(null)
function openAdd() {
  editingLine.value = null
  dialogOpen.value = true
}

function openEdit(line: LedgerLine | PendingLedgerLine) {
  editingLine.value = line
  dialogOpen.value = true
}

function onSaved() {
  toast.success(
    editingLine.value
      ? 'Ledger entry saved and sent for approval.'
      : 'Ledger entry added. It counts once approved.',
  )
  load()
}

const deleteTarget = ref<LedgerLine | PendingLedgerLine | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(line: LedgerLine | PendingLedgerLine) {
  deleteTarget.value = line
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const line = deleteTarget.value
  if (!line) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deletePartyTransaction(line.id)
    deleteOpen.value = false
    toast.success('Ledger entry deleted.')
    load()
  } catch (error) {
    if (errorStatus(error) !== 401)
      deleteError.value = errorMessage(error, 'Could not delete. Please try again.')
  } finally {
    deleteBusy.value = false
  }
}

/* ---------- Approve / return ---------- */

const actions = useApprovalActions(load)
const approvalTarget = (line: LedgerLine | PendingLedgerLine) => ({
  type: 'party-transactions' as const,
  id: line.id,
  label: `${line.type_label} of ${toDisplayDate(line.date)}`,
})

/** Where a receipt's or payment's line is changed. */
const voucherLink = (line: LedgerLine | PendingLedgerLine) => ({
  name: line.cash_payment_id ? 'accounts-cash-payments' : 'accounts-cash-receipts',
  query: { q: line.reference },
})

function print() {
  window.print()
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50'
const amount = (value: number) => (value ? formatMoney(value) : '')
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <RouterLink
      :to="{ name: 'accounts-parties', query: isOwner ? { type: 'owner' } : {} }"
      class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline print:hidden"
    >
      ← Parties
    </RouterLink>

    <div
      v-if="loadError && !ledger"
      role="alert"
      class="glass-card mt-4 space-y-4 p-10 text-center"
      data-error
    >
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <div v-else-if="!ledger" class="glass-card mt-4 animate-pulse space-y-3 p-6" data-skeleton>
      <div class="h-6 w-1/3 rounded bg-slate-200" />
      <div class="h-4 w-1/2 rounded bg-slate-200" />
      <span class="sr-only">Loading the ledger…</span>
    </div>

    <template v-else-if="party">
      <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">
            {{ party.name }}
            <span class="font-mono text-base font-semibold text-muted">{{ party.code }}</span>
          </h1>
          <p class="mt-1 text-sm text-muted">
            {{ party.type_label }} · {{ party.mobile }} · {{ party.address }}
          </p>
          <p class="text-sm text-muted">
            NID/Passport {{ party.nid_passport
            }}<template v-if="party.tin_bin"> · TIN/BIN {{ party.tin_bin }}</template>
            <span
              v-if="!party.is_active"
              class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300"
              >Inactive</span
            >
          </p>
        </div>
        <div class="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            class="btn btn-accent text-sm"
            data-add="receivable"
            @click="openAdd"
          >
            Add receivable
          </button>
          <RouterLink
            :to="{ name: 'accounts-cash-receipts', query: { new: '1', party: String(party.id) } }"
            class="btn btn-primary text-sm"
            data-receive
          >
            Receive cash
          </RouterLink>
          <RouterLink
            :to="{ name: 'accounts-cash-payments', query: { new: '1', party: String(party.id) } }"
            class="btn btn-primary text-sm"
            data-pay
          >
            Pay cash
          </RouterLink>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50"
            @click="print"
          >
            Print
          </button>
        </div>
      </div>

      <dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-summary>
        <div v-for="card in cards" :key="card.key" class="glass-card p-4" :data-card="card.key">
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">
            {{ card.label }}
          </dt>
          <dd class="mt-1 text-lg font-bold text-ink tabular-nums">{{ card.value }}</dd>
        </div>
        <div class="glass-card p-4 ring-2 ring-accent-400" data-card="closing">
          <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Closing balance</dt>
          <dd
            class="mt-1 text-lg font-bold tabular-nums"
            :class="balanceClass(party.totals?.closing_balance ?? 0)"
          >
            {{ formatBalance(party.totals?.closing_balance ?? 0) }}
          </dd>
        </div>
      </dl>

      <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Ledger">
        <div role="search" class="flex flex-wrap items-end gap-4 print:hidden">
          <div class="w-full sm:w-48">
            <label :for="fromId" class="block text-sm font-medium text-slate-700">From</label>
            <input :id="fromId" v-model.lazy="from" type="date" :class="inputClass" data-from />
          </div>
          <div class="w-full sm:w-48">
            <label :for="toId" class="block text-sm font-medium text-slate-700">To</label>
            <input :id="toId" v-model.lazy="to" type="date" :class="inputClass" data-to />
          </div>
          <button
            v-if="range.from || range.to"
            type="button"
            class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
            @click="setRange({ from: '', to: '' })"
          >
            All dates
          </button>
        </div>
        <p v-if="loadError" role="alert" class="mt-4 text-sm text-red-700">{{ loadError }}</p>

        <div
          class="mt-6 overflow-x-auto border-t border-stroke pt-2"
          :class="{ 'opacity-60': isLoading }"
          :aria-busy="isLoading"
        >
          <table class="w-full text-left text-sm" data-ledger>
            <thead :class="TABLE_HEAD">
              <tr>
                <th scope="col" :class="TABLE_TH">Date</th>
                <th scope="col" :class="TABLE_TH">Particulars</th>
                <th scope="col" :class="TABLE_TH">Ref.</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Debit</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Credit</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Balance</th>
                <th scope="col" class="py-3 print:hidden"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr class="bg-primary-50/50" data-opening-row>
                <td :class="TABLE_TD">{{ range.from ? toDisplayDate(range.from) : '' }}</td>
                <td :class="[TABLE_TD, 'font-semibold']" colspan="4">
                  {{ range.from ? 'Balance brought forward' : 'Opening balance' }}
                </td>
                <td :class="[TABLE_TD, 'text-right font-semibold tabular-nums whitespace-nowrap']">
                  {{ formatBalance(ledger.opening_balance) }}
                </td>
                <td class="print:hidden" />
              </tr>
              <tr v-if="ledger.lines.length === 0">
                <td colspan="7" class="py-8 text-center text-muted" data-empty>
                  No transactions{{ range.from || range.to ? ' in these dates' : ' yet' }}.
                </td>
              </tr>
              <tr v-for="line in ledger.lines" :key="line.id" :data-line="line.id">
                <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(line.date) }}</td>
                <td :class="TABLE_TD">
                  <span class="font-medium">{{ line.type_label }}</span>
                  <span v-if="line.note" class="block text-xs text-muted">{{ line.note }}</span>
                </td>
                <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                  {{ line.reference ?? '' }}
                </td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ amount(line.debit) }}</td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ amount(line.credit) }}</td>
                <td
                  class="py-3 pr-4 text-right font-medium whitespace-nowrap tabular-nums"
                  :class="balanceClass(line.balance)"
                >
                  {{ formatBalance(line.balance) }}
                </td>
                <td class="py-2 text-right print:hidden">
                  <button
                    v-if="line.is_manual && line.can.send_back"
                    type="button"
                    :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                    data-return
                    @click="actions.askReturn(approvalTarget(line))"
                  >
                    Return
                  </button>
                  <RouterLink
                    v-else-if="line.reference"
                    :to="voucherLink(line)"
                    :class="[actionClass, 'text-primary-700']"
                    data-voucher
                  >
                    {{ line.cash_payment_id ? 'Payment' : 'Receipt' }}
                  </RouterLink>
                </td>
              </tr>
            </tbody>
            <tfoot class="border-t-2 border-stroke font-semibold">
              <tr>
                <td :class="TABLE_TD" colspan="3">Total / closing balance</td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']" data-total-debit>
                  {{ formatMoney(ledger.totals.debit) }}
                </td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']" data-total-credit>
                  {{ formatMoney(ledger.totals.credit) }}
                </td>
                <td
                  class="py-3 pr-4 text-right whitespace-nowrap tabular-nums"
                  :class="balanceClass(ledger.closing_balance)"
                  data-closing
                >
                  {{ formatBalance(ledger.closing_balance) }}
                </td>
                <td class="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="mt-3 text-xs text-muted">
          Dr = the {{ isOwner ? 'owner' : 'party' }} owes us · Cr = we owe the
          {{ isOwner ? 'owner' : 'party' }}.
        </p>
      </section>

      <section
        v-if="ledger.pending.length"
        class="glass-card mt-6 p-4 ring-1 ring-amber-300 sm:p-6"
        aria-labelledby="pending-title"
        data-pending
      >
        <h2 id="pending-title" class="text-lg font-bold text-primary-900">
          Waiting for approval or returned
        </h2>
        <p class="mt-1 text-sm text-muted">These entries do not count in the balance yet.</p>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead :class="TABLE_HEAD">
              <tr>
                <th scope="col" :class="TABLE_TH">Date</th>
                <th scope="col" :class="TABLE_TH">Particulars</th>
                <th scope="col" :class="TABLE_TH">Ref.</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Debit</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Credit</th>
                <th scope="col" :class="TABLE_TH">Status</th>
                <th scope="col" class="py-3 print:hidden"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr v-for="line in ledger.pending" :key="line.id" :data-pending-line="line.id">
                <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(line.date) }}</td>
                <td :class="TABLE_TD">
                  <span class="font-medium">{{ line.type_label }}</span>
                  <span v-if="line.note" class="block text-xs text-muted">{{ line.note }}</span>
                  <span v-if="line.prepared_by" class="block text-xs text-muted">
                    Prepared by {{ line.prepared_by }}
                  </span>
                </td>
                <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                  {{ line.reference ?? '' }}
                </td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ amount(line.debit) }}</td>
                <td :class="[TABLE_TD, 'text-right tabular-nums']">{{ amount(line.credit) }}</td>
                <td :class="TABLE_TD">
                  <ApprovalBadge
                    :status="line.status"
                    :label="line.status_label"
                    :reason="line.return_reason"
                    :by="line.returned_by"
                  />
                </td>
                <td class="py-2 text-right print:hidden">
                  <div v-if="line.is_manual" class="flex flex-wrap justify-end gap-1">
                    <button
                      v-if="line.can.approve"
                      type="button"
                      :class="[actionClass, 'text-green-800 hover:bg-green-50']"
                      :disabled="actions.isBusy(approvalTarget(line))"
                      data-approve
                      @click="actions.approve(approvalTarget(line))"
                    >
                      Approve
                    </button>
                    <button
                      v-if="line.can.send_back"
                      type="button"
                      :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                      data-return
                      @click="actions.askReturn(approvalTarget(line))"
                    >
                      Return
                    </button>
                    <button
                      v-if="line.can.update"
                      type="button"
                      :class="[actionClass, 'text-primary-700']"
                      data-edit
                      @click="openEdit(line)"
                    >
                      Edit
                    </button>
                    <button
                      v-if="line.can.delete"
                      type="button"
                      :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                      data-delete
                      @click="askDelete(line)"
                    >
                      Delete
                    </button>
                  </div>
                  <RouterLink
                    v-else-if="line.reference"
                    :to="voucherLink(line)"
                    :class="[actionClass, 'text-primary-700']"
                    data-voucher
                  >
                    {{ line.cash_payment_id ? 'Payment' : 'Receipt' }}
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ReturnReasonDialog
        v-model:open="actions.returnOpen.value"
        :title="`Return ${actions.returnTarget.value?.label ?? ''}`"
        :busy="actions.returnBusy.value"
        :error="actions.returnError.value"
        @confirm="actions.confirmReturn"
      />

      <PartyTransactionDialog
        v-model:open="dialogOpen"
        :party="party"
        :line="editingLine"
        @saved="onSaved"
      />

      <ConfirmDialog
        v-model:open="deleteOpen"
        title="Delete ledger entry"
        confirm-label="Delete"
        danger
        :busy="deleteBusy"
        :error="deleteError"
        @confirm="confirmDelete"
      >
        <p v-if="deleteTarget">
          Delete the {{ deleteTarget.type_label.toLowerCase() }} of
          <strong>{{ formatMoney(deleteTarget.debit || deleteTarget.credit) }}</strong> on
          {{ toDisplayDate(deleteTarget.date) }}? This cannot be undone.
        </p>
      </ConfirmDialog>
    </template>
  </div>
</template>
