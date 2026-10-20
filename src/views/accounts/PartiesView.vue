<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PartyFormDialog from '@/components/accounts/PartyFormDialog.vue'
import { deleteParty, listParties, updateParty } from '@/api/accounts'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { balanceClass, formatBalance, formatMoney } from '@/lib/accounts'
import { errorMessage, errorStatus } from '@/lib/errors'
import { ADMIN_ROLES } from '@/lib/roles'
import { TABLE_HEAD, TABLE_TD, TABLE_TH } from '@/lib/tableClasses'
import { useAuthStore } from '@/stores/auth'
import type { Paginated } from '@/types/auth'
import type { Party, PartyType } from '@/types/accounts'

/**
 * Accounts › Parties: clients and owners in two tabs, with search, an active filter, the
 * ledger totals (receivable, payment, refund, closing balance) and create / edit /
 * (de)activate. Admins may also delete a party that has no transactions.
 */
const PER_PAGE = 15

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const canDelete = computed(() => !!auth.user && ADMIN_ROLES.includes(auth.user.role))

const searchId = useId()
const statusId = useId()

type StatusFilter = '' | 'active' | 'inactive'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const query = computed(() => {
  const status = text(route.query.status)
  const page = Number(text(route.query.page))
  return {
    type: (text(route.query.type) === 'owner' ? 'owner' : 'client') as PartyType,
    q: text(route.query.q).trim(),
    status: (status === 'active' || status === 'inactive' ? status : '') as StatusFilter,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
const hasFilters = computed(() => Boolean(query.value.q || query.value.status))

function queryWith(
  changes: Partial<{ type: PartyType; q: string; status: StatusFilter; page: number }>,
) {
  const next = { ...query.value, page: 1, ...changes }
  const result: LocationQuery = {}
  if (next.type === 'owner') result.type = 'owner'
  if (next.q) result.q = next.q
  if (next.status) result.status = next.status
  if (next.page > 1) result.page = String(next.page)
  return result
}

const search = ref(query.value.q)
const debounced = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)

const status = computed({
  get: () => query.value.status,
  set: (value: StatusFilter) => router.replace({ query: queryWith({ status: value }) }),
})

function clearFilters() {
  search.value = ''
  debounced.cancel()
  router.replace({ query: queryWith({ q: '', status: '' }) })
}

const tabs = [
  { type: 'client', label: 'Parties / Clients' },
  { type: 'owner', label: 'Owners' },
] as const

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<Party> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const q = query.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listParties({
      type: q.type,
      q: q.q || undefined,
      is_active: q.status === 'active' ? 1 : q.status === 'inactive' ? 0 : undefined,
      page: q.page,
      per_page: PER_PAGE,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id === requestId && errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the parties. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(query.value),
  () => {
    if (search.value.trim() !== query.value.q) search.value = query.value.q
    load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...query.value, page }) })
const noun = computed(() => (query.value.type === 'owner' ? 'owner' : 'party'))

/* ---------- Create / edit ---------- */

const formOpen = ref(false)
const editing = ref<Party | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(party: Party) {
  editing.value = party
  formOpen.value = true
}

function onSaved(party: Party, created: boolean) {
  toast.success(created ? `${party.code} “${party.name}” created.` : `${party.code} saved.`)
  if (created && party.type !== query.value.type) {
    router.replace({ query: queryWith({ type: party.type, q: '', status: '' }) })
  } else load()
}

/* ---------- Activate / deactivate ---------- */

const busyId = ref<number | null>(null)

async function setActive(party: Party, active: boolean) {
  busyId.value = party.id
  try {
    await updateParty(party.id, { is_active: active })
    toast.success(active ? `${party.code} activated.` : `${party.code} deactivated.`)
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not change the party. Please try again.'))
  } finally {
    busyId.value = null
  }
}

/* ---------- Delete (admins) ---------- */

const deleteTarget = ref<Party | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)
/** The API refused: the party has transactions. Offer to deactivate instead. */
const deleteBlocked = ref(false)

function askDelete(party: Party) {
  deleteTarget.value = party
  deleteError.value = null
  deleteBlocked.value = false
  deleteOpen.value = true
}

async function confirmDelete() {
  const party = deleteTarget.value
  if (!party) return
  if (deleteBlocked.value) {
    deleteOpen.value = false
    await setActive(party, false)
    return
  }
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteParty(party.id)
    deleteOpen.value = false
    toast.success(`${party.code} “${party.name}” deleted.`)
    load()
  } catch (error) {
    const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code
    if (errorStatus(error) === 422 && code === 'party_has_transactions') {
      deleteBlocked.value = true
    } else if (errorStatus(error) === 404) {
      deleteOpen.value = false
      load()
    } else if (errorStatus(error) !== 401) {
      deleteError.value = errorMessage(error, 'Could not delete. Please try again.')
    }
  } finally {
    deleteBusy.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50 disabled:opacity-50'
const money = (value: number | undefined) => (value ? formatMoney(value) : '—')
/** Loans taken from the party, less what was repaid. */
const loanBalance = (p: Party) => (p.totals ? p.totals.loan - p.totals.loan_repayment : undefined)
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Parties</h1>
        <p class="mt-1 text-sm text-muted">
          Clients and owners with their balances. Open one to see its ledger.
        </p>
      </div>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New {{ noun }}
      </button>
    </div>

    <div role="tablist" aria-label="Party type" class="mt-6 flex gap-2">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.type"
        role="tab"
        :to="{ query: queryWith({ type: tab.type, q: '', status: '' }) }"
        :aria-selected="query.type === tab.type"
        class="rounded-full px-4 py-2 text-sm font-semibold"
        :class="
          query.type === tab.type
            ? 'bg-primary-900 text-white'
            : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
        "
        :data-tab="tab.type"
      >
        {{ tab.label }}
      </RouterLink>
    </div>

    <section class="glass-card mt-4 p-4 sm:p-6" aria-label="Parties">
      <div role="search" class="flex flex-wrap items-end gap-4">
        <div class="w-full sm:w-80">
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Name, ID, mobile or NID"
            :class="inputClass"
            data-search
            @input="debounced.run()"
          />
        </div>
        <div class="w-full sm:w-44">
          <label :for="statusId" class="block text-sm font-medium text-slate-700">Status</label>
          <select :id="statusId" v-model="status" :class="inputClass" data-status-filter>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
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
          <span class="sr-only">Loading parties…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{
              hasFilters
                ? 'Nothing matches these filters.'
                : `No ${noun === 'owner' ? 'owners' : 'parties'} yet.`
            }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New {{ noun }}
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead :class="TABLE_HEAD">
                <tr>
                  <th scope="col" :class="TABLE_TH">ID</th>
                  <th scope="col" :class="TABLE_TH">Name</th>
                  <th scope="col" :class="TABLE_TH">NID / Passport</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Opening</th>
                  <template v-if="query.type === 'client'">
                    <th scope="col" :class="[TABLE_TH, 'text-right']">Receivable</th>
                    <th scope="col" :class="[TABLE_TH, 'text-right']">Payment</th>
                    <th scope="col" :class="[TABLE_TH, 'text-right']">Refund</th>
                  </template>
                  <template v-else>
                    <th scope="col" :class="[TABLE_TH, 'text-right']">Capital</th>
                    <th scope="col" :class="[TABLE_TH, 'text-right']">Drawing</th>
                  </template>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Loan balance</th>
                  <th scope="col" :class="[TABLE_TH, 'text-right']">Closing balance</th>
                  <th scope="col" :class="TABLE_TH">Status</th>
                  <th scope="col" class="py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="p in list.data" :key="p.id" class="align-top" :data-party="p.id">
                  <td :class="[TABLE_TD, 'font-mono text-xs whitespace-nowrap']">{{ p.code }}</td>
                  <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                    <RouterLink
                      :to="{ name: 'accounts-party-ledger', params: { id: p.id } }"
                      class="text-primary-800 underline-offset-4 hover:underline"
                    >
                      {{ p.name }}
                    </RouterLink>
                    <span class="block text-xs font-normal text-muted">{{ p.mobile }}</span>
                  </th>
                  <td :class="TABLE_TD">
                    {{ p.nid_passport }}
                    <span v-if="p.tin_bin" class="block text-xs text-muted"
                      >TIN/BIN {{ p.tin_bin }}</span
                    >
                  </td>
                  <td :class="[TABLE_TD, 'text-right tabular-nums whitespace-nowrap']">
                    {{
                      formatBalance(
                        p.opening_balance_type === 'payable'
                          ? -p.opening_balance
                          : p.opening_balance,
                      )
                    }}
                  </td>
                  <template v-if="query.type === 'client'">
                    <td :class="[TABLE_TD, 'text-right tabular-nums']">
                      {{ money(p.totals?.receivable) }}
                    </td>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']">
                      {{ money(p.totals?.payment) }}
                    </td>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']">
                      {{ money(p.totals?.refund) }}
                    </td>
                  </template>
                  <template v-else>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']">
                      {{ money(p.totals?.capital) }}
                    </td>
                    <td :class="[TABLE_TD, 'text-right tabular-nums']">
                      {{ money(p.totals?.drawing) }}
                    </td>
                  </template>
                  <td :class="[TABLE_TD, 'text-right tabular-nums']" data-loan>
                    {{ money(loanBalance(p)) }}
                  </td>
                  <td
                    class="py-3 pr-4 text-right font-semibold whitespace-nowrap tabular-nums"
                    :class="balanceClass(p.totals?.closing_balance ?? 0)"
                    data-closing
                  >
                    {{ formatBalance(p.totals?.closing_balance ?? 0) }}
                  </td>
                  <td :class="TABLE_TD">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        p.is_active
                          ? 'bg-green-50 text-green-800 ring-green-300'
                          : 'bg-slate-100 text-slate-700 ring-slate-300'
                      "
                    >
                      {{ p.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="py-3">
                    <div class="flex flex-wrap justify-end gap-1">
                      <RouterLink
                        :to="{ name: 'accounts-party-ledger', params: { id: p.id } }"
                        :class="[actionClass, 'text-primary-700']"
                        data-ledger
                      >
                        Ledger<span class="sr-only"> {{ p.name }}</span>
                      </RouterLink>
                      <button
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(p)"
                      >
                        Edit<span class="sr-only"> {{ p.name }}</span>
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, p.is_active ? 'text-amber-800' : 'text-green-800']"
                        :disabled="busyId === p.id"
                        :data-toggle-active="p.is_active ? 'deactivate' : 'activate'"
                        @click="setActive(p, !p.is_active)"
                      >
                        {{ p.is_active ? 'Deactivate' : 'Activate'
                        }}<span class="sr-only"> {{ p.name }}</span>
                      </button>
                      <button
                        v-if="canDelete"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(p)"
                      >
                        Delete<span class="sr-only"> {{ p.name }}</span>
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

    <PartyFormDialog
      v-model:open="formOpen"
      :party="editing"
      :default-type="query.type"
      @saved="onSaved"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="deleteBlocked ? 'This party cannot be deleted' : 'Delete party'"
      :confirm-label="deleteBlocked ? 'Deactivate instead' : 'Delete'"
      :danger="!deleteBlocked"
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteBlocked && deleteTarget" data-delete-blocked>
        <strong>{{ deleteTarget.code }} {{ deleteTarget.name }}</strong> has transactions, so it
        can't be deleted. You can deactivate it instead: its ledger stays, but it can no longer be
        chosen for new receipts.
      </p>
      <p v-else-if="deleteTarget">
        Delete <strong>{{ deleteTarget.code }} {{ deleteTarget.name }}</strong
        >? This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
