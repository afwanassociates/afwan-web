<script setup lang="ts">
import { computed } from 'vue'
import type { Service, ServiceIcon, ServiceTone } from '@/data/services'

const props = defineProps<{ service: Service }>()

// Outline icons on a 24×24 grid; each entry is a list of SVG path "d" values.
const iconPaths: Record<ServiceIcon, string[]> = {
  // A shipping box
  export: ['M12 3 20 7.5v9L12 21l-8-4.5v-9z', 'M4 7.5 12 12l8-4.5', 'M12 12v9', 'M8 5.25l8 4.5'],
  // A builder's hard hat
  contractor: [
    'M3 17h18v2H3z',
    'M5 17v-2a7 7 0 0 1 14 0v2',
    'M10 8.3V6a2 2 0 0 1 4 0v2.3',
    'M9 17v-3M15 17v-3',
  ],
  // An office building
  property: [
    'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17',
    'M4 21h16',
    'M10 7h4M10 11h4M10 15h4',
    'M11 21v-3h2v3',
  ],
  // A folded map
  land: ['M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z', 'M9 4v13.5', 'M15 6.5V20'],
  // The sun
  solar: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  // A delivery truck
  supplier: [
    'M3 6h11v10H3z',
    'M14 9h4l3 3.5V16h-7',
    'M5.5 18.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
    'M15.5 18.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  ],
}

// Badge colours; the gold badge takes dark icon strokes, the others white.
const toneClasses: Record<ServiceTone, string> = {
  gold: 'bg-tone-gold text-cocoa-950',
  flame: 'bg-tone-flame text-white',
  rust: 'bg-tone-rust text-white',
  brick: 'bg-tone-brick text-white',
  maroon: 'bg-tone-maroon text-white',
  sun: 'bg-tone-sun text-cocoa-950',
}

const paths = computed(() => iconPaths[props.service.icon])
</script>

<template>
  <article
    class="flex h-full flex-col rounded-[1.75rem] bg-white p-7 shadow-[0_24px_50px_-30px_rgb(124_27_23/0.35)] ring-1 ring-cream-100 transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-8"
    :data-service="service.id"
  >
    <span
      class="flex h-14 w-14 items-center justify-center rounded-full"
      :class="toneClasses[service.tone]"
      aria-hidden="true"
    >
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
    <h3 class="mt-7 text-xl font-semibold text-cocoa-950 sm:text-2xl">{{ service.title }}</h3>
    <p class="mt-3 leading-relaxed text-cocoa-700">{{ service.description }}</p>
  </article>
</template>
