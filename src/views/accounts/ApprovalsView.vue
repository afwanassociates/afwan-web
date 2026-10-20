<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ApprovalBadge from '@/components/accounts/ApprovalBadge.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import { fetchApprovals } from '@/api/accounts'
import { useApprovalActions, type ApprovalTarget } from '@/composables/useApprovalActions'
import { formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import { staffTitle } from '@/lib/pageTitle'
import { APPROVER_ROLES } from '@/lib/roles'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import { useAuthStore } from '@/stores/auth'
import type { ApprovalItem, ApprovalType } from '@/types/accounts'

/**
 * Accounts › Approvals (Prepared → Approved). Approvers (accounts head, admin, super admin)
 * see every entry waiting for approval and every returned one, and approve or return here;
 * nobody approves an entry they prepared or edited. For the accounts team the page is
 * "My entries": only what they prepared (the API filters it), opening on the ones returned to
 * them for correction.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isApprover = computed(() => !!auth.user && APPROVER_ROLES.includes(auth.user.role))
const typeId = useId()

const TYPES: { value: ApprovalType; label: string }[] = [
  { value: 'cash-receipts', label: 'Cash receive' },
  { value: 'cash-payments', label: 'Cash payment' },
  { value: 'cash-transfers', label: 'Cash transfer' },
  { value: 'party-transactions', label: 'Ledger entries' },
]

/** Where each entry type is edited (searched by its number). */
const PAGES: Record<ApprovalType, string> = {
  'cash-receipts': 'accounts-cash-receipts',
  'cash-payments': 'accounts-cash-payments',
  'cash-transfers': 'accounts-cash-transfers',
  'party-transactions': 'accounts-party-ledger',
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
/** The tab shown without ?status: approvers start on the queue, the team on what to fix. */
const defaultStatus = computed(() => (isApprover.value ? 'pending' : 'rejected'))

const filters = computed(() => {
  const type = text(route.query.type)
  const status = text(route.query.status)
  return {
    status: (status === 'pending' || status === 'rejected' ? status : defaultStatus.value) as
      'pending' | 'rejected',
    type: (TYPES.some((t) => t.value === type) ? type : '') as ApprovalType | '',
  }
})

function queryWith(changes: Partial<{ status: string; type: string }>): LocationQuery {
  const next = { ...filters.value, ...changes }
  const result: LocationQuery = {}
  if (next.status !== defaultStatus.value) result.status = next.status
  if (next.type) result.type = next.type
  return result
}

const type = computed({
  get: () => filters.value.type,
  set: (value: string) => router.replace({ query: queryWith({ type: value }) }),
})

const items = shallowRef<ApprovalItem[] | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchApprovals(filters.value.status, filters.value.type || undefined)
    if (id === requestId) items.value = result
  } catch (error) {
    if (id === requestId && errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the approvals. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(() => JSON.stringify(filters.value), load, { immediate: true })

const actions = useApprovalActions(load)

const target = (item: ApprovalItem): ApprovalTarget => ({
  type: item.type,
  id: item.id,
  label: item.reference ?? `${item.kind} of ${toDisplayDate(item.date)}`,
})

const total = computed(() => (items.value ?? []).reduce((sum, item) => sum + item.amount, 0))

function openLink(item: ApprovalItem) {
  return item.type === 'party-transactions'
    ? { name: PAGES[item.type], params: { id: item.party_id } }
    : { name: PAGES[item.type], query: { q: item.reference } }
}

const tabs = computed(() =>
  isApprover.value
    ? ([
        { status: 'pending', label: 'Waiting for approval' },
        { status: 'rejected', label: 'Returned' },
      ] as const)
    : ([
        { status: 'rejected', label: 'Returned to me' },
        { status: 'pending', label: 'Waiting for approval' },
      ] as const),
)

const pageTitle = computed(() => (isApprover.value ? 'Approvals' : 'My entries'))
watch(pageTitle, (title) => (document.title = staffTitle(title)), { immediate: true })

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div>
      <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-muted">
        <template v-if="isApprover">
          Entries count in the cash book and ledgers only after approval. You can't approve an entry
          you prepared or edited.
        </template>
        <template v-else>
          The entries you prepared. Fix the ones returned to you and save them again; the accounts &
          finance head approves them.
        </template>
      </p>
    </div>

    <div class="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div role="tablist" aria-label="Approval status" class="flex gap-2">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.status"
          role="tab"
          :to="{ query: queryWith({ status: tab.status }) }"
          :aria-selected="filters.status === tab.status"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :class="
            filters.status === tab.status
              ? 'bg-primary-900 text-white'
              : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
          "
          :data-tab="tab.status"
        >
          {{ tab.label }}
        </RouterLink>
      </div>
      <div class="w-full sm:w-56">
        <label :for="typeId" class="block text-sm font-medium text-slate-700">Type</label>
        <select :id="typeId" v-model="type" :class="inputClass" data-type-filter>
          <option value="">All entries</option>
          <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
    </div>

    <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Entries" :aria-busy="isLoading">
      <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
        <p class="text-red-700">{{ loadError }}</p>
        <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
      </div>

      <div v-else-if="!items" class="animate-pulse space-y-3 py-4" data-skeleton>
        <div v-for="n in 5" :key="n" class="h-4 rounded bg-slate-200" />
        <span class="sr-only">Loading approvals…</span>
      </div>

      <p v-else-if="items.length === 0" class="py-12 text-center font-semibold text-ink" data-empty>
        {{
          filters.status === 'pending'
            ? 'Nothing is waiting for approval.'
            : isApprover
              ? 'No returned entries.'
              : 'Nothing was returned to you.'
        }}
      </p>

      <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
        <p class="mb-2 text-sm text-muted" data-summary>
          {{ items.length }} {{ items.length === 1 ? 'entry' : 'entries' }} · ৳
          {{ formatMoney(total) }}
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead :class="TABLE_HEAD">
              <tr>
                <th scope="col" :class="TABLE_TH">Date</th>
                <th scope="col" :class="TABLE_TH">Entry</th>
                <th scope="col" :class="TABLE_TH">Details</th>
                <th scope="col" :class="TABLE_TH">Prepared by</th>
                <th scope="col" :class="[TABLE_TH, 'text-right']">Amount</th>
                <th scope="col" :class="TABLE_TH">Status</th>
                <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr
                v-for="item in items"
                :key="`${item.type}-${item.id}`"
                class="align-top"
                :data-item="`${item.type}-${item.id}`"
              >
                <td :class="[TABLE_TD, 'whitespace-nowrap']">{{ toDisplayDate(item.date) }}</td>
                <td :class="TABLE_TD">
                  <span class="font-semibold">{{ item.kind }}</span>
                  <RouterLink
                    :to="openLink(item)"
                    class="block font-mono text-xs text-primary-800 underline-offset-4 hover:underline"
                  >
                    {{ item.reference ?? 'Open ledger' }}
                  </RouterLink>
                </td>
                <td :class="TABLE_TD">
                  <span class="font-medium">{{ item.title }}</span>
                  <span class="block text-xs text-muted">{{ item.detail }}</span>
                  <span v-if="item.note" class="block text-xs text-muted">{{ item.note }}</span>
                </td>
                <td :class="TABLE_TD">
                  {{ item.prepared_by ?? '—' }}
                  <span
                    v-if="item.updated_by && item.updated_by !== item.prepared_by"
                    class="block text-xs text-muted"
                  >
                    edited by {{ item.updated_by }}
                  </span>
                </td>
                <td
                  :class="[TABLE_TD, 'text-right font-semibold whitespace-nowrap tabular-nums']"
                  :data-direction="item.direction"
                >
                  <span
                    :class="
                      item.direction === 'in'
                        ? 'text-green-800'
                        : item.direction === 'out'
                          ? 'text-red-800'
                          : ''
                    "
                  >
                    {{ item.direction === 'in' ? '+' : item.direction === 'out' ? '−' : '' }}
                    {{ formatMoney(item.amount) }}
                  </span>
                </td>
                <td :class="TABLE_TD">
                  <ApprovalBadge
                    :status="item.status"
                    :label="item.status_label"
                    :reason="item.return_reason"
                    :by="item.returned_by"
                  />
                </td>
                <td class="py-3">
                  <div class="flex flex-wrap justify-end gap-1">
                    <button
                      v-if="item.can.approve"
                      type="button"
                      :class="[actionClass, 'text-green-800 hover:bg-green-50']"
                      :disabled="actions.isBusy(target(item))"
                      data-approve
                      @click="actions.approve(target(item))"
                    >
                      Approve
                    </button>
                    <span
                      v-else-if="isApprover && item.status === 'pending' && item.approve_denied"
                      class="max-w-40 px-2 py-1.5 text-xs text-muted"
                      data-approve-denied
                    >
                      {{ item.approve_denied }}
                    </span>
                    <button
                      v-if="item.can.send_back"
                      type="button"
                      :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                      data-return
                      @click="actions.askReturn(target(item))"
                    >
                      Return
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <ReturnReasonDialog
      v-model:open="actions.returnOpen.value"
      :title="`Return ${actions.returnTarget.value?.label ?? ''}`"
      :busy="actions.returnBusy.value"
      :error="actions.returnError.value"
      @confirm="actions.confirmReturn"
    >
      <p class="text-sm text-muted">
        It goes back to the person who prepared it, who can fix it and send it again.
      </p>
    </ReturnReasonDialog>
  </div>
</template>
