<script setup lang="ts">
import { computed } from 'vue'
import { TONE_BADGE, statusTone } from '@/lib/workflow'
import type { ValidityStatus } from '@/types/workflow'

/** Valid / Expiring soon / Expired chip for a step's valid-until date (always text). */
const props = defineProps<{
  status: ValidityStatus | null | undefined
  daysLeft?: number | null
}>()

const text = computed(() => {
  const left = props.daysLeft
  switch (props.status) {
    case 'valid':
      return 'Valid'
    case 'expiring_soon':
      return left !== null && left !== undefined ? `Expires in ${left} d` : 'Expiring soon'
    case 'expired':
      return 'Expired'
    default:
      return null
  }
})

const tone = computed(() => (props.status === 'valid' ? 'success' : statusTone(props.status)))
</script>

<template>
  <span
    v-if="text"
    class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
    :class="TONE_BADGE[tone]"
    data-validity
  >
    {{ text }}
  </span>
</template>
