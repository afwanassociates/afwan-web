<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <!-- Always rendered so screen readers announce new messages. -->
  <div
    class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[0_18px_40px_-18px_rgb(0_0_100/0.45)]"
      :class="
        toast.type === 'success'
          ? 'border-green-200 bg-green-50 text-green-900'
          : 'border-red-200 bg-red-50 text-red-900'
      "
    >
      <p class="flex-1 font-medium">{{ toast.message }}</p>
      <button
        type="button"
        class="-m-1 rounded-md p-1 opacity-70 hover:opacity-100"
        @click="dismiss(toast.id)"
      >
        <span class="sr-only">Dismiss</span>
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
