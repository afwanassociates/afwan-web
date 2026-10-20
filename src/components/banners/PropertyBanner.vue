<script setup lang="ts">
import BannerTopBar from './BannerTopBar.vue'

/** Hero banner 3: "Property You Can Trust." with a city skyline at sunrise. */

// Towers of the skyline (SVG units, ground at y = 720): x, top, width and colour.
const towers = [
  { x: 0, top: 344, width: 156, color: '#8c2a1c' },
  { x: 176, top: 176, width: 198, color: '#5a1218' },
  { x: 395, top: 270, width: 176, color: '#7c1b17' },
  { x: 594, top: 52, width: 228, color: '#4a0e12' },
  { x: 843, top: 406, width: 117, color: '#b8431c' },
]

const tags = ['Residential', 'Commercial', 'Land Development']
const lines = [
  'Export / Import',
  'First-Class Contractor',
  'Property',
  'Land Development',
  'Supplier',
]
</script>

<template>
  <div
    class="relative flex h-full flex-col overflow-hidden bg-linear-to-b from-[#fff8ee] via-[#fde3a6] to-[#f5bd58] text-cocoa-950"
  >
    <!-- Sun glow and its thin halo -->
    <div
      class="pointer-events-none absolute top-[14%] right-[11%] hidden aspect-square w-[27%] rounded-full bg-[radial-gradient(circle,rgb(255_236_170/0.95)_0%,rgb(253_215_120/0.6)_45%,transparent_70%)] lg:block"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute top-[14.5%] right-[10%] hidden aspect-square w-[28%] rounded-full border border-[#a8603c]/50 lg:block"
      aria-hidden="true"
    />

    <!-- Skyline -->
    <svg
      viewBox="0 0 960 720"
      preserveAspectRatio="xMaxYMax meet"
      class="pointer-events-none absolute right-0 bottom-[8%] hidden h-[72%] w-[50%] lg:block"
      aria-hidden="true"
    >
      <defs>
        <pattern id="tower-windows" width="27.6" height="37.5" patternUnits="userSpaceOnUse">
          <rect x="8" y="9" width="14" height="18" fill="#f5d6a0" />
        </pattern>
        <linearGradient id="tower-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stop-color="#fff" stop-opacity="1" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.35" />
        </linearGradient>
        <mask id="tower-mask">
          <rect width="960" height="720" fill="url(#tower-fade)" />
        </mask>
      </defs>
      <g mask="url(#tower-mask)">
        <g v-for="t in towers" :key="t.x">
          <rect :x="t.x" :y="t.top" :width="t.width" :height="720 - t.top" :fill="t.color" />
          <rect
            :x="t.x"
            :y="t.top"
            :width="t.width"
            :height="720 - t.top"
            fill="url(#tower-windows)"
          />
        </g>
        <!-- Antenna on the tallest tower -->
        <rect x="705" y="0" width="6" height="52" fill="#4a0e12" />
      </g>
    </svg>

    <div class="relative flex flex-1 flex-col px-6 pt-6 sm:px-12 sm:pt-10 lg:px-16 short:pt-6">
      <BannerTopBar />

      <div class="my-auto max-w-2xl py-6 lg:max-w-[46%]">
        <p class="text-xs font-semibold tracking-[0.3em] text-maroon-700 uppercase sm:text-sm">
          Property · Land · Development
        </p>
        <h2
          class="mt-5 font-display text-5xl leading-[1.02] font-bold sm:text-6xl lg:text-7xl short:mt-3 short:text-6xl"
        >
          Property<br />
          You Can <span class="text-tone-rust italic">Trust.</span>
        </h2>
        <p class="mt-6 max-w-xl text-base leading-relaxed font-medium sm:text-lg">
          Residential and commercial property solutions, handled with care and transparency.
        </p>
        <ul class="mt-7 flex flex-wrap gap-2 sm:gap-3">
          <li
            v-for="tag in tags"
            :key="tag"
            class="rounded-full bg-maroon-950 px-5 py-2.5 text-sm font-semibold text-cream-50"
          >
            {{ tag }}
          </li>
        </ul>
      </div>
    </div>

    <p
      class="relative bg-[#3a0b0f] px-6 pt-4 pb-16 text-xs leading-relaxed font-medium text-cream-100 sm:px-12 sm:py-4 sm:pr-56 sm:text-sm lg:px-16"
      data-lines
    >
      {{ lines.join(' · ') }} — excluding explosive materials and chemicals
    </p>
  </div>
</template>
