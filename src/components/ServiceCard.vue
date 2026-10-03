<script setup lang="ts">
import { computed } from 'vue'
import type { Service, ServiceIcon } from '@/data/services'

const props = defineProps<{ service: Service }>()

// Outline icons on a 24×24 grid; each entry is a list of SVG path "d" values.
const iconPaths: Record<ServiceIcon, string[]> = {
  local: [
    'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z',
    'M9.5 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  ],
  overseas: [
    'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0',
    'M3.6 9h16.8M3.6 15h16.8',
    'M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z',
  ],
  workforce: [
    'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    'M3 21v-1a6 6 0 0 1 6-6 6 6 0 0 1 6 6v1',
    'M16 3.5a3.5 3.5 0 0 1 0 7',
    'M21 21v-1a5.5 5.5 0 0 0-3.5-5.1',
  ],
  visa: ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
  training: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5', 'M22 9v6'],
}

const paths = computed(() => iconPaths[props.service.icon])
</script>

<template>
  <article class="glass-card hover-lift group relative flex h-full flex-col overflow-hidden p-6">
    <!-- Glossy top edge in brand colours -->
    <span
      class="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-gold-400 via-accent-600 to-ember-700 opacity-80"
      aria-hidden="true"
    />
    <span class="gloss-badge h-12 w-12 rounded-xl" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path v-for="d in paths" :key="d" :d="d" />
      </svg>
    </span>
    <h3 class="mt-5 text-lg font-semibold text-primary-900">{{ service.title }}</h3>
    <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ service.description }}</p>
  </article>
</template>
