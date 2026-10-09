<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { STEP_STATE_TEXT, stepTone, type StepTone } from '@/lib/medical'
import { useWorkflowStore } from '@/stores/workflow'
import type { StepState, WorkflowStep } from '@/types/medical'

/**
 * The workflow step bar (1 Passport → 2 Medical → 3 …), in two modes:
 *
 * - Summary (no `steps`): counts from /workflow/summary, Step 1 and 2 link to their lists,
 *   `current` is highlighted, steps before it get a check mark, disabled steps are greyed.
 * - One passport (`steps` from the passport's `workflow`): each step's state with an icon and
 *   text. `compact` shows a small dotted indicator for list rows (text visually hidden).
 */
const props = withDefaults(
  defineProps<{
    /** Summary mode: the step this page belongs to. */
    current?: 'passport' | 'medical' | null
    /** Passport mode: the passport's workflow steps. */
    steps?: WorkflowStep[] | null
    compact?: boolean
  }>(),
  { current: null, steps: null, compact: false },
)

const workflow = useWorkflowStore()
onMounted(() => {
  if (!props.steps) workflow.load()
})

/* ---------- Summary mode ---------- */

interface Chip {
  label: string
  value: number
  tone: StepTone
}

interface SummaryStep {
  key: string
  number: number
  label: string
  enabled: boolean
  to: RouteLocationRaw | null
  count: number | null
  countLabel: string
  chips: Chip[]
}

const STEP_LINKS: Record<string, RouteLocationRaw> = {
  passport: { name: 'passports' },
  medical: { name: 'medical' },
}

const summarySteps = computed<SummaryStep[]>(() => {
  const s = workflow.summary
  const configured = s?.steps ?? [
    { key: 'passport', label: 'Passport', enabled: true },
    { key: 'medical', label: 'Medical', enabled: true },
    { key: 'step3', label: 'Step 3', enabled: false },
  ]
  return configured.map((step, i) => {
    const base = {
      key: step.key,
      number: i + 1,
      label: step.label,
      enabled: step.enabled,
      to: step.enabled ? (STEP_LINKS[step.key] ?? null) : null,
    }
    if (step.key === 'passport')
      return {
        ...base,
        count: s?.step1.total_active ?? null,
        countLabel: 'in the list',
        chips: [],
      }
    if (step.key === 'medical')
      return {
        ...base,
        count: s?.step2.pending ?? null,
        countLabel: 'pending',
        chips: s
          ? [
              { label: 'fit', value: s.step2.fit, tone: 'success' as const },
              { label: 'expired', value: s.step2.expired, tone: 'warning' as const },
              { label: 'unfit', value: s.step2.unfit, tone: 'danger' as const },
            ]
          : [],
      }
    return {
      ...base,
      count: step.enabled ? (s?.step3.ready ?? null) : null,
      countLabel: 'ready',
      chips: [],
    }
  })
})

const currentIndex = computed(() => summarySteps.value.findIndex((s) => s.key === props.current))

/** Before the current step = completed (check mark); the current one is highlighted. */
function summaryPosition(index: number): 'done' | 'current' | 'upcoming' {
  if (currentIndex.value < 0) return 'upcoming'
  if (index < currentIndex.value) return 'done'
  return index === currentIndex.value ? 'current' : 'upcoming'
}

/* ---------- Passport mode ---------- */

const toneClass: Record<StepTone, string> = {
  success: 'bg-green-600 text-white ring-green-600',
  warning: 'bg-accent-400 text-primary-950 ring-accent-500',
  danger: 'bg-red-600 text-white ring-red-600',
  muted: 'bg-slate-200 text-slate-600 ring-slate-300',
  info: 'bg-primary-900 text-white ring-primary-900',
}

const chipClass: Record<StepTone, string> = {
  success: 'bg-green-50 text-green-800',
  warning: 'bg-orange-50 text-orange-800',
  danger: 'bg-red-50 text-red-800',
  muted: 'bg-slate-100 text-slate-700',
  info: 'bg-primary-50 text-primary-800',
}

// 24×24 icons per state.
const stateIcon: Record<StepState, string> = {
  done: 'M5 12.5l4.5 4.5L19 7.5',
  passed: 'M5 12.5l4.5 4.5L19 7.5',
  pending: 'M7 12h.01M12 12h.01M17 12h.01', // …
  needs_attention: 'M12 6v8M12 17.5v.5',
  expired: 'M12 6v8M12 17.5v.5',
  failed: 'M7 7l10 10M17 7L7 17',
  locked: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  ready: 'M8 12h8M13 8l4 4-4 4',
}

const passportSummary = computed(() =>
  (props.steps ?? []).map((s) => `${s.label}: ${STEP_STATE_TEXT[s.state]}`).join(', '),
)
</script>

<template>
  <!-- ===== One passport, compact: dotted indicator for list rows ===== -->
  <div
    v-if="steps && compact"
    class="inline-flex items-center"
    :title="passportSummary"
    data-mode="compact"
  >
    <span class="sr-only">Progress: {{ passportSummary }}</span>
    <template v-for="(step, i) in steps" :key="step.key">
      <span
        v-if="i > 0"
        class="h-0.5 w-2.5"
        :class="stepTone(step.state) === 'muted' ? 'bg-slate-300' : 'bg-slate-400'"
        aria-hidden="true"
      />
      <span
        class="flex h-5 w-5 items-center justify-center rounded-full ring-1"
        :class="toneClass[stepTone(step.state)]"
        :data-state="step.state"
        aria-hidden="true"
      >
        <svg
          class="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="stateIcon[step.state]" />
        </svg>
      </span>
    </template>
  </div>

  <!-- ===== One passport, full size (detail page) ===== -->
  <ol v-else-if="steps" class="flex flex-wrap items-center gap-x-2 gap-y-3" data-mode="passport">
    <template v-for="(step, i) in steps" :key="step.key">
      <li v-if="i > 0" class="hidden h-0.5 w-8 bg-slate-300 sm:block" aria-hidden="true" />
      <li class="flex items-center gap-2" :data-state="step.state">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1"
          :class="toneClass[stepTone(step.state)]"
          aria-hidden="true"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="stateIcon[step.state]" />
          </svg>
        </span>
        <span class="leading-tight">
          <span class="block text-sm font-semibold text-ink">{{ i + 1 }} {{ step.label }}</span>
          <span class="block text-xs text-muted">{{ STEP_STATE_TEXT[step.state] }}</span>
        </span>
      </li>
    </template>
  </ol>

  <!-- ===== Summary bar ===== -->
  <nav v-else aria-label="Workflow steps" class="overflow-x-auto" data-mode="summary">
    <ol class="flex min-w-max items-stretch gap-2 sm:min-w-0">
      <template v-for="(step, i) in summarySteps" :key="step.key">
        <li v-if="i > 0" class="flex w-4 shrink-0 items-center sm:w-8" aria-hidden="true">
          <span class="h-0.5 w-full bg-slate-300" />
        </li>
        <li class="min-w-44 flex-1" :data-step="step.key">
          <component
            :is="step.to ? RouterLink : 'div'"
            v-bind="step.to ? { to: step.to } : {}"
            class="flex h-full items-start gap-3 rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3"
            :class="[
              !step.enabled
                ? 'cursor-not-allowed border-dashed border-slate-300 bg-slate-50 opacity-70'
                : summaryPosition(i) === 'current'
                  ? 'border-primary-900 bg-primary-50 shadow-[inset_0_-3px_0_var(--color-accent-400)]'
                  : 'border-stroke bg-white hover:border-primary-300',
            ]"
            :aria-current="summaryPosition(i) === 'current' ? 'step' : undefined"
            :aria-disabled="step.enabled ? undefined : 'true'"
            :title="step.enabled ? undefined : 'Not available yet'"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1"
              :class="
                !step.enabled
                  ? toneClass.muted
                  : summaryPosition(i) === 'done'
                    ? toneClass.success
                    : summaryPosition(i) === 'current'
                      ? toneClass.info
                      : 'bg-white text-primary-900 ring-slate-300'
              "
              aria-hidden="true"
            >
              <svg
                v-if="!step.enabled || summaryPosition(i) === 'done'"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path :d="step.enabled ? stateIcon.done : stateIcon.locked" />
              </svg>
              <template v-else>{{ step.number }}</template>
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-ink">
                {{ step.number }} {{ step.label }}
                <span v-if="summaryPosition(i) === 'done'" class="sr-only">(completed)</span>
                <span v-if="summaryPosition(i) === 'current'" class="sr-only">(current step)</span>
              </span>
              <span v-if="!step.enabled" class="block text-xs text-muted">Coming soon</span>
              <span v-else class="block text-xs text-muted">
                <span class="font-semibold text-ink tabular-nums" data-count>{{
                  step.count ?? '–'
                }}</span>
                {{ step.countLabel }}
              </span>
              <span v-if="step.chips.length" class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="chip in step.chips"
                  :key="chip.label"
                  class="rounded-full px-1.5 py-px text-[0.7rem] font-semibold tabular-nums"
                  :class="chipClass[chip.tone]"
                >
                  {{ chip.value }} {{ chip.label }}
                </span>
              </span>
            </span>
          </component>
        </li>
      </template>
    </ol>
  </nav>
</template>
