<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ArrowIcon from '@/components/ArrowIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { settingsPagesFor } from '@/lib/settingsPages'

/** Settings overview: one card per settings page the user may open. */
const auth = useAuthStore()

const pages = computed(() => (auth.user ? settingsPagesFor(auth.user.role) : []))
</script>

<template>
  <section aria-labelledby="settings-overview-heading">
    <h2 id="settings-overview-heading" class="sr-only">Overview</h2>
    <p class="text-muted">Choose what you want to change.</p>

    <ul class="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="page in pages" :key="page.name">
        <RouterLink
          :to="{ name: page.name }"
          class="glass-card hover-lift flex h-full flex-col p-6"
        >
          <span class="text-lg font-semibold text-ink">{{ page.label }}</span>
          <span class="mt-2 flex-1 text-sm leading-relaxed text-muted">
            {{ page.description }}
          </span>
          <span class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
            Open <ArrowIcon />
          </span>
        </RouterLink>
      </li>
    </ul>

    <p v-if="pages.length === 0" class="mt-5 text-muted">There are no settings you can change.</p>
  </section>
</template>
