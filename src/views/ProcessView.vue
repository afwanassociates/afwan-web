<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportListFilters from '@/components/PassportListFilters.vue'
import ProcessTable from '@/components/ProcessTable.vue'
import RecordStepModal from '@/components/RecordStepModal.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { usePassportList, type SortOption } from '@/composables/usePassportList'
import { isRecordStep } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import type { PassportEntry } from '@/types/passport'
import type { StepRecordSummary } from '@/types/workflow'

/**
 * Process: steps 3+ (calling, visa, BMET, flight) and the completed passports.
 * One tab per step from /workflow/config; tab, sub-filter and filters live in the URL.
 */
const SORTS: SortOption[] = [
  { value: 'passport_received_date:asc', label: 'Received (oldest first)' },
  { value: 'passport_received_date:desc', label: 'Received (newest first)' },
  { value: 'status_date:desc', label: 'Status date (newest first)' },
]

const SUB_FILTERS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_process', label: 'In process' },
  { value: 'rejected', label: 'Rejected' },
] as const
type SubFilter = (typeof SUB_FILTERS)[number]['value'] | ''

const route = useRoute()
const router = useRouter()
const workflow = useWorkflowStore()
workflow.load()
workflow.loadConfig()

interface Tab {
  key: string
  label: string
}

const tabs = computed<Tab[]>(() => [
  ...(workflow.config?.steps ?? [])
    .filter(isRecordStep)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ key: s.key, label: s.label })),
  { key: 'completed', label: 'Completed' },
])

/** The last record step: the Completed tab shows its (flight) details. */
const finalStepKey = computed(() => tabs.value[tabs.value.length - 2]?.key ?? 'flight')

const tab = computed(() => {
  const wanted = route.query.tab
  return tabs.value.find((t) => t.key === wanted)?.key ?? tabs.value[0]?.key ?? 'calling'
})
const isCompleted = computed(() => tab.value === 'completed')

const subFilter = computed<SubFilter>(() => {
  const value = route.query.status
  return SUB_FILTERS.find((f) => f.value === value)?.value ?? ''
})

const listing = usePassportList({
  routeName: 'process',
  fixed: () => ({
    stage: tab.value,
    stage_status: isCompleted.value ? undefined : subFilter.value || undefined,
  }),
  sortOptions: () => SORTS,
  // The tabs come from the config: do not ask for a stage before they are known.
  ready: () => workflow.config !== null,
})
const { hasFilters, search, company, companyCountry, sort, list, isLoading, loadError } = listing

function countFor(key: string): number | null {
  const s = workflow.summary
  if (!s) return null
  return key === 'completed' ? (s.completed ?? 0) : (s.stages?.[key]?.total ?? 0)
}

function subCount(value: SubFilter): number | null {
  const stage = workflow.summary?.stages?.[tab.value]
  if (!stage) return null
  return value ? (stage[value] ?? 0) : stage.total
}

/* ---------- Tabs and sub-filters (URL) ---------- */

const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabButtons')

function selectTab(key: string) {
  if (key === tab.value) return
  const query: LocationQuery = { ...listing.queryWith({}) }
  delete query.status
  delete query.sort
  query.tab = key
  router.push({ query })
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = tabs.value[(index + step + tabs.value.length) % tabs.value.length]!
  selectTab(next.key)
  tabRefs.value?.[tabs.value.indexOf(next)]?.focus()
}

function selectSubFilter(value: SubFilter) {
  const query: LocationQuery = { ...listing.queryWith({}) }
  if (value) query.status = value
  else delete query.status
  router.push({ query })
}

/* ---------- Record / update ---------- */

const modalOpen = ref(false)
const modalPassport = ref<PassportEntry | null>(null)
const modalRecord = ref<StepRecordSummary | null>(null)
const modalWithNext = ref(false)

type RowAction = { label: string; update: boolean; tone: string }

function actionFor(entry: PassportEntry): RowAction | null {
  if (isCompleted.value || entry.current_stage !== tab.value) return null
  switch (entry.stage_status) {
    case 'waiting':
      return {
        label: 'Record',
        update: false,
        tone: 'bg-primary-900 text-white hover:bg-primary-700',
      }
    case 'in_process':
      return {
        label: 'Update status',
        update: true,
        tone: 'bg-blue-700 text-white hover:bg-blue-800',
      }
    case 'rejected':
      return {
        label: 'Record again',
        update: false,
        tone: 'bg-accent-400 text-primary-900 hover:bg-accent-500',
      }
    default:
      return null
  }
}

function openAction(entry: PassportEntry, record: StepRecordSummary | null) {
  const action = actionFor(entry)
  if (!action) return
  modalPassport.value = entry
  modalRecord.value = action.update ? record : null
  modalWithNext.value = entry.stage_status === 'waiting'
  modalOpen.value = true
}

const smallButton =
  'rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-offset-1'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <WorkflowStepper :active-step="tab" />

    <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl">Process</h1>
    <p class="mt-1 text-sm text-muted">Record work permits, visas, BMET clearances and flights.</p>

    <section class="glass-card mt-6 p-4 sm:p-6">
      <div class="-mx-4 overflow-x-auto border-b border-stroke px-4 sm:-mx-6 sm:px-6">
        <div role="tablist" aria-label="Process steps" class="flex min-w-max gap-1">
          <button
            v-for="(t, i) in tabs"
            :id="`process-tab-${t.key}`"
            ref="tabButtons"
            :key="t.key"
            type="button"
            role="tab"
            :aria-selected="tab === t.key"
            :aria-controls="`process-panel-${t.key}`"
            :tabindex="tab === t.key ? 0 : -1"
            class="-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap"
            :class="
              tab === t.key
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
        :id="`process-panel-${tab}`"
        role="tabpanel"
        :aria-labelledby="`process-tab-${tab}`"
        class="space-y-5 pt-5"
      >
        <div
          v-if="!isCompleted"
          role="group"
          aria-label="Status at this step"
          class="flex flex-wrap gap-2"
        >
          <button
            v-for="f in [{ value: '', label: 'All' }, ...SUB_FILTERS]"
            :key="f.value || 'all'"
            type="button"
            class="inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold"
            :class="
              subFilter === f.value
                ? 'border-primary-900 bg-primary-900 text-white'
                : 'border-slate-300 bg-white text-primary-900 hover:bg-primary-50'
            "
            :aria-pressed="subFilter === f.value"
            :data-sub="f.value || 'all'"
            @click="selectSubFilter(f.value as SubFilter)"
          >
            {{ f.label }}
            <span
              class="rounded-full px-1.5 text-xs tabular-nums"
              :class="subFilter === f.value ? 'bg-white/20' : 'bg-slate-100 text-slate-700'"
            >
              {{ subCount(f.value as SubFilter) ?? '–' }}
            </span>
          </button>
        </div>

        <PassportListFilters
          v-model:search="search"
          v-model:company="company"
          v-model:company-country="companyCountry"
          v-model:sort="sort"
          :sort-options="SORTS"
          :has-filters="hasFilters"
          @search="listing.onSearchInput"
          @clear="listing.clearFilters"
        />

        <div class="border-t border-stroke pt-2">
          <PassportListBody
            :list="list"
            :is-loading="isLoading"
            :load-error="loadError"
            :page-link="listing.pageLink"
            :empty-title="
              hasFilters || subFilter
                ? 'No passports match these filters.'
                : isCompleted
                  ? 'No passports have completed every step yet.'
                  : 'No passports are at this step.'
            "
            @retry="listing.load"
          >
            <ProcessTable
              :entries="list?.data ?? []"
              :step-key="isCompleted ? finalStepKey : tab"
              :flight="isCompleted || tab === finalStepKey"
            >
              <template #actions="{ entry, record }">
                <button
                  v-if="actionFor(entry)"
                  type="button"
                  :class="[smallButton, actionFor(entry)!.tone]"
                  :data-action="actionFor(entry)!.label"
                  @click="openAction(entry, record)"
                >
                  {{ actionFor(entry)!.label
                  }}<span class="sr-only">{{ ` ${entry.passport_number}` }}</span>
                </button>
              </template>
            </ProcessTable>
          </PassportListBody>
        </div>
      </div>
    </section>

    <RecordStepModal
      v-model:open="modalOpen"
      :passport="modalPassport"
      :step-key="isCompleted ? null : tab"
      :record="modalRecord"
      :with-next="modalWithNext"
      @saved="listing.load"
    />
  </div>
</template>
