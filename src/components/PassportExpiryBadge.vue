<script setup lang="ts">
import { computed } from 'vue'
import { businessToday, daysLeft } from '@/lib/dates'

/** Passport expiry status chip (always text): Valid, Expires soon (≤ 180 days), Expired, Not set. */
const props = defineProps<{ expiryDate: string | null }>()

const today = businessToday()

const chip = computed(() => {
  if (!props.expiryDate) return { text: 'Not set', class: 'bg-slate-100 text-slate-700' }
  const left = daysLeft(props.expiryDate, today) ?? 0
  if (left < 0) return { text: 'Expired', class: 'bg-red-50 text-red-800' }
  if (left <= 180) return { text: 'Expires soon', class: 'bg-accent-50 text-accent-800' }
  return { text: 'Valid', class: 'bg-green-50 text-green-800' }
})
</script>

<template>
  <span
    class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="chip.class"
    data-expiry-badge
  >
    {{ chip.text }}
  </span>
</template>
