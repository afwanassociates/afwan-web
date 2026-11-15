<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import SearchSelect from '@/components/SearchSelect.vue'
import PriceDialog from '@/components/accounts/PriceDialog.vue'
import { fetchPaymentReport, savePassportPrice } from '@/api/accounts'
import { fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { ACCOUNTS_ROLES, PRICE_SETTER_ROLES, formatMoney } from '@/lib/accounts'
import { countryName } from '@/lib/companyReport'
import { toDisplayDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import type {
  PaymentReport,
  PaymentReportParams,
  PaymentReportPassport,
  PaymentReportReceipt,
  PaymentReportStatus,
  PriceSource,
} from '@/types/accounts'
import type { CompanySummary, ReferenceSummary } from '@/types/passport'

/**
 * Payment report (accounts head and super admin): every passport given by a reference, with
 * its company, payment status (paid, pending approval, part paid, unpaid) and each cash
 * receipt behind it, with the price and the due at every level (reference, company,
 * passport). A receipt pays one amount per company for several passports, so a passport's
 * amount is its share of that line (split by price). Prices come from the Passport Rates
 * page; the accounts head sets a reference's rate for a company or one passport's special
 * price here too. Filters live in the URL; the summary covers every filter except status, so
 * the status tabs keep their counts. Returned passports are counted apart (not in the
 * passport total); money paid for one stays on its receipt as the reference's credit.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
/** Only the accounts head sets prices; the super admin reads. */
const canSetPrices = computed(() => !!auth.user && PRICE_SETTER_ROLES.includes(auth.user.role))

const searchId = useId()
/** Only the accounts team opens party ledgers (the super admin has no accounts pages). */
const canOpenLedger = computed(() => !!auth.user && ACCOUNTS_ROLES.includes(auth.user.role))

const STATUS_TABS: { value: '' | PaymentReportStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'paid', label: 'Paid' },
  { value: 'returned', label: 'Returned' },
]

const STATUS_BADGE: Record<PaymentReportStatus, { text: string; cls: string }> = {
  paid: { text: 'Paid', cls: 'bg-green-50 text-green-800 ring-green-300' },
  pending: { text: 'Pending approval', cls: 'bg-amber-50 text-amber-900 ring-amber-300' },
  part_paid: { text: 'Part paid', cls: 'bg-sky-50 text-sky-900 ring-sky-300' },
  unpaid: { text: 'Unpaid', cls: 'bg-slate-100 text-slate-700 ring-slate-300' },
  returned: { text: 'Returned', cls: 'bg-violet-50 text-violet-900 ring-violet-300' },
}

const APPROVAL_TEXT: Record<PaymentReportReceipt['status'], { text: string; cls: string }> = {
  approved: { text: 'Approved', cls: 'text-green-700' },
  pending: { text: 'Waiting approval', cls: 'text-amber-700' },
  rejected: { text: 'Returned', cls: 'text-red-700' },
}

/* ---------- Filters (in the URL) ---------- */

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const idFrom = (value: unknown) => {
  const id = Number(text(value))
  return Number.isInteger(id) && id > 0 ? id : undefined
}

const params = computed<PaymentReportParams>(() => {
  const page = Number(text(route.query.page)) || 1
  const status = text(route.query.status)
  return {
    q: text(route.query.q).trim() || undefined,
    reference_id: idFrom(route.query.reference_id),
    company_id: idFrom(route.query.company_id),
    status: STATUS_TABS.some((t) => t.value && t.value === status)
      ? (status as PaymentReportStatus)
      : undefined,
    page: page > 1 ? page : undefined,
  }
})

const hasFilters = computed(() =>
  Boolean(params.value.q || params.value.reference_id || params.value.company_id),
)

function queryWith(changes: Record<string, string | number | undefined>): LocationQuery {
  const query: LocationQuery = { ...route.query }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') delete query[key]
    else query[key] = String(value)
  }
  return query
}

/** A filter change goes back to page 1. */
function setFilter(changes: Record<string, string | undefined>) {
  router.replace({ query: queryWith({ ...changes, page: undefined }) })
}

const search = ref(params.value.q ?? '')
const debounced = useDebounce(() => setFilter({ q: search.value.trim() || undefined }), 300)

const selectedReference = ref<ReferenceSummary | null>(null)
const selectedCompany = ref<CompanySummary | null>(null)

async function searchReportCompanies(query: string): Promise<CompanySummary[]> {
  const { data } = await fetchCompanyReport({ search: query || undefined, per_page: 20 })
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    country: { code: c.country_code, name: countryName(c.country_code) },
  }))
}
const fetchReferences = (query: string) => fetchReportReferences({ q: query })
const referenceSubtitle = (item: ReferenceSummary) => item.type_label
const companySubtitle = (item: CompanySummary) => item.country?.name

function onReferenceSelected(value: ReferenceSummary | null) {
  selectedReference.value = value
  setFilter({ reference_id: value ? String(value.id) : undefined })
}

function onCompanySelected(value: CompanySummary | null) {
  selectedCompany.value = value
  setFilter({ company_id: value ? String(value.id) : undefined })
}

function setStatus(value: '' | PaymentReportStatus) {
  setFilter({ status: value || undefined })
}

function clearFilters() {
  search.value = ''
  debounced.cancel()
  selectedReference.value = null
  selectedCompany.value = null
  setFilter({ q: undefined, reference_id: undefined, company_id: undefined, status: undefined })
}

const pageLink = (page: number) => ({ query: queryWith({ page: page > 1 ? page : undefined }) })

/* ---------- Loading ---------- */

const report = shallowRef<PaymentReport | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const result = await fetchPaymentReport(params.value)
    if (id !== requestId) return
    report.value = result
    const { reference, company } = result.filters
    if (reference && selectedReference.value?.id !== reference.id)
      selectedReference.value = reference
    if (company && selectedCompany.value?.id !== company.id)
      selectedCompany.value = {
        id: company.id,
        name: company.name,
        country: { code: company.country_code ?? '', name: countryName(company.country_code) },
      }
  } catch (error) {
    if (id !== requestId) return
    loadError.value = errorMessage(error, 'Could not load the payment report. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(params.value),
  () => {
    // Back / forward: drop what the URL no longer has.
    if (!params.value.reference_id) selectedReference.value = null
    if (!params.value.company_id) selectedCompany.value = null
    if ((params.value.q ?? '') !== search.value.trim()) search.value = params.value.q ?? ''
    load()
  },
  { immediate: true },
)

const rows = computed(() => report.value?.data ?? [])

/* ---------- Passport details per company (opened on click; open while searching) ---------- */

const passportsId = useId()
const openPassports = ref(new Set<string>())
/** While searching, the matching passports start open; a click flips one company. */
const isOpen = (referenceId: number, companyId: number) =>
  Boolean(params.value.q) !== openPassports.value.has(`${referenceId}-${companyId}`)
function togglePassports(referenceId: number, companyId: number) {
  const key = `${referenceId}-${companyId}`
  const next = new Set(openPassports.value)
  if (!next.delete(key)) next.add(key)
  openPassports.value = next
}
/*
 * A reference card's passport details (its companies table): closed until asked for, open
 * while searching or filtered to one reference; a click flips one card.
 */
const referenceDetailsId = useId()
const openReferences = ref(new Set<number>())
const isReferenceOpen = (referenceId: number) =>
  Boolean(params.value.q || params.value.reference_id) !== openReferences.value.has(referenceId)
function toggleReference(referenceId: number) {
  const next = new Set(openReferences.value)
  if (!next.delete(referenceId)) next.add(referenceId)
  openReferences.value = next
}
/** The share of the price received (approved), 0 to 100, for the card's progress bar. */
function receivedPercent(paid: number, price: number): number {
  if (price <= 0) return paid > 0 ? 100 : 0
  return Math.min(100, Math.max(0, Math.round((paid / price) * 100)))
}
/** The card's accent: red while money is due, green when cleared. */
function accentClass(due: number | null): string {
  if (due === null) return 'border-l-slate-300'
  if (due > 0.004) return 'border-l-red-500'
  if (due < -0.004) return 'border-l-sky-500'
  return 'border-l-green-500'
}

const summary = computed(() => report.value?.summary ?? null)
const meta = computed(() => report.value?.meta ?? null)
const showingFrom = computed(() =>
  meta.value && meta.value.total > 0 ? (meta.value.current_page - 1) * meta.value.per_page + 1 : 0,
)
const showingTo = computed(() =>
  meta.value ? Math.min(meta.value.current_page * meta.value.per_page, meta.value.total) : 0,
)

function tabCount(value: '' | PaymentReportStatus): number | null {
  if (!summary.value) return null
  return value ? summary.value[value] : summary.value.total
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const th = 'px-3 py-3 text-xs font-semibold tracking-wider whitespace-nowrap uppercase'
const td = 'px-3 py-3 align-top'

const PRICE_SOURCE_TEXT: Record<PriceSource, string> = {
  company: 'Standard rate',
  reference: 'Party rate',
  special: 'Special price',
}

/** Due: red when owed, green when settled, "credit" when paid more. */
function dueClass(due: number | null): string {
  if (due === null) return 'text-muted'
  if (due > 0.004) return 'font-bold text-red-700'
  if (due < -0.004) return 'font-semibold text-sky-700'
  return 'font-semibold text-green-700'
}
function dueText(due: number | null): string {
  if (due === null) return '—'
  if (due < -0.004) return `${formatMoney(-due)} credit`
  return formatMoney(due)
}

/* ---------- A special price on one passport (accounts head) ---------- */
/* Party rates are set on the Party Rates page, standard rates on Standard Rates. */

const priceTarget = ref<{ passportId: number; title: string; value: number | null } | null>(null)
const priceOpen = ref(false)
const priceSaving = ref(false)
const priceError = ref<string | null>(null)

function editPassportPrice(p: PaymentReportPassport) {
  priceTarget.value = {
    passportId: p.id,
    title: `#${p.entry_no} ${p.passport_name}`,
    value: p.price_source === 'special' ? p.price : null,
  }
  priceError.value = null
  priceOpen.value = true
}

async function savePrice(price: number | null) {
  const t = priceTarget.value
  if (!t || priceSaving.value) return
  priceSaving.value = true
  priceError.value = null
  try {
    await savePassportPrice(t.passportId, price)
    toast.success(price === null ? 'Special price removed.' : 'Special price saved.')
    priceOpen.value = false
    await load()
  } catch (error) {
    priceError.value = errorMessage(error, 'Could not save the price. Please try again.')
  } finally {
    priceSaving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Payment Report</h1>
        <p class="mt-1 text-sm text-muted">
          Each reference, what it owes and paid for each company, and every passport with its price,
          receipts and due.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-if="canSetPrices"
          :to="{ name: 'accounts-party-rates' }"
          class="btn btn-white text-sm"
          data-party-rates-link
        >
          Party rates
        </RouterLink>
      </div>
    </div>

    <!-- Summary -->
    <dl class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-summary>
      <div class="rounded-lg border border-stroke bg-white px-4 py-3">
        <dt class="text-xs font-medium text-muted">Passports</dt>
        <dd class="mt-1 text-xl font-bold text-ink tabular-nums" data-summary-total>
          {{ summary?.total ?? '–' }}
        </dd>
        <dd v-if="summary" class="mt-0.5 text-xs text-muted">
          <span class="text-green-700">{{ summary.paid }} paid</span> ·
          <span class="text-sky-700">{{ summary.part_paid }} part</span> ·
          <span class="text-red-700">{{ summary.unpaid }} unpaid</span>
        </dd>
        <dd v-if="summary?.returned" class="mt-0.5 text-xs text-violet-700" data-summary-returned>
          + {{ summary.returned }} returned (not counted)
        </dd>
      </div>
      <div class="rounded-lg border border-stroke bg-white px-4 py-3">
        <dt class="text-xs font-medium text-muted">Total price</dt>
        <dd class="mt-1 text-lg font-bold text-ink tabular-nums" data-summary-price>
          {{ summary ? formatMoney(summary.price_total) : '–' }}
        </dd>
      </div>
      <div class="rounded-lg border border-stroke bg-white px-4 py-3">
        <dt class="text-xs font-medium text-muted">Received (approved)</dt>
        <dd class="mt-1 text-lg font-bold text-green-700 tabular-nums" data-summary-paid-amount>
          {{ summary ? formatMoney(summary.paid_amount) : '–' }}
        </dd>
        <dd v-if="summary && summary.pending_amount > 0" class="mt-0.5 text-xs text-amber-700">
          + {{ formatMoney(summary.pending_amount) }} waiting approval
        </dd>
      </div>
      <div class="rounded-lg border border-red-200 bg-red-50/50 px-4 py-3">
        <dt class="text-xs font-medium text-muted">Total due</dt>
        <dd
          class="mt-1 text-lg tabular-nums"
          :class="dueClass(summary?.due ?? null)"
          data-summary-due
        >
          {{ summary ? dueText(summary.due) : '–' }}
        </dd>
        <dd
          v-if="summary && summary.returned_credit > 0"
          class="mt-0.5 text-xs text-sky-700"
          data-summary-returned-credit
        >
          after {{ formatMoney(summary.returned_credit) }} credit for returned passports
        </dd>
      </div>
    </dl>
    <p
      v-if="summary && summary.no_price > 0"
      class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
      data-no-price
    >
      {{ summary.no_price }} passport{{ summary.no_price === 1 ? ' has' : 's have' }} no price, so
      the due leaves {{ summary.no_price === 1 ? 'it' : 'them' }} out.
      <RouterLink
        v-if="canSetPrices"
        :to="{ name: 'accounts-party-rates' }"
        class="font-semibold underline underline-offset-2"
        >Set the rates</RouterLink
      >.
    </p>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Passport payments">
      <!-- Filters -->
      <div role="search" class="flex flex-wrap items-end gap-4">
        <div class="w-full sm:w-64">
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            :class="inputClass"
            placeholder="Name, passport no. or entry no."
            data-search
            @input="debounced.run()"
          />
        </div>
        <div class="w-full sm:w-64">
          <SearchSelect
            :model-value="selectedReference"
            :fetch="fetchReferences"
            :subtitle-of="referenceSubtitle"
            label="Reference"
            placeholder="Search reference…"
            none-label="All references"
            clearable
            data-reference-filter
            @update:model-value="onReferenceSelected"
          />
        </div>
        <div class="w-full sm:w-64">
          <SearchSelect
            :model-value="selectedCompany"
            :fetch="searchReportCompanies"
            :subtitle-of="companySubtitle"
            label="Company"
            placeholder="Search company…"
            none-label="All companies"
            clearable
            data-company-filter
            @update:model-value="onCompanySelected"
          />
        </div>
        <button
          v-if="hasFilters || params.status"
          type="button"
          class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          data-clear-filters
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <!-- Status tabs -->
      <div
        class="mt-5 flex flex-wrap gap-2"
        role="group"
        aria-label="Payment status"
        data-status-tabs
      >
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          type="button"
          class="rounded-full border px-3 py-1.5 text-sm font-semibold"
          :class="
            (params.status ?? '') === tab.value
              ? 'border-primary-900 bg-primary-900 text-white'
              : 'border-slate-300 bg-white text-primary-900 hover:bg-primary-50'
          "
          :aria-pressed="(params.status ?? '') === tab.value ? 'true' : 'false'"
          :data-status-tab="tab.value || 'all'"
          @click="setStatus(tab.value)"
        >
          {{ tab.label }}
          <span class="ml-1 tabular-nums opacity-80">{{ tabCount(tab.value) ?? '' }}</span>
        </button>
      </div>

      <div class="mt-5 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <div v-else-if="!report" class="animate-pulse space-y-3 py-4" data-skeleton>
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
            <div class="hidden h-4 w-1/6 rounded bg-slate-200 md:block" />
          </div>
          <span class="sr-only">Loading the payment report…</span>
        </div>

        <div v-else-if="rows.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{
              hasFilters || params.status
                ? 'No passports match these filters.'
                : 'No passports with a reference yet.'
            }}
          </p>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <ul class="space-y-4 pt-2" data-references>
            <li
              v-for="group in rows"
              :key="group.reference.id"
              class="overflow-hidden rounded-xl border border-l-4 border-stroke bg-white shadow-sm ring-1 ring-primary-100 transition-shadow hover:shadow-md motion-reduce:transition-none"
              :class="accentClass(group.due)"
              :data-reference="group.reference.id"
            >
              <!-- Reference: totals -->
              <div
                class="flex flex-wrap items-start justify-between gap-4 bg-linear-to-r from-primary-50 to-white px-4 py-4 sm:px-5"
              >
                <div class="min-w-0">
                  <RouterLink
                    v-if="canOpenLedger"
                    :to="{ name: 'accounts-party-ledger', params: { id: group.reference.id } }"
                    class="text-base font-bold text-primary-800 underline-offset-4 hover:underline"
                  >
                    {{ group.reference.name }}
                  </RouterLink>
                  <span v-else class="text-base font-bold text-ink">{{
                    group.reference.name
                  }}</span>
                  <p class="text-xs text-muted">
                    <template v-if="group.reference.code">{{ group.reference.code }} · </template
                    >{{ group.reference.type_label
                    }}<template v-if="group.reference.mobile">
                      · {{ group.reference.mobile }}</template
                    >
                  </p>
                  <p class="mt-1 text-xs text-muted" data-reference-counts>
                    <span class="font-semibold text-ink">{{ group.counts.total }}</span> passports ·
                    <span class="text-green-700">{{ group.counts.paid }} paid</span>
                    <template v-if="group.counts.part_paid">
                      · <span class="text-sky-700">{{ group.counts.part_paid }} part paid</span>
                    </template>
                    <template v-if="group.counts.pending">
                      · <span class="text-amber-700">{{ group.counts.pending }} pending</span>
                    </template>
                    ·
                    <span class="font-semibold text-red-700">{{ group.counts.unpaid }} unpaid</span>
                    <template v-if="group.counts.returned">
                      · <span class="text-violet-700">{{ group.counts.returned }} returned</span>
                    </template>
                  </p>
                  <p
                    v-if="group.counts.returned_credit > 0"
                    class="mt-1 text-xs font-semibold text-sky-700"
                    data-reference-returned-credit
                  >
                    {{ formatMoney(group.counts.returned_credit) }} paid for
                    {{ group.counts.returned_paid }} returned
                    {{ group.counts.returned_paid === 1 ? 'passport' : 'passports' }}: credit to
                    refund or use for other passports
                  </p>
                  <!-- Received share of the price (short, inline) -->
                  <div class="mt-2 flex items-center gap-2" data-reference-progress>
                    <div
                      class="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      :aria-valuenow="receivedPercent(group.paid_amount, group.price_total)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label="Received share of the price"
                    >
                      <div
                        class="h-full rounded-full bg-green-500"
                        :style="{
                          width: `${receivedPercent(group.paid_amount, group.price_total)}%`,
                        }"
                      ></div>
                    </div>
                    <span class="text-xs font-semibold text-green-700 tabular-nums">
                      {{ receivedPercent(group.paid_amount, group.price_total) }}% received
                    </span>
                  </div>
                </div>
                <dl class="grid w-full grid-cols-3 gap-2 text-right sm:w-auto sm:gap-3">
                  <div class="rounded-lg bg-white px-3 py-2 ring-1 ring-stroke">
                    <dt class="text-xs font-medium text-muted">Price</dt>
                    <dd class="font-semibold text-ink tabular-nums">
                      {{ formatMoney(group.price_total) }}
                    </dd>
                  </div>
                  <div class="rounded-lg bg-green-50 px-3 py-2 ring-1 ring-green-200">
                    <dt class="text-xs font-medium text-green-800">Received</dt>
                    <dd class="font-semibold text-green-700 tabular-nums" data-reference-paid>
                      {{ formatMoney(group.paid_amount) }}
                    </dd>
                    <dd v-if="group.pending_amount > 0" class="text-xs text-amber-700 tabular-nums">
                      + {{ formatMoney(group.pending_amount) }} waiting
                    </dd>
                  </div>
                  <div
                    class="rounded-lg px-3 py-2 ring-1"
                    :class="
                      group.due !== null && group.due > 0.004
                        ? 'bg-red-50 ring-red-200'
                        : 'bg-white ring-stroke'
                    "
                  >
                    <dt class="text-xs font-medium text-muted">Due</dt>
                    <dd
                      class="text-lg tabular-nums"
                      :class="dueClass(group.due)"
                      data-reference-due
                    >
                      {{ dueText(group.due) }}
                    </dd>
                  </div>
                </dl>
              </div>

              <!-- Show / hide the passport details (the companies table) -->
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 border-y border-stroke bg-slate-50 px-4 py-2.5 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600 sm:px-5"
                :aria-expanded="isReferenceOpen(group.reference.id) ? 'true' : 'false'"
                :aria-controls="`${referenceDetailsId}-${group.reference.id}`"
                data-toggle-reference
                @click="toggleReference(group.reference.id)"
              >
                <span>
                  {{ isReferenceOpen(group.reference.id) ? 'Hide' : 'Show' }} passport details
                  <span class="font-normal text-muted">
                    · {{ group.companies.length }}
                    {{ group.companies.length === 1 ? 'company' : 'companies' }} ·
                    {{ group.counts.total }}
                    {{ group.counts.total === 1 ? 'passport' : 'passports' }}
                  </span>
                </span>
                <svg
                  class="h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none"
                  :class="isReferenceOpen(group.reference.id) ? 'rotate-180' : ''"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5 7l5 6 5-6H5z" />
                </svg>
              </button>

              <!-- Companies: price, received and due for each -->
              <div
                v-if="isReferenceOpen(group.reference.id)"
                :id="`${referenceDetailsId}-${group.reference.id}`"
                class="overflow-x-auto"
              >
                <table class="w-full text-left text-sm" data-companies-table>
                  <caption class="sr-only">
                    Companies of
                    {{
                      group.reference.name
                    }}
                    with the price, amount paid and due.
                  </caption>
                  <thead class="border-b border-stroke text-muted">
                    <tr>
                      <th scope="col" :class="th">Company</th>
                      <th scope="col" :class="th">Passports</th>
                      <th scope="col" :class="[th, 'text-right']">Rate</th>
                      <th scope="col" :class="[th, 'text-right']">Price</th>
                      <th scope="col" :class="[th, 'text-right']">Received</th>
                      <th scope="col" :class="[th, 'text-right']">Waiting</th>
                      <th scope="col" :class="[th, 'text-right']">Due</th>
                      <th scope="col" :class="th"><span class="sr-only">Passports</span></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-stroke">
                    <template v-for="c in group.companies" :key="c.company.id">
                      <tr :data-company="c.company.id">
                        <th scope="row" :class="[td, 'text-left font-semibold text-ink']">
                          {{ c.company.name ?? '—' }}
                          <span class="block text-xs font-normal text-muted">
                            {{ countryName(c.company.country_code) }} · {{ c.receipt_count }}
                            {{ c.receipt_count === 1 ? 'receipt' : 'receipts' }}
                          </span>
                        </th>
                        <td :class="[td, 'text-xs whitespace-nowrap']">
                          <span class="text-sm font-semibold text-ink tabular-nums">{{
                            c.counts.total
                          }}</span>
                          <span class="block text-muted">
                            <span class="text-green-700">{{ c.counts.paid }} paid</span>
                            <template v-if="c.counts.part_paid">
                              · <span class="text-sky-700">{{ c.counts.part_paid }} part</span>
                            </template>
                            <template v-if="c.counts.pending">
                              · <span class="text-amber-700">{{ c.counts.pending }} pending</span>
                            </template>
                            · <span class="text-red-700">{{ c.counts.unpaid }} unpaid</span>
                            <template v-if="c.counts.returned">
                              ·
                              <span class="text-violet-700">{{ c.counts.returned }} returned</span>
                            </template>
                          </span>
                        </td>
                        <td :class="[td, 'text-right whitespace-nowrap']" data-company-rate>
                          <span class="font-semibold text-ink tabular-nums">{{
                            c.reference_rate !== null
                              ? formatMoney(c.reference_rate)
                              : c.company_rate !== null
                                ? formatMoney(c.company_rate)
                                : 'Not set'
                          }}</span>
                          <span class="block text-xs text-muted">
                            {{
                              c.reference_rate !== null
                                ? 'Party rate'
                                : c.company_rate !== null
                                  ? 'Standard rate'
                                  : ''
                            }}
                          </span>
                        </td>
                        <td :class="[td, 'text-right tabular-nums whitespace-nowrap']">
                          {{ formatMoney(c.price_total) }}
                          <span v-if="c.no_price" class="block text-xs text-amber-700">
                            {{ c.no_price }} without price
                          </span>
                        </td>
                        <td
                          :class="[
                            td,
                            'text-right font-semibold text-green-700 tabular-nums whitespace-nowrap',
                          ]"
                          data-company-paid
                        >
                          {{ formatMoney(c.paid_amount) }}
                        </td>
                        <td
                          :class="[td, 'text-right text-amber-700 tabular-nums whitespace-nowrap']"
                        >
                          {{ c.pending_amount > 0 ? formatMoney(c.pending_amount) : '—' }}
                        </td>
                        <td
                          :class="[
                            td,
                            'text-right tabular-nums whitespace-nowrap',
                            dueClass(c.due),
                          ]"
                          data-company-due
                        >
                          {{ dueText(c.due) }}
                        </td>
                        <td :class="[td, 'text-right whitespace-nowrap']">
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 text-xs font-semibold text-primary-800 hover:underline"
                            :aria-expanded="
                              isOpen(group.reference.id, c.company.id) ? 'true' : 'false'
                            "
                            :aria-controls="`${passportsId}-${group.reference.id}-${c.company.id}`"
                            data-toggle-passports
                            @click="togglePassports(group.reference.id, c.company.id)"
                          >
                            {{ isOpen(group.reference.id, c.company.id) ? 'Hide' : 'Show' }}
                            {{ c.passports.length }}
                            {{ c.passports.length === 1 ? 'passport' : 'passports' }}
                            <svg
                              class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none"
                              :class="isOpen(group.reference.id, c.company.id) ? 'rotate-90' : ''"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M7 5l6 5-6 5V5z" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      <!-- Passport details of this company -->
                      <tr
                        v-if="isOpen(group.reference.id, c.company.id)"
                        :id="`${passportsId}-${group.reference.id}-${c.company.id}`"
                        class="bg-slate-50/70"
                      >
                        <td colspan="8" class="px-3 py-3">
                          <div class="overflow-x-auto rounded-md border border-stroke bg-white">
                            <table class="w-full text-left text-sm" data-passports-table>
                              <thead class="border-b border-stroke text-muted">
                                <tr>
                                  <th scope="col" :class="th">Passport</th>
                                  <th scope="col" :class="th">Status</th>
                                  <th scope="col" :class="[th, 'text-right']">Price</th>
                                  <th scope="col" :class="th">Receipts</th>
                                  <th scope="col" :class="[th, 'text-right']">Paid</th>
                                  <th scope="col" :class="[th, 'text-right']">Due</th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-stroke">
                                <tr v-for="p in c.passports" :key="p.id" :data-passport="p.id">
                                  <td :class="td">
                                    <span class="font-mono text-xs text-muted"
                                      >#{{ p.entry_no }}</span
                                    >
                                    <span class="block font-semibold text-ink">{{
                                      p.passport_name
                                    }}</span>
                                    <span class="block text-xs text-muted">
                                      {{ p.passport_number
                                      }}<template v-if="p.stage"> · {{ p.stage }}</template>
                                    </span>
                                  </td>
                                  <td :class="td">
                                    <span
                                      class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
                                      :class="STATUS_BADGE[p.status].cls"
                                      data-status
                                    >
                                      {{ STATUS_BADGE[p.status].text }}
                                    </span>
                                    <span
                                      v-if="p.short"
                                      class="mt-1 block text-xs font-semibold whitespace-nowrap text-red-700"
                                      data-short
                                    >
                                      Marked full · {{ formatMoney(p.due ?? 0) }} short
                                    </span>
                                    <span
                                      v-if="p.is_returned"
                                      class="mt-1 block text-xs"
                                      :class="
                                        p.paid_amount + p.pending_amount > 0.004
                                          ? 'font-semibold text-sky-700'
                                          : 'text-muted'
                                      "
                                      data-returned-note
                                    >
                                      <template v-if="p.paid_amount + p.pending_amount > 0.004">
                                        {{ formatMoney(p.paid_amount + p.pending_amount) }} paid:
                                        credit to the reference
                                      </template>
                                      <template v-else>No price due</template>
                                    </span>
                                  </td>
                                  <td
                                    :class="[td, 'text-right whitespace-nowrap']"
                                    data-passport-price
                                  >
                                    <template v-if="p.price !== null">
                                      <span
                                        class="font-semibold tabular-nums"
                                        :class="
                                          p.is_returned ? 'text-muted line-through' : 'text-ink'
                                        "
                                        >{{ formatMoney(p.price) }}</span
                                      >
                                      <span
                                        class="block text-xs"
                                        :class="
                                          p.price_source === 'special'
                                            ? 'font-semibold text-violet-700'
                                            : 'text-muted'
                                        "
                                      >
                                        {{
                                          p.price_source ? PRICE_SOURCE_TEXT[p.price_source] : ''
                                        }}
                                      </span>
                                    </template>
                                    <span v-else class="text-xs font-semibold text-amber-700"
                                      >No price</span
                                    >
                                    <button
                                      v-if="canSetPrices"
                                      type="button"
                                      class="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-800 hover:underline"
                                      data-edit-passport-price
                                      @click="editPassportPrice(p)"
                                    >
                                      <svg
                                        class="h-3.5 w-3.5"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M13.6 3.4a2 2 0 0 1 2.8 2.8l-8.6 8.6-3.6.8.8-3.6 8.6-8.6z"
                                        />
                                      </svg>
                                      {{ p.price_source === 'special' ? 'Edit' : 'Special price' }}
                                    </button>
                                  </td>
                                  <td :class="td">
                                    <ul
                                      v-if="p.receipts.length"
                                      class="space-y-1 text-xs"
                                      data-receipts
                                    >
                                      <li
                                        v-for="r in p.receipts"
                                        :key="r.id"
                                        class="whitespace-nowrap"
                                        :data-receipt="r.receipt_no"
                                      >
                                        <RouterLink
                                          v-if="canOpenLedger"
                                          :to="{
                                            name: 'accounts-cash-receipts',
                                            query: { q: r.receipt_no },
                                          }"
                                          class="font-mono font-semibold text-primary-800 underline-offset-4 hover:underline"
                                          >{{ r.receipt_no }}</RouterLink
                                        >
                                        <span v-else class="font-mono font-semibold text-ink">{{
                                          r.receipt_no
                                        }}</span>
                                        <span class="text-muted">
                                          · {{ toDisplayDate(r.date) }} ·
                                        </span>
                                        <span
                                          class="font-semibold"
                                          :class="r.is_full_payment ? 'text-ink' : 'text-sky-800'"
                                          >{{ r.is_full_payment ? 'Full' : 'Part' }}</span
                                        >
                                        <span class="text-muted"> · </span>
                                        <span class="font-semibold text-ink tabular-nums">{{
                                          formatMoney(r.share)
                                        }}</span>
                                        <span
                                          v-if="r.line_passports > 1"
                                          class="text-muted"
                                          :title="
                                            r.split_by_price
                                              ? 'Split by the passports\' prices'
                                              : 'Split evenly'
                                          "
                                        >
                                          (of {{ formatMoney(r.line_amount) }} for
                                          {{ r.line_passports }})</span
                                        >
                                        <span
                                          class="font-medium"
                                          :class="APPROVAL_TEXT[r.status].cls"
                                        >
                                          · {{ APPROVAL_TEXT[r.status].text }}</span
                                        >
                                      </li>
                                    </ul>
                                    <span v-else class="text-xs text-muted">No receipt yet</span>
                                  </td>
                                  <td :class="[td, 'text-right whitespace-nowrap tabular-nums']">
                                    <span class="font-semibold text-green-700" data-paid-amount>{{
                                      formatMoney(p.paid_amount)
                                    }}</span>
                                    <span
                                      v-if="p.pending_amount > 0"
                                      class="block text-xs text-amber-700"
                                    >
                                      + {{ formatMoney(p.pending_amount) }} waiting
                                    </span>
                                  </td>
                                  <td
                                    :class="[
                                      td,
                                      'text-right whitespace-nowrap tabular-nums',
                                      dueClass(p.due),
                                    ]"
                                    data-passport-due
                                  >
                                    {{ dueText(p.due) }}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </li>
          </ul>

          <nav
            v-if="meta"
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <p class="text-sm text-muted">
              Showing {{ showingFrom }}–{{ showingTo }} of {{ meta.total }}
              {{ meta.total === 1 ? 'reference' : 'references' }}
            </p>
            <div v-if="meta.last_page > 1" class="flex items-center gap-2">
              <RouterLink
                v-if="meta.current_page > 1"
                :to="pageLink(meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="text-sm text-muted">
                Page {{ meta.current_page }} of {{ meta.last_page }}
              </span>
              <RouterLink
                v-if="meta.current_page < meta.last_page"
                :to="pageLink(meta.current_page + 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>

    <PriceDialog
      v-if="canSetPrices"
      v-model:open="priceOpen"
      :title="`Special price: ${priceTarget?.title ?? ''}`"
      description="A special price for this passport only. Remove it to go back to the party rate or the standard rate."
      :value="priceTarget?.value ?? null"
      :removable="priceTarget !== null && priceTarget.value !== null"
      remove-label="Remove special price"
      :busy="priceSaving"
      :error="priceError"
      @save="savePrice"
    />
  </div>
</template>
