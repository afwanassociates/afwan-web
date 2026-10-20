<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import CashTransferFormDialog from '@/components/accounts/CashTransferFormDialog.vue'
import ListPager from '@/components/accounts/ListPager.vue'
import { deleteCashTransfer, listCashTransfers, type CashTransferPage } from '@/api/accounts'
import { useApprovalActions } from '@/composables/useApprovalActions'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { formatMoney, useCashRefresh } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import type { ApprovalStatus, CashTransfer, TransferDirection } from '@/types/accounts'

/**
 * Accounts › Cash › Cash Transfer: cash in hand deposited to a bank, and cash withdrawn from a
 * bank. Filters live in the URL; the totals cover every matching transfer.
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
  direction: useId(),
}

interface Filters {
  q: string
  status: '' | ApprovalStatus
  from: string
  to: string
  direction: '' | TransferDirection
  page: number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const oneOf = <T extends string>(value: string, options: readonly T[]): '' | T =>
  (options as readonly string[]).includes(value) ? (value as T) : ''
const ymd = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')

const filters = computed<Filters>(() => {
  const page = Number(text(route.query.page))
  const direction = text(route.query.direction)
  return {
    q: text(route.query.q).trim(),
    status: oneOf(text(route.query.status), ['pending', 'approved', 'rejected'] as const),
    from: ymd(text(route.query.from)),
    to: ymd(text(route.query.to)),
    direction: direction === 'deposit' || direction === 'withdrawal' ? direction : '',
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

function filterModel<K extends 'from' | 'to' | 'direction' | 'status'>(key: K) {
  return computed({
    get: () => filters.value[key],
    set: (value: Filters[K]) =>
      router.replace({ query: queryWith({ [key]: value } as Partial<Filters>) }),
  })
}
const from = filterModel('from')
const status = filterModel('status')
const to = filterModel('to')
const direction = filterModel('direction')

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

const list = shallowRef<CashTransferPage | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listCashTransfers({
      q: f.q || undefined,
      status: f.status || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      direction: f.direction || undefined,
      page: f.page,
      per_page: PER_PAGE,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id !== requestId || errorStatus(error) === 401) return
    loadError.value =
      errorStatus(error) === 422
        ? 'The “to” date must be on or after the “from” date.'
        : errorMessage(error, 'Could not load the transfers. Please try again.')
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
const approvalTarget = (entry: { id: number; transfer_no: string }) => ({
  type: 'cash-transfers' as const,
  id: entry.id,
  label: `Transfer ${entry.transfer_no}`,
})

const formOpen = ref(false)
const editing = ref<CashTransfer | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(transfer: CashTransfer) {
  editing.value = transfer
  formOpen.value = true
}

function onSaved(transfer: CashTransfer, created: boolean) {
  toast.success(
    created
      ? `Transfer ${transfer.transfer_no} saved for approval: ৳ ${formatMoney(transfer.amount)}.`
      : `Transfer ${transfer.transfer_no} updated.`,
  )
  load()
  refreshCash()
}

const deleteTarget = ref<CashTransfer | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(transfer: CashTransfer) {
  deleteTarget.value = transfer
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  const transfer = deleteTarget.value
  if (!transfer) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteCashTransfer(transfer.id)
    deleteOpen.value = false
    toast.success(`Transfer ${transfer.transfer_no} deleted.`)
    load()
    refreshCash()
  } catch (error) {
    if (errorStatus(error) !== 401)
      deleteError.value = errorMessage(error, 'Could not delete the transfer. Please try again.')
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
      <h2 class="text-lg font-bold text-primary-900">Cash Transfer</h2>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New transfer
      </button>
    </div>

    <dl v-if="list" class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-totals>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Transfers</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums">{{ list.meta.totals.count }}</dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">Deposited to bank</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums" data-total-deposit>
          ৳ {{ formatMoney(list.meta.totals.deposit) }}
        </dd>
      </div>
      <div class="glass-card p-4">
        <dt class="text-xs font-semibold tracking-wider text-muted uppercase">
          Withdrawn from bank
        </dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums" data-total-withdrawal>
          ৳ {{ formatMoney(list.meta.totals.withdrawal) }}
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

    <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Cash transfers">
      <div role="search" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div class="sm:col-span-2">
          <label :for="ids.search" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="ids.search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Transfer no, bank or branch"
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
          <label :for="ids.direction" class="block text-sm font-medium text-slate-700">Type</label>
          <select :id="ids.direction" v-model="direction" :class="inputClass" data-direction-filter>
            <option value="">All</option>
            <option value="deposit">Deposit to bank</option>
            <option value="withdrawal">Withdrawal from bank</option>
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
          <span class="sr-only">Loading transfers…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No transfers match these filters.' : 'No transfers yet.' }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New transfer
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">Transfer no</th>
                  <th scope="col" :class="TABLE_TH">Date</th>
                  <th scope="col" :class="TABLE_TH">Type</th>
                  <th scope="col" :class="TABLE_TH">Bank</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Amount</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                  <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="t in list.data" :key="t.id" class="align-top" :data-transfer="t.id">
                  <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">
                    {{ t.transfer_no }}
                  </td>
                  <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(t.date) }}</td>
                  <td :class="TABLE_TD">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        t.direction === 'deposit'
                          ? 'bg-amber-50 text-amber-800 ring-amber-300'
                          : 'bg-green-50 text-green-800 ring-green-300'
                      "
                    >
                      {{ t.direction_label }}
                    </span>
                    <span v-if="t.note" class="block pt-1 text-xs text-muted">{{ t.note }}</span>
                  </td>
                  <td :class="TABLE_TD">
                    {{ t.bank_name }}
                    <span class="block text-xs text-muted">{{ t.bank_branch }}</span>
                  </td>
                  <td
                    :class="[TABLE_TD, 'text-right font-semibold tabular-nums whitespace-nowrap']"
                  >
                    {{ formatMoney(t.amount) }}
                  </td>
                  <td :class="TABLE_TD">
                    <ApprovalBadge
                      :status="t.status"
                      :label="t.status_label"
                      :reason="t.return_reason"
                      :by="t.returned_by"
                    />
                    <span v-if="t.approved_by" class="block text-xs text-muted"
                      >by {{ t.approved_by }}</span
                    >
                  </td>
                  <td class="py-3">
                    <div class="flex justify-end gap-1">
                      <button
                        v-if="t.can.approve"
                        type="button"
                        :class="[actionClass, 'text-green-800 hover:bg-green-50']"
                        :disabled="actions.isBusy(approvalTarget(t))"
                        data-approve
                        @click="actions.approve(approvalTarget(t))"
                      >
                        Approve<span class="sr-only"> {{ t.transfer_no }}</span>
                      </button>
                      <button
                        v-if="t.can.send_back"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-return
                        @click="actions.askReturn(approvalTarget(t))"
                      >
                        Return<span class="sr-only"> {{ t.transfer_no }}</span>
                      </button>
                      <button
                        v-if="t.can.update"
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(t)"
                      >
                        Edit<span class="sr-only"> {{ t.transfer_no }}</span>
                      </button>
                      <button
                        v-if="t.can.delete"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(t)"
                      >
                        Delete<span class="sr-only"> {{ t.transfer_no }}</span>
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

    <CashTransferFormDialog v-model:open="formOpen" :transfer="editing" @saved="onSaved" />

    <ReturnReasonDialog
      v-model:open="actions.returnOpen.value"
      :title="`Return ${actions.returnTarget.value?.label ?? ''}`"
      :busy="actions.returnBusy.value"
      :error="actions.returnError.value"
      @confirm="actions.confirmReturn"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete transfer"
      confirm-label="Delete"
      danger
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteTarget">
        Delete transfer <strong>{{ deleteTarget.transfer_no }}</strong> of
        <strong>৳ {{ formatMoney(deleteTarget.amount) }}</strong
        >? This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
