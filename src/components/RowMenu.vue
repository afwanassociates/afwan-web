<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'

/**
 * A row's "⋯" (more actions) menu: the less used actions of a table row (Edit slip, Return
 * to owner, …). The menu is teleported to <body> so the table's scrolling and sticky column
 * never clip it. Escape, a click outside, scrolling or resizing closes it.
 *
 * Put the actions in the default slot as <button role="menuitem"> (or links); `close` closes
 * the menu.
 */
defineProps<{
  /** For screen readers, e.g. "More actions for A12345678". */
  label: string
}>()

const id = useId()
const open = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const position = ref({ top: 0, right: 0 })

function place() {
  const rect = button.value?.getBoundingClientRect()
  if (!rect) return
  position.value = { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) }
}

async function toggle() {
  if (open.value) return close()
  place()
  open.value = true
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  await nextTick()
  menu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
}

function close() {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
}

function onOutside(event: Event) {
  const target = event.target as Node
  if (menu.value?.contains(target) || button.value?.contains(target)) return
  close()
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
    button.value?.focus()
  }
}

onBeforeUnmount(close)
</script>

<template>
  <button
    ref="button"
    type="button"
    class="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-primary-900"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? id : undefined"
    data-row-menu
    @click="toggle"
  >
    <span class="sr-only">{{ label }}</span>
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="id"
      ref="menu"
      role="menu"
      class="fixed z-50 min-w-44 rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
      :style="{ top: `${position.top}px`, right: `${position.right}px` }"
      data-row-menu-items
      @click="close"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>
