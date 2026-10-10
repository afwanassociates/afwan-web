<script setup lang="ts">
import { computed } from 'vue'
import { toDisplayDate } from '@/lib/dates'
import { latestStatusDisplay } from '@/lib/latestStatus'
import type { LatestStatus, StatusTone } from '@/types/passport'

/**
 * A passport's latest status as coloured text ("Medical: Pending") with its date below.
 * The status is always written out; the colour and dot only support it.
 * Text colours are 700/600 shades: at least 4.5:1 contrast on white.
 */
const props = defineProps<{ latestStatus: LatestStatus }>()

/** "Passport entered" (grey) and "Medical pending" (amber) are worded here. */
const display = computed(() => latestStatusDisplay(props.latestStatus))

const TEXT: Record<StatusTone, string> = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  green: 'text-green-700',
  gray: 'text-gray-600',
}

const DOT: Record<StatusTone, string> = {
  red: 'bg-red-600',
  amber: 'bg-amber-500',
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  gray: 'bg-gray-400',
}

/** Unknown tones from the API fall back to gray. */
const tone = (value: string): StatusTone => (value in TEXT ? (value as StatusTone) : 'gray')
</script>

<template>
  <span class="inline-flex flex-col" :data-tone="tone(display.tone)">
    <span
      class="inline-flex items-center gap-1.5 font-semibold"
      :class="TEXT[tone(display.tone)]"
      data-status-text
    >
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        :class="DOT[tone(display.tone)]"
        aria-hidden="true"
      />
      {{ display.text }}
    </span>
    <span v-if="latestStatus.date" class="mt-0.5 text-xs text-slate-500" data-status-date>
      {{ toDisplayDate(latestStatus.date) }}
    </span>
  </span>
</template>
