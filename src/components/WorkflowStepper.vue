<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { STEP_STATE_TEXT, stepTone, type StepTone } from '@/lib/medical'
import { humanize } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import type { StepState, WorkflowStep } from '@/types/medical'

/**
 * The workflow step bar, built from the API's step list (no step names in this code):
 *
 * - Summary (no `steps`): counts from /workflow/summary per stage, status chips, "Final" on
 *   the last step and "Completed (N)" at the end. `activeStep` highlights a step; without it
 *   the bar is an overview. Steps link to their pages.
 * - One passport (`steps` from the passport's workflow): each step's state with an icon and
 *   text. `compact` shows small dots for list rows (text visually hidden).
 */
const props = withDefaults(
  defineProps<{
    /** Summary mode: the step this page belongs to (null = overview). */
    activeStep?: string | null
    /** Passport mode: the passport's workflow steps. */
    steps?: WorkflowStep[] | null
    compact?: boolean
    /** Summary mode: leave out the "Completed (N)" card (the All Passports overview). */
    hideCompleted?: boolean
  }>(),
  { activeStep: null, steps: null, compact: false, hideCompleted: false },
)

const workflow = useWorkflowStore()
onMounted(() => {
  if (!props.steps) workflow.load()
})

/* ---------- Summary mode ---------- */

interface Chip {
  key: string
  label: string
  value: number
  tone: StepTone
}

interface SummaryStep {
  key: string
  number: number
  label: string
  shortLabel: string
  enabled: boolean
  isFinal: boolean
  to: RouteLocationRaw | null
  count: number | null
  chips: Chip[]
}

/** Where each step leads: the first two have their own pages, later ones a Process tab. */
function linkFor(key: string, index: number): RouteLocationRaw {
  if (index === 0) return { name: 'passports' }
  if (index === 1) return { name: 'medical' }
  return { name: 'process', query: { tab: key } }
}

const CHIP_TONE: Record<string, StepTone> = {
  pending: 'warning',
  waiting: 'warning',
  in_process: 'info',
  rejected: 'danger',
  unfit: 'danger',
}

const summarySteps = computed<SummaryStep[]>(() => {
  const s = workflow.summary
  if (!s) return []
  const ordered = [...s.steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return ordered.map((step, i) => {
    const stage = s.stages?.[step.key]
    // The first step has no stage count: show the passports in the list.
    const count = i === 0 ? s.step1.total_active : (stage?.total ?? null)
    const chips: Chip[] = stage
      ? Object.entries(stage)
          .filter(([key]) => key !== 'total')
          .map(([key, value]) => ({
            key,
            label: humanize(key).toLowerCase(),
            value,
            tone: CHIP_TONE[key] ?? 'muted',
          }))
      : []
    return {
      key: step.key,
      number: i + 1,
      label: step.label,
      shortLabel: step.short_label ?? step.label,
      enabled: step.enabled,
      isFinal: i === ordered.length - 1,
      to: step.enabled ? linkFor(step.key, i) : null,
      count,
      chips,
    }
  })
})

const activeIndex = computed(() => summarySteps.value.findIndex((s) => s.key === props.activeStep))

/** Before the active step = completed (check mark); the active one is highlighted. */
function position(index: number): 'done' | 'current' | 'upcoming' {
  if (activeIndex.value < 0) return 'upcoming'
  if (index < activeIndex.value) return 'done'
  return index === activeIndex.value ? 'current' : 'upcoming'
}

/* ---------- Passport mode ---------- */

const toneClass: Record<StepTone, string> = {
  success: 'bg-green-600 text-white ring-green-600',
  warning: 'bg-accent-400 text-primary-950 ring-accent-500',
  danger: 'bg-red-600 text-white ring-red-600',
  muted: 'bg-slate-200 text-slate-600 ring-slate-300',
  info: 'bg-blue-600 text-white ring-blue-600',
}

const chipClass: Record<StepTone, string> = {
  success: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-800',
  muted: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-50 text-blue-800',
}

// 24×24 icons per state.
const CHECK = 'M5 12.5l4.5 4.5L19 7.5'
const DOTS = 'M7 12h.01M12 12h.01M17 12h.01'
const ALERT = 'M12 6v8M12 17.5v.5'
const CROSS = 'M7 7l10 10M17 7L7 17'
const LOCK = 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'
const ARROW = 'M8 12h8M13 8l4 4-4 4'
const SPIN = 'M12 4a8 8 0 1 1-8 8' // in process

const stateIcon: Record<StepState, string> = {
  not_started: DOTS,
  done: CHECK,
  passed: CHECK,
  completed: CHECK,
  pending: DOTS,
  waiting: DOTS,
  needs_attention: ALERT,
  expired: ALERT,
  failed: CROSS,
  rejected: CROSS,
  locked: LOCK,
  ready: ARROW,
  in_process: SPIN,
}

const passportSummary = computed(() =>
  (props.steps ?? []).map((s) => `${s.label}: ${STEP_STATE_TEXT[s.state] ?? s.state}`).join(', '),
)
</script>

<template>
  <!-- ===== One passport, compact: dots for list rows ===== -->
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
        class="h-0.5 w-1.5"
        :class="stepTone(step.state) === 'muted' ? 'bg-slate-300' : 'bg-slate-400'"
        aria-hidden="true"
      />
      <span
        class="flex h-4 w-4 items-center justify-center rounded-full ring-1"
        :class="toneClass[stepTone(step.state)]"
        :data-state="step.state"
        aria-hidden="true"
      >
        <svg
          class="h-2.5 w-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="stateIcon[step.state] ?? DOTS" />
        </svg>
      </span>
    </template>
  </div>

  <!-- ===== One passport, full size (detail page) ===== -->
  <ol
    v-else-if="steps"
    class="flex snap-x gap-x-2 gap-y-3 overflow-x-auto pb-1 sm:flex-wrap"
    data-mode="passport"
  >
    <template v-for="(step, i) in steps" :key="step.key">
      <li v-if="i > 0" class="hidden w-6 shrink-0 self-center sm:block" aria-hidden="true">
        <span class="block h-0.5 w-full bg-slate-300" />
      </li>
      <li class="flex shrink-0 snap-start items-center gap-2" :data-state="step.state">
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
            <path :d="stateIcon[step.state] ?? DOTS" />
          </svg>
        </span>
        <span class="leading-tight">
          <span class="block text-sm font-semibold text-ink">{{ i + 1 }} {{ step.label }}</span>
          <span class="block text-xs text-muted">{{
            STEP_STATE_TEXT[step.state] ?? step.state
          }}</span>
        </span>
      </li>
    </template>
  </ol>

  <!-- ===== Summary bar ===== -->
  <nav
    v-else
    aria-label="Workflow steps"
    class="snap-x snap-mandatory overflow-x-auto pb-1"
    data-mode="summary"
  >
    <p v-if="!summarySteps.length" class="py-3 text-sm text-muted">Loading the steps…</p>
    <ol v-else class="flex min-w-max items-stretch gap-1.5 xl:min-w-0">
      <template v-for="(step, i) in summarySteps" :key="step.key">
        <li v-if="i > 0" class="flex w-3 shrink-0 items-center" aria-hidden="true">
          <span class="h-0.5 w-full bg-slate-300" />
        </li>
        <li class="w-36 shrink-0 snap-start xl:w-auto xl:flex-1" :data-step="step.key">
          <component
            :is="step.to ? RouterLink : 'div'"
            v-bind="step.to ? { to: step.to } : {}"
            class="flex h-full flex-col gap-1 rounded-xl border px-2.5 py-2"
            :class="[
              !step.enabled
                ? 'cursor-not-allowed border-dashed border-slate-300 bg-slate-50 opacity-70'
                : position(i) === 'current'
                  ? 'border-primary-900 bg-primary-50 shadow-[inset_0_-3px_0_var(--color-accent-400)]'
                  : 'border-stroke bg-white hover:border-primary-300',
            ]"
            :aria-current="position(i) === 'current' ? 'step' : undefined"
            :aria-disabled="step.enabled ? undefined : 'true'"
            :title="step.enabled ? step.label : 'Not available yet'"
          >
            <span class="flex items-center gap-2">
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1"
                :class="
                  !step.enabled
                    ? toneClass.muted
                    : position(i) === 'done'
                      ? toneClass.success
                      : position(i) === 'current'
                        ? 'bg-primary-900 text-white ring-primary-900'
                        : 'bg-white text-primary-900 ring-slate-300'
                "
                aria-hidden="true"
              >
                <svg
                  v-if="!step.enabled || position(i) === 'done'"
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path :d="step.enabled ? CHECK : LOCK" />
                </svg>
                <template v-else>{{ step.number }}</template>
              </span>
              <span class="min-w-0 text-sm leading-tight font-semibold text-ink">
                <span class="xl:hidden">{{ step.shortLabel }}</span>
                <span class="hidden xl:inline">{{ step.label }}</span>
                <span v-if="position(i) === 'done'" class="sr-only"> (completed)</span>
                <span v-if="position(i) === 'current'" class="sr-only"> (current step)</span>
              </span>
              <span
                v-if="step.isFinal"
                class="ml-auto rounded bg-primary-900 px-1 text-[0.6rem] font-bold tracking-wide text-white uppercase"
                data-final
              >
                Final
              </span>
            </span>
            <span v-if="!step.enabled" class="text-xs text-muted">Coming soon</span>
            <span v-else class="text-xs text-muted">
              <span class="font-semibold text-ink tabular-nums" data-count>{{
                step.count ?? '–'
              }}</span>
              {{ i === 0 ? 'in the list' : 'at this step' }}
            </span>
            <span v-if="step.chips.length" class="flex flex-wrap gap-1">
              <span
                v-for="chip in step.chips"
                :key="chip.key"
                class="rounded-full px-1.5 py-px text-[0.68rem] font-semibold whitespace-nowrap tabular-nums"
                :class="chipClass[chip.tone]"
                :data-chip="chip.key"
              >
                {{ chip.value }} {{ chip.label }}
              </span>
            </span>
          </component>
        </li>
      </template>
      <li v-if="!hideCompleted" class="flex w-3 shrink-0 items-center" aria-hidden="true">
        <span class="h-0.5 w-full bg-slate-300" />
      </li>
      <li v-if="!hideCompleted" class="w-28 shrink-0 snap-start" data-step="completed">
        <RouterLink
          :to="{ name: 'process', query: { tab: 'completed' } }"
          class="flex h-full flex-col justify-center gap-1 rounded-xl border px-2.5 py-2"
          :class="
            activeStep === 'completed'
              ? 'border-green-700 bg-green-50'
              : 'border-green-200 bg-white hover:border-green-400'
          "
          :aria-current="activeStep === 'completed' ? 'step' : undefined"
        >
          <span class="flex items-center gap-1.5 text-sm font-semibold text-green-800">
            <svg
              class="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="CHECK" />
            </svg>
            Completed
          </span>
          <span class="text-xs text-muted" data-completed>
            (<span class="font-semibold text-ink tabular-nums">{{
              workflow.summary?.completed ?? 0
            }}</span
            >)
          </span>
        </RouterLink>
      </li>
    </ol>
  </nav>
</template>
