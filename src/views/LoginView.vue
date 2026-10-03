<script setup lang="ts">
import { ref } from 'vue'

const email = ref('')
const password = ref('')
const isSubmitting = ref(false)

async function onSubmit() {
  isSubmitting.value = true
  try {
    // TODO: call the login API here once the backend is ready, e.g.:
    //   import api from '@/lib/api'
    //   await api.get('/sanctum/csrf-cookie')
    //   await api.post('/login', { email: email.value, password: password.value })
    //   then redirect with router.push(...)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    class="relative flex items-center justify-center overflow-hidden bg-linear-to-br from-primary-50 via-white to-accent-50 px-4 py-16 sm:py-24"
  >
    <div
      class="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-accent-300/30 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary-300/30 blur-3xl"
      aria-hidden="true"
    />
    <div class="glass-card relative w-full max-w-md p-6 sm:p-8">
      <h1 class="text-2xl font-bold text-primary-900">Login</h1>
      <p class="mt-1 text-sm text-slate-600">Sign in to your account.</p>

      <form class="mt-6 space-y-5" novalidate @submit.prevent="onSubmit">
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            required
            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600"
          />
        </div>

        <button type="submit" class="btn btn-accent w-full" :disabled="isSubmitting">Login</button>
      </form>
    </div>
  </div>
</template>
