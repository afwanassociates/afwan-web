<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/lib/api'
import { dashboardEndpointFor } from '@/lib/roles'
import { errorMessage, errorStatus } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

interface AreaResponse {
  area: string
  message: string
}

const route = useRoute()
const auth = useAuthStore()

const area = computed(() => route.meta.area)

const result = ref<AreaResponse | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(false)

let requestId = 0

async function load() {
  if (!area.value) return
  const id = ++requestId
  isLoading.value = true
  error.value = null
  result.value = null
  try {
    const { data } = await api.get<AreaResponse>(dashboardEndpointFor(area.value))
    if (id === requestId) result.value = data
  } catch (e) {
    if (id !== requestId) return
    error.value =
      errorStatus(e) === 403
        ? 'You do not have permission to view this area.'
        : errorMessage(e, 'Could not load this area. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(area, load, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p v-if="auth.user" class="text-sm text-slate-600">Welcome back, {{ auth.user.name }}</p>
    <h1 class="mt-1 text-2xl font-bold text-primary-900 sm:text-3xl">Dashboard</h1>

    <section class="glass-card mt-6 p-6" aria-live="polite" :aria-busy="isLoading">
      <p v-if="isLoading" class="text-slate-600">Loading…</p>

      <div v-else-if="error" role="alert" class="space-y-4">
        <p class="text-red-700">{{ error }}</p>
        <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
      </div>

      <div v-else-if="result">
        <p class="text-xs font-semibold tracking-wider text-accent-700 uppercase">
          {{ result.area }}
        </p>
        <p class="mt-2 text-lg text-slate-800">{{ result.message }}</p>
      </div>
    </section>
  </div>
</template>
