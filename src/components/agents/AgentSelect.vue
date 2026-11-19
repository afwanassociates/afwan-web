<script setup lang="ts">
import { computed, useId } from 'vue'
import type { AgentTabCounts } from '@/types/agents'

/**
 * The recruitment agent filter as one dropdown: All agents, the Own agent, each partner agent
 * (AG-002, AG-003, …) with its passports, and "No agent" while some have none approved.
 *
 * v-model: null (all agents), an agent id, or 'none'.
 */
const model = defineModel<number | 'none' | null>({ required: true })
const props = defineProps<{ counts: AgentTabCounts | null }>()

const id = useId()
const total = computed(() => (props.counts ? props.counts.none + props.counts.approved : null))

/** The <select> value: '' all, an id, or 'none'. */
const value = computed({
  get: () => (model.value === null ? '' : String(model.value)),
  set: (v: string) => {
    model.value = v === '' ? null : v === 'none' ? 'none' : Number(v)
  },
})
</script>

<template>
  <div class="min-w-0" data-agent-select>
    <label :for="id" class="sr-only">Recruitment agent</label>
    <div class="relative">
      <select
        :id="id"
        v-model="value"
        class="block w-full appearance-none rounded-lg border-2 border-primary-300 bg-white py-2.5 pr-10 pl-3 text-sm font-semibold text-primary-900 focus:border-primary-600"
        data-agent-filter
      >
        <option value="">All agents{{ total !== null ? ` (${total})` : '' }}</option>
        <option v-for="a in counts?.agents ?? []" :key="a.id" :value="String(a.id)">
          {{ a.name }} ({{ a.count }})
        </option>
        <option v-if="counts && (counts.none > 0 || model === 'none')" value="none">
          ⚠ No agent ({{ counts.none }})
        </option>
      </select>
      <!-- The dropdown arrow (the native one is hidden by appearance-none) -->
      <svg
        class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-primary-700"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </div>
  </div>
</template>
