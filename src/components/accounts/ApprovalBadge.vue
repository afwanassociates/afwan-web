<script setup lang="ts">
import type { ApprovalStatus } from '@/types/accounts'

/** The approval status of an entry, with the return reason under a returned one. */
defineProps<{ status: ApprovalStatus; label: string; reason?: string | null; by?: string | null }>()

const tone: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-300',
  approved: 'bg-green-50 text-green-800 ring-green-300',
  rejected: 'bg-red-50 text-red-800 ring-red-300',
}
</script>

<template>
  <span class="inline-block">
    <span
      class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
      :class="tone[status]"
      :data-status="status"
    >
      {{ label }}
    </span>
    <span
      v-if="status === 'rejected' && reason"
      class="mt-1 block text-xs text-red-800"
      data-reason
    >
      “{{ reason }}”<template v-if="by"> — {{ by }}</template>
    </span>
  </span>
</template>
