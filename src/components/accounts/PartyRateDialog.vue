<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SearchSelect from '@/components/SearchSelect.vue'
import PriceDialog from '@/components/accounts/PriceDialog.vue'
import { saveReferenceRate } from '@/api/accounts'
import { fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { useToast } from '@/composables/useToast'
import { formatMoney, rateSaveMessage } from '@/lib/accounts'
import { countryName } from '@/lib/companyReport'
import { errorMessage } from '@/lib/errors'
import type { PassportRates } from '@/types/accounts'
import type { CompanySummary, ReferenceSummary } from '@/types/passport'

/**
 * Sets a reference / party's own rate per passport for a company (the accounts head; Party
 * Rates page), used instead of the company's standard rate. With `rate` it edits that one
 * (and can remove it); without, it adds one: the party and the company are chosen in the
 * dialog. Emits `saved` after saving, so the page reloads its rates.
 */
type PartyRate = PassportRates['references'][number]

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ rates: PassportRates; rate?: PartyRate | null }>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const party = ref<ReferenceSummary | null>(null)
const company = ref<CompanySummary | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  party.value = null
  company.value = null
  saveError.value = null
})

const partyId = computed(() => props.rate?.reference.id ?? party.value?.id ?? null)
const companyId = computed(() => props.rate?.company.id ?? company.value?.id ?? null)

/** The party's rate for the chosen company, if it has one already. */
const existing = computed(() =>
  partyId.value && companyId.value
    ? (props.rates.references.find(
        (r) => r.reference.id === partyId.value && r.company.id === companyId.value,
      ) ?? null)
    : null,
)
const standard = computed(() =>
  companyId.value
    ? (props.rates.companies.find((c) => c.id === companyId.value)?.rate ?? null)
    : null,
)

const fetchReferences = (q: string) => fetchReportReferences({ q })
async function fetchCompanies(q: string): Promise<CompanySummary[]> {
  const { data } = await fetchCompanyReport({ search: q || undefined, per_page: 20 })
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    country: { code: c.country_code, name: countryName(c.country_code) },
  }))
}
const referenceSubtitle = (item: ReferenceSummary) => item.type_label
const companySubtitle = (item: CompanySummary) => {
  const rate = props.rates.companies.find((c) => c.id === item.id)?.rate
  return `${item.country?.name ?? ''}${rate !== null && rate !== undefined ? ` · standard ${formatMoney(rate)}` : ''}`
}

const title = computed(() =>
  props.rate
    ? `Party rate: ${props.rate.reference.name} · ${props.rate.company.name}`
    : 'Add party rate',
)
const description = computed(
  () =>
    `This party's price per passport for this company, instead of the standard rate (${
      standard.value === null ? 'not set' : formatMoney(standard.value)
    }).`,
)

async function save(price: number | null, updateExisting: boolean) {
  if (!partyId.value) {
    saveError.value = 'Choose the party.'
    return
  }
  if (!companyId.value) {
    saveError.value = 'Choose the company.'
    return
  }
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const result = await saveReferenceRate(partyId.value, companyId.value, price, updateExisting)
    toast.success(price === null ? 'Party rate removed.' : rateSaveMessage(result))
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
    :title="title"
    :description="description"
    :value="rate?.rate ?? null"
    :removable="!!rate"
    remove-label="Remove party rate"
    show-update-existing
    :busy="saving"
    :error="saveError"
    @save="save"
  >
    <template v-if="!rate">
      <div data-field="party">
        <SearchSelect
          v-model="party"
          :fetch="fetchReferences"
          :subtitle-of="referenceSubtitle"
          label="Reference / party"
          placeholder="Search party…"
          clearable
          data-new-party
        />
      </div>
      <div data-field="company">
        <SearchSelect
          v-model="company"
          :fetch="fetchCompanies"
          :subtitle-of="companySubtitle"
          label="Company"
          placeholder="Search company…"
          clearable
          data-new-company
        />
        <p v-if="existing" class="mt-1 text-xs text-amber-800" data-has-rate>
          {{ existing.reference.name }} already pays {{ formatMoney(existing.rate) }} for
          {{ existing.company.name }}. Saving changes it.
        </p>
      </div>
    </template>
  </PriceDialog>
</template>
