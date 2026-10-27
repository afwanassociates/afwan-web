<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LatestStatusText from '@/components/LatestStatusText.vue'
import PassportListBody from '@/components/PassportListBody.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import {
  downloadReferencePassportsCsv,
  fetchReferencePassports,
  fetchReferenceReport,
} from '@/api/reports'
import { useToast } from '@/composables/useToast'
import { countClass, rememberReferenceRows, rememberedReferenceRow } from '@/lib/companyReport'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { CompanyCounts, CompanyPassport, ReferenceReportRow } from '@/types/report'

/**
 * One reference of the References report: a header card with the reference and its counts,
 * then its passports (newest first) with an Export CSV of all of them. Read-only, like the
 * company page.
 */
const route = useRoute()
const toast = useToast()

const PER_PAGE = 15

const referenceId = computed(() => Number(route.params.id))
const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isInteger(value) && value > 1 ? value : 1
})

/* ---------- Header (the reference's report row) ---------- */

const row = shallowRef<ReferenceReportRow | null>(null)
const rowMissing = ref(false)

async function loadHeader(id: number) {
  rowMissing.value = false
  try {
    let found = rememberedReferenceRow(id)
    if (!found) {
      const result = await fetchReferenceReport({ reference_id: id })
      rememberReferenceRows(result.data)
      found = result.data.find((r) => r.id === id)
    }
    row.value = found ?? null
    rowMissing.value = row.value === null
  } catch {
    rowMissing.value = row.value === null
  }
}

const MINI_COUNTS: { key: keyof CompanyCounts; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'not_started', label: 'Not started' },
  { key: 'medical_pending', label: 'Medical pending' },
  { key: 'medical_fit', label: 'Medical fit' },
  { key: 'medical_unfit', label: 'Unfit' },
  { key: 'calling_done', label: 'Calling' },
  { key: 'visa_done', label: 'Visa' },
  { key: 'bmet_done', label: 'BMET' },
  { key: 'flight_done', label: 'Flight done' },
  { key: 'in_process', label: 'In process' },
]

/* ---------- Passports ---------- */

const list = shallowRef<Paginated<CompanyPassport> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const notFound = ref(false)
let requestId = 0
let headerLoadedFor: number | null = null

async function load() {
  const id = referenceId.value
  const request = ++requestId
  isLoading.value = true
  loadError.value = null
  notFound.value = false
  try {
    const result = await fetchReferencePassports(id, { page: page.value, per_page: PER_PAGE })
    if (request !== requestId) return
    list.value = result
    // Once per reference (not per page).
    if (headerLoadedFor !== id) {
      headerLoadedFor = id
      loadHeader(id)
    }
  } catch (error) {
    if (request !== requestId) return
    if (errorStatus(error) === 404) notFound.value = true
    else loadError.value = errorMessage(error, 'Could not load the passports. Please try again.')
  } finally {
    if (request === requestId) isLoading.value = false
  }
}

watch(
  [referenceId, page],
  ([id], old) => {
    if (!old || old[0] !== id) {
      row.value = rememberedReferenceRow(id) ?? null
      list.value = null
    }
    load()
  },
  { immediate: true },
)

const pageLink = (p: number) => ({ query: { ...route.query, page: p > 1 ? String(p) : undefined } })

/* ---------- Export ---------- */

const isExporting = ref(false)

/** Downloads every passport of this reference (all pages) as CSV. */
async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const fileName = await downloadReferencePassportsCsv(referenceId.value)
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the passports. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

const title = computed(() => row.value?.name ?? list.value?.data[0]?.reference?.name ?? 'Reference')
const th = 'py-3 pr-4 font-semibold'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <RouterLink
      :to="{ name: 'reference-report' }"
      class="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
    >
      <span aria-hidden="true">←</span> All references
    </RouterLink>

    <div v-if="notFound" class="glass-card mt-4 p-8 text-center" role="alert" data-not-found>
      <p class="font-semibold text-ink">This reference does not exist.</p>
      <p class="mt-1 text-sm text-muted">It may have been removed.</p>
    </div>

    <template v-else>
      <!-- Header card -->
      <section class="glass-card mt-4 p-5 sm:p-6" aria-labelledby="reference-heading" data-header>
        <h1 id="reference-heading" class="text-2xl font-bold text-primary-900 sm:text-3xl">
          {{ title }}
        </h1>
        <p v-if="row" class="mt-1 text-sm text-muted">
          {{ row.type_label }}<template v-if="row.phone"> · {{ row.phone }}</template
          ><template v-if="!row.is_active"> · Inactive</template>
        </p>

        <div v-if="!row && !rowMissing" class="mt-4 animate-pulse space-y-2" data-header-skeleton>
          <div class="h-4 w-1/3 rounded bg-slate-200" />
          <div class="h-4 w-1/4 rounded bg-slate-200" />
          <span class="sr-only">Loading reference details…</span>
        </div>
        <p v-else-if="!row" class="mt-4 text-sm text-muted">Reference details are not available.</p>

        <ul
          v-else
          class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5"
          data-mini-counts
        >
          <li
            v-for="c in MINI_COUNTS"
            :key="c.key"
            class="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-stroke"
            :data-mini="c.key"
          >
            <span class="block text-xs text-muted">{{ c.label }}</span>
            <span class="text-lg font-bold tabular-nums" :class="countClass(c.key, row[c.key])">
              {{ row[c.key] }}
            </span>
          </li>
        </ul>
      </section>

      <!-- Passports: the heading and Export CSV above the card, the list inside it. -->
      <div class="mt-6 flex flex-wrap items-end justify-between gap-4" data-passports-header>
        <h2 id="passports-heading" class="text-lg font-semibold text-ink">Passports</h2>
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
      </div>
      <section class="glass-card mt-3 p-4 sm:p-6" aria-labelledby="passports-heading">
        <PassportListBody
          :list="list"
          :is-loading="isLoading"
          :load-error="loadError"
          :page-link="pageLink"
          empty-title="This reference has no passports yet."
          @retry="load"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" data-passports>
              <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" :class="th">Name</th>
                  <th scope="col" :class="th">Passport no</th>
                  <th scope="col" :class="th">Company</th>
                  <th scope="col" :class="th">Latest status</th>
                  <th scope="col" :class="[th, 'pr-0']">Progress</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr
                  v-for="p in list?.data ?? []"
                  :key="p.id"
                  class="align-top"
                  :data-passport-row="p.id"
                >
                  <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                    {{ p.passport_name }}
                  </th>
                  <td class="py-3 pr-4 font-mono tracking-wider whitespace-nowrap text-ink">
                    {{ p.passport_number }}
                  </td>
                  <td class="py-3 pr-4 text-slate-700">{{ p.company?.name ?? '—' }}</td>
                  <td class="py-3 pr-4">
                    <LatestStatusText :latest-status="p.latest_status" />
                  </td>
                  <td class="py-3">
                    <!-- Display only: no workflow buttons on this page. -->
                    <WorkflowStepper :steps="p.workflow.steps" compact />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </PassportListBody>
      </section>
    </template>
  </div>
</template>
