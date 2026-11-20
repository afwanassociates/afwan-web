<script setup lang="ts">
import { computed } from 'vue'
import type { AgentTabCounts } from '@/types/agents'

/**
 * The agent-wise cards of a step page (Medical, Calling, Visa, BMET, Flight): All agents, then
 * each recruitment agent with its passports (the Own agent first), and "No agent" while some
 * passports have no approved agent yet (they can't move forward until one is approved).
 *
 * v-model: null (all agents), an agent id, or 'none'.
 */
const model = defineModel<number | 'none' | null>({ required: true })
const props = defineProps<{ counts: AgentTabCounts | null }>()

const total = computed(() => (props.counts ? props.counts.none + props.counts.approved : null))

const chip = (active: boolean) =>
  active
    ? 'bg-primary-900 text-white'
    : 'bg-white text-primary-900 ring-1 ring-slate-300 hover:bg-primary-50'
const sub = (active: boolean) => (active ? 'text-white/80' : 'text-muted')
</script>

<template>
  <div
    class="flex flex-wrap gap-2 rounded-xl bg-surface p-3"
    role="group"
    aria-label="Recruitment agent"
    data-agent-filter
  >
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-left text-sm text-primary-900"
      :class="
        model === null ? 'ring-2 ring-primary-900' : 'ring-1 ring-slate-300 hover:ring-primary-400'
      "
      :aria-pressed="model === null"
      data-agent="all"
      @click="model = null"
    >
      <span class="font-semibold">All agents</span>
      <span v-if="total !== null" class="ml-1 tabular-nums">({{ total }})</span>
      <span class="block text-xs text-muted">Every passport</span>
    </button>
    <button
      v-for="a in counts?.agents ?? []"
      :key="a.id"
      type="button"
      class="rounded-lg px-3 py-2 text-left text-sm"
      :class="chip(model === a.id)"
      :aria-pressed="model === a.id"
      :data-agent="a.id"
      @click="model = a.id"
    >
      <span class="font-semibold">{{ a.name }}</span>
      <span
        v-if="a.is_own"
        class="ml-1 rounded-full px-1.5 text-xs font-semibold ring-1"
        :class="model === a.id ? 'ring-white/60' : 'text-primary-800 ring-primary-200'"
        >Own</span
      >
      <span class="ml-1 tabular-nums">({{ a.count }})</span>
      <span class="block text-xs" :class="sub(model === a.id)">{{ a.rl_number }}</span>
    </button>
    <button
      v-if="counts && (counts.none > 0 || model === 'none')"
      type="button"
      class="rounded-lg px-3 py-2 text-left text-sm"
      :class="
        model === 'none'
          ? 'bg-amber-700 text-white'
          : 'bg-white text-amber-900 ring-1 ring-amber-300 hover:bg-amber-50'
      "
      :aria-pressed="model === 'none'"
      data-agent="none"
      @click="model = 'none'"
    >
      <span class="font-semibold">No agent</span>
      <span class="ml-1 tabular-nums">({{ counts.none }})</span>
      <span class="block text-xs" :class="model === 'none' ? 'text-white/80' : 'text-amber-800'"
        >Blocked until an agent is approved</span
      >
    </button>
  </div>
</template>
