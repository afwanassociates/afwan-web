<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { settingsPagesFor } from '@/lib/settingsPages'

/** Frame of the Settings section: heading, one tab per settings page, then the page. */
const auth = useAuthStore()

const tabs = computed(() => [
  { name: 'settings', label: 'Overview' },
  ...(auth.user ? settingsPagesFor(auth.user.role) : []),
])
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Settings</h1>

    <nav aria-label="Settings sections" class="mt-4 border-b border-stroke">
      <!-- Scrolls sideways on narrow screens as more settings are added. -->
      <ul class="-mb-px flex gap-1 overflow-x-auto">
        <li v-for="tab in tabs" :key="tab.name" class="shrink-0">
          <RouterLink
            :to="{ name: tab.name }"
            class="block border-b-2 border-transparent px-4 py-3 text-sm font-semibold whitespace-nowrap text-muted hover:border-slate-300 hover:text-primary-900"
            exact-active-class="border-accent-500! text-primary-900!"
          >
            {{ tab.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="mt-6">
      <RouterView />
    </div>
  </div>
</template>
