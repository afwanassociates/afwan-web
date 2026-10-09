<script setup lang="ts">
import { useId } from 'vue'
import CountrySelect from '@/components/CountrySelect.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import type { SortOption } from '@/composables/usePassportList'
import type { CountrySummary } from '@/types/country'

/** Search, company, company country and sort controls for the Medical and Unfit lists. */
defineProps<{ sortOptions: SortOption[]; hasFilters: boolean }>()
const search = defineModel<string>('search', { required: true })
const company = defineModel<{ id: number; name: string; country?: CountrySummary } | null>(
  'company',
  { required: true },
)
const companyCountry = defineModel<CountrySummary | null>('companyCountry', { required: true })
const sort = defineModel<string>('sort', { required: true })
defineEmits<{ search: []; clear: [] }>()

const searchId = useId()
const sortId = useId()

const fetchCompanies = (q: string) => searchCompanies(q)
const companySubtitle = (item: { country?: CountrySummary }) => item.country?.name

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div role="search" class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="sm:col-span-2 lg:col-span-1">
        <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
        <input
          :id="searchId"
          v-model="search"
          type="search"
          autocomplete="off"
          placeholder="Name or passport number"
          :class="inputClass"
          @input="$emit('search')"
        />
      </div>
      <SearchSelect
        v-model="company"
        :fetch="fetchCompanies"
        :subtitle-of="companySubtitle"
        label="Company"
        placeholder="Any company"
        clearable
      />
      <CountrySelect
        v-model="companyCountry"
        label="Company country"
        placeholder="All countries"
        clearable
      />
      <div>
        <label :for="sortId" class="block text-sm font-medium text-slate-700">Sort by</label>
        <select :id="sortId" v-model="sort" :class="inputClass">
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
    <button
      v-if="hasFilters"
      type="button"
      class="text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
      @click="$emit('clear')"
    >
      Clear filters
    </button>
  </div>
</template>
