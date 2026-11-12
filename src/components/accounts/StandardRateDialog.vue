<script setup lang="ts">
import { ref, watch } from 'vue'
import SearchSelect from '@/components/SearchSelect.vue'
import PriceDialog from '@/components/accounts/PriceDialog.vue'
import { saveCompanyRate } from '@/api/accounts'
import { useToast } from '@/composables/useToast'
import { formatMoney, rateSaveMessage } from '@/lib/accounts'
import { countryName } from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import type { PassportRates } from '@/types/accounts'
import type { CompanySummary } from '@/types/passport'

/**
 * Sets a company's standard rate per passport (the accounts head; Standard Rates and Party
 * Rates pages). With `company` it edits that company's rate (and can remove it); without,
 * it adds one: the company is chosen in the dialog from `companies`. Emits `saved` after
 * saving, so the page reloads its rates.
 */
type Company = PassportRates['companies'][number]

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ companies: Company[]; company?: Company | null }>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const chosen = ref<CompanySummary | null>(null)
const target = ref<Company | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  chosen.value = null
  target.value = props.company ?? null
  saveError.value = null
})

/** The companies for the dropdown (the list the page loaded). */
async function fetchCompanies(q: string): Promise<CompanySummary[]> {
  const text = q.trim().toLowerCase()
  return props.companies
    .filter((c) => !text || c.name.toLowerCase().includes(text))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      country: { code: c.country_code ?? '', name: countryName(c.country_code) },
    }))
}
const companySubtitle = (item: CompanySummary) => {
  const rate = props.companies.find((c) => c.id === item.id)?.rate
  return `${item.country?.name ?? ''}${rate !== null && rate !== undefined ? ` · now ${formatMoney(rate)}` : ''}`
}

function onChosen(value: CompanySummary | null) {
  chosen.value = value
  target.value = value ? (props.companies.find((c) => c.id === value.id) ?? null) : null
  saveError.value = null
}

async function save(price: number | null, updateExisting: boolean) {
  if (!target.value) {
    saveError.value = 'Choose the company.'
    return
  }
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const result = await saveCompanyRate(target.value.id, price, updateExisting)
    toast.success(price === null ? 'Standard rate removed.' : rateSaveMessage(result))
    open.value = false
    emit('saved')
  } catch (error) {
    saveError.value = errorMessage(error, 'Could not save the rate. Please try again.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PriceDialog
    v-model:open="open"
    :title="company ? `Standard rate: ${company.name}` : 'Add standard rate'"
    description="The price per passport for every party without its own rate for this company."
    :value="target?.rate ?? null"
    :removable="!!company && company.rate !== null"
    remove-label="Remove standard rate"
    show-update-existing
    :busy="saving"
    :error="saveError"
    @save="save"
  >
    <div v-if="!company" data-field="company">
      <SearchSelect
        :model-value="chosen"
        :fetch="fetchCompanies"
        :subtitle-of="companySubtitle"
        label="Company"
        placeholder="Search company…"
        clearable
        data-new-company
        @update:model-value="onChosen"
      />
      <p v-if="target && target.rate !== null" class="mt-1 text-xs text-amber-800" data-has-rate>
        {{ target.name }} already has a standard rate of {{ formatMoney(target.rate) }}. Saving
        changes it.
      </p>
    </div>
  </PriceDialog>
</template>
