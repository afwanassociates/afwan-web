<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import PassportListBody from '@/components/PassportListBody.vue'
import PassportListFilters from '@/components/PassportListFilters.vue'
import PassportOverviewTable from '@/components/PassportOverviewTable.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import { listPassportOverview } from '@/api/passports'
import { usePassportList, type SortOption } from '@/composables/usePassportList'
import type { PassportOverview } from '@/types/passport'

/**
 * All Passports: a read-only overview of every passport in every status (unfit included),
 * each with one coloured "Latest status". No create, edit or delete controls.
 */
const SORTS: SortOption[] = [
  { value: 'status_date:desc', label: 'Status date (newest first)' },
  { value: 'status_date:asc', label: 'Status date (oldest first)' },
  { value: 'passport_received_date:desc', label: 'Received (newest first)' },
  { value: 'passport_received_date:asc', label: 'Received (oldest first)' },
]

/** Query keys of the old version of this page; ignored and dropped from the URL. */
const OLD_KEYS = ['status', 'stage', 'medical_status']

const route = useRoute()
const router = useRouter()

const listing = usePassportList<PassportOverview>({
  routeName: 'all-passports',
  fixed: () => ({ view: 'overview', medical_status: 'all' }),
  sortOptions: () => SORTS,
  fetch: listPassportOverview,
})
const { hasFilters, search, company, companyCountry, sort, list, isLoading, loadError } = listing

onMounted(() => {
  if (!OLD_KEYS.some((key) => key in route.query)) return
  const query: LocationQuery = { ...route.query }
  for (const key of OLD_KEYS) delete query[key]
  router.replace({ query })
})

/** Direction of the status-date sort, for the "Latest status" column header. */
const statusSort = computed(() => {
  const [field, direction] = sort.value.split(':')
  return field === 'status_date' ? (direction as 'asc' | 'desc') : null
})

function toggleStatusSort() {
  sort.value = statusSort.value === 'desc' ? 'status_date:asc' : 'status_date:desc'
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <!-- Overview: no step is highlighted as the current one. -->
    <WorkflowStepper />

    <h1 class="mt-6 text-2xl font-bold text-primary-900 sm:text-3xl">All Passports</h1>
    <p class="mt-1 text-sm text-muted">Every passport in every status, including unfit.</p>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="All passports">
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

      <div class="mt-6 border-t border-stroke pt-2">
        <PassportListBody
          :list="list"
          :is-loading="isLoading"
          :load-error="loadError"
          :page-link="listing.pageLink"
          :empty-title="hasFilters ? 'No passports match these filters.' : 'No passports yet.'"
          @retry="listing.load"
        >
          <PassportOverviewTable
            :entries="list?.data ?? []"
            :status-sort="statusSort"
            @sort-status="toggleStatusSort"
          />
        </PassportListBody>
      </div>
    </section>
  </div>
</template>
