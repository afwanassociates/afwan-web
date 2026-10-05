<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppLogo from '@/components/AppLogo.vue'
import AppToast from '@/components/AppToast.vue'
import { useAuthStore } from '@/stores/auth'
import { ROLES, ROLE_LIST, canAccessArea } from '@/lib/roles'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const isLoggingOut = ref(false)

/**
 * Only the areas the user can open, plus the passport screens for anyone who can open the
 * data-entry area and "Users" for anyone who can open the admin area.
 */
const navItems = computed(() => {
  const role = auth.user?.role
  if (!role) return []
  const items = ROLE_LIST.filter((area) => canAccessArea(role, area)).map((area) => ({
    name: ROLES[area].routeName,
    label: `${ROLES[area].label} area`,
  }))
  if (canAccessArea(role, 'data_entry')) {
    items.push({ name: 'passport-new', label: 'Add Passport' })
    items.push({ name: 'passports', label: 'Passport List' })
  }
  if (canAccessArea(role, 'admin')) items.push({ name: 'staff-users', label: 'Users' })
  return items
})

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

async function logout() {
  isLoggingOut.value = true
  try {
    await auth.logout()
  } catch {
    // The local session is cleared either way.
  } finally {
    isLoggingOut.value = false
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <div class="min-h-screen bg-primary-50/60" @keydown.esc="menuOpen = false">
    <!-- Mobile backdrop -->
    <div
      v-if="menuOpen"
      class="fixed inset-0 z-30 bg-primary-950/50 lg:hidden"
      aria-hidden="true"
      @click="menuOpen = false"
    />

    <aside
      id="staff-sidebar"
      class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-950 text-primary-100 transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible'"
      data-surface="dark"
    >
      <div class="flex h-16 items-center px-4">
        <RouterLink
          to="/"
          class="inline-block rounded-lg bg-linear-to-b from-white to-primary-50 px-3 py-2"
          aria-label="Afwan Associates Ltd — public website"
        >
          <AppLogo />
        </RouterLink>
      </div>
      <div class="h-0.5 bg-accent-400" aria-hidden="true" />

      <nav aria-label="Staff portal" class="flex-1 overflow-y-auto p-3">
        <ul class="space-y-1">
          <li v-for="item in navItems" :key="item.name">
            <RouterLink
              :to="{ name: item.name }"
              class="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/10 hover:text-white"
              exact-active-class="bg-white/15 text-white shadow-[inset_3px_0_0_var(--color-accent-400)]"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="flex min-h-screen flex-col lg:pl-64">
      <header
        class="sticky top-0 z-20 flex h-16 items-center gap-3 bg-white/85 px-4 shadow-[0_6px_24px_-12px_rgb(21_42_80/0.35)] backdrop-blur-lg sm:px-6"
      >
        <button
          type="button"
          class="-ml-1 rounded-md p-2 text-primary-900 hover:bg-primary-50 lg:hidden"
          aria-controls="staff-sidebar"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span class="sr-only">{{ menuOpen ? 'Close menu' : 'Open menu' }}</span>
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <div v-if="auth.user" class="ml-auto min-w-0 text-right">
          <p class="truncate text-sm font-semibold text-primary-900">{{ auth.user.name }}</p>
          <p class="truncate text-xs text-slate-600">{{ auth.user.role_label }}</p>
        </div>
        <button
          type="button"
          class="btn btn-primary shrink-0 px-4 text-sm"
          :class="{ 'ml-auto': !auth.user }"
          :disabled="isLoggingOut"
          @click="logout"
        >
          {{ isLoggingOut ? 'Logging out…' : 'Logout' }}
        </button>
      </header>

      <main id="main-content" tabindex="-1" class="flex-1 p-4 focus:outline-none sm:p-6 lg:p-8">
        <slot />
      </main>
      <AppToast />
    </div>
  </div>
</template>
