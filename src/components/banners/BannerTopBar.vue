<script setup lang="ts">
/**
 * Top row of a hero banner: the logo mark with the company name on the left and the location
 * on the right. `dark` is for the night-sky (solar) banner: gold mark, spaced light lettering.
 */
withDefaults(defineProps<{ dark?: boolean }>(), { dark: false })
</script>

<template>
  <div class="flex items-center justify-between gap-4" aria-hidden="true">
    <span class="flex items-center gap-3">
      <img
        src="/images/logo-mark.png"
        alt=""
        width="196"
        height="202"
        class="h-9 w-auto sm:h-11"
        :class="{ '[filter:sepia(1)_saturate(2.4)_hue-rotate(2deg)_brightness(1.45)]': dark }"
        decoding="async"
      />
      <span
        v-if="dark"
        class="text-xs font-medium tracking-[0.35em] text-cream-100 uppercase sm:text-sm"
      >
        Afwan Associates Ltd.
      </span>
      <span v-else class="text-lg font-semibold text-tone-flame sm:text-2xl">
        Afwan Associates Ltd.
      </span>
    </span>
    <span
      class="hidden text-[0.7rem] font-semibold tracking-[0.3em] uppercase sm:block"
      :class="dark ? 'text-cream-100/40' : 'text-cocoa-950'"
    >
      {{ dark ? 'Dhaka · Bangladesh' : 'Dhaka, Bangladesh' }}
    </span>
  </div>
</template>
