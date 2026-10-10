<script setup lang="ts" generic="T">
import { ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { useCountriesStore } from '@/stores/countries'
import type { CountrySummary } from '@/types/country'
import {
  AGENT_FIELDS,
  emptyAgentValues,
  validateAgentValues,
  type AgentFormValues,
} from '@/lib/companyForm'
import type { CompanyAgentDetails } from '@/types/passport'

export interface QuickAddValues {
  name: string
  phone: string | null
  /** Only with `withCountry`. */
  country_code: string | null
  /** Only with `withAgent`. */
  agent: CompanyAgentDetails | null
}

/**
 * Small "add new" dialog used from a SearchSelect: a required name, an optional phone,
 * an optional (then required) country preselected with `defaultCountryCode` and, for
 * companies, the optional agent details and quota (`withAgent`).
 * `save` calls the API; a 422 (e.g. the name already exists) keeps the dialog open.
 */
const open = defineModel<boolean>('open', { required: true })
const props = withDefaults(
  defineProps<{
    title: string
    save: (values: QuickAddValues) => Promise<T>
    nameLabel?: string
    withPhone?: boolean
    /** Show a required Country field. */
    withCountry?: boolean
    /** Country preselected when the dialog opens (can be changed). */
    defaultCountryCode?: string | null
    /** Show the optional company agent fields and quota. */
    withAgent?: boolean
    /** Prefills the name, e.g. with the text typed in the combobox. */
    initialName?: string
  }>(),
  {
    nameLabel: 'Name',
    withPhone: false,
    withCountry: false,
    defaultCountryCode: null,
    withAgent: false,
    initialName: '',
  },
)
const emit = defineEmits<{ saved: [item: T] }>()

const NAME_MAX = 150
const PHONE_MAX = 30

const nameId = useId()
const phoneId = useId()
const fieldId = useId()

const countries = useCountriesStore()

const name = ref('')
const phone = ref('')
const country = ref<CountrySummary | null>(null)
const agent = ref<AgentFormValues>(emptyAgentValues())
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)
const isSaving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  name.value = props.initialName
  phone.value = ''
  agent.value = emptyAgentValues()
  errors.value = {}
  formError.value = null
  country.value = null
  if (props.withCountry) {
    await countries.load()
    country.value = countries.byCode(props.defaultCountryCode) ?? null
  }
})

async function onSubmit() {
  errors.value = {}
  formError.value = null
  const trimmedName = name.value.trim().replace(/\s+/g, ' ')
  const trimmedPhone = phone.value.trim()
  if (!trimmedName) errors.value.name = `Enter the ${props.nameLabel.toLowerCase()}.`
  else if (trimmedName.length > NAME_MAX)
    errors.value.name = `The ${props.nameLabel.toLowerCase()} must be at most ${NAME_MAX} characters.`
  if (trimmedPhone.length > PHONE_MAX)
    errors.value.phone = `The phone must be at most ${PHONE_MAX} characters.`
  if (props.withCountry && !country.value) errors.value.country_code = 'Select a country.'
  const agentValues = props.withAgent ? validateAgent() : null
  if (Object.keys(errors.value).length > 0) return

  isSaving.value = true
  try {
    const item = await props.save({
      name: trimmedName,
      phone: trimmedPhone || null,
      country_code: props.withCountry ? (country.value?.code ?? null) : null,
      agent: agentValues,
    })
    emit('saved', item)
    open.value = false
  } catch (error) {
    errors.value = fieldErrors(error)
    if (Object.keys(errors.value).length === 0) {
      formError.value =
        errorStatus(error) === 403
          ? errorMessage(error, 'You are not allowed to add this.')
          : errorMessage(error)
    }
  } finally {
    isSaving.value = false
  }
}

/** Checks the agent fields (adding to `errors`) and returns them trimmed, empty as null. */
function validateAgent(): CompanyAgentDetails {
  const { values, errors: agentErrors } = validateAgentValues(agent.value)
  Object.assign(errors.value, agentErrors)
  return values
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p
      v-if="formError"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ formError }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="onSubmit">
      <div>
        <label :for="nameId" class="block text-sm font-medium text-slate-700">
          {{ nameLabel }}<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="nameId"
          v-model="name"
          type="text"
          autocomplete="off"
          required
          autofocus
          :maxlength="NAME_MAX"
          :class="[inputClass, errors.name ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? `${nameId}-error` : undefined"
        />
        <p v-if="errors.name" :id="`${nameId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.name }}
        </p>
      </div>

      <div v-if="withPhone">
        <label :for="phoneId" class="block text-sm font-medium text-slate-700">
          Phone <span class="font-normal text-muted">(optional)</span>
        </label>
        <input
          :id="phoneId"
          v-model="phone"
          type="tel"
          autocomplete="off"
          :maxlength="PHONE_MAX"
          :class="[inputClass, errors.phone ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.phone ? 'true' : undefined"
          :aria-describedby="errors.phone ? `${phoneId}-error` : undefined"
        />
        <p v-if="errors.phone" :id="`${phoneId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.phone }}
        </p>
      </div>

      <CountrySelect
        v-if="withCountry"
        v-model="country"
        label="Country"
        :error="errors.country_code"
        required
      />

      <fieldset v-if="withAgent" class="space-y-4 rounded-xl border border-stroke p-4">
        <legend class="px-1 text-sm font-semibold text-ink">
          Agent and quota <span class="font-normal text-muted">(optional)</span>
        </legend>
        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="f in AGENT_FIELDS" :key="f.name" :data-field="f.name">
            <label :for="`${fieldId}-${f.name}`" class="block text-sm font-medium text-slate-700">
              {{ f.label }}
            </label>
            <input
              :id="`${fieldId}-${f.name}`"
              v-model="agent[f.name]"
              :type="f.type"
              autocomplete="off"
              :maxlength="f.max"
              :class="[inputClass, errors[f.name] ? 'border-red-500' : 'border-slate-300']"
              :aria-invalid="errors[f.name] ? 'true' : undefined"
              :aria-describedby="errors[f.name] ? `${fieldId}-${f.name}-error` : undefined"
            />
            <p
              v-if="errors[f.name]"
              :id="`${fieldId}-${f.name}-error`"
              class="mt-1 text-sm text-red-700"
            >
              {{ errors[f.name] }}
            </p>
          </div>
          <div data-field="quota">
            <label :for="`${fieldId}-quota`" class="block text-sm font-medium text-slate-700">
              Quota
            </label>
            <input
              :id="`${fieldId}-quota`"
              v-model="agent.quota"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              :class="[inputClass, errors.quota ? 'border-red-500' : 'border-slate-300']"
              :aria-invalid="errors.quota ? 'true' : undefined"
              :aria-describedby="`${fieldId}-quota-hint${errors.quota ? ` ${fieldId}-quota-error` : ''}`"
            />
            <p :id="`${fieldId}-quota-hint`" class="mt-1 text-xs text-muted">
              Workers the company asked for.
            </p>
            <p v-if="errors.quota" :id="`${fieldId}-quota-error`" class="mt-1 text-sm text-red-700">
              {{ errors.quota }}
            </p>
          </div>
        </div>
      </fieldset>

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving">
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
