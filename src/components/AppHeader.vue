<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppLogo from '@/components/AppLogo.vue'
import ArrowIcon from '@/components/ArrowIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useSectionNav } from '@/composables/useSectionNav'
import { homeRouteFor } from '@/lib/roles'
import { sectionLinks } from '@/data/navigation'

const auth = useAuthStore()
const route = useRoute()
const goToSection = useSectionNav()

const menuOpen = ref(false)

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

function onSectionClick(id: string) {
  menuOpen.value = false
  goToSection(id)
}
</script>

<template>
  <header
    class="sticky top-0 z-40 bg-primary-900/95 text-white shadow-[0_10px_30px_-18px_rgb(0_0_60/0.8)] backdrop-blur-md"
    data-surface="dark"
    @keydown.esc="menuOpen = false"
  >
    <div
      class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-8 lg:px-10"
    >
      <RouterLink
        to="/"
        class="shrink-0 rounded-xl bg-white px-3 py-1.5 shadow-[0_8px_20px_-12px_rgb(0_0_0/0.5)]"
        aria-label="Afwan Associates Ltd — home"
      >
        <AppLogo class="h-7! sm:h-8!" />
      </RouterLink>

      <nav aria-label="Main" class="hidden lg:block">
        <ul class="flex items-center gap-8 text-[0.95rem] font-medium">
          <li v-for="link in sectionLinks" :key="link.id">
            <a
              :href="`/#${link.id}`"
              class="rounded-sm py-1 text-white/90 transition-colors hover:text-accent-400"
              @click.prevent="onSectionClick(link.id)"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
      </nav>

      <div class="flex items-center gap-2">
        <RouterLink
          v-if="auth.user"
          :to="homeRouteFor(auth.user.role)"
          class="btn btn-white btn-icon text-sm"
        >
          Dashboard <ArrowIcon />
        </RouterLink>
        <RouterLink v-else to="/login" class="btn btn-white btn-icon text-sm">
          Login <ArrowIcon />
        </RouterLink>

        <button
          type="button"
          class="rounded-full p-2.5 hover:bg-white/10 lg:hidden"
          aria-controls="main-menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span class="sr-only">{{ menuOpen ? 'Close menu' : 'Open menu' }}</span>
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              v-if="menuOpen"
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              v-else
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <nav
      v-show="menuOpen"
      id="main-menu"
      aria-label="Main"
      class="border-t border-white/10 px-4 pb-6 sm:px-8 lg:hidden"
    >
      <ul class="pt-2">
        <li v-for="link in sectionLinks" :key="link.id">
          <a
            :href="`/#${link.id}`"
            class="block rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-accent-400"
            @click.prevent="onSectionClick(link.id)"
          >
            {{ link.label }}
          </a>
        </li>
      </ul>
    </nav>
  </header>
</template>
