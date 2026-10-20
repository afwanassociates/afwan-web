<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandLockup from '@/components/BrandLockup.vue'
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
    class="sticky top-0 z-40 bg-primary-900/95 text-white shadow-[0_10px_30px_-18px_rgb(58_11_15/0.8)] backdrop-blur-md"
    data-surface="dark"
    @keydown.esc="menuOpen = false"
  >
    <div
      class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-8 lg:px-10"
    >
      <RouterLink to="/" class="shrink-0 rounded-md" aria-label="Afwan Associates Ltd — home">
        <BrandLockup dark />
      </RouterLink>

      <nav aria-label="Main" class="hidden lg:block">
        <ul
          class="flex items-center gap-5 text-sm font-medium whitespace-nowrap xl:gap-8 xl:text-[0.95rem]"
        >
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

      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <RouterLink
          v-if="auth.user"
          :to="homeRouteFor(auth.user.role)"
          class="btn btn-white btn-icon text-sm max-sm:px-1.5"
        >
          <!-- Phones: just the round arrow, so the company name and menu still fit -->
          <span class="max-sm:sr-only">Dashboard</span> <ArrowIcon />
        </RouterLink>
        <RouterLink v-else to="/login" class="btn btn-white btn-icon text-sm max-sm:px-1.5">
          <span class="max-sm:sr-only">Login</span> <ArrowIcon />
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
