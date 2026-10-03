<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import StaffLayout from '@/layouts/StaffLayout.vue'
import { scrollToSection } from '@/lib/scroll'

const route = useRoute()
</script>

<template>
  <a
    href="#main-content"
    class="sr-only z-50 rounded-md bg-accent-400 px-4 py-2 font-semibold text-primary-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    @click.prevent="scrollToSection('main-content')"
  >
    Skip to content
  </a>

  <StaffLayout v-if="route.meta.layout === 'staff'">
    <RouterView />
  </StaffLayout>

  <div v-else class="flex min-h-screen flex-col">
    <AppHeader />
    <main id="main-content" tabindex="-1" class="flex-1 scroll-mt-20 focus:outline-none">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
