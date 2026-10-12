<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue'

/**
 * A modal anchored near the top of the viewport (8vh), centred, over a dim backdrop:
 * max 480px wide (full width minus 16px gutters on phones), scrolling inside when taller
 * than the screen. Esc, a backdrop click and the X close it; focus moves to the first field
 * and returns to what had it when it closes. Mount it with v-if; `close` asks the parent to
 * unmount it (ignored while `busy`).
 */
const props = defineProps<{
  title: string
  /** A line under the title (e.g. the passport name). */
  subtitle?: string
  /** Saving: Esc, the backdrop and the X do nothing. */
  busy?: boolean
  /** Gets the focus back on close (e.g. the button that opened it); else what had it before. */
  returnFocus?: HTMLElement | null
}>()
const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const panel = useTemplateRef<HTMLElement>('panel')
// Safari does not focus a clicked button, so the opener is best passed in.
const opener =
  props.returnFocus ??
  (document.activeElement instanceof HTMLElement ? document.activeElement : null)

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function close() {
  if (!props.busy) emit('close')
}

/** Esc closes; Tab stays inside the modal. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  await nextTick()
  // The first field (not the X), else the first button.
  const field = panel.value?.querySelector<HTMLElement>('input, select, textarea')
  ;(field ?? panel.value?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.value)?.focus()
})
onBeforeUnmount(() => {
  if (opener?.isConnected) opener.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50" data-top-modal @keydown="onKeydown">
      <div
        class="fixed inset-0 bg-slate-900/50"
        aria-hidden="true"
        data-modal-backdrop
        @click="close"
      />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="fixed top-[8vh] left-1/2 max-h-[84vh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 overflow-y-auto rounded-2xl border border-stroke bg-white p-5 text-left shadow-2xl focus:outline-none"
        data-modal-panel
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 :id="titleId" class="text-lg font-semibold text-ink">{{ title }}</h2>
            <p v-if="subtitle" class="text-sm text-muted">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            class="-mt-1 -mr-1 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            :disabled="busy"
            data-modal-close
            @click="close"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span class="sr-only">Close</span>
          </button>
        </div>
        <div class="mt-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
