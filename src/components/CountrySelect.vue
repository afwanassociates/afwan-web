<script setup lang="ts">
import { useTemplateRef } from 'vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { useCountriesStore } from '@/stores/countries'
import type { CountrySummary } from '@/types/country'

/**
 * Searchable country picker over the cached active-country list (pinned first).
 * Searching is local, so there is no request and no delay.
 */
const model = defineModel<CountrySummary | null>({ required: true })
const props = withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    error?: string
    hint?: string
    required?: boolean
    clearable?: boolean
    disabled?: boolean
    /** E.g. "None": an option that clears the value. */
    noneLabel?: string
    /**
     * A value to keep selectable even if it is no longer active
     * (the saved country of a record being edited).
     */
    keep?: CountrySummary | null
  }>(),
  {
    placeholder: 'Search country…',
    error: undefined,
    hint: undefined,
    required: false,
    clearable: false,
    disabled: false,
    noneLabel: undefined,
    keep: null,
  },
)

const store = useCountriesStore()

async function fetchCountries(query: string) {
  await store.load()
  return store.search(query, props.keep)
}

const keyOf = (country: CountrySummary) => country.code

const select = useTemplateRef<{ focus: () => void }>('select')
defineExpose({ focus: () => select.value?.focus() })
</script>

<template>
  <SearchSelect
    ref="select"
    v-model="model"
    :fetch="fetchCountries"
    :key-of="keyOf"
    :debounce="0"
    :label="label"
    :placeholder="placeholder"
    :error="error"
    :hint="hint"
    :required="required"
    :clearable="clearable"
    :disabled="disabled"
    :none-label="noneLabel"
  />
</template>
