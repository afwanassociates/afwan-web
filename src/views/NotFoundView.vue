<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
    <p class="text-brand-gradient text-7xl font-extrabold">404</p>
    <h1 class="mt-4 text-2xl font-bold text-primary-900">Page not found</h1>
    <p class="mt-2 text-slate-600">
      Sorry, the page you are looking for doesn't exist or has moved.
    </p>
    <RouterLink to="/" class="btn btn-accent mt-8"> Back to home </RouterLink>
  </div>
</template>
