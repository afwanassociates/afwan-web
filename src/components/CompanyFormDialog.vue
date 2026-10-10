<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import CountrySelect from '@/components/CountrySelect.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import { createAdminCompany, updateAdminCompany } from '@/api/companies'
import {
  AGENT_FIELDS,
  COMPANY_NAME_MAX,
  emptyAgentValues,
  validateAgentValues,
  type AgentFormValues,
} from '@/lib/companyForm'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import { useCountriesStore } from '@/stores/countries'
import type { CountrySummary } from '@/types/country'
import type { Company } from '@/types/passport'

/**
 * Admin create / edit form for a company: name, country, agent details, Bangladesh agency,
 * quota and active. `company` null creates a new one.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ company: Company | null }>()
const emit = defineEmits<{ saved: [company: Company, created: boolean] }>()

const countries = useCountriesStore()

const nameId = useId()
const fieldId = useId()

const name = ref('')
const country = ref<CountrySummary | null>(null)
const agent = ref<AgentFormValues>(emptyAgentValues())
const isActive = ref(true)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.company !== null)

watch(open, async (isOpen) => {
  if (!isOpen) return
  const c = props.company
  name.value = c?.name ?? ''
  agent.value = emptyAgentValues(c)
  isActive.value = c?.is_active ?? true
  errors.value = {}
  banner.value = null
  country.value = c?.country ?? null
  await countries.load()
  if (!c) country.value = countries.byCode(countries.defaults?.default_company_country_code) ?? null
})

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  const trimmedName = name.value.trim().replace(/\s+/g, ' ')
  if (!trimmedName) e.name = 'Enter the company name.'
  else if (trimmedName.length > COMPANY_NAME_MAX)
    e.name = `The company name must be at most ${COMPANY_NAME_MAX} characters.`
  if (!country.value) e.country_code = 'Select a country.'
  const { values, errors: agentErrors } = validateAgentValues(agent.value)
  errors.value = { ...e, ...agentErrors }
  if (Object.keys(errors.value).length > 0) return

  const payload = {
    name: trimmedName,
    country_code: country.value!.code,
    ...values,
    is_active: isActive.value,
  }
  isSaving.value = true
  try {
    const saved = props.company
      ? await updateAdminCompany(props.company.id, payload)
      : await createAdminCompany(payload)
    emit('saved', saved, !props.company)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'Only admins can manage companies.'
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the company. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <BaseDialog v-model:open="open" :title="isEdit ? 'Edit company' : 'New company'" :busy="isSaving">
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <div data-field="name">
        <label :for="nameId" class="block text-sm font-medium text-slate-700">
          Company name<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="nameId"
          v-model="name"
          type="text"
          autocomplete="off"
          required
          :maxlength="COMPANY_NAME_MAX"
          :class="[inputClass, errors.name ? 'border-red-500' : 'border-slate-300']"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? `${nameId}-error` : undefined"
        />
        <p v-if="errors.name" :id="`${nameId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.name }}
        </p>
      </div>

      <CountrySelect
        v-model="country"
        label="Country"
        :error="errors.country_code"
        :keep="company?.country ?? null"
        required
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="f in AGENT_FIELDS" :key="f.name" :data-field="f.name">
          <label :for="`${fieldId}-${f.name}`" class="block text-sm font-medium text-slate-700">
            {{ f.label }} <span class="font-normal text-muted">(optional)</span>
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
            Quota <span class="font-normal text-muted">(optional)</span>
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
            :aria-describedby="errors.quota ? `${fieldId}-quota-error` : undefined"
          />
          <p v-if="errors.quota" :id="`${fieldId}-quota-error`" class="mt-1 text-sm text-red-700">
            {{ errors.quota }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 rounded-xl bg-surface p-3" data-field="is_active">
        <ToggleSwitch v-model="isActive" label="Active" />
        <span class="text-sm text-slate-700">
          <strong>{{ isActive ? 'Active' : 'Inactive' }}</strong>
          · inactive companies cannot be chosen for new passports.
        </span>
      </div>

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create company' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
