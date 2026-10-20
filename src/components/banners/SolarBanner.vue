<script setup lang="ts">
import { scrollToSection } from '@/lib/scroll'
import BannerTopBar from './BannerTopBar.vue'

/** Hero banner 2: "Energy for a Brighter Bangladesh." with a glowing solar panel. */

type Point = [number, number]

// The panel face, tilted in perspective (SVG units): top-left, top-right, bottom-right, bottom-left.
const face: [Point, Point, Point, Point] = [
  [62, 108],
  [660, 25],
  [668, 485],
  [24, 508],
]

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/** A point on the face: u runs left to right, v top to bottom. */
function at(u: number, v: number): Point {
  const [tl, tr, br, bl] = face
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v)
}

/** Grid lines of the face: `cols` × `rows` cells, as SVG path data. */
function grid(cols: number, rows: number): string {
  const d: string[] = []
  for (let i = 1; i < cols; i++)
    d.push(`M${at(i / cols, 0).join(',')}L${at(i / cols, 1).join(',')}`)
  for (let j = 1; j < rows; j++)
    d.push(`M${at(0, j / rows).join(',')}L${at(1, j / rows).join(',')}`)
  return d.join('')
}

const facePoints = face.map((p) => p.join(',')).join(' ')
const majorGrid = grid(6, 5)
const minorGrid = grid(18, 15)

const chips = [
  {
    label: 'Clean Power',
    paths: [
      'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8',
      'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    ],
    class: 'lg:left-[50%] lg:bottom-[12%]',
  },
  {
    label: 'Reliable Supply',
    paths: [
      'M3 6h11v10H3z',
      'M14 9h4l3 3.5V16h-7',
      'M5.5 18.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
      'M15.5 18.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
    ],
    class: 'lg:left-[66%] lg:bottom-[7.5%]',
  },
  {
    label: 'Public Infrastructure',
    paths: [
      'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17',
      'M4 21h16',
      'M10 7h4M10 11h4M10 15h4',
      'M11 21v-3h2v3',
    ],
    class: 'lg:left-[82%] lg:bottom-[12%]',
  },
]
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#07070b] text-white" data-surface="dark">
    <!-- Sun glow top right, ember glow bottom left -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_20%,rgb(255_196_74/0.9)_0%,rgb(240_160_40/0.45)_9%,rgb(120_80_20/0.18)_24%,transparent_45%),radial-gradient(circle_at_0%_100%,rgb(110_20_20/0.45),transparent_35%)]"
      aria-hidden="true"
    />

    <!-- Solar panel -->
    <svg
      viewBox="0 0 700 540"
      class="pointer-events-none absolute top-[24%] right-[4%] hidden w-[37%] drop-shadow-[0_0_28px_rgb(240_170_60/0.55)] lg:block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="solar-cells" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5f6db8" />
          <stop offset="0.45" stop-color="#2b3470" />
          <stop offset="1" stop-color="#232338" />
        </linearGradient>
        <linearGradient id="solar-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f6c76a" />
          <stop offset="1" stop-color="#c88a2a" />
        </linearGradient>
      </defs>
      <!-- Frame -->
      <polygon
        points="40,90 682,0 694,500 0,530"
        fill="#0b0b18"
        stroke="url(#solar-frame)"
        stroke-width="6"
        stroke-linejoin="round"
      />
      <!-- Cells -->
      <polygon :points="facePoints" fill="url(#solar-cells)" />
      <path :d="minorGrid" stroke="rgb(255 255 255 / 0.12)" stroke-width="1" fill="none" />
      <path :d="majorGrid" stroke="#e7b257" stroke-width="2.5" fill="none" />
    </svg>

    <!-- Feature chips -->
    <ul class="absolute right-6 bottom-20 left-6 hidden gap-3 lg:block">
      <li
        v-for="chip in chips"
        :key="chip.label"
        class="absolute flex w-[14%] min-w-48 items-center gap-3 rounded-2xl bg-white/[0.06] px-5 py-4 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md xl:text-base"
        :class="chip.class"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-7 w-7 shrink-0 text-tone-gold"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="d in chip.paths" :key="d" :d="d" />
        </svg>
        {{ chip.label }}
      </li>
    </ul>

    <div class="relative flex h-full flex-col px-6 pt-6 pb-16 sm:px-12 sm:pt-10 lg:px-16">
      <BannerTopBar dark />
      <div class="mt-5 h-px bg-white/10" aria-hidden="true" />

      <div class="my-auto max-w-2xl pt-6 lg:max-w-[60%]">
        <p class="text-xs font-semibold tracking-[0.35em] text-tone-gold uppercase sm:text-sm">
          Solar energy solutions
        </p>
        <h2
          class="mt-5 font-display text-4xl leading-[1.08] font-bold sm:text-6xl lg:text-[3.6rem] xl:text-7xl"
        >
          Energy for a Brighter
          <span
            class="block bg-linear-to-r from-[#f6cf7a] to-[#d18f2c] bg-clip-text pr-2 text-transparent italic"
          >
            Bangladesh.
          </span>
        </h2>
        <p class="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
          Reliable solar energy solutions for homes, buildings and public infrastructure.
        </p>
        <a
          href="#solar"
          class="mt-8 inline-flex items-center gap-3 rounded-full bg-linear-to-r from-[#f6d27f] to-[#cf8d2b] px-7 py-3.5 text-sm font-semibold text-[#1a1208] shadow-[0_10px_30px_-10px_rgb(240_170_60/0.8)] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none sm:text-base"
          @click.prevent="scrollToSection('solar')"
        >
          Explore Solar Solutions
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>

      <div class="mt-auto border-t border-white/10 pt-4">
        <p class="text-xs text-white/60 sm:text-sm">
          Supplier of all goods, excluding explosive materials and chemicals.
        </p>
      </div>
    </div>
  </div>
</template>
