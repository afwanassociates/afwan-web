<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LatestStatusText from '@/components/LatestStatusText.vue'
import PassportListBody from '@/components/PassportListBody.vue'
import WorkflowStepper from '@/components/WorkflowStepper.vue'
import {
  downloadCompanyPassportsCsv,
  fetchCompanyPassports,
  fetchCompanyReport,
} from '@/api/reports'
import { useToast } from '@/composables/useToast'
import {
  balanceClass,
  countClass,
  countryName,
  formatBalance,
  rememberRows,
  rememberedRow,
} from '@/lib/companyReport'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { CompanyCounts, CompanyPassport, CompanyReportRow } from '@/types/report'

/**
 * One company of the Companies report: a header card with the company and its counts, then the
 * company's passports (newest first) with an Export CSV of all of them. Read-only: no row
 * actions, and the step bar is display only.
 */
const route = useRoute()
const toast = useToast()

const PER_PAGE = 15

const companyId = computed(() => Number(route.params.id))
const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isInteger(value) && value > 1 ? value : 1
})

/* ---------- Header (the company's report row) ---------- */

const row = shallowRef<CompanyReportRow | null>(null)
const rowMissing = ref(false)

/** Finds the company's report row: searching by name when known, else page by page. */
async function findRow(id: number, nameHint: string | null): Promise<CompanyReportRow | null> {
  if (nameHint) {
    const result = await fetchCompanyReport({ search: nameHint, per_page: 100 })
    rememberRows(result.data)
    const found = result.data.find((r) => r.id === id)
    if (found) return found
  }
  for (let p = 1; p <= 20; p++) {
    const result = await fetchCompanyReport({ page: p, per_page: 100 })
    rememberRows(result.data)
    const found = result.data.find((r) => r.id === id)
    if (found) return found
    if (p >= result.meta.last_page) break
  }
  return null
}

let headerLoadedFor: number | null = null

async function loadHeader(id: number, nameHint: string | null) {
  rowMissing.value = false
  try {
    row.value = rememberedRow(id) ?? (await findRow(id, nameHint))
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

async function load() {
  const id = companyId.value
  const request = ++requestId
  isLoading.value = true
  loadError.value = null
  notFound.value = false
  try {
    const result = await fetchCompanyPassports(id, { page: page.value, per_page: PER_PAGE })
    if (request !== requestId) return
    list.value = result
    // Once per company (not per page): the header row and the agent's phone and email.
    // A row cached from the Companies list still needs the contact lookup.
    if (headerLoadedFor !== id) {
      headerLoadedFor = id
      loadHeader(id, result.data[0]?.company.name ?? null)
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
  [companyId, page],
  ([id], old) => {
    if (!old || old[0] !== id) {
      row.value = rememberedRow(id) ?? null
      list.value = null
    }
    load()
  },
  { immediate: true },
)

const pageLink = (p: number) => ({ query: { ...route.query, page: p > 1 ? String(p) : undefined } })
/* ---------- Export ---------- */

const isExporting = ref(false)

/** Downloads every passport of this company (all pages) as CSV. */
async function exportCsv() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const fileName = await downloadCompanyPassportsCsv(companyId.value)
    toast.success(`Downloaded ${fileName}.`)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not export the passports. Please try again.'))
  } finally {
    isExporting.value = false
  }
}

const title = computed(() => row.value?.name ?? list.value?.data[0]?.company.name ?? 'Company')
const th = 'py-3 pr-4 font-semibold'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <RouterLink
      :to="{ name: 'companies' }"
      class="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
    >
      <span aria-hidden="true">←</span> All companies
    </RouterLink>

    <div v-if="notFound" class="glass-card mt-4 p-8 text-center" role="alert" data-not-found>
      <p class="font-semibold text-ink">This company does not exist.</p>
      <p class="mt-1 text-sm text-muted">It may have been removed.</p>
    </div>

    <template v-else>
      <!-- Header card -->
      <section class="glass-card mt-4 p-5 sm:p-6" aria-labelledby="company-heading" data-header>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 id="company-heading" class="text-2xl font-bold text-primary-900 sm:text-3xl">
              {{ title }}
            </h1>
            <p v-if="row" class="mt-1 text-sm text-muted">{{ countryName(row.country_code) }}</p>
          </div>
          <div v-if="row" class="text-right" data-balance>
            <p class="text-xs font-semibold tracking-wider text-muted uppercase">Balance</p>
            <p class="text-2xl font-bold tabular-nums" :class="balanceClass(row.balance)">
              {{ formatBalance(row.balance) }}
            </p>
            <p class="text-xs text-muted">
              <template v-if="row.quota === null">No quota set</template>
              <template v-else>of a quota of {{ row.quota }}</template>
            </p>
          </div>
        </div>

        <div v-if="!row && !rowMissing" class="mt-4 animate-pulse space-y-2" data-header-skeleton>
          <div class="h-4 w-1/3 rounded bg-slate-200" />
          <div class="h-4 w-1/4 rounded bg-slate-200" />
          <span class="sr-only">Loading company details…</span>
        </div>
        <p v-else-if="!row" class="mt-4 text-sm text-muted">Company details are not available.</p>

        <template v-else>
          <ul class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5" data-mini-counts>
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
        </template>
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
        <div>
          <PassportListBody
            :list="list"
            :is-loading="isLoading"
            :load-error="loadError"
            :page-link="pageLink"
            empty-title="This company has no passports yet."
            @retry="load"
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm" data-passports>
                <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
                  <tr>
                    <th scope="col" :class="th">Name</th>
                    <th scope="col" :class="th">Passport no</th>
                    <th scope="col" :class="th">Reference</th>
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
                    <td class="py-3 pr-4 text-slate-700">{{ p.reference?.name ?? '—' }}</td>
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
        </div>
      </section>
    </template>
  </div>
</template>
