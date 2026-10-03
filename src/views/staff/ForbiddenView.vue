<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { homeRouteFor } from '@/lib/roles'

const auth = useAuthStore()
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
    <p class="text-brand-gradient text-7xl font-extrabold">403</p>
    <h1 class="mt-4 text-2xl font-bold text-primary-900">Access denied</h1>
    <p class="mt-2 text-slate-600">
      Your account does not have permission to open this page. If you think this is a mistake,
      please contact an administrator.
    </p>
    <RouterLink v-if="auth.user" :to="homeRouteFor(auth.user.role)" class="btn btn-accent mt-8">
      Go to my dashboard
    </RouterLink>
  </div>
</template>
