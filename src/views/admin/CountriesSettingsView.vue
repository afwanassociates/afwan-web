<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import AddCountryModal from '@/components/AddCountryModal.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import { listAdminCountries, updateCountry } from '@/api/countries'
import { getSettings, updateSettings } from '@/api/settings'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { useCountriesStore } from '@/stores/countries'
import type { AdminCountry, AppDefaults, CountrySummary } from '@/types/country'

const MAX_ROWS = 300

const toast = useToast()
const countries = useCountriesStore()

const searchId = useId()
const statusId = useId()

/** Keeps the dropdowns in the data-entry forms in step with changes made here. */
function refreshCache() {
  countries.reload()
}

/* ---------- Defaults ---------- */

const settings = ref<AppDefaults | null>(null)
const settingsError = ref<string | null>(null)
const companyDefault = ref<CountrySummary | null>(null)
const passportDefault = ref<CountrySummary | null>(null)
const defaultsErrors = ref<Record<string, string>>({})
const isSavingDefaults = ref(false)

const toCountry = (code: string | null): CountrySummary | null =>
  code ? (countries.byCode(code) ?? { code, name: code }) : null

function showDefaults(values: AppDefaults) {
  settings.value = values
  companyDefault.value = toCountry(values.default_company_country_code)
  passportDefault.value = toCountry(values.default_passport_country_code)
}

async function loadSettings() {
  settingsError.value = null
  try {
    const [values] = await Promise.all([getSettings(), countries.load()])
    showDefaults(values)
  } catch (error) {
    settingsError.value =
      errorStatus(error) === 403
        ? 'Only admins can change these settings.'
        : errorMessage(error, 'Could not load the settings.')
  }
}

async function saveDefaults() {
  defaultsErrors.value = {}
  if (!companyDefault.value) {
    defaultsErrors.value.default_company_country_code = 'Select the default company country.'
    return
  }
  isSavingDefaults.value = true
  try {
    const saved = await updateSettings({
      default_company_country_code: companyDefault.value.code,
      default_passport_country_code: passportDefault.value?.code ?? null,
    })
    showDefaults(saved)
    toast.success('Default countries saved.')
    refreshCache()
  } catch (error) {
    defaultsErrors.value = fieldErrors(error)
    if (Object.keys(defaultsErrors.value).length === 0) {
      toast.error(
        errorStatus(error) === 403
          ? 'Only admins can change these settings.'
          : errorMessage(error, 'Could not save the defaults.'),
      )
    }
  } finally {
    isSavingDefaults.value = false
  }
}

watch(companyDefault, () => delete defaultsErrors.value.default_company_country_code)
watch(passportDefault, () => delete defaultsErrors.value.default_passport_country_code)

/** "Default" badges in the country list. */
function defaultRoles(code: string): string[] {
  const roles: string[] = []
  if (settings.value?.default_company_country_code === code) roles.push('companies')
  if (settings.value?.default_passport_country_code === code) roles.push('passports')
  return roles
}

/* ---------- Country list ---------- */

type Status = '' | 'active' | 'inactive'

const search = ref('')
const status = ref<Status>('')
const rows = ref<AdminCountry[]>([])
const total = ref(0)
const hasLoaded = ref(false)
const isLoading = ref(false)
const listError = ref<string | null>(null)
let requestId = 0

async function loadCountries() {
  const id = ++requestId
  isLoading.value = true
  listError.value = null
  try {
    const result = await listAdminCountries({
      q: search.value.trim() || undefined,
      is_active: status.value === '' ? undefined : status.value === 'active' ? 1 : 0,
      per_page: MAX_ROWS,
    })
    if (id !== requestId) return
    rows.value = result.data
    total.value = result.meta.total
    hasLoaded.value = true
  } catch (error) {
    if (id !== requestId) return
    listError.value =
      errorStatus(error) === 403
        ? 'Only admins can manage countries.'
        : errorMessage(error, 'Could not load the countries.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

const debouncedLoad = useDebounce(loadCountries, 300)
watch(status, loadCountries)

const hasFilters = computed(() => search.value.trim() !== '' || status.value !== '')

/** Saves one switch. ToggleSwitch has already shown the new value and rolls back on failure. */
function saveSwitch(country: AdminCountry, field: 'is_active' | 'is_pinned') {
  return async (next: boolean) => {
    const updated = await updateCountry(country.code, { [field]: next })
    Object.assign(country, updated)
    const what =
      field === 'is_active' ? (next ? 'activated' : 'deactivated') : next ? 'pinned' : 'unpinned'
    toast.success(`${country.name} ${what}.`)
    refreshCache()
  }
}

function onSwitchError(error: unknown) {
  // e.g. 422: "Malaysia is the default company country and cannot be deactivated. …"
  const errors = fieldErrors(error)
  toast.error(
    errors.is_active ??
      errors.is_pinned ??
      (errorStatus(error) === 403
        ? 'Only admins can change countries.'
        : errorMessage(error, 'Could not save the change.')),
  )
}

const addOpen = ref(false)

function onCountryAdded(country: AdminCountry) {
  rows.value = [country, ...rows.value.filter((row) => row.code !== country.code)]
  total.value += 1
  toast.success(`${country.name} (${country.code}) added.`)
  refreshCache()
}

onMounted(() => {
  loadSettings()
  loadCountries()
})

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <!-- Shown inside SettingsLayout, which provides the page heading and tabs. -->
  <div class="space-y-6">
    <!-- Defaults -->
    <section class="glass-card p-5 sm:p-6" aria-labelledby="defaults-heading">
      <h2 id="defaults-heading" class="text-lg font-semibold text-ink">Defaults</h2>
      <p class="mt-1 text-sm text-muted">
        Preselected in the data-entry forms; staff can change them.
      </p>

      <div v-if="settingsError" role="alert" class="mt-4 space-y-3">
        <p class="text-red-700">{{ settingsError }}</p>
        <button type="button" class="btn btn-primary text-sm" @click="loadSettings">
          Try again
        </button>
      </div>
      <p v-else-if="!settings" class="mt-4 text-muted" role="status">Loading the defaults…</p>

      <form v-else class="mt-5" novalidate @submit.prevent="saveDefaults">
        <div class="grid gap-5 md:grid-cols-2">
          <CountrySelect
            v-model="companyDefault"
            label="Default country for new companies"
            :error="defaultsErrors.default_company_country_code"
            required
          />
          <CountrySelect
            v-model="passportDefault"
            label="Default passport country"
            placeholder="None"
            none-label="None"
            hint="“None” leaves the passport country empty on new entries."
            :error="defaultsErrors.default_passport_country_code"
          />
        </div>
        <div class="mt-5 flex justify-end">
          <button type="submit" class="btn btn-accent" :disabled="isSavingDefaults">
            {{ isSavingDefaults ? 'Saving…' : 'Save defaults' }}
          </button>
        </div>
      </form>
    </section>

    <!-- Country list -->
    <section class="glass-card p-5 sm:p-6" aria-labelledby="countries-heading">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="countries-heading" class="text-lg font-semibold text-ink">Country list</h2>
          <p class="mt-1 text-sm text-muted">
            Inactive countries are hidden from dropdowns. Pinned countries are listed first.
          </p>
        </div>
        <button type="button" class="btn btn-primary text-sm" @click="addOpen = true">
          Add country
        </button>
      </div>

      <div role="search" class="mt-5 grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Name or code"
            :class="inputClass"
            @input="debouncedLoad.run()"
          />
        </div>
        <div>
          <label :for="statusId" class="block text-sm font-medium text-slate-700">Status</label>
          <select :id="statusId" v-model="status" :class="inputClass">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="listError" role="alert" class="space-y-4 py-10 text-center">
          <p class="text-red-700">{{ listError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="loadCountries">
            Try again
          </button>
        </div>

        <div v-else-if="!hasLoaded" class="animate-pulse space-y-3 py-4">
          <div v-for="n in 8" :key="n" class="flex gap-4">
            <div class="h-4 w-10 rounded bg-slate-200" />
            <div class="h-4 w-1/3 rounded bg-slate-200" />
            <div class="h-4 w-12 rounded bg-slate-200" />
            <div class="h-4 w-12 rounded bg-slate-200" />
          </div>
          <span class="sr-only">Loading countries…</span>
        </div>

        <div v-else-if="rows.length === 0" class="py-12 text-center">
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No countries match your search.' : 'No countries yet.' }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ hasFilters ? 'Try another name or code.' : 'Add the first country.' }}
          </p>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <!-- Phones: cards -->
          <ul class="divide-y divide-stroke md:hidden">
            <li v-for="country in rows" :key="country.code" class="py-4">
              <div class="flex items-start justify-between gap-3">
                <p class="min-w-0 font-semibold text-primary-900">
                  <span class="mr-2 font-mono text-sm text-muted">{{ country.code }}</span>
                  {{ country.name }}
                </p>
                <div class="flex shrink-0 flex-wrap justify-end gap-1">
                  <span
                    v-for="role in defaultRoles(country.code)"
                    :key="role"
                    class="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-800"
                  >
                    Default · {{ role }}
                  </span>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                <span class="flex items-center gap-2">
                  <ToggleSwitch
                    v-model="country.is_active"
                    :label="`Active: ${country.name}`"
                    :save="saveSwitch(country, 'is_active')"
                    @error="onSwitchError"
                  />
                  <span aria-hidden="true">Active</span>
                </span>
                <span class="flex items-center gap-2">
                  <ToggleSwitch
                    v-model="country.is_pinned"
                    :label="`Pinned: ${country.name}`"
                    :save="saveSwitch(country, 'is_pinned')"
                    @error="onSwitchError"
                  />
                  <span aria-hidden="true">Pinned</span>
                </span>
              </div>
              <p class="mt-2 text-xs text-muted">
                {{ country.companies_count }} companies · {{ country.passport_entries_count }}
                passports
              </p>
            </li>
          </ul>

          <!-- Tablets and up: table -->
          <div class="hidden overflow-x-auto md:block">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" class="py-3 pr-4 font-semibold">Code</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Country</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Active</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Pinned</th>
                  <th scope="col" class="py-3 pr-4 text-right font-semibold">Companies</th>
                  <th scope="col" class="py-3 text-right font-semibold">Passports</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="country in rows" :key="country.code" class="align-middle">
                  <td class="py-3 pr-4 font-mono text-slate-700">{{ country.code }}</td>
                  <td class="py-3 pr-4">
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold text-primary-900">{{ country.name }}</span>
                      <span
                        v-for="role in defaultRoles(country.code)"
                        :key="role"
                        class="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-800"
                      >
                        Default · {{ role }}
                      </span>
                    </span>
                  </td>
                  <td class="py-3 pr-4">
                    <ToggleSwitch
                      v-model="country.is_active"
                      :label="`Active: ${country.name}`"
                      :save="saveSwitch(country, 'is_active')"
                      @error="onSwitchError"
                    />
                  </td>
                  <td class="py-3 pr-4">
                    <ToggleSwitch
                      v-model="country.is_pinned"
                      :label="`Pinned: ${country.name}`"
                      :save="saveSwitch(country, 'is_pinned')"
                      @error="onSwitchError"
                    />
                  </td>
                  <td class="py-3 pr-4 text-right text-slate-700 tabular-nums">
                    {{ country.companies_count }}
                  </td>
                  <td class="py-3 text-right text-slate-700 tabular-nums">
                    {{ country.passport_entries_count }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="total > rows.length" class="mt-4 text-sm text-muted">
            Showing the first {{ rows.length }} of {{ total }}. Search to narrow the list.
          </p>
        </div>
      </div>
    </section>

    <AddCountryModal v-model:open="addOpen" @saved="onCountryAdded" />
  </div>
</template>
