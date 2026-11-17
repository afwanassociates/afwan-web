<script setup lang="ts">
import { AGENT_STATUS_CLASSES, AGENT_STATUS_LABELS } from '@/lib/agents'
import type { AgentStatus } from '@/types/agents'

/** A passport's MYGRAM agent status as a small pill. */
defineProps<{ status: AgentStatus }>()
</script>

<template>
  <span
    class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
    :class="AGENT_STATUS_CLASSES[status]"
    :data-agent-status="status"
  >
    {{ AGENT_STATUS_LABELS[status] }}
  </span>
</template>
