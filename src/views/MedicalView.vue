<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportListFilters from '@/components/PassportListFilters.vue'
import PassportTable from '@/components/PassportTable.vue'
import RecordMedicalModal from '@/components/RecordMedicalModal.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import type { PassportColumn } from '@/lib/passportColumns'
import { usePassportList, type SortOption } from '@/composables/usePassportList'
import { isMedicalAdmin } from '@/lib/medical'
import { useAuthStore } from '@/stores/auth'
import { useWorkflowStore } from '@/stores/workflow'
import type { MedicalStatus } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

/** Step 2: Medical. One tab per medical status; tab and filters live in the URL. */
type TabKey = 'pending' | 'fit' | 'expiring_soon' | 'expired' | 'unfit'

interface Tab {
  key: TabKey
  label: string
  status: MedicalStatus
  columns: PassportColumn[]
  sorts: SortOption[]
  emptyTitle: string
}

const MEDICAL_COLUMNS: PassportColumn[] = [
  'country',
  'company',
  'medical_date',
  'valid_until',
  'days_left',
]

const TABS: Tab[] = [
  {
    key: 'pending',
    label: 'Pending medical',
    status: 'pending',
    columns: ['country', 'company', 'received', 'waiting'],
    sorts: [
      { value: 'passport_received_date:asc', label: 'Waiting longest first' },
      { value: 'passport_received_date:desc', label: 'Received most recently' },
    ],
    emptyTitle: 'No passports are waiting for a medical.',
  },
  {
    key: 'fit',
    label: 'Fit (valid)',
    status: 'fit',
    columns: MEDICAL_COLUMNS,
    sorts: [
      { value: 'valid_until:asc', label: 'Valid until (soonest first)' },
      { value: 'medical_date:desc', label: 'Medical date (newest first)' },
      { value: 'medical_date:asc', label: 'Medical date (oldest first)' },
    ],
    emptyTitle: 'No passports with a valid fit result.',
  },
  {
    key: 'expiring_soon',
    label: 'Expiring soon',
    status: 'expiring_soon',
    columns: MEDICAL_COLUMNS,
    sorts: [
      { value: 'valid_until:asc', label: 'Valid until (soonest first)' },
      { value: 'valid_until:desc', label: 'Valid until (latest first)' },
    ],
    emptyTitle: 'No fit results expire in the next 14 days.',
  },
  {
    key: 'expired',
    label: 'Expired',
    status: 'expired',
    columns: MEDICAL_COLUMNS,
    sorts: [
      { value: 'valid_until:desc', label: 'Expired most recently' },
      { value: 'valid_until:asc', label: 'Expired longest ago' },
    ],
    emptyTitle: 'No expired fit results.',
  },
  {
    // Unfit passports live only here: the Passport List leaves them out.
    key: 'unfit',
    label: 'Unfit',
    status: 'unfit',
    columns: ['country', 'company', 'medical_date', 'remarks', 'entered_by'],
    sorts: [
      { value: 'medical_date:desc', label: 'Medical date (newest first)' },
      { value: 'medical_date:asc', label: 'Medical date (oldest first)' },
    ],
    emptyTitle: 'No unfit passports.',
  },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workflow = useWorkflowStore()
workflow.load()

const tab = computed<Tab>(() => TABS.find((t) => t.key === route.query.tab) ?? TABS[0]!)

const listing = usePassportList({
  routeName: 'medical',
  fixed: () => ({ medical_status: tab.value.status }),
  sortOptions: () => tab.value.sorts,
})
const { hasFilters, search, company, companyCountry, sort, list, isLoading, loadError } = listing

/** Re-testing an unfit passport is for admins only; the API's flag must agree too. */
const canRetest = (entry: PassportEntry) =>
  isMedicalAdmin(auth.user?.role) && entry.can.record_medical

function countFor(key: TabKey): number | null {
  const step2 = workflow.summary?.step2
  return step2 ? step2[key] : null
}

/* ---------- Tabs (WAI-ARIA tabs; the selected tab is in ?tab=) ---------- */

const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabButtons')

function selectTab(key: TabKey) {
  if (key === tab.value.key) return
  // Keep the search and filters; the sort and page belong to the tab.
  const query: LocationQuery = { ...listing.queryWith({}) }
  delete query.sort
  if (key === 'pending') delete query.tab
  else query.tab = key
  router.push({ query })
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = TABS[(index + step + TABS.length) % TABS.length]!
  selectTab(next.key)
  tabRefs.value?.[TABS.indexOf(next)]?.focus()
}

/* ---------- Record medical ---------- */

const modalOpen = ref(false)
const modalPassport = ref<PassportEntry | null>(null)

function openRecord(entry: PassportEntry) {
  modalPassport.value = entry
  modalOpen.value = true
}

const actionClass =
  'rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-offset-1'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <WorkflowStepper current="medical" />

    <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl">Medical</h1>
    <p class="mt-1 text-sm text-muted">
      Step 2: record fit or unfit results and follow up expiries.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6">
      <div class="-mx-4 overflow-x-auto border-b border-stroke px-4 sm:-mx-6 sm:px-6">
        <div role="tablist" aria-label="Medical status" class="flex min-w-max gap-1">
          <button
            v-for="(t, i) in TABS"
            :id="`medical-tab-${t.key}`"
            ref="tabButtons"
            :key="t.key"
            type="button"
            role="tab"
            :aria-selected="tab.key === t.key"
            :aria-controls="`medical-panel-${t.key}`"
            :tabindex="tab.key === t.key ? 0 : -1"
            class="-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap"
            :class="
              tab.key === t.key
                ? 'border-accent-500 text-primary-900'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-primary-900'
            "
            @click="selectTab(t.key)"
            @keydown="onTabKeydown($event, i)"
          >
            {{ t.label }}
            <span
              class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 tabular-nums"
              data-tab-count
            >
              {{ countFor(t.key) ?? '–' }}
            </span>
          </button>
        </div>
      </div>

      <div
        :id="`medical-panel-${tab.key}`"
        role="tabpanel"
        :aria-labelledby="`medical-tab-${tab.key}`"
        class="pt-5"
      >
        <PassportListFilters
          v-model:search="search"
          v-model:company="company"
          v-model:company-country="companyCountry"
          v-model:sort="sort"
          :sort-options="tab.sorts"
          :has-filters="hasFilters"
          @search="listing.onSearchInput"
          @clear="listing.clearFilters"
        />

        <div class="mt-6 border-t border-stroke pt-2">
          <PassportListBody
            :list="list"
            :is-loading="isLoading"
            :load-error="loadError"
            :page-link="listing.pageLink"
            :empty-title="hasFilters ? 'No passports match your filters.' : tab.emptyTitle"
            @retry="listing.load"
          >
            <PassportTable
              :entries="list?.data ?? []"
              :current-user-id="auth.user?.id ?? null"
              :columns="tab.columns"
            >
              <template #actions="{ entry }">
                <button
                  v-if="tab.key === 'pending' && entry.can.record_medical"
                  type="button"
                  :class="[actionClass, 'bg-primary-900 text-white hover:bg-primary-700']"
                  @click="openRecord(entry)"
                >
                  Record medical<span class="sr-only"> for {{ entry.passport_number }}</span>
                </button>
                <button
                  v-else-if="tab.key === 'expired' && entry.can.record_medical"
                  type="button"
                  :class="[actionClass, 'bg-accent-400 text-primary-900 hover:bg-accent-500']"
                  @click="openRecord(entry)"
                >
                  Repeat medical<span class="sr-only"> for {{ entry.passport_number }}</span>
                </button>
                <button
                  v-else-if="tab.key === 'unfit' && canRetest(entry)"
                  type="button"
                  :class="[actionClass, 'bg-primary-900 text-white hover:bg-primary-700']"
                  data-retest
                  @click="openRecord(entry)"
                >
                  Re-test<span class="sr-only"> {{ entry.passport_number }}</span>
                </button>
              </template>
            </PassportTable>
          </PassportListBody>
        </div>
      </div>
    </section>

    <RecordMedicalModal
      v-model:open="modalOpen"
      :passport="modalPassport"
      :with-next="tab.key === 'pending'"
      @saved="listing.load"
    />
  </div>
</template>
