<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PerPageSelect from '@/components/PerPageSelect.vue'
import ReturnReasonDialog from '@/components/accounts/ReturnReasonDialog.vue'
import {
  approveAgentAssignment,
  approveReference,
  bulkApproveAgentAssignments,
  downloadAgentApprovalsCsv,
  listAgentApprovals,
  listPendingReferences,
  type PendingReference,
  returnAgentAssignment,
} from '@/api/agents'
import { useAgentBadges } from '@/composables/useAgentBadges'
import { usePerPage } from '@/composables/usePerPage'
import { useToast } from '@/composables/useToast'
import { BUCKET_LABELS } from '@/lib/agents'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { AgentAssignment, AssignmentStatus } from '@/types/agents'

/**
 * Agent Approvals (the Operations Head): recruitment agent assignments and changes sent by data
 * entry. Approve one, several, or return one for correction with a reason. Nobody approves
 * an assignment they made. The Approved and Returned tabs show what was decided.
 */
const toast = useToast()
const badges = useAgentBadges()

const TABS: { key: AssignmentStatus; label: string }[] = [
  { key: 'pending', label: 'Waiting for approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'returned', label: 'Returned' },
]
const route = useRoute()
const router = useRouter()

/** The open tab and page live in the address (?tab=approved&page=2). */
const tab = computed<AssignmentStatus>(() => {
  const value = route.query.tab
  return TABS.some((t) => t.key === value) ? (value as AssignmentStatus) : 'pending'
})
const page = computed(() => {
  const n = Number(route.query.page)
  return Number.isInteger(n) && n > 1 ? n : 1
})

function setTab(key: AssignmentStatus) {
  router.replace({ query: key === 'pending' ? {} : { tab: key } })
}

/* ---------- Reference-wise (Waiting for approval) ---------- */

/** ?reference=<id>: only that reference's passports (Waiting for approval tab). */
const referenceId = computed(() => {
  const n = Number(route.query.reference)
  return tab.value === 'pending' && Number.isInteger(n) && n > 0 ? n : null
})
const references = shallowRef<PendingReference[]>([])

async function loadReferences() {
  try {
    references.value = await listPendingReferences()
  } catch {
    references.value = []
  }
}

const currentReference = computed(
  () => references.value.find((r) => r.id === referenceId.value) ?? null,
)

function setReference(value: string) {
  const n = Number(value)
  router.replace({ query: Number.isInteger(n) && n > 0 ? { reference: String(n) } : {} })
}

const approveReferenceBusy = ref(false)

async function approveAllOfReference() {
  const ref_ = currentReference.value
  if (!ref_?.id || approveReferenceBusy.value) return
  approveReferenceBusy.value = true
  try {
    const result = await approveReference(ref_.id)
    toast.success(
      `${ref_.name}: ${result.updated.length} approved${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.`,
    )
    if (result.skipped.length)
      toast.error(result.skipped.map((s) => `${s.passport_number}: ${s.reason}`).join(' · '))
    router.replace({ query: {} })
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not approve. Please try again.'))
  } finally {
    approveReferenceBusy.value = false
  }
}

const pageLink = (n: number) => ({
  query: { ...route.query, page: n > 1 ? String(n) : undefined },
})

const list = shallowRef<Paginated<AgentAssignment> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const selected = ref<Set<number>>(new Set())

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    list.value = await listAgentApprovals({
      status: tab.value,
      reference_id: referenceId.value ?? undefined,
      page: page.value,
      per_page: perPage.value,
    })
    if (tab.value === 'pending') loadReferences()
    selected.value = new Set()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the agent approvals.')
  } finally {
    isLoading.value = false
  }
  badges.refresh()
}
const perPage = usePerPage(() => load())
watch([tab, page, referenceId], load, { immediate: true })

const approvable = computed(() => list.value?.data.filter((row) => row.can.approve) ?? [])
const allSelected = computed(
  () => approvable.value.length > 0 && approvable.value.every((row) => selected.value.has(row.id)),
)

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(approvable.value.map((r) => r.id))
}

const busyId = ref<number | null>(null)
const bulkBusy = ref(false)

async function approve(row: AgentAssignment) {
  busyId.value = row.id
  try {
    await approveAgentAssignment(row.id)
    toast.success(`${row.passport?.passport_number}: ${row.agent?.name} approved.`)
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not approve. Please try again.'))
  } finally {
    busyId.value = null
  }
}

async function approveSelected() {
  if (!selected.value.size) return
  bulkBusy.value = true
  try {
    const result = await bulkApproveAgentAssignments([...selected.value])
    toast.success(
      `${result.updated.length} approved${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.`,
    )
    if (result.skipped.length)
      toast.error(result.skipped.map((s) => `${s.passport_number}: ${s.reason}`).join(' · '))
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not approve. Please try again.'))
  } finally {
    bulkBusy.value = false
  }
}

const returnTarget = ref<AgentAssignment | null>(null)
const returnOpen = ref(false)
const returnBusy = ref(false)
const returnError = ref<string | null>(null)

function askReturn(row: AgentAssignment) {
  returnTarget.value = row
  returnError.value = null
  returnOpen.value = true
}

async function confirmReturn(reason: string) {
  const row = returnTarget.value
  if (!row) return
  returnBusy.value = true
  returnError.value = null
  try {
    await returnAgentAssignment(row.id, reason)
    returnOpen.value = false
    toast.success(`${row.passport?.passport_number}: returned to data entry for correction.`)
    load()
  } catch (error) {
    if (errorStatus(error) !== 401)
      returnError.value = errorMessage(error, 'Could not return it. Please try again.')
  } finally {
    returnBusy.value = false
  }
}

/* ---------- Export the tab as CSV ---------- */

const isExporting = ref(false)

async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const fileName = await downloadAgentApprovalsCsv(tab.value, referenceId.value ?? undefined)
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

const tabClass = (active: boolean) =>
  active
    ? 'bg-primary-900 text-white'
    : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Recruitment Agent Approvals</h1>
    <p class="mt-1 text-sm text-muted">
      Recruitment agents assigned by data entry. A passport needs its agent approved before the
      medical slip.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Agent approvals">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            role="tab"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="tabClass(tab === t.key)"
            :aria-selected="tab === t.key"
            :data-tab="t.key"
            @click="setTab(t.key)"
          >
            {{ t.label }}
            <span v-if="t.key === 'pending' && badges.approvals.value" class="ml-1 tabular-nums"
              >({{ badges.approvals.value }})</span
            >
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-white text-sm"
            :disabled="isExporting || !list || list.data.length === 0"
            data-export
            @click="exportCsv"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
            </svg>
            {{ isExporting ? 'Exporting…' : 'Export CSV' }}
          </button>
          <button
            v-if="tab === 'pending' && approvable.length"
            type="button"
            class="btn btn-primary text-sm"
            :disabled="!selected.size || bulkBusy"
            data-bulk-approve
            @click="approveSelected"
          >
            {{ bulkBusy ? 'Approving…' : `Approve ticked (${selected.size})` }}
          </button>
        </div>
      </div>

      <!-- Waiting for approval: one reference at a time, and approve all of it -->
      <div
        v-if="tab === 'pending' && references.length"
        class="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-surface p-3"
        data-reference-filter
      >
        <div class="w-full sm:w-80">
          <label for="approvals-reference" class="block text-sm font-medium text-slate-700"
            >Reference</label
          >
          <select
            id="approvals-reference"
            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            :value="referenceId ?? ''"
            @change="setReference(($event.target as HTMLSelectElement).value)"
          >
            <option value="">All references ({{ badges.approvals.value }})</option>
            <option
              v-for="r in references"
              :key="r.id ?? 'none'"
              :value="r.id ?? ''"
              :disabled="r.id === null"
            >
              {{ r.name }} ({{ r.pending }})
            </option>
          </select>
        </div>
        <button
          v-if="currentReference"
          type="button"
          class="btn btn-primary text-sm"
          :disabled="approveReferenceBusy"
          data-approve-reference
          @click="approveAllOfReference"
        >
          {{
            approveReferenceBusy
              ? 'Approving…'
              : `Approve all of ${currentReference.name} (${currentReference.pending})`
          }}
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>
        <p v-else-if="!list" class="py-8 text-center text-muted">Loading…</p>
        <p
          v-else-if="list.data.length === 0"
          class="py-12 text-center font-semibold text-ink"
          data-empty
        >
          {{ tab === 'pending' ? 'Nothing is waiting for approval.' : 'Nothing here yet.' }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
              <tr>
                <th v-if="tab === 'pending'" scope="col" class="w-10 py-3 pr-2">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    aria-label="Tick all"
                    @change="toggleAll"
                  />
                </th>
                <th scope="col" class="py-3 pr-4 font-semibold">Passport</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Agent</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Date</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Remark / reason</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Assigned by</th>
                <th scope="col" class="py-3 pr-4 font-semibold">Stage</th>
                <th scope="col" class="py-3 font-semibold">
                  {{ tab === 'pending' ? '' : tab === 'approved' ? 'Approved by' : 'Returned' }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr
                v-for="row in list.data"
                :key="row.id"
                class="align-top"
                :data-assignment="row.id"
              >
                <td v-if="tab === 'pending'" class="py-3 pr-2">
                  <input
                    v-if="row.can.approve"
                    type="checkbox"
                    :checked="selected.has(row.id)"
                    :aria-label="`Tick ${row.passport?.passport_number}`"
                    @change="toggle(row.id)"
                  />
                </td>
                <td class="py-3 pr-4">
                  <RouterLink
                    v-if="row.passport"
                    :to="{ name: 'passport-detail', params: { id: row.passport.id } }"
                    class="font-semibold text-primary-900 hover:underline"
                    >{{ row.passport.passport_name }}</RouterLink
                  >
                  <span class="block font-mono text-xs text-slate-600">{{
                    row.passport?.passport_number
                  }}</span>
                </td>
                <td class="py-3 pr-4">
                  <span class="font-medium text-ink">{{ row.agent?.name }}</span>
                  <span class="block text-xs text-muted"
                    >{{ row.agent?.code }} · RL {{ row.agent?.rl_number }}</span
                  >
                  <span v-if="row.current_agent" class="mt-1 block text-xs text-amber-800">
                    Change from {{ row.current_agent.name }}
                  </span>
                </td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ toDisplayDate(row.assigned_date) }}</td>
                <td class="py-3 pr-4 break-words">{{ row.remark || '—' }}</td>
                <td class="py-3 pr-4">{{ row.assigned_by?.name ?? '—' }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  {{ row.passport ? BUCKET_LABELS[row.passport.bucket] : '—' }}
                </td>
                <td class="py-3">
                  <div v-if="tab === 'pending'" class="flex flex-wrap justify-end gap-1">
                    <template v-if="row.can.approve">
                      <button
                        type="button"
                        :class="[actionClass, 'text-green-800']"
                        :disabled="busyId === row.id"
                        data-approve
                        @click="approve(row)"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-return
                        @click="askReturn(row)"
                      >
                        Return for correction
                      </button>
                    </template>
                    <span v-else class="text-xs text-muted">You made this one</span>
                  </div>
                  <template v-else-if="tab === 'approved'">{{
                    row.approved_by?.name ?? '—'
                  }}</template>
                  <template v-else>
                    {{ row.returned_by?.name ?? '—' }}
                    <span class="block text-xs text-red-700">{{ row.return_reason }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav
          v-if="list && list.data.length"
          aria-label="Pagination"
          class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          data-pager
        >
          <div class="flex flex-wrap items-center justify-center gap-4">
            <p class="text-sm text-muted">
              Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
            </p>
            <PerPageSelect />
          </div>
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
    </section>

    <ReturnReasonDialog
      v-model:open="returnOpen"
      title="Return for correction"
      :busy="returnBusy"
      :error="returnError"
      @confirm="confirmReturn"
    >
      <p v-if="returnTarget" class="text-sm">
        {{ returnTarget.passport?.passport_number }} →
        <strong>{{ returnTarget.agent?.name }}</strong
        >. Data entry sees the reason and sends a corrected one.
      </p>
    </ReturnReasonDialog>
  </div>
</template>
