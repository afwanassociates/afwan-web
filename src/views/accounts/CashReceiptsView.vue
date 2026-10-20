<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import CashReceiptFormDialog from '@/components/accounts/CashReceiptFormDialog.vue'
import {
  deleteCashReceipt,
  fetchParty,
  listCashReceipts,
  type CashReceiptPage,
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
  CashReceipt,
  CashReceiptType,
  Party,
  PartyType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Accounts › Cash receive: money received from parties and owners, as cash or a loan, in
 * hand or into a bank. Filters live in the URL; the totals cover every matching receipt.
 * ?new=1&party=<id> opens the form for that party (the ledger's "Receive cash" button).
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
  party_type: '' | PartyType
  receipt_type: '' | CashReceiptType
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
    party_type: oneOf(text(route.query.party_type), ['client', 'owner'] as const),
    receipt_type: oneOf(text(route.query.receipt_type), ['cash', 'loan'] as const),
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

/** A select/date bound to one URL filter. */
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
const partyType = filterModel('party_type')
const receiptType = filterModel('receipt_type')
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

const list = shallowRef<CashReceiptPage | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listCashReceipts({
      q: f.q || undefined,
      status: f.status || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      party_type: f.party_type || undefined,
      receipt_type: f.receipt_type || undefined,
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
        : errorMessage(error, 'Could not load the receipts. Please try again.')
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
const approvalTarget = (entry: { id: number; receipt_no: string }) => ({
  type: 'cash-receipts' as const,
  id: entry.id,
  label: `Receipt ${entry.receipt_no}`,
})

/* ---------- Create / edit ---------- */

const formOpen = ref(false)
const editing = ref<CashReceipt | null>(null)
const presetParty = ref<Party | null>(null)

function openCreate() {
  editing.value = null
  presetParty.value = null
  formOpen.value = true
}

function openEdit(receipt: CashReceipt) {
  editing.value = receipt
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
        // The form opens without a party.
      }
    }
    formOpen.value = true
  },
  { immediate: true },
)

function onSaved(receipt: CashReceipt, created: boolean) {
  toast.success(
    created
      ? `Receipt ${receipt.receipt_no} saved for approval: ৳ ${formatMoney(receipt.amount)} from ${receipt.party.name}.`
      : `Receipt ${receipt.receipt_no} updated.`,
  )
  load()
  refreshCash()
}

/* ---------- Delete (admins) ---------- */

const deleteTarget = ref<CashReceipt | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(receipt: CashReceipt) {
  deleteTarget.value = receipt
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const receipt = deleteTarget.value
  if (!receipt) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteCashReceipt(receipt.id)
    deleteOpen.value = false
    toast.success(`Receipt ${receipt.receipt_no} deleted.`)
    load()
    refreshCash()
  } catch (error) {
    if (errorStatus(error) !== 401)
      deleteError.value = errorMessage(error, 'Could not delete the receipt. Please try again.')
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
      <div>
        <h2 class="text-lg font-bold text-primary-900">Cash Receive</h2>
        <p class="text-sm text-muted">Money received from parties and owners, as cash or a loan.</p>
      </div>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New receipt
      </button>
    </div>

    <dl v-if="list" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-totals>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Receipts</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">{{ list.meta.totals.count }}</dd>
      </div>
      <div class="glass-card p-4 ring-2 ring-accent-400">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Total received</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums" data-total-amount>
          ৳ {{ formatMoney(list.meta.totals.amount) }}
        </dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Cash in hand</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">
          ৳ {{ formatMoney(list.meta.totals.cash) }}
        </dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Bank</dt>
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

    <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Cash receipts">
      <div role="search" class="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div class="sm:col-span-3 lg:col-span-2">
          <label :for="ids.search" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="ids.search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Receipt no, party ID or name"
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
          <label :for="ids.who" class="block text-sm font-medium text-slate-700">From whom</label>
          <select :id="ids.who" v-model="partyType" :class="inputClass" data-party-type-filter>
            <option value="">All</option>
            <option value="client">Parties</option>
            <option value="owner">Owners</option>
          </select>
        </div>
        <div>
          <label :for="ids.type" class="block text-sm font-medium text-slate-700">Type</label>
          <select :id="ids.type" v-model="receiptType" :class="inputClass" data-receipt-type-filter>
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="loan">Loan</option>
          </select>
        </div>
        <div>
          <label :for="ids.via" class="block text-sm font-medium text-slate-700"
            >Received via</label
          >
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
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
          </div>
          <span class="sr-only">Loading receipts…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No receipts match these filters.' : 'No receipts yet.' }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New receipt
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Receipt no</th>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="TABLE_TH">Received from</th>
                  <th scope="col" :class="TABLE_TH">Type</th>
                  <th scope="col" :class="TABLE_TH">Received via</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Amount</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                  <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="r in list.data" :key="r.id" class="align-top" :data-receipt="r.id">
                  <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                    {{ r.receipt_no }}
                  </td>
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(r.date) }}</td>
                  <td :class="TABLE_TD">
                    <RouterLink
                      :to="{ name: 'accounts-party-ledger', params: { id: r.party.id } }"
                      class="font-semibold text-primary-800 underline-offset-4 hover:underline"
                    >
                      {{ r.party.name }}
                    </RouterLink>
                    <span class="block text-xs text-muted">
                      {{ r.party.code }} · {{ r.party.type === 'owner' ? 'Owner' : 'Party' }} ·
                      {{ r.party.mobile }}
                    </span>
                    <span v-if="r.note" class="block text-xs text-muted">{{ r.note }}</span>
                  </td>
                  <td :class="TABLE_TD">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        r.receipt_type === 'loan'
                          ? 'bg-amber-50 text-amber-800 ring-amber-300'
                          : 'bg-green-50 text-green-800 ring-green-300'
                      "
                    >
                      {{ r.receipt_type_label }}
                    </span>
                  </td>
                  <td :class="TABLE_TD">
                    {{ r.payment_method_label }}
                    <span v-if="r.payment_method === 'bank'" class="block text-xs text-muted">
                      {{ r.bank_name }}, {{ r.bank_branch }}
                    </span>
                  </td>
                  <td
                    :class="[TABLE_TD, 'text-right font-semibold tabular-nums whitespace-nowrap']"
                  >
                    {{ formatMoney(r.amount) }}
                  </td>
                  <td :class="TABLE_TD">
                    <ApprovalBadge
                      :status="r.status"
                      :label="r.status_label"
                      :reason="r.return_reason"
                      :by="r.returned_by"
                    />
                    <span v-if="r.approved_by" class="block text-xs text-muted"
                      >by {{ r.approved_by }}</span
                    >
                  </td>
                  <td class="py-3">
                    <div class="flex justify-end gap-1">
                      <button
                        v-if="r.can.approve"
                        type="button"
                        :class="[actionClass, 'text-green-800 hover:bg-green-50']"
                        :disabled="actions.isBusy(approvalTarget(r))"
                        data-approve
                        @click="actions.approve(approvalTarget(r))"
                      >
                        Approve<span class="sr-only"> {{ r.receipt_no }}</span>
                      </button>
                      <button
                        v-if="r.can.send_back"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-return
                        @click="actions.askReturn(approvalTarget(r))"
                      >
                        Return<span class="sr-only"> {{ r.receipt_no }}</span>
                      </button>
                      <button
                        v-if="r.can.update"
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(r)"
                      >
                        Edit<span class="sr-only"> {{ r.receipt_no }}</span>
                      </button>
                      <button
                        v-if="r.can.delete"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(r)"
                      >
                        Delete<span class="sr-only"> {{ r.receipt_no }}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <p class="text-sm text-muted">
              Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
            </p>
            <div v-if="list.meta.last_page > 1" class="flex items-center gap-2">
              <RouterLink
                v-if="list.meta.current_page > 1"
                :to="pageLink(list.meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="px-2 text-sm text-muted">
                Page {{ list.meta.current_page }} of {{ list.meta.last_page }}
              </span>
              <RouterLink
                v-if="list.meta.current_page < list.meta.last_page"
                :to="pageLink(list.meta.current_page + 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>

    <CashReceiptFormDialog
      v-model:open="formOpen"
      :receipt="editing"
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
      title="Delete receipt"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete receipt <strong>{{ deleteTarget.receipt_no }}</strong> of
        <strong>৳ {{ formatMoney(deleteTarget.amount) }}</strong> from
        {{ deleteTarget.party.name }}? Its line in the party ledger is removed too. This cannot be
        undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
