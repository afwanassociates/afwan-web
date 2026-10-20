<script setup lang="ts">
import BannerTopBar from './BannerTopBar.vue'

/** Hero banner 1: "Building Trust. Delivering Growth." with the five lines of business. */
const lines = [
  'Export / Import',
  'First-Class Contractor',
  'Property',
  'Land Development',
  'Supplier',
]
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#fdf8f1] text-cocoa-950">
    <!-- Soft sand circles behind the logo -->
    <div
      class="pointer-events-none absolute top-[-30%] right-[-12%] h-[160%] w-[58%] rounded-full bg-[#f9e9cd]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute top-[32%] right-[-8%] h-[60%] w-[34%] rounded-full bg-[#f6dfb3]/80"
      aria-hidden="true"
    />
    <img
      src="/images/logo-mark.png"
      alt=""
      width="196"
      height="202"
      class="pointer-events-none absolute right-[7%] bottom-[24%] hidden h-[62%] w-auto lg:block"
      aria-hidden="true"
      decoding="async"
    />

    <div
      class="relative flex h-full flex-col px-6 pt-6 pb-16 sm:px-12 sm:pt-10 lg:px-16 short:pt-6 short:pb-14"
    >
      <BannerTopBar />

      <div class="mt-8 max-w-3xl sm:mt-12 lg:mt-14 short:mt-6">
        <p class="text-xs font-semibold tracking-[0.3em] text-tone-flame uppercase sm:text-sm">
          Trusted business partner
        </p>
        <h2
          class="mt-4 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl lg:text-7xl short:mt-3 short:text-6xl"
        >
          Building Trust.<br />
          <span class="text-tone-flame">Delivering Growth.</span>
        </h2>
        <p class="mt-5 max-w-xl text-base leading-relaxed text-cocoa-700 sm:text-lg">
          Export and import, contracting, property, land development and supply, handled by one
          dependable team.
        </p>
      </div>

      <div class="mt-auto pt-6">
        <ol class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5" data-lines>
          <li
            v-for="(line, i) in lines"
            :key="line"
            class="rounded-xl px-4 py-3 sm:px-5 sm:py-4"
            :class="
              i === lines.length - 1
                ? 'bg-maroon-700 text-white'
                : 'bg-white text-cocoa-950 ring-1 ring-[#f3e3cc]'
            "
          >
            <span
              class="block text-xs font-semibold"
              :class="i === lines.length - 1 ? 'text-tone-gold' : 'text-tone-flame'"
            >
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <span class="mt-1 block text-sm font-semibold sm:text-base lg:text-lg">{{ line }}</span>
          </li>
        </ol>
        <p class="mt-3 text-xs text-cocoa-700 sm:text-sm">
          Supplier of all goods, excluding explosive materials and chemicals.
        </p>
      </div>
    </div>
  </div>
</template>
