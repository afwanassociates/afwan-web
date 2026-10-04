<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Slide } from '@/data/slides'
import ArrowIcon from '@/components/ArrowIcon.vue'
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
      backgroundImage: `linear-gradient(rgb(155 28 20 / 0.78), rgb(155 28 20 / 0.78)), url('${slide.image}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { backgroundImage: slide.background }
}

const arrowClass =
  'absolute bottom-5 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/35 backdrop-blur-sm transition-colors hover:bg-accent-400 hover:text-primary-900 hover:ring-accent-400 md:top-1/2 md:bottom-auto md:-translate-y-1/2'
</script>

<template>
  <!-- Rounded card on a light frame, like the rest of the page -->
  <section class="bg-surface p-2 sm:p-4" aria-roledescription="carousel" :aria-label="label">
    <div
      class="relative isolate overflow-hidden rounded-[1.75rem] bg-ember-700 text-white sm:rounded-[2.5rem]"
      data-surface="dark"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
      @keydown="onKeydown"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <div
        class="relative h-[38rem] sm:h-[36rem] lg:h-[40rem]"
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
          class="absolute inset-0 flex items-center justify-center px-5 pb-20 text-center transition-opacity duration-700 ease-in-out motion-reduce:transition-none sm:px-24 md:pb-8"
          :class="i === current ? 'z-10 opacity-100' : 'z-0 opacity-0'"
          :style="slideStyle(slide)"
        >
          <!-- Subtle dot pattern -->
          <div
            class="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.14)_1px,transparent_1px)] bg-size-[22px_22px] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
            aria-hidden="true"
          />

          <div class="relative mx-auto max-w-4xl">
            <p
              class="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium tracking-wider text-white uppercase ring-1 ring-white/25 sm:text-sm"
            >
              <span class="h-2 w-2 rounded-full bg-accent-400" aria-hidden="true" />
              Afwan Associates Ltd
            </p>
            <h2
              class="mt-6 text-4xl leading-tight font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              {{ slide.heading }}
            </h2>
            <p class="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white sm:text-lg">
              {{ slide.text }}
            </p>
            <div class="mt-10 flex flex-wrap justify-center gap-3">
              <a
                :href="`#${slide.cta.target}`"
                class="btn btn-accent btn-icon"
                @click.prevent="scrollToSection(slide.cta.target)"
              >
                {{ slide.cta.label }} <ArrowIcon />
              </a>
              <a href="#contact" class="btn btn-glass" @click.prevent="scrollToSection('contact')">
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </div>

      <template v-if="count > 1">
        <button
          type="button"
          :class="[arrowClass, 'left-4 sm:left-6']"
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
        <button
          type="button"
          :class="[arrowClass, 'right-4 sm:right-6']"
          aria-label="Next slide"
          @click="next"
        >
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

        <div class="absolute inset-x-0 bottom-5 z-20 flex h-11 items-center justify-center gap-1">
          <button
            ref="pauseButton"
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15"
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
              :class="
                i === current ? 'w-7 bg-accent-400' : 'w-2.5 bg-white/50 group-hover:bg-white'
              "
            />
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
