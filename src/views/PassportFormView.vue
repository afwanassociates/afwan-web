<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SearchSelect from '@/components/SearchSelect.vue'
import QuickAddModal, { type QuickAddValues } from '@/components/QuickAddModal.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import ReferenceTypeToggle from '@/components/ReferenceTypeToggle.vue'
import { createPassport, getPassport, updatePassport } from '@/api/passports'
import { createReference, searchReferences } from '@/api/references'
import { createCompany, searchCompanies } from '@/api/companies'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { addDays, toApiDate, toDisplayDate, todayApiDate } from '@/lib/dates'
import { useCountriesStore } from '@/stores/countries'
import { useWorkflowStore } from '@/stores/workflow'
import {
  PASSPORT_NAME_MAX,
  normalizePassportName,
  normalizePassportNameInput,
  normalizePassportNumber,
  validatePassportForm,
  type PassportFormErrors,
  type PassportFormValues,
} from '@/lib/passportRules'
import type {
  Company,
  CompanySummary,
  PassportEntry,
  PassportPayload,
  Reference,
  ReferenceSummary,
  ReferenceType,
} from '@/types/passport'
import type { CountrySummary } from '@/types/country'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const countries = useCountriesStore()
const workflow = useWorkflowStore()

const nameId = useId()
const numberId = useId()
const dateId = useId()
const birthId = useId()
const expiryId = useId()

const entryId = computed(() => (route.name === 'passport-edit' ? Number(route.params.id) : null))
const isEdit = computed(() => entryId.value !== null)

/* ---------- Form state ---------- */

const today = todayApiDate()
const yesterday = addDays(today, -1)

const passportName = ref('')
const passportNumber = ref('')
const country = ref<CountrySummary | null>(null)
/** Edit mode: the saved country, kept selectable even if it was deactivated since. */
const savedCountry = ref<CountrySummary | null>(null)
const dateOfBirth = ref('')
const referenceType = ref<ReferenceType>('person')
const reference = ref<ReferenceSummary | null>(null)
const company = ref<CompanySummary | null>(null)
const receivedDate = ref(today)
const expiryDate = ref('')
/** The expiry date must be after the received date. */
const minExpiryDate = computed(() => addDays(receivedDate.value, 1) || undefined)

const errors = ref<PassportFormErrors>({})
/** Form-level error: network, server, permission. */
const banner = ref<string | null>(null)
const isSaving = ref(false)

const entry = ref<PassportEntry | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
/** Edit mode: whether the API says this user may update the entry. */
const canSave = computed(() => !isEdit.value || (entry.value?.can.update ?? false))

const nameInput = useTemplateRef<HTMLInputElement>('nameInput')
const numberInput = useTemplateRef<HTMLInputElement>('numberInput')
const dateInput = useTemplateRef<HTMLInputElement>('dateInput')
const birthInput = useTemplateRef<HTMLInputElement>('birthInput')
const expiryInput = useTemplateRef<HTMLInputElement>('expiryInput')
const countrySelect = useTemplateRef<{ focus: () => void }>('countrySelect')
const referenceSelect = useTemplateRef<{ focus: () => void }>('referenceSelect')
const companySelect = useTemplateRef<{ focus: () => void }>('companySelect')

/* ---------- Loading / resetting ---------- */

function clearForm() {
  passportName.value = ''
  passportNumber.value = ''
  country.value = null
  dateOfBirth.value = ''
  expiryDate.value = ''
  reference.value = null
  company.value = null
  errors.value = {}
  banner.value = null
}

/** New entries only: preselect the default passport country, when the admin has set one. */
async function applyPassportCountryDefault() {
  await countries.load()
  if (isEdit.value) return
  const code = countries.defaults?.default_passport_country_code
  country.value = code ? (countries.byCode(code) ?? null) : null
}

async function focusName() {
  await nextTick()
  nameInput.value?.focus()
}

async function init() {
  clearForm()
  entry.value = null
  savedCountry.value = null
  loadError.value = null
  referenceType.value = 'person'
  receivedDate.value = today

  const id = entryId.value
  if (id === null) {
    focusName()
    await applyPassportCountryDefault()
    return
  }
  // The country list is also needed in edit mode (for the dropdowns).
  countries.load()

  isLoading.value = true
  try {
    const loaded = await getPassport(id)
    if (entryId.value !== id) return
    entry.value = loaded
    passportName.value = loaded.passport_name
    passportNumber.value = loaded.passport_number
    country.value = loaded.country
    savedCountry.value = loaded.country
    dateOfBirth.value = loaded.date_of_birth ?? ''
    expiryDate.value = loaded.passport_expiry_date ?? ''
    referenceType.value = loaded.reference.type
    reference.value = loaded.reference
    company.value = loaded.company
    receivedDate.value = loaded.passport_received_date
  } catch (error) {
    loadError.value =
      errorStatus(error) === 404
        ? 'This passport entry was not found. It may have been deleted.'
        : errorMessage(error, 'Could not load this passport entry.')
  } finally {
    isLoading.value = false
  }
  if (!loadError.value) focusName()
}

// The same component serves /new and /:id/edit, so re-initialize when the route changes.
watch(() => [route.name, route.params.id], init, { immediate: true })

/* ---------- Typing ---------- */

/** Applies a normalizer while typing and keeps the caret where the user expects it. */
function onNormalizedInput(
  event: Event,
  normalize: (value: string) => string,
  assign: (value: string) => void,
  field: keyof PassportFormErrors,
) {
  const el = event.target as HTMLInputElement
  const raw = el.value
  const next = normalize(raw)
  if (next !== raw) {
    const caret = normalize(raw.slice(0, el.selectionStart ?? raw.length)).length
    el.value = next
    el.setSelectionRange(caret, caret)
  }
  assign(next)
  clearError(field)
}

const setPassportName = (value: string) => (passportName.value = value)
const setPassportNumber = (value: string) => (passportNumber.value = value)

function clearError(field: keyof PassportFormErrors) {
  if (errors.value[field]) errors.value = { ...errors.value, [field]: undefined }
}

function onReferenceTypeChange(type: ReferenceType) {
  if (type === referenceType.value) return
  referenceType.value = type
  // References are filtered by type, so a selection of the other type no longer applies.
  reference.value = null
  clearError('reference_id')
}

watch(reference, () => clearError('reference_id'))
watch(company, () => clearError('company_id'))
watch(receivedDate, () => clearError('passport_received_date'))
watch(country, () => clearError('country_code'))
watch(dateOfBirth, () => clearError('date_of_birth'))
watch(expiryDate, () => clearError('passport_expiry_date'))

/* ---------- Comboboxes and quick add ---------- */

const fetchReferences = (q: string) => searchReferences({ type: referenceType.value, q })
const fetchCompanies = (q: string) => searchCompanies(q)
const companySubtitle = (item: CompanySummary) => item.country?.name

const referenceTypeLabel = computed(() => (referenceType.value === 'person' ? 'person' : 'agency'))

const referenceModalOpen = ref(false)
const companyModalOpen = ref(false)
const quickAddName = ref('')

function openReferenceModal(query: string) {
  quickAddName.value = query
  referenceModalOpen.value = true
}

function openCompanyModal(query: string) {
  quickAddName.value = query
  companyModalOpen.value = true
}

const saveReference = (values: QuickAddValues) =>
  createReference({ type: referenceType.value, name: values.name, phone: values.phone })

const saveCompany = (values: QuickAddValues) =>
  createCompany({ name: values.name, country_code: values.country_code ?? '', ...values.agent })

const defaultCompanyCountryCode = computed(
  () => countries.defaults?.default_company_country_code ?? null,
)

function onReferenceAdded(item: Reference) {
  reference.value = item
  toast.success(`${item.type_label} “${item.name}” added.`)
}

function onCompanyAdded(item: Company) {
  company.value = item
  toast.success(`Company “${item.name}” (${item.country.name}) added.`)
}

/* ---------- Saving ---------- */

function formValues(): PassportFormValues {
  return {
    passport_name: passportName.value,
    passport_number: passportNumber.value,
    country_code: country.value?.code ?? null,
    date_of_birth: dateOfBirth.value,
    reference_id: reference.value?.id ?? null,
    company_id: company.value?.id ?? null,
    passport_received_date: receivedDate.value,
    passport_expiry_date: expiryDate.value,
  }
}

const FIELD_ORDER: (keyof PassportFormErrors)[] = [
  'passport_name',
  'passport_number',
  'country_code',
  'date_of_birth',
  'reference_id',
  'passport_received_date',
  'passport_expiry_date',
  'company_id',
]

async function focusFirstError() {
  await nextTick()
  const first = FIELD_ORDER.find((field) => errors.value[field])
  const targets: Record<keyof PassportFormErrors, (() => void) | undefined> = {
    passport_name: () => nameInput.value?.focus(),
    passport_number: () => numberInput.value?.focus(),
    country_code: () => countrySelect.value?.focus(),
    date_of_birth: () => birthInput.value?.focus(),
    passport_expiry_date: () => expiryInput.value?.focus(),
    reference_id: () => referenceSelect.value?.focus(),
    company_id: () => companySelect.value?.focus(),
    passport_received_date: () => dateInput.value?.focus(),
  }
  if (first) targets[first]?.()
}

/** Puts a 422 response's messages under their fields; anything else goes to the banner. */
function applyServerErrors(error: unknown) {
  const server = fieldErrors(error)
  const mapped: PassportFormErrors = {}
  const other: string[] = []
  for (const [field, message] of Object.entries(server)) {
    if ((FIELD_ORDER as string[]).includes(field))
      mapped[field as keyof PassportFormErrors] = message
    else other.push(message)
  }
  errors.value = mapped
  if (other.length > 0) banner.value = other.join(' ')
  else if (Object.keys(mapped).length === 0) banner.value = errorMessage(error)
}

type SaveAction = 'save' | 'another'

async function onSubmit(event: SubmitEvent) {
  const submitter = event.submitter as HTMLButtonElement | null
  const action: SaveAction = submitter?.dataset.action === 'another' ? 'another' : 'save'
  await save(action)
}

async function save(action: SaveAction) {
  if (isSaving.value || !canSave.value) return
  banner.value = null

  const values = formValues()
  errors.value = validatePassportForm(values, today)
  if (Object.values(errors.value).some(Boolean)) {
    focusFirstError()
    return
  }

  const payload: PassportPayload = {
    passport_name: normalizePassportName(values.passport_name),
    passport_number: normalizePassportNumber(values.passport_number),
    country_code: values.country_code,
    date_of_birth: toApiDate(values.date_of_birth),
    reference_id: values.reference_id as number,
    company_id: values.company_id as number,
    passport_received_date: toApiDate(values.passport_received_date),
    passport_expiry_date: toApiDate(values.passport_expiry_date),
  }

  isSaving.value = true
  try {
    if (entryId.value !== null) {
      const saved = await updatePassport(entryId.value, payload)
      toast.success(`Passport ${saved.passport_number} updated.`)
      workflow.refresh()
      router.push({ name: 'passports' })
    } else {
      const saved = await createPassport(payload)
      toast.success(`Passport ${saved.passport_number} saved.`)
      workflow.refresh()
      if (action === 'save') {
        router.push({ name: 'passports' })
      } else {
        // Keep the received date and reference type for the next passport of the batch.
        clearForm()
        focusName()
        applyPassportCountryDefault()
      }
    }
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      applyServerErrors(error)
      focusFirstError()
    } else if (status === 403) {
      banner.value = isEdit.value
        ? 'You can only edit entries you created.'
        : errorMessage(error, 'You are not allowed to add passport entries.')
    } else if (status !== 401) {
      // 401 is handled globally (redirect to login).
      banner.value = errorMessage(error, 'Could not save the passport entry. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600 disabled:bg-slate-100'
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <RouterLink
      :to="{ name: 'passports' }"
      class="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-primary-700 hover:underline"
    >
      <span aria-hidden="true">←</span> Passport list
    </RouterLink>
    <h1 class="mt-2 text-2xl font-bold text-primary-900 sm:text-3xl">
      {{ isEdit ? 'Edit passport' : 'Add passport' }}
    </h1>

    <section class="glass-card mt-6 p-5 sm:p-8">
      <p v-if="isLoading" class="text-muted" role="status">Loading the passport entry…</p>

      <div v-else-if="loadError" role="alert" class="space-y-4">
        <p class="text-red-700">{{ loadError }}</p>
        <RouterLink :to="{ name: 'passports' }" class="btn btn-primary text-sm">
          Back to the list
        </RouterLink>
      </div>

      <template v-else>
        <p
          v-if="isEdit && !canSave"
          role="status"
          class="mb-6 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2.5 text-sm text-accent-800"
        >
          You can only edit entries you created.
        </p>
        <p
          v-if="banner"
          role="alert"
          class="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
        >
          {{ banner }}
        </p>

        <form class="space-y-6" novalidate @submit.prevent="onSubmit">
          <div class="grid gap-6 sm:grid-cols-2">
            <!-- 1. Passport name -->
            <div>
              <label :for="nameId" class="block text-sm font-medium text-slate-700">
                Passport name<span class="text-red-700" aria-hidden="true"> *</span>
              </label>
              <input
                :id="nameId"
                ref="nameInput"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                required
                :maxlength="PASSPORT_NAME_MAX"
                :value="passportName"
                :class="[inputClass, errors.passport_name ? 'border-red-500' : 'border-slate-300']"
                :aria-invalid="errors.passport_name ? 'true' : undefined"
                :aria-describedby="errors.passport_name ? `${nameId}-error` : undefined"
                @input="
                  onNormalizedInput(
                    $event,
                    normalizePassportNameInput,
                    setPassportName,
                    'passport_name',
                  )
                "
              />
              <p
                v-if="errors.passport_name"
                :id="`${nameId}-error`"
                class="mt-1 text-sm text-red-700"
              >
                {{ errors.passport_name }}
              </p>
            </div>

            <!-- 2. Passport number -->
            <div>
              <label :for="numberId" class="block text-sm font-medium text-slate-700">
                Passport number<span class="text-red-700" aria-hidden="true"> *</span>
              </label>
              <input
                :id="numberId"
                ref="numberInput"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                required
                maxlength="30"
                :value="passportNumber"
                :class="[
                  inputClass,
                  'font-mono tracking-wider',
                  errors.passport_number ? 'border-red-500' : 'border-slate-300',
                ]"
                :aria-invalid="errors.passport_number ? 'true' : undefined"
                :aria-describedby="`${numberId}-hint${errors.passport_number ? ` ${numberId}-error` : ''}`"
                @input="
                  onNormalizedInput(
                    $event,
                    normalizePassportNumber,
                    setPassportNumber,
                    'passport_number',
                  )
                "
              />
              <p :id="`${numberId}-hint`" class="mt-1 text-xs text-muted">
                6 to 20 letters and digits, no spaces.
              </p>
              <p
                v-if="errors.passport_number"
                :id="`${numberId}-error`"
                class="mt-1 text-sm text-red-700"
              >
                {{ errors.passport_number }}
              </p>
            </div>
          </div>

          <div class="grid gap-6 sm:grid-cols-2">
            <!-- Passport country (optional) -->
            <CountrySelect
              ref="countrySelect"
              v-model="country"
              label="Passport country"
              hint="Optional."
              :keep="savedCountry"
              :error="errors.country_code"
              clearable
            />

            <!-- Date of birth -->
            <div>
              <label :for="birthId" class="block text-sm font-medium text-slate-700">
                Date of birth<span class="text-red-700" aria-hidden="true"> *</span>
              </label>
              <input
                :id="birthId"
                ref="birthInput"
                v-model="dateOfBirth"
                type="date"
                required
                :max="yesterday"
                :class="[inputClass, errors.date_of_birth ? 'border-red-500' : 'border-slate-300']"
                :aria-invalid="errors.date_of_birth ? 'true' : undefined"
                :aria-describedby="`${birthId}-hint${errors.date_of_birth ? ` ${birthId}-error` : ''}`"
              />
              <p :id="`${birthId}-hint`" class="mt-1 text-xs text-muted">
                {{ toDisplayDate(dateOfBirth) || 'DD-MM-YYYY' }}
              </p>
              <p
                v-if="errors.date_of_birth"
                :id="`${birthId}-error`"
                class="mt-1 text-sm text-red-700"
              >
                {{ errors.date_of_birth }}
              </p>
            </div>
          </div>

          <!-- 3. Reference: type toggle + search -->
          <fieldset class="space-y-3 rounded-xl border border-stroke p-4">
            <legend class="px-1 text-sm font-semibold text-ink">Reference</legend>
            <ReferenceTypeToggle
              :model-value="referenceType"
              @update:model-value="onReferenceTypeChange"
            />
            <SearchSelect
              :key="referenceType"
              ref="referenceSelect"
              v-model="reference"
              :fetch="fetchReferences"
              :label="referenceType === 'person' ? 'Reference person' : 'Reference agency'"
              :placeholder="`Search ${referenceTypeLabel}…`"
              :add-label="`Add new ${referenceTypeLabel}`"
              :error="errors.reference_id"
              required
              @add="openReferenceModal"
            />
          </fieldset>

          <div class="grid gap-6 sm:grid-cols-2">
            <!-- 4. Received date -->
            <div>
              <label :for="dateId" class="block text-sm font-medium text-slate-700">
                Passport received date<span class="text-red-700" aria-hidden="true"> *</span>
              </label>
              <input
                :id="dateId"
                ref="dateInput"
                v-model="receivedDate"
                type="date"
                required
                :max="today"
                :class="[
                  inputClass,
                  errors.passport_received_date ? 'border-red-500' : 'border-slate-300',
                ]"
                :aria-invalid="errors.passport_received_date ? 'true' : undefined"
                :aria-describedby="`${dateId}-hint${errors.passport_received_date ? ` ${dateId}-error` : ''}`"
              />
              <p :id="`${dateId}-hint`" class="mt-1 text-xs text-muted">
                {{ toDisplayDate(receivedDate) || 'DD-MM-YYYY' }} · cannot be in the future
              </p>
              <p
                v-if="errors.passport_received_date"
                :id="`${dateId}-error`"
                class="mt-1 text-sm text-red-700"
              >
                {{ errors.passport_received_date }}
              </p>
            </div>

            <!-- Expiry date -->
            <div>
              <label :for="expiryId" class="block text-sm font-medium text-slate-700">
                Passport expiry date<span class="text-red-700" aria-hidden="true"> *</span>
              </label>
              <input
                :id="expiryId"
                ref="expiryInput"
                v-model="expiryDate"
                type="date"
                required
                :min="minExpiryDate"
                :class="[
                  inputClass,
                  errors.passport_expiry_date ? 'border-red-500' : 'border-slate-300',
                ]"
                :aria-invalid="errors.passport_expiry_date ? 'true' : undefined"
                :aria-describedby="`${expiryId}-hint${errors.passport_expiry_date ? ` ${expiryId}-error` : ''}`"
              />
              <p :id="`${expiryId}-hint`" class="mt-1 text-xs text-muted">
                {{ toDisplayDate(expiryDate) || 'DD-MM-YYYY' }} · after the received date
              </p>
              <p
                v-if="errors.passport_expiry_date"
                :id="`${expiryId}-error`"
                class="mt-1 text-sm text-red-700"
              >
                {{ errors.passport_expiry_date }}
              </p>
            </div>
          </div>

          <!-- 5. Company -->
          <SearchSelect
            ref="companySelect"
            v-model="company"
            :fetch="fetchCompanies"
            :subtitle-of="companySubtitle"
            label="Company name"
            placeholder="Search company…"
            add-label="Add new company"
            :error="errors.company_id"
            required
            @add="openCompanyModal"
          />

          <div class="flex flex-col gap-3 border-t border-stroke pt-6 sm:flex-row sm:justify-end">
            <!-- The first submit button is the one Enter triggers. -->
            <template v-if="!isEdit">
              <button
                type="submit"
                data-action="another"
                class="btn btn-accent"
                :disabled="isSaving"
              >
                {{ isSaving ? 'Saving…' : 'Save and add another' }}
              </button>
              <button type="submit" data-action="save" class="btn btn-white" :disabled="isSaving">
                Save
              </button>
            </template>
            <button
              v-else
              type="submit"
              data-action="save"
              class="btn btn-accent"
              :disabled="isSaving || !canSave"
            >
              {{ isSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      </template>
    </section>

    <!-- Outside the form: a dialog has its own form, and forms cannot be nested. -->
    <QuickAddModal
      v-model:open="referenceModalOpen"
      :title="`Add new ${referenceTypeLabel}`"
      :name-label="referenceType === 'person' ? 'Person name' : 'Agency name'"
      :initial-name="quickAddName"
      :save="saveReference"
      with-phone
      @saved="onReferenceAdded"
    />
    <QuickAddModal
      v-model:open="companyModalOpen"
      title="Add new company"
      name-label="Company name"
      :initial-name="quickAddName"
      :save="saveCompany"
      with-country
      with-agent
      :default-country-code="defaultCompanyCountryCode"
      @saved="onCompanyAdded"
    />
  </div>
</template>
