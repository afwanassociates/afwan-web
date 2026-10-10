<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { TONE_BADGE, humanize, statusTone } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'

/** "Visa, In process" / "Completed": a passport's current stage and status, as text. */
const props = defineProps<{ stage: string | null | undefined; status: string | null | undefined }>()

const workflow = useWorkflowStore()
onMounted(() => workflow.loadConfig())

const text = computed(() => {
  if (!props.stage) return '—'
  if (props.stage === 'completed') return 'Completed'
  const step = workflow.stepConfig(props.stage)
  const stage = step?.short_label ?? step?.label ?? humanize(props.stage)
  return props.status ? `${stage}, ${humanize(props.status)}` : stage
})

const tone = computed(() => statusTone(props.stage === 'completed' ? 'completed' : props.status))
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
    :class="TONE_BADGE[tone]"
    data-stage-badge
    :data-tone="tone"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ text }}
  </span>
</template>
