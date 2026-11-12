<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PartyRateDialog from '@/components/accounts/PartyRateDialog.vue'
import StandardRateDialog from '@/components/accounts/StandardRateDialog.vue'
import { fetchPassportRates } from '@/api/accounts'
import { formatMoney } from '@/lib/accounts'
import { countryName } from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import type { PassportRates } from '@/types/accounts'

/**
 * Party Rates (the accounts head only): every passport price, in two tabs.
 *
 * - Reference / party rates: a party's own price per passport for a company, used instead of
 *   the company's standard rate. Add, change or remove one.
 * - Company standard rates: each company's price per passport, paid by every party without
 *   its own rate. Add, change or remove one.
 *
 * Saving a rate prices the passports of that scope that have no price; "Also change existing
 * passports" re-prices the others (never a special price). The tab lives in the URL (?tab=).
 */
type Tab = 'party' | 'standard'
type Company = PassportRates['companies'][number]
type PartyRate = PassportRates['references'][number]

const route = useRoute()
const router = useRouter()
const ids = { tabs: useId(), party: useId(), standard: useId() }

const tab = computed<Tab>(() => (route.query.tab === 'standard' ? 'standard' : 'party'))
function setTab(value: Tab) {
  router.replace({ query: { ...route.query, tab: value === 'party' ? undefined : value } })
}
/** Arrow keys move between the tabs. */
function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  setTab(tab.value === 'party' ? 'standard' : 'party')
  document.getElementById(`${ids.tabs}-${tab.value === 'party' ? 'standard' : 'party'}`)?.focus()
}

const rates = shallowRef<PassportRates | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    rates.value = await fetchPassportRates()
  } catch (error) {
    loadError.value = errorMessage(error, 'Could not load the rates. Please try again.')
  }
}
load()

const unpriced = computed(() =>
  (rates.value?.companies ?? []).reduce((sum, c) => sum + c.no_price, 0),
)

/* ---------- Reference / party rates ---------- */

const partyFilter = ref('')
const partyRates = computed(() => {
  const q = partyFilter.value.trim().toLowerCase()
  const list = rates.value?.references ?? []
  return q
    ? list.filter(
        (r) =>
          r.reference.name.toLowerCase().includes(q) ||
          (r.reference.code ?? '').toLowerCase().includes(q) ||
          r.company.name.toLowerCase().includes(q),
      )
    : list
})
const partyCount = computed(
  () => new Set((rates.value?.references ?? []).map((r) => r.reference.id)).size,
)

const partyOpen = ref(false)
/** The rate being edited (null: adding). */
const partyTarget = ref<PartyRate | null>(null)
function addParty() {
  partyTarget.value = null
  partyOpen.value = true
}
function editParty(r: PartyRate) {
  partyTarget.value = r
  partyOpen.value = true
}

/** Party rate vs the standard rate: how much less (or more) the party pays. */
function difference(r: PartyRate): { text: string; cls: string } | null {
  if (r.company_rate === null) return null
  const diff = r.rate - r.company_rate
  if (Math.abs(diff) < 0.005) return { text: 'Same as standard', cls: 'text-muted' }
  return diff < 0
    ? { text: `${formatMoney(-diff)} less`, cls: 'text-green-700' }
    : { text: `${formatMoney(diff)} more`, cls: 'text-amber-700' }
}

/* ---------- Company standard rates ---------- */

const standardFilter = ref('')
const companies = computed(() => {
  const q = standardFilter.value.trim().toLowerCase()
  const list = rates.value?.companies ?? []
  return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list
})
const withRate = computed(
  () => (rates.value?.companies ?? []).filter((c) => c.rate !== null).length,
)

const standardOpen = ref(false)
/** The company being edited (null: adding, the company is chosen in the dialog). */
const standardTarget = ref<Company | null>(null)
function addStandard() {
  standardTarget.value = null
  standardOpen.value = true
}
function editStandard(c: Company) {
  standardTarget.value = c
  standardOpen.value = true
}

const th = 'px-3 py-3 text-xs font-semibold tracking-wider whitespace-nowrap uppercase'
const td = 'px-3 py-3'
const inputClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const tabClass = (active: boolean) =>
  [
    '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap',
    active
      ? 'border-primary-800 text-primary-900'
      : 'border-transparent text-muted hover:border-slate-300 hover:text-primary-800',
  ].join(' ')
const countClass = (active: boolean) =>
  [
    'ml-1.5 rounded-full px-2 py-0.5 text-xs tabular-nums',
    active ? 'bg-primary-900 text-white' : 'bg-slate-100 text-slate-700',
  ].join(' ')
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Party Rates</h1>
    <p class="mt-1 text-sm text-muted">
      The price per passport: a party's own rate for a company if it has one, else the company's
      standard rate. A passport keeps the price it got when it was entered.
    </p>

    <div v-if="loadError" role="alert" class="glass-card mt-6 space-y-4 p-6 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <template v-else>
      <p
        v-if="unpriced > 0"
        class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        data-unpriced
      >
        {{ unpriced }} passport{{ unpriced === 1 ? ' has' : 's have' }} no price yet, so cash cannot
        be received for {{ unpriced === 1 ? 'it' : 'them' }}. Add the company's standard rate (or
        the party's rate) and they get it.
      </p>

      <!-- Tabs -->
      <div
        class="mt-6 flex gap-1 overflow-x-auto border-b border-stroke"
        role="tablist"
        aria-label="Rates"
        data-tabs
      >
        <button
          :id="`${ids.tabs}-party`"
          type="button"
          role="tab"
          :aria-selected="tab === 'party' ? 'true' : 'false'"
          :aria-controls="ids.party"
          :tabindex="tab === 'party' ? 0 : -1"
          :class="tabClass(tab === 'party')"
          data-tab="party"
          @click="setTab('party')"
          @keydown="onTabKey"
        >
          Reference / party rates
          <span :class="countClass(tab === 'party')">{{ rates?.references.length ?? '–' }}</span>
        </button>
        <button
          :id="`${ids.tabs}-standard`"
          type="button"
          role="tab"
          :aria-selected="tab === 'standard' ? 'true' : 'false'"
          :aria-controls="ids.standard"
          :tabindex="tab === 'standard' ? 0 : -1"
          :class="tabClass(tab === 'standard')"
          data-tab="standard"
          @click="setTab('standard')"
          @keydown="onTabKey"
        >
          Company standard rates
          <span :class="countClass(tab === 'standard')">{{ rates ? withRate : '–' }}</span>
        </button>
      </div>

      <!-- Tab 1: reference / party rates -->
      <section
        v-if="tab === 'party'"
        :id="ids.party"
        role="tabpanel"
        :aria-labelledby="`${ids.tabs}-party`"
        class="glass-card mt-4 p-4 sm:p-6"
        data-panel="party"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-primary-900">Reference / party rates</h2>
            <p v-if="rates" class="text-sm text-muted" data-party-summary>
              {{ rates.references.length }}
              {{ rates.references.length === 1 ? 'rate' : 'rates' }} for {{ partyCount }}
              {{ partyCount === 1 ? 'party' : 'parties' }}. Other parties pay the standard rate.
            </p>
          </div>
          <button
            type="button"
            class="btn btn-primary text-sm"
            :disabled="!rates"
            data-add-party-rate
            @click="addParty"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add party rate
          </button>
        </div>

        <p v-if="!rates" class="mt-4 animate-pulse text-sm text-muted">Loading…</p>
        <div
          v-else-if="!rates.references.length"
          class="mt-6 rounded-lg border border-dashed border-slate-300 py-10 text-center"
          data-party-empty
        >
          <p class="font-semibold text-ink">No party rates yet</p>
          <p class="mt-1 text-sm text-muted">
            Every party pays the company's standard rate. Add a party rate for a party with its own
            deal.
          </p>
        </div>
        <template v-else>
          <div class="mt-4 w-full sm:w-72">
            <label for="party-rates-filter" class="sr-only">Find a party or company</label>
            <input
              id="party-rates-filter"
              v-model="partyFilter"
              type="search"
              placeholder="Find a party or company…"
              :class="inputClass"
            />
          </div>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-sm" data-party-rates>
              <caption class="sr-only">
                Each party's own rate per passport for a company, with the standard rate.
              </caption>
              <thead class="border-b border-stroke text-muted">
                <tr>
                  <th scope="col" :class="th">Reference / party</th>
                  <th scope="col" :class="th">Company</th>
                  <th scope="col" :class="[th, 'text-right']">Party rate</th>
                  <th scope="col" :class="[th, 'text-right']">Standard rate</th>
                  <th scope="col" :class="th"><span class="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr
                  v-for="r in partyRates"
                  :key="`${r.reference.id}-${r.company.id}`"
                  :data-party-rate="`${r.reference.id}-${r.company.id}`"
                >
                  <th scope="row" :class="[td, 'text-left font-semibold text-ink']">
                    {{ r.reference.name }}
                    <span v-if="r.reference.code" class="block text-xs font-normal text-muted">
                      {{ r.reference.code }}
                    </span>
                  </th>
                  <td :class="td">
                    {{ r.company.name }}
                    <span class="block text-xs text-muted">{{
                      countryName(r.company.country_code)
                    }}</span>
                  </td>
                  <td :class="[td, 'text-right whitespace-nowrap tabular-nums']">
                    <span class="font-semibold text-ink">{{ formatMoney(r.rate) }}</span>
                    <span
                      v-if="difference(r)"
                      class="block text-xs"
                      :class="difference(r)!.cls"
                      data-difference
                      >{{ difference(r)!.text }}</span
                    >
                  </td>
                  <td :class="[td, 'text-right whitespace-nowrap text-muted tabular-nums']">
                    {{ r.company_rate !== null ? formatMoney(r.company_rate) : 'Not set' }}
                  </td>
                  <td :class="[td, 'text-right']">
                    <button
                      type="button"
                      class="text-sm font-semibold text-primary-800 hover:underline"
                      data-edit-party-rate
                      @click="editParty(r)"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
                <tr v-if="!partyRates.length">
                  <td colspan="5" class="py-6 text-center text-muted">No party rates match.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <!-- Tab 2: company standard rates -->
      <section
        v-else
        :id="ids.standard"
        role="tabpanel"
        :aria-labelledby="`${ids.tabs}-standard`"
        class="glass-card mt-4 p-4 sm:p-6"
        data-panel="standard"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-primary-900">Company standard rates</h2>
            <p v-if="rates" class="text-sm text-muted" data-standard-summary>
              {{ withRate }} of {{ rates.companies.length }}
              {{ rates.companies.length === 1 ? 'company has' : 'companies have' }} a standard rate.
            </p>
          </div>
          <button
            type="button"
            class="btn btn-primary text-sm"
            :disabled="!rates"
            data-add-standard-rate
            @click="addStandard"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add standard rate
          </button>
        </div>

        <p v-if="!rates" class="mt-4 animate-pulse text-sm text-muted">Loading…</p>
        <template v-else>
          <div class="mt-4 w-full sm:w-72">
            <label for="standard-filter" class="sr-only">Find a company</label>
            <input
              id="standard-filter"
              v-model="standardFilter"
              type="search"
              placeholder="Find a company…"
              :class="inputClass"
            />
          </div>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-sm" data-standard-rates>
              <caption class="sr-only">
                Each company's standard rate per passport.
              </caption>
              <thead class="border-b border-stroke text-muted">
                <tr>
                  <th scope="col" :class="th">Company</th>
                  <th scope="col" :class="[th, 'text-right']">Passports</th>
                  <th scope="col" :class="[th, 'text-right']">No price</th>
                  <th scope="col" :class="[th, 'text-right']">Standard rate</th>
                  <th scope="col" :class="th"><span class="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="c in companies" :key="c.id" :data-company="c.id">
                  <th scope="row" :class="[td, 'text-left font-semibold text-ink']">
                    {{ c.name }}
                    <span class="block text-xs font-normal text-muted">
                      {{ countryName(c.country_code)
                      }}<template v-if="!c.is_active"> · Inactive</template>
                    </span>
                  </th>
                  <td :class="[td, 'text-right tabular-nums']">{{ c.passports }}</td>
                  <td
                    :class="[
                      td,
                      'text-right tabular-nums',
                      c.no_price ? 'font-semibold text-amber-700' : 'text-muted',
                    ]"
                  >
                    {{ c.no_price }}
                  </td>
                  <td :class="[td, 'text-right tabular-nums whitespace-nowrap']" data-standard-rate>
                    <span v-if="c.rate !== null" class="font-semibold text-ink">{{
                      formatMoney(c.rate)
                    }}</span>
                    <span
                      v-else
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      >Not set</span
                    >
                  </td>
                  <td :class="[td, 'text-right']">
                    <button
                      type="button"
                      class="text-sm font-semibold text-primary-800 hover:underline"
                      data-edit-standard-rate
                      @click="editStandard(c)"
                    >
                      {{ c.rate === null ? 'Set rate' : 'Edit' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!companies.length">
                  <td colspan="5" class="py-6 text-center text-muted">No companies match.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </template>

    <PartyRateDialog
      v-if="rates"
      v-model:open="partyOpen"
      :rates="rates"
      :rate="partyTarget"
      @saved="load"
    />
    <StandardRateDialog
      v-if="rates"
      v-model:open="standardOpen"
      :companies="rates.companies"
      :company="standardTarget"
      @saved="load"
    />
  </div>
</template>
