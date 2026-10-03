<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Slide } from '@/data/slides'
import { prefersReducedMotion, scrollToSection } from '@/lib/scroll'

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

function slideStyle(slide: Slide) {
  if (slide.image) {
    return {
      backgroundImage: `linear-gradient(rgba(12, 26, 53, 0.72), rgba(12, 26, 53, 0.72)), url('${slide.image}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { backgroundImage: slide.background }
}

const arrowClass =
  'absolute bottom-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-b from-white/25 to-white/5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_8px_20px_-8px_rgb(0_0_0/0.5)] ring-1 ring-white/30 backdrop-blur-md transition-colors hover:from-white/35 hover:to-white/15 md:top-1/2 md:bottom-auto md:-translate-y-1/2'
</script>

<template>
  <section
    class="relative isolate overflow-hidden bg-primary-950 text-white"
    data-surface="dark"
    aria-roledescription="carousel"
    :aria-label="label"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeydown"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <div
      class="relative h-[70vh] min-h-136 sm:min-h-120"
      :aria-live="autoplayActive ? 'off' : 'polite'"
    >
      <div
        v-for="(slide, i) in slides"
        :key="slide.id"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${i + 1} of ${count}`"
        :aria-hidden="i !== current"
        :inert="i !== current"
        :data-active="i === current"
        class="absolute inset-0 flex items-center transition-opacity duration-700 ease-in-out motion-reduce:transition-none"
        :class="i === current ? 'z-10 opacity-100' : 'z-0 opacity-0'"
        :style="slideStyle(slide)"
      >
        <!-- Decorative gloss: light sheen and soft glowing orbs -->
        <div class="sheen pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          class="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl md:h-120 md:w-120"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute top-10 -left-20 h-56 w-56 rounded-full bg-primary-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div class="relative mx-auto w-full max-w-7xl px-6 pb-16 sm:px-10 md:px-24 md:pb-0">
          <div class="max-w-2xl">
            <p
              class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider text-white uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] ring-1 ring-white/25 backdrop-blur-sm"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden="true" />
              Afwan Associates Ltd
            </p>
            <h2
              class="mt-5 text-3xl leading-tight font-extrabold drop-shadow-[0_2px_12px_rgb(0_0_0/0.35)] sm:text-4xl lg:text-6xl"
            >
              {{ slide.heading }}
            </h2>
            <p class="mt-4 text-base leading-relaxed text-primary-100 sm:text-lg">
              {{ slide.text }}
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a
                :href="`#${slide.cta.target}`"
                class="btn btn-accent"
                @click.prevent="scrollToSection(slide.cta.target)"
              >
                {{ slide.cta.label }}
              </a>
              <a href="#contact" class="btn btn-glass" @click.prevent="scrollToSection('contact')">
                Contact us
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template v-if="count > 1">
      <button
        type="button"
        :class="[arrowClass, 'left-4']"
        aria-label="Previous slide"
        @click="prev"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button type="button" :class="[arrowClass, 'right-4']" aria-label="Next slide" @click="next">
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <div class="absolute inset-x-0 bottom-4 z-20 flex h-11 items-center justify-center gap-2">
        <button
          ref="pauseButton"
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
          :aria-label="isUserPaused ? 'Play slideshow' : 'Pause slideshow'"
          @click="togglePause"
        >
          <svg
            v-if="isUserPaused"
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l10.5-6.5z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
        </button>

        <button
          v-for="(slide, i) in slides"
          :key="slide.id"
          type="button"
          class="group flex h-8 w-8 items-center justify-center rounded-full"
          :aria-label="`Go to slide ${i + 1}: ${slide.heading}`"
          :aria-current="i === current ? 'true' : undefined"
          @click="select(i)"
        >
          <span
            class="block h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none"
            :class="i === current ? 'w-6 bg-accent-400' : 'w-2.5 bg-white/60 group-hover:bg-white'"
          />
        </button>
      </div>
    </template>
  </section>
</template>
