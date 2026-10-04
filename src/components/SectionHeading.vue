<script setup lang="ts">
/** Section title + intro, centred by default. Use `dark` on navy backgrounds. */
withDefaults(
  defineProps<{
    id: string
    title: string
    subtitle?: string
    align?: 'center' | 'left'
    dark?: boolean
  }>(),
  { subtitle: undefined, align: 'center', dark: false },
)
</script>

<template>
  <div :class="align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'">
    <h2
      :id="id"
      class="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-[2.625rem]"
      :class="dark ? 'text-white' : 'text-ink'"
    >
      {{ title }}
    </h2>
    <p
      v-if="subtitle"
      class="mt-4 text-base leading-relaxed sm:text-lg"
      :class="dark ? 'text-primary-200' : 'text-muted'"
    >
      {{ subtitle }}
    </p>
  </div>
</template>
