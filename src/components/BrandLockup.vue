<script setup lang="ts">
import { company } from '@/data/company'

/**
 * The logo mark with the company name beside it, vertically centred on the mark.
 * `dark` (maroon header and footer): gold mark and gold name. Otherwise (cream backgrounds):
 * the original mark colours and an orange name.
 */
withDefaults(defineProps<{ dark?: boolean }>(), { dark: false })
</script>

<template>
  <span class="inline-flex items-center gap-2.5 sm:gap-3">
    <img
      src="/images/logo-mark.png"
      alt=""
      width="196"
      height="202"
      class="h-8 w-auto shrink-0 sm:h-10"
      :class="{ '[filter:sepia(1)_saturate(2.4)_hue-rotate(2deg)_brightness(1.45)]': dark }"
      decoding="async"
    />
    <span
      class="text-base leading-none font-semibold whitespace-nowrap sm:text-xl"
      :class="dark ? 'text-accent-300' : 'text-tone-flame'"
    >
      {{ company.name }}.
    </span>
  </span>
</template>
