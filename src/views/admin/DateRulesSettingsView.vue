<script setup lang="ts">
import { computed, reactive, ref, shallowRef, useId } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import {
  deleteCountryDateRules,
  fetchDateRules,
  updateDateRules,
  type DateRule,
  type DateRulesPage,
  type DateRuleUnit,
} from '@/api/dateRules'
import { useToast } from '@/composables/useToast'
import type { DateRuleKey } from '@/lib/dateRules'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { useCountriesStore } from '@/stores/countries'
import { useWorkflowStore } from '@/stores/workflow'
import type { CountrySummary } from '@/types/country'

/**
 * Settings → Date rules (super admin only): the validity periods, expiry warnings and
 * passport limits of each company country (where the worker goes; Malaysia today). A
 * passport uses the rules of its company's country.
 *
 * When the company starts working in another country, "Set rules for a country" opens an
 * empty form: every rule must be filled in before it can be saved. A change applies from
 * then on: dates already saved on passports keep their value.
 */
const toast = useToast()
const countriesStore = useCountriesStore()
const workflow = useWorkflowStore()
const idPrefix = useId()

const page = shallowRef<DateRulesPage | null>(null)
const loadError = ref<string | null>(null)
const isLoading = ref(false)
/** The country shown; null before one is chosen. */
const country = ref<string | null>(null)
/** What the inputs show, as typed. */
const form = reactive<Partial<Record<DateRuleKey, string | number>>>({})
const errors = ref<Record<string, string>>({})
const isSaving = ref(false)

const rules = computed(() => page.value?.rules ?? [])
/** The country shown has no rules yet: every rule must be entered. */
const isNew = computed(() => country.value !== null && rules.value.every((r) => r.value === null))

function show(next: DateRulesPage) {
  page.value = next
  for (const key of Object.keys(form)) delete form[key as DateRuleKey]
  for (const rule of next.rules) form[rule.key] = rule.value === null ? '' : String(rule.value)
  errors.value = {}
}

async function load(code: string | null) {
  loadError.value = null
  isLoading.value = true
  try {
    let next = await fetchDateRules(code)
    // First visit: open the first country with rules (Malaysia).
    if (code === null && next.countries[0]) next = await fetchDateRules(next.countries[0].code)
    show(next)
    country.value = next.country?.code ?? null
  } catch (error) {
    if (errorStatus(error) === 403)
      loadError.value = 'Only the super admin can change the date rules.'
    else if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the date rules. Please try again.')
  } finally {
    isLoading.value = false
  }
}
load(null)

/* ---------- Choosing the country ---------- */

const pickerCountry = ref<CountrySummary | null>(null)

function choose(code: string) {
  if (code === country.value || isLoading.value) return
  if (changed.value.length > 0 && !window.confirm('Discard the changes that are not saved?')) return
  void load(code)
}

function onCountryPicked(value: CountrySummary | null) {
  pickerCountry.value = null
  if (value) choose(value.code)
}

/** One tab per country with rules, plus the new one being set up. */
const tabs = computed(() => {
  const list = (page.value?.countries ?? []).map((c) => ({
    code: c.code,
    name: c.name,
    note: c.complete ? '' : 'incomplete',
  }))
  const current = page.value?.country
  if (current && !list.some((c) => c.code === current.code))
    list.push({ code: current.code, name: current.name, note: 'new' })
  return list
})

const countryName = computed(() => page.value?.country?.name ?? country.value ?? '')

/* ---------- The form ---------- */

/** The rules by group, in the API's order. */
const groups = computed(() => {
  const map = new Map<string, DateRule[]>()
  for (const rule of rules.value) map.set(rule.group, [...(map.get(rule.group) ?? []), rule])
  return [...map.entries()].map(([name, list]) => ({ name, list }))
})

const UNIT_ONE: Record<DateRuleUnit, string> = { days: 'day', months: 'month', years: 'year' }
const amount = (value: number, unit: DateRuleUnit) =>
  `${value} ${value === 1 ? UNIT_ONE[unit] : unit}`

// type="number" inputs give numbers, so compare as text.
const typed = (rule: DateRule) => String(form[rule.key] ?? '').trim()
const saved = (rule: DateRule) => (rule.value === null ? '' : String(rule.value))

/** An input's problem before it is sent, or undefined. */
function problem(rule: DateRule): string | undefined {
  const text = typed(rule)
  if (text === '') return `Enter a number of ${rule.unit}.`
  if (!/^\d+$/.test(text)) return `Enter a whole number of ${rule.unit}.`
  const value = Number(text)
  if (value < rule.min) return `At least ${amount(rule.min, rule.unit)}.`
  if (value > rule.max) return `At most ${amount(rule.max, rule.unit)}.`
  return undefined
}

const changed = computed(() => rules.value.filter((rule) => typed(rule) !== saved(rule)))
/** A new country: how many rules are filled in. */
const filled = computed(() => rules.value.filter((rule) => typed(rule) !== '').length)

function discard() {
  if (page.value) show(page.value)
}

async function save() {
  const code = country.value
  if (isSaving.value || !code || changed.value.length === 0) return
  // A new country sends every rule; otherwise only what changed.
  const toSend = isNew.value ? rules.value : changed.value
  const found: Record<string, string> = {}
  for (const rule of toSend) {
    const message = problem(rule)
    if (message) found[rule.key] = message
  }
  if (Object.keys(found).length > 0) {
    if (isNew.value) found.form = 'Fill in every rule for a new country.'
    errors.value = found
    return
  }
  errors.value = {}

  const values: Partial<Record<DateRuleKey, number>> = {}
  for (const rule of toSend) values[rule.key] = Number(typed(rule))

  isSaving.value = true
  try {
    show(await updateDateRules(values, code))
    toast.success(`Date rules for ${countryName.value} saved. They apply from now on.`)
    // This session's forms and step pages pick up the new values at once.
    await refreshApp()
  } catch (error) {
    if (errorStatus(error) === 422) errors.value = fieldErrors(error)
    else if (errorStatus(error) !== 401)
      errors.value = {
        form: errorMessage(error, 'Could not save the date rules. Nothing was changed.'),
      }
  } finally {
    isSaving.value = false
  }
}

async function refreshApp() {
  await Promise.all([countriesStore.refreshDefaults(), workflow.reloadConfig()])
}

/* ---------- Removing a country's rules ---------- */

const removeOpen = ref(false)
const removeBusy = ref(false)
const removeError = ref<string | null>(null)
const companiesIn = computed(
  () => page.value?.countries.find((c) => c.code === country.value)?.companies ?? 0,
)

function askRemove() {
  removeError.value = null
  removeOpen.value = true
}

async function confirmRemove() {
  const code = country.value
  if (!code) return
  removeBusy.value = true
  removeError.value = null
  try {
    await deleteCountryDateRules(code)
    removeOpen.value = false
    toast.success(`Date rules for ${countryName.value} removed.`)
    country.value = null
    await Promise.all([load(null), refreshApp()])
  } catch (error) {
    removeError.value = errorMessage(error, 'Could not remove the rules.')
  } finally {
    removeBusy.value = false
  }
}

const inputClass =
  'block w-28 rounded-lg border bg-white px-3 py-2 text-right text-slate-900 tabular-nums shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <!-- Shown inside SettingsLayout, which provides the page heading and tabs. -->
  <div class="space-y-6">
    <div v-if="loadError" role="alert" class="glass-card space-y-4 p-8 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load(country)">
        Try again
      </button>
    </div>

    <div v-else-if="!page" class="glass-card animate-pulse space-y-3 p-6" data-skeleton>
      <div v-for="n in 5" :key="n" class="h-4 rounded bg-slate-200" />
      <span class="sr-only">Loading…</span>
    </div>

    <template v-else>
      <!-- The company countries -->
      <section class="glass-card p-5 sm:p-6" aria-labelledby="date-rules-country-heading">
        <h2 id="date-rules-country-heading" class="text-lg font-semibold text-ink">Country</h2>
        <p class="mt-1 text-sm text-muted">
          Each company country (where the worker goes) has its own rules. A passport uses the rules
          of its company's country.
        </p>

        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div
            v-if="tabs.length > 0"
            role="tablist"
            aria-label="Date rules of"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="tab in tabs"
              :key="tab.code"
              type="button"
              role="tab"
              :aria-selected="tab.code === country"
              class="rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors"
              :class="
                tab.code === country
                  ? 'bg-primary-900 text-white ring-primary-900'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              "
              :data-country-tab="tab.code"
              @click="choose(tab.code)"
            >
              {{ tab.name }}
              <span v-if="tab.note" class="ml-1 text-xs opacity-75">({{ tab.note }})</span>
            </button>
          </div>
          <p v-else class="text-sm text-slate-700" data-no-countries>
            No country has date rules yet.
          </p>
          <div class="ml-auto w-full sm:w-64" data-add-country>
            <CountrySelect
              :model-value="pickerCountry"
              label="Set rules for a country"
              placeholder="Search country…"
              @update:model-value="onCountryPicked"
            />
          </div>
        </div>

        <!-- Companies in countries without rules use the built-in values. -->
        <div
          v-if="page.missing.length > 0"
          role="status"
          class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-missing
        >
          <p class="font-medium">These company countries have no date rules yet:</p>
          <ul class="mt-1 flex flex-wrap gap-2">
            <li v-for="m in page.missing" :key="m.code">
              <button
                type="button"
                class="rounded-full bg-white px-3 py-1 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                :data-missing-country="m.code"
                @click="choose(m.code)"
              >
                {{ m.name }} · {{ m.companies }} {{ m.companies === 1 ? 'company' : 'companies' }}
              </button>
            </li>
          </ul>
          <p class="mt-1 text-xs">
            Until you set them, their passports use the app's built-in values.
          </p>
        </div>
      </section>

      <form v-if="country" class="space-y-6" novalidate @submit.prevent="save">
        <p class="text-sm text-slate-700" data-country-note>
          <template v-if="isNew">
            New rules for <strong>{{ countryName }}</strong
            >. Fill in every rule ({{ filled }} of {{ rules.length }} done).
          </template>
          <template v-else>
            Rules for <strong>{{ countryName }}</strong
            >. A change applies from now on: dates already saved on passports keep their value.
          </template>
        </p>

        <section
          v-for="group in groups"
          :key="group.name"
          class="glass-card p-5 sm:p-6"
          :aria-labelledby="`${idPrefix}-${group.name}`"
          :data-group="group.name"
        >
          <h2 :id="`${idPrefix}-${group.name}`" class="text-lg font-semibold text-ink">
            {{ group.name }}
          </h2>
          <ul class="mt-4 divide-y divide-stroke">
            <li
              v-for="rule in group.list"
              :key="rule.key"
              class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0"
              :data-rule="rule.key"
            >
              <div class="min-w-0 flex-1 basis-64">
                <label :for="`${idPrefix}-${rule.key}`" class="font-medium text-slate-900">
                  {{ rule.label }}
                  <span v-if="isNew" class="text-red-700" aria-hidden="true">*</span>
                </label>
                <p :id="`${idPrefix}-${rule.key}-help`" class="mt-0.5 text-sm text-muted">
                  {{ rule.help }}
                </p>
                <p class="mt-1 text-xs text-muted" data-limits>
                  Allowed {{ rule.min }}–{{ rule.max }} {{ rule.unit }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-1">
                <div class="flex items-center gap-2">
                  <input
                    :id="`${idPrefix}-${rule.key}`"
                    v-model="form[rule.key]"
                    type="number"
                    inputmode="numeric"
                    step="1"
                    :min="rule.min"
                    :max="rule.max"
                    :required="isNew"
                    :class="[inputClass, errors[rule.key] ? 'border-red-500' : 'border-slate-300']"
                    :aria-invalid="errors[rule.key] ? 'true' : undefined"
                    :aria-describedby="`${idPrefix}-${rule.key}-help${errors[rule.key] ? ` ${idPrefix}-${rule.key}-error` : ''}`"
                    @input="delete errors[rule.key]"
                  />
                  <span class="w-14 text-sm text-slate-700">{{ rule.unit }}</span>
                </div>
                <p
                  v-if="errors[rule.key]"
                  :id="`${idPrefix}-${rule.key}-error`"
                  class="max-w-56 text-right text-sm text-red-700"
                >
                  {{ errors[rule.key] }}
                </p>
              </div>
            </li>
          </ul>
        </section>

        <p
          v-if="errors.form || errors.country"
          role="alert"
          class="text-sm font-medium text-red-700"
        >
          {{ errors.form || errors.country }}
        </p>

        <div
          class="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-slate-200 backdrop-blur"
        >
          <span class="mr-auto text-sm text-muted" data-changed>
            {{
              changed.length === 0
                ? 'No changes'
                : `${changed.length} change${changed.length === 1 ? '' : 's'} not saved`
            }}
          </span>
          <button
            v-if="!isNew"
            type="button"
            class="btn text-sm text-red-700"
            :disabled="isSaving"
            data-remove-country
            @click="askRemove"
          >
            Remove {{ countryName }} rules
          </button>
          <button
            type="button"
            class="btn text-sm"
            :disabled="changed.length === 0 || isSaving"
            data-discard
            @click="discard"
          >
            Discard
          </button>
          <button
            type="submit"
            class="btn btn-accent"
            :disabled="changed.length === 0 || isSaving"
            data-save
          >
            {{ isSaving ? 'Saving…' : isNew ? `Save ${countryName} rules` : 'Save date rules' }}
          </button>
        </div>
      </form>

      <p v-else class="glass-card p-6 text-sm text-slate-700" data-choose-country>
        Choose a country under “Set rules for a country” to set its date rules.
      </p>
    </template>

    <ConfirmDialog
      v-model:open="removeOpen"
      :title="`Remove ${countryName} rules`"
      confirm-label="Remove"
      :busy="removeBusy"
      :error="removeError"
      danger
      @confirm="confirmRemove"
    >
      <template v-if="companiesIn > 0">
        {{ countryName }} has {{ companiesIn }} {{ companiesIn === 1 ? 'company' : 'companies' }}.
        Until you set its rules again, their passports use the app's built-in values.
      </template>
      <template v-else>The rules for {{ countryName }} will be deleted.</template>
    </ConfirmDialog>
  </div>
</template>
