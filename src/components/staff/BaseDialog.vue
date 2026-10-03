<script setup lang="ts">
import { nextTick, onBeforeUnmount, useId, useTemplateRef, watch } from 'vue'

/**
 * Accessible modal built on the native <dialog>: focus is trapped while open,
 * Escape closes it (unless busy) and focus returns to the opener afterwards.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  title: string
  /** Blocks closing while a request is running. */
  busy?: boolean
}>()

const titleId = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

watch(
  open,
  async (isOpen) => {
    await nextTick()
    const el = dialog.value
    if (!el) return
    if (isOpen && !el.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!isOpen && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
      opener?.focus()
      opener = null
    }
  },
  { immediate: true },
)

function onCancel(event: Event) {
  event.preventDefault()
  if (!props.busy) open.value = false
}

onBeforeUnmount(() => opener?.focus())
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-slate-800 shadow-[0_24px_60px_-20px_rgb(21_42_80/0.55)] backdrop:bg-primary-950/50 backdrop:backdrop-blur-sm"
    @cancel="onCancel"
  >
    <div class="p-6">
      <div class="flex items-start justify-between gap-4">
        <h2 :id="titleId" class="text-lg font-bold text-primary-900">{{ title }}</h2>
        <button
          type="button"
          class="-m-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          :disabled="busy"
          @click="open = false"
        >
          <span class="sr-only">Close</span>
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="mt-4">
        <slot />
      </div>
    </div>
  </dialog>
</template>
