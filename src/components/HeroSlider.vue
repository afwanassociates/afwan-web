<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import type { BannerKind, Slide } from '@/data/slides'
import GrowthBanner from '@/components/banners/GrowthBanner.vue'
import PropertyBanner from '@/components/banners/PropertyBanner.vue'
import SolarBanner from '@/components/banners/SolarBanner.vue'
import { prefersReducedMotion } from '@/lib/scroll'

/** Hero carousel of full-width banners (src/components/banners), with autoplay. */
const banners: Record<BannerKind, Component> = {
  growth: GrowthBanner,
  solar: SolarBanner,
  property: PropertyBanner,
}

const props = withDefaults(
  defineProps<{
    slides: Slide[]
    /** Autoplay delay in milliseconds. */
    interval?: number
    label?: string
  }>(),
  { interval: 5000, label: 'Highlights' },
)

const SWIPE_THRESHOLD = 50

const current = ref(0)
const isHovered = ref(false)
const hasFocus = ref(false)
const isUserPaused = ref(false)

const count = computed(() => props.slides.length)
const autoplayActive = computed(
  () => count.value > 1 && !isHovered.value && !hasFocus.value && !isUserPaused.value,
)

function goTo(index: number) {
  if (count.value === 0) return
  current.value = (index + count.value) % count.value
}

// --- Autoplay -------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | undefined

function stopTimer() {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function startTimer() {
  stopTimer()
  if (autoplayActive.value) timer = setInterval(() => goTo(current.value + 1), props.interval)
}

watch(autoplayActive, startTimer)

// Manual navigation restarts the countdown so a slide never changes right after a click.
function next() {
  goTo(current.value + 1)
  startTimer()
}

function prev() {
  goTo(current.value - 1)
  startTimer()
}

function select(index: number) {
  goTo(index)
  startTimer()
}

function togglePause() {
  isUserPaused.value = !isUserPaused.value
}

onMounted(() => {
  // With reduced motion, start paused; the user can still press play.
  if (prefersReducedMotion()) isUserPaused.value = true
  startTimer()
})

onBeforeUnmount(stopTimer)

// --- Focus: pause while keyboard focus is inside (except on the play/pause button) ---

const pauseButton = ref<HTMLButtonElement | null>(null)

function onFocusIn(event: FocusEvent) {
  hasFocus.value = event.target !== pauseButton.value
}

function onFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement
  if (!root.contains(event.relatedTarget as Node | null)) hasFocus.value = false
}

// --- Keyboard and touch ---------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    next()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prev()
  }
}

let touchStartX = 0
let touchStartY = 0

function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
}

function onTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - touchStartX
  const dy = touch.clientY - touchStartY
  // Only treat mostly-horizontal movement as a swipe so vertical scrolling still works.
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
  if (dx < 0) next()
  else prev()
}

// --- Presentation ---------------------------------------------------------

const controlClass =
  'flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20'
</script>

<template>
  <!-- Rounded card on a light frame, like the rest of the page -->
  <section class="bg-surface p-2 sm:p-4" aria-roledescription="carousel" :aria-label="label">
    <div
      class="relative isolate overflow-hidden rounded-[14px] bg-[#fdf8f1]"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
      @keydown="onKeydown"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <!--
        Height. Phones and tablets: fixed, so the stacked text always fits. Laptops and up: the
        banners' wide shape (45% of the width), but never taller than the screen minus the
        navbar and frame (100svh − 7rem), so the whole banner shows with the page below it;
        clamped to 32–46rem (short screens get smaller headings, see the
        short: variant in main.css) so the text always fits.
      -->
      <div
        class="relative h-[46rem] sm:h-[40rem] lg:h-[clamp(32rem,min(45vw,calc(100svh-7rem)),46rem)]"
        :aria-live="autoplayActive ? 'off' : 'polite'"
      >
        <div
          v-for="(slide, i) in slides"
          :key="slide.id"
          role="group"
          aria-roledescription="slide"
          :aria-label="`${i + 1} of ${count}: ${slide.label}`"
          :aria-hidden="i !== current"
          :inert="i !== current"
          :data-active="i === current"
          :data-slide="slide.id"
          class="absolute inset-0 transition-opacity duration-700 ease-in-out motion-reduce:transition-none"
          :class="i === current ? 'z-10 opacity-100' : 'z-0 opacity-0'"
        >
          <component :is="banners[slide.kind]" />
        </div>
      </div>

      <!-- Controls: a small dark pill in the bottom-right corner, readable on every banner -->
      <div
        v-if="count > 1"
        class="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-1 backdrop-blur-sm sm:right-5 sm:bottom-4"
      >
        <button type="button" :class="controlClass" aria-label="Previous slide" @click="prev">
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          ref="pauseButton"
          type="button"
          :class="controlClass"
          :aria-label="isUserPaused ? 'Play slideshow' : 'Pause slideshow'"
          @click="togglePause"
        >
          <svg
            v-if="isUserPaused"
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l10.5-6.5z" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
        </button>
        <button
          v-for="(slide, i) in slides"
          :key="slide.id"
          type="button"
          class="group flex h-8 w-6 items-center justify-center rounded-full"
          :aria-label="`Go to slide ${i + 1}: ${slide.label}`"
          :aria-current="i === current ? 'true' : undefined"
          @click="select(i)"
        >
          <span
            class="block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none"
            :class="i === current ? 'w-5 bg-tone-gold' : 'w-2 bg-white/60 group-hover:bg-white'"
          />
        </button>
        <button type="button" :class="controlClass" aria-label="Next slide" @click="next">
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>
