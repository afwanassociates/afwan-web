<script setup lang="ts">
import type { EntryModeValue } from '@/types/passport'

/**
 * The Online mark as a small tag: a globe icon and the API's label written out (never colour
 * alone). Nothing is shown without a mark.
 */
defineProps<{ mode: EntryModeValue | null | undefined }>()

// 24×24 outline globe.
const GLOBE =
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'
</script>

<template>
  <span
    v-if="mode"
    class="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-sky-800 ring-1 ring-sky-300"
    :data-entry-mode="mode.value"
  >
    <svg
      class="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="GLOBE" />
    </svg>
    {{ mode.label }}
  </span>
</template>
