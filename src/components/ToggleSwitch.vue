<script setup lang="ts">
import { ref } from 'vue'

/**
 * Accessible on/off switch (role="switch"). Toggles with a click, Space or Enter.
 *
 * With `save`, it updates optimistically: the new value shows at once, `save(next)` runs,
 * and if it fails the value rolls back and `error` is emitted with the failure.
 */
const model = defineModel<boolean>({ required: true })
const props = withDefaults(
  defineProps<{
    /** Accessible name, e.g. "Active: Malaysia". */
    label: string
    save?: (next: boolean) => Promise<unknown>
    disabled?: boolean
  }>(),
  { save: undefined, disabled: false },
)
const emit = defineEmits<{ error: [error: unknown] }>()

const isPending = ref(false)

async function toggle() {
  if (props.disabled || isPending.value) return
  const previous = model.value
  const next = !previous
  model.value = next
  if (!props.save) return

  isPending.value = true
  try {
    await props.save(next)
  } catch (error) {
    model.value = previous
    emit('error', error)
  } finally {
    isPending.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === ' ' || event.key === 'Enter') {
    // Handled here; preventDefault stops the button's own click so it toggles only once.
    event.preventDefault()
    toggle()
  }
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :aria-busy="isPending || undefined"
    :disabled="disabled"
    class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
    :class="[model ? 'bg-primary-900' : 'bg-slate-300', { 'opacity-70': isPending }]"
    @click="toggle"
    @keydown="onKeydown"
    @keyup.space.prevent
  >
    <span
      class="inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-transform duration-200 motion-reduce:transition-none"
      :class="model ? 'translate-x-5' : 'translate-x-0'"
      aria-hidden="true"
    />
  </button>
</template>
