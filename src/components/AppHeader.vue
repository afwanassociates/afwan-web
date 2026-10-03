<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/AppLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { homeRouteFor } from '@/lib/roles'

const auth = useAuthStore()
</script>

<template>
  <header
    class="sticky top-0 z-40 bg-white/85 shadow-[0_6px_24px_-12px_rgb(21_42_80/0.35)] backdrop-blur-lg"
  >
    <div
      class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6 lg:px-8"
    >
      <RouterLink
        to="/"
        class="-m-1 shrink-0 rounded-md p-1"
        aria-label="Afwan Associates Ltd — home"
      >
        <AppLogo />
      </RouterLink>

      <RouterLink
        v-if="auth.user"
        :to="homeRouteFor(auth.user.role)"
        class="btn btn-accent text-sm"
      >
        Dashboard
      </RouterLink>
      <RouterLink v-else to="/login" class="btn btn-accent text-sm">Login</RouterLink>
    </div>
    <!-- Glossy brand line: logo gold → orange → deep blue -->
    <div
      class="h-0.5 bg-linear-to-r from-gold-400 via-accent-600 to-primary-800"
      aria-hidden="true"
    />
  </header>
</template>
