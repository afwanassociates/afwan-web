<script setup lang="ts">
import { computed } from 'vue'
import { medicalStatusText } from '@/lib/medical'
import type { MedicalStatus } from '@/types/medical'

/** Medical status chip: an icon and text (never colour alone). */
const props = defineProps<{
  status: MedicalStatus
  /** For "Fit until DD-MM-YYYY". */
  validUntil?: string | null
}>()

const text = computed(() => medicalStatusText(props.status, props.validUntil))

const toneClass: Record<MedicalStatus, string> = {
  pending: 'bg-slate-100 text-slate-800 ring-slate-300',
  fit: 'bg-green-50 text-green-800 ring-green-300',
  expiring_soon: 'bg-accent-50 text-accent-800 ring-accent-300',
  expired: 'bg-orange-50 text-orange-800 ring-orange-300',
  unfit: 'bg-red-50 text-red-800 ring-red-300',
}

// 24×24 outline icons.
const iconPath: Record<MedicalStatus, string> = {
  pending: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', // clock
  fit: 'M5 12.5l4.5 4.5L19 7.5', // check
  expiring_soon:
    'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', // warning
  expired: 'M4 4l16 16M12 7v3M21 12a9 9 0 0 1-14.3 7.3M3 12a9 9 0 0 1 14.3-7.3', // crossed clock
  unfit: 'M6 6l12 12M18 6L6 18', // cross
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
    :class="toneClass[status]"
    :data-status="status"
  >
    <svg
      class="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="iconPath[status]" />
    </svg>
    {{ text }}
  </span>
</template>
