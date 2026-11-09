<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { fetchPartyPassports } from '@/api/accounts'
import { passportPaymentBadge } from '@/lib/accounts'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { PartyPassportGroups } from '@/types/accounts'

/**
 * On a party's ledger: the passports the party gave, by company, each paid (an approved cash
 * receipt paid it off), pending (that receipt waits for approval), part paid or unpaid.
 * Every country.
 * `version` changes when receipts may have changed (reloads the list).
 */
const props = defineProps<{ partyId: number; version?: number }>()

const id = useId()
const result = ref<PartyPassportGroups | null>(null)
const loadError = ref<string | null>(null)
const expanded = ref(new Set<number>())

let request = 0
watch(
  () => [props.partyId, props.version] as const,
  async ([partyId]) => {
    const current = ++request
    loadError.value = null
    try {
      const data = await fetchPartyPassports(partyId)
      if (current === request) result.value = data
    } catch (error) {
      if (current === request && errorStatus(error) !== 401) {
        loadError.value = errorMessage(error, 'Could not load the passports.')
      }
    }
  },
  { immediate: true },
)

function toggle(companyId: number) {
  const next = new Set(expanded.value)
  if (!next.delete(companyId)) next.add(companyId)
  expanded.value = next
}

const badge = passportPaymentBadge
</script>

<template>
  <section
    v-if="loadError || (result && result.data.length)"
    class="glass-card mt-6 p-4 sm:p-6"
    aria-labelledby="party-passports-title"
    data-party-passports
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="party-passports-title" class="text-lg font-bold text-primary-900">Passports</h2>
      <p v-if="result" class="text-sm text-muted" data-total-counts>
        {{ result.meta.counts.total }} passports · {{ result.meta.counts.paid }} paid
        <template v-if="result.meta.counts.pending">
          · {{ result.meta.counts.pending }} pending</template
        >
        <template v-if="result.meta.counts.part_paid">
          · {{ result.meta.counts.part_paid }} part paid</template
        >
        · <span class="font-semibold text-ink">{{ result.meta.counts.unpaid }} unpaid</span>
      </p>
    </div>
    <p v-if="loadError" class="mt-3 text-sm text-red-700" role="alert">{{ loadError }}</p>

    <ul v-else-if="result" class="mt-4 space-y-2">
      <li
        v-for="group in result.data"
        :key="group.company.id"
        class="rounded-lg border border-stroke"
        :data-company="group.company.id"
      >
        <button
          type="button"
          class="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
          :aria-expanded="expanded.has(group.company.id) ? 'true' : 'false'"
          :aria-controls="`${id}-c${group.company.id}`"
          @click="toggle(group.company.id)"
        >
          <span class="flex items-center gap-2 font-semibold text-primary-900">
            <svg
              class="h-4 w-4 transition-transform motion-reduce:transition-none"
              :class="expanded.has(group.company.id) ? 'rotate-90' : ''"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 5l6 5-6 5V5z" />
            </svg>
            {{ group.company.name }}
            <span v-if="group.company.country_code" class="text-xs font-normal text-muted">{{
              group.company.country_code
            }}</span>
          </span>
          <span class="text-xs text-muted">
            {{ group.counts.total }} · {{ group.counts.paid }} paid
            <template v-if="group.counts.pending">· {{ group.counts.pending }} pending</template>
            <template v-if="group.counts.part_paid"
              >· {{ group.counts.part_paid }} part paid</template
            >
            · <span class="font-semibold text-ink">{{ group.counts.unpaid }} unpaid</span>
          </span>
        </button>
        <ul
          v-if="expanded.has(group.company.id)"
          :id="`${id}-c${group.company.id}`"
          class="max-h-80 divide-y divide-stroke overflow-y-auto border-t border-stroke"
        >
          <li
            v-for="p in group.passports"
            :key="p.id"
            class="flex items-center gap-3 px-3 py-2 text-sm"
            :data-passport="p.id"
          >
            <span class="w-12 font-mono text-xs text-muted">#{{ p.entry_no }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink">{{ p.passport_name }}</span>
              <span class="block text-xs text-muted">
                {{ p.passport_number }}<template v-if="p.stage"> · {{ p.stage }}</template>
              </span>
            </span>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
              :class="badge(p).cls"
              data-status
              >{{ badge(p).text }}</span
            >
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
