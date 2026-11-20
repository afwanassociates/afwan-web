<script setup lang="ts">
import AgentFilterBar from '@/components/agents/AgentFilterBar.vue'
import { usePerPage } from '@/composables/usePerPage'
import PerPageSelect from '@/components/PerPageSelect.vue'
import { computed, onMounted, ref, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ArrowIcon from '@/components/ArrowIcon.vue'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import PassportTable from '@/components/PassportTable.vue'
import ReturnPassportDialog from '@/components/ReturnPassportDialog.vue'
import AssignAgentDialog from '@/components/agents/AssignAgentDialog.vue'
import BulkAssignAgentDialog from '@/components/agents/BulkAssignAgentDialog.vue'
import { AGENT_ASSIGNER_ROLES } from '@/lib/agents'
import { fetchAgentTabCounts, type AgentTabCounts } from '@/api/agents'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import { listPassports } from '@/api/passports'
import { useDebounce } from '@/composables/useDebounce'
import { errorMessage, errorStatus } from '@/lib/errors'
import { referenceSubtitle, searchReferenceOptions } from '@/lib/referenceOptions'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { Paginated } from '@/types/auth'
import type { CompanySummary, PassportEntry, ReferenceSummary } from '@/types/passport'
import { usePageHeading } from '@/composables/usePageHeading'

/** Rows per page (the dropdown by the pagination): reload from page 1 when it changes. */
const perPage = usePerPage(() => load())

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workflow = useWorkflowStore()

usePageHeading(() => ({
  title: 'Passport Entry List',
  subtitle: 'Passports entered, waiting for their medical slip.',
}))
workflow.load()

const searchId = useId()

/**
 * This page lists only passports at the "Passport entered" stage: no medical slip date yet
 * (and so not unfit). Adding the medical slip moves a passport on to Medical → Pending.
 */
const STAGE = 'passport'

/* ---------- Filters, kept in the URL query ---------- */

/** Query keys of older versions of this page; ignored and dropped from the URL. */
const OLD_KEYS = [
  'reference_type',
  // The old reference text search (now Filter by reference, ?reference_id=).
  'reference',
  'reference_name',
  'company_name',
  'company_country_code',
  'company',
  'stage',
]

interface Filters {
  /** Name or passport number */
  q: string
  /** Selected reference ID (Filter by reference) */
  reference_id: number | null
  /** Selected company ID */
  company_id: number | null
  /** YYYY-MM-DD: received date range start */
  received_from: string
  /** YYYY-MM-DD: received date range end */
  received_to: string
  /** none: passports without an approved recruitment agent · approved: one agent's passports */
  tab: AgentTab
  /** The agent shown on the Ready for Medical tab. */
  agent: number | null
  page: number
}

type AgentTab = 'none' | 'approved'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const positiveInt = (value: unknown) => {
  const n = Number(text(value))
  return Number.isInteger(n) && n > 0 ? n : null
}

const filters = computed<Filters>(() => ({
  q: text(route.query.q).trim(),
  reference_id: positiveInt(route.query.reference_id),
  company_id: positiveInt(route.query.company_id),
  received_from: text(route.query.received_from).trim(),
  received_to: text(route.query.received_to).trim(),
  tab: route.query.tab === 'approved' ? 'approved' : 'none',
  agent: route.query.tab === 'approved' ? positiveInt(route.query.agent) : null,
  page: positiveInt(route.query.page) ?? 1,
}))

const hasFilters = computed(() =>
  Boolean(
    filters.value.q ||
    filters.value.reference_id ||
    filters.value.company_id ||
    filters.value.received_from ||
    filters.value.received_to,
  ),
)

/** Builds the URL query from the current filters plus `changes`. Changing a search resets the page. */
function queryWith(changes: Partial<Filters>): LocationQuery {
  const next = { ...filters.value, page: 1, ...changes }
  const query: LocationQuery = {}
  if (next.q) query.q = next.q
  if (next.reference_id) query.reference_id = String(next.reference_id)
  if (next.company_id) query.company_id = String(next.company_id)
  if (next.received_from) query.received_from = next.received_from
  if (next.received_to) query.received_to = next.received_to
  if (next.tab === 'approved') {
    query.tab = 'approved'
    if (next.agent) query.agent = String(next.agent)
  }
  if (next.page > 1) query.page = String(next.page)
  return query
}

// The searches: debounced, and `replace` so typing does not flood the browser history.
const search = ref(filters.value.q)
const selectedReference = ref<ReferenceSummary | null>(null)
const selectedCompany = ref<CompanySummary | null>(null)
const receivedFrom = ref(filters.value.received_from)
const receivedTo = ref(filters.value.received_to)
const receivedFromId = useId()
const receivedToId = useId()

/**
 * Puts all text searches in the URL at once.
 */
function applySearches() {
  router.replace({
    query: queryWith({
      q: search.value.trim(),
      received_from: receivedFrom.value,
      received_to: receivedTo.value,
    }),
  })
}

const debouncedSearch = useDebounce(applySearches, 300)
/** With a company chosen, only references that have passports of that company. */
const fetchReferences = (query: string) =>
  searchReferenceOptions(query, true, filters.value.company_id ?? undefined)

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  router.replace({ query: queryWith({ reference_id: value?.id ?? null }) })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  router.replace({ query: queryWith({ company_id: value?.id ?? null }) })
}

// Back / forward: show what the URL says.
watch(filters, (f) => {
  if (f.q !== search.value.trim()) search.value = f.q
  if (!f.reference_id && selectedReference.value) selectedReference.value = null
  if (!f.company_id && selectedCompany.value) selectedCompany.value = null
  if (f.received_from !== receivedFrom.value) receivedFrom.value = f.received_from
  if (f.received_to !== receivedTo.value) receivedTo.value = f.received_to
})

function clearFilters() {
  search.value = ''
  selectedReference.value = null
  selectedCompany.value = null
  receivedFrom.value = ''
  receivedTo.value = ''
  debouncedSearch.cancel()
  // The tab and the agent stay: only the searches are cleared.
  const { tab, agent } = filters.value
  router.push({
    query: queryWith({
      q: '',
      reference_id: null,
      company_id: null,
      received_from: '',
      received_to: '',
      tab,
      agent,
    }),
  })
}

/* ---------- Tabs: Waiting for Agent / Ready for Medical (one agent at a time) ---------- */

const counts = ref<AgentTabCounts | null>(null)
let countsRequest = 0

async function loadCounts(): Promise<AgentTabCounts | null> {
  const id = ++countsRequest
  try {
    const result = await fetchAgentTabCounts(STAGE)
    if (id === countsRequest) counts.value = result
    return result
  } catch {
    // The counts just stay as they were (the list still loads).
    return null
  }
}

function setTab(tab: AgentTab) {
  if (filters.value.tab === tab) return
  router.push({ query: queryWith({ tab, agent: null }) })
}

/** The Ready for Medical tab's agent dropdown: null (all agents) or an agent id. */
const agentFilter = computed({
  get: () => filters.value.agent,
  set: (agent: number | 'none' | null) => {
    router.replace({
      query: queryWith({ tab: 'approved', agent: typeof agent === 'number' ? agent : null }),
    })
  },
})

/** The dropdown's counts: approved passports only (no "No agent" on this tab). */
const approvedCounts = computed(() => (counts.value ? { ...counts.value, none: 0 } : null))

/** The agent shown on the Ready for Medical tab (from the counts, with its name). */
const currentAgent = computed(
  () => counts.value?.agents.find((a) => a.id === filters.value.agent) ?? null,
)

onMounted(() => {
  if (OLD_KEYS.some((key) => key in route.query)) router.replace({ query: queryWith({}) })
})

/* ---------- Loading ---------- */

/**
 * A search with no result here may match a passport in the Unfit list (they are left out
 * of this list), so we check and say so.
 */
const unfitMatches = ref(0)

async function checkUnfitMatches(q: string, id: number) {
  try {
    const unfit = await listPassports({ q, medical_status: 'unfit', per_page: 1 })
    if (id === requestId) unfitMatches.value = unfit.meta.total
  } catch {
    // Only a hint: ignore failures.
  }
}

const list = ref<Paginated<PassportEntry> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const f = filters.value
  isLoading.value = true
  loadError.value = null
  loadCounts()
  try {
    const result = await listPassports({
      q: f.q || undefined,
      reference_id: f.reference_id ?? undefined,
      company_id: f.company_id ?? undefined,
      received_from: f.received_from || undefined,
      received_to: f.received_to || undefined,
      stage: STAGE,
      // Ready for Medical: every approved passport, or one agent's; Waiting for Agent: none.
      ...(f.tab === 'approved'
        ? f.agent
          ? { recruitment_agent_id: f.agent }
          : { agent_status: 'approved' as const }
        : { recruitment_agent_id: 'none' as const }),
      page: f.page,
      per_page: perPage.value,
    })
    if (id !== requestId) return
    const { current_page, last_page } = result.meta
    // The page no longer exists (e.g. after deleting its last entry): go to the last one.
    if (result.data.length === 0 && current_page > last_page && last_page >= 1) {
      router.replace({ query: queryWith({ ...f, page: last_page }) })
      return
    }
    list.value = result
    unfitMatches.value = 0
    if (result.data.length === 0 && f.q) checkUnfitMatches(f.q, id)
  } catch (error) {
    if (id !== requestId) return
    if (errorStatus(error) !== 401) {
      loadError.value = errorMessage(error, 'Could not load passport entries. Please try again.')
    }
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => route.query,
  () => {
    if (route.name === 'passports') load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ page }) })

/* ---------- Medical slip ---------- */

/** data_entry, admin and super_admin (everyone who can open this page) may add a slip. */
const slipOpen = ref(false)
const slipPassport = ref<PassportEntry | null>(null)

function openSlip(entry: PassportEntry) {
  slipPassport.value = entry
  slipOpen.value = true
}

/** The passport moved on to Medical → Pending: it leaves this list. Refresh list and counts. */
function afterSlip() {
  load()
  workflow.refresh()
}

// Everything here is "Passport entered": "Add medical slip" once the recruitment agent is approved
// (older API versions send no agent_status: no check then).
const slipAction = (entry: PassportEntry) =>
  entry.medical_status === 'not_started' &&
  (!entry.agent_status || entry.agent_status === 'approved')
    ? 'Add medical slip'
    : null

/* ---------- recruitment agent (data entry assigns, the Operations Head approves) ---------- */

const canAssignAgents = computed(() =>
  Boolean(auth.user && AGENT_ASSIGNER_ROLES.includes(auth.user.role)),
)
const agentAction = (entry: PassportEntry) =>
  entry.can.assign_agent && (entry.agent_status === 'none' || entry.agent_status === 'returned')
    ? entry.agent_status === 'returned'
      ? 'Correct agent'
      : 'Assign agent'
    : null

const agentOpen = ref(false)
const agentPassport = ref<PassportEntry | null>(null)
const bulkAgentOpen = ref(false)

function openAgent(entry: PassportEntry) {
  agentPassport.value = entry
  agentOpen.value = true
}

const rowActionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50'

/* ---------- Return (the operations head) ---------- */

const returnTarget = ref<PassportEntry | null>(null)
const returnOpen = ref(false)

function askReturn(entry: PassportEntry) {
  returnTarget.value = entry
  returnOpen.value = true
}

function afterReturn() {
  load()
  workflow.refresh()
}

const TABS: { key: AgentTab; label: string }[] = [
  { key: 'none', label: 'Waiting for Agent' },
  { key: 'approved', label: 'Ready for Medical' },
]
const tabClass = (active: boolean) =>
  active
    ? 'bg-primary-900 text-white'
    : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <!-- The title and description show in the header bar; this heading is for screen readers. -->
      <h1 class="sr-only">Passport Entry List</h1>
      <RouterLink
        :to="{ name: 'all-passports' }"
        class="text-sm font-semibold text-primary-700 underline underline-offset-2"
        data-all-link
      >
        View all passports ({{ workflow.summary?.step1.total_all ?? '–' }})
      </RouterLink>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="canAssignAgents && filters.tab === 'none'"
          type="button"
          class="btn btn-primary"
          data-bulk-agent
          @click="bulkAgentOpen = true"
        >
          Assign agent to many
        </button>
        <RouterLink :to="{ name: 'passport-new' }" class="btn btn-accent btn-icon">
          Add passport <ArrowIcon />
        </RouterLink>
      </div>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-labelledby="passport-list-heading">
      <h2 id="passport-list-heading" class="sr-only">Passport entries</h2>

      <!-- Tabs: passports without an approved agent, and agent by agent -->
      <div class="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Recruitment agent">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :class="tabClass(filters.tab === t.key)"
          :aria-selected="filters.tab === t.key"
          :data-tab="t.key"
          @click="setTab(t.key)"
        >
          {{ t.label }}
          <span v-if="counts" class="ml-1 tabular-nums" data-tab-count>({{ counts[t.key] }})</span>
        </button>
      </div>

      <!-- Ready for Medical: the agent cards (all agents, or one) -->
      <AgentFilterBar
        v-if="filters.tab === 'approved'"
        v-model="agentFilter"
        :counts="approvedCounts"
        class="mb-5"
      />

      <!-- Search and filters -->
      <div role="search" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
            <input
              :id="searchId"
              v-model="search"
              type="search"
              autocomplete="off"
              placeholder="Name or passport number"
              :class="inputClass"
              data-search
              @input="debouncedSearch.run()"
            />
          </div>
          <SearchSelect
            :model-value="selectedReference"
            :fetch="fetchReferences"
            :subtitle-of="referenceSubtitle"
            label="Filter by reference"
            placeholder="Search reference…"
            none-label="All references"
            clearable
            data-reference-filter
            @update:model-value="onReferenceSelected"
          />
          <SearchSelect
            :model-value="selectedCompany"
            :fetch="searchCompanies"
            label="Filter by company"
            placeholder="Search company…"
            none-label="All companies"
            clearable
            data-company-filter
            @update:model-value="onCompanySelected"
          />
        </div>

        <!-- Received date range -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label :for="receivedFromId" class="block text-sm font-medium text-slate-700">
              Received from
            </label>
            <input
              :id="receivedFromId"
              v-model="receivedFrom"
              type="date"
              :max="receivedTo || undefined"
              :class="inputClass"
              data-received-from
              @change="applySearches"
            />
          </div>
          <div>
            <label :for="receivedToId" class="block text-sm font-medium text-slate-700">
              Received to
            </label>
            <input
              :id="receivedToId"
              v-model="receivedTo"
              type="date"
              :min="receivedFrom || undefined"
              :class="inputClass"
              data-received-to
              @change="applySearches"
            />
          </div>
        </div>

        <button
          v-if="hasFilters"
          type="button"
          class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          @click="clearFilters"
        >
          Clear searches
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <!-- Error -->
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <!-- First load: skeleton -->
        <div v-else-if="!list" class="animate-pulse space-y-3 py-4" aria-label="Loading passports">
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
            <div class="hidden h-4 w-1/5 rounded bg-slate-200 md:block" />
            <div class="hidden h-4 w-1/12 rounded bg-slate-200 md:block" />
          </div>
          <span class="sr-only">Loading passport entries…</span>
        </div>

        <!-- Empty -->
        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{
              hasFilters
                ? 'No passports match these searches.'
                : filters.tab === 'none'
                  ? 'Every passport here has an approved agent.'
                  : currentAgent
                    ? `No passports of ${currentAgent.name} are waiting for a medical slip.`
                    : 'No passport has an approved recruitment agent yet.'
            }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{
              hasFilters
                ? 'Check the name or passport number, reference, company and received date searches, or clear them.'
                : filters.tab === 'none'
                  ? 'New passports appear here until the Operations Head approves their recruitment agent.'
                  : 'Passports appear here once their agent is approved, until their medical slip is added.'
            }}
          </p>
          <p
            v-if="unfitMatches > 0"
            class="mx-auto mt-3 max-w-md rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-900"
            data-unfit-hint
          >
            Not found here. Check
            <RouterLink
              :to="{ name: 'medical', query: { tab: 'unfit', q: filters.q } }"
              class="font-semibold underline underline-offset-2"
              >Medical → Unfit</RouterLink
            >.
          </p>
          <button
            v-if="hasFilters"
            type="button"
            class="btn btn-white mt-5 text-sm"
            @click="clearFilters"
          >
            Clear searches
          </button>
          <RouterLink v-else :to="{ name: 'passport-new' }" class="btn btn-accent mt-5 text-sm">
            Add passport
          </RouterLink>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <PassportTable
            :entries="list.data"
            :current-user-id="auth.user?.id ?? null"
            :columns="
              filters.tab === 'none'
                ? ['reference', 'company', 'received', 'recruitment_agent', 'entered_by']
                : ['reference', 'company', 'received', 'entered_by']
            "
            split-name-number
            show-entry-no
            @return="askReturn"
          >
            <template #extra-actions="{ entry }">
              <button
                v-if="agentAction(entry)"
                type="button"
                :class="[rowActionClass, 'bg-accent-100 text-primary-900 hover:bg-accent-200']"
                :data-agent-action="entry.id"
                @click="openAgent(entry)"
              >
                {{ agentAction(entry)
                }}<span class="sr-only"> for passport {{ entry.passport_number }}</span>
              </button>
              <button
                v-if="slipAction(entry)"
                type="button"
                :class="[
                  rowActionClass,
                  entry.medical_status === 'not_started'
                    ? 'bg-accent-100 text-primary-900 hover:bg-accent-200'
                    : 'text-primary-700',
                ]"
                :data-slip-action="entry.id"
                @click="openSlip(entry)"
              >
                {{ slipAction(entry)
                }}<span class="sr-only"> for passport {{ entry.passport_number }}</span>
              </button>
            </template>
          </PassportTable>

          <nav
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <div class="flex flex-wrap items-center justify-center gap-4">
              <p class="text-sm text-muted">
                Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
              </p>
              <PerPageSelect />
            </div>
            <div class="flex items-center gap-2">
              <RouterLink
                v-if="list.meta.current_page > 1"
                :to="pageLink(list.meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="px-2 text-sm text-muted" aria-current="page">
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

    <MedicalSlipModal
      v-model:open="slipOpen"
      :passport="slipPassport"
      success-message="Moved to Medical Pending"
      @saved="afterSlip"
    />

    <AssignAgentDialog v-model:open="agentOpen" :passport="agentPassport" @saved="load" />
    <BulkAssignAgentDialog v-model:open="bulkAgentOpen" @saved="load" />

    <ReturnPassportDialog
      v-model:open="returnOpen"
      :passport="returnTarget"
      @returned="afterReturn"
    />
  </div>
</template>
