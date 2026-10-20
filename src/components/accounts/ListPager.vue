<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import type { Paginated } from '@/types/auth'

/** "Showing x–y of z" and Previous / Next links of an accounts list. */
defineProps<{
  meta: Paginated<unknown>['meta']
  pageLink: (page: number) => RouteLocationRaw
}>()

const linkClass =
  'rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50'
</script>

<template>
  <nav
    aria-label="Pagination"
    class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
  >
    <p class="text-sm text-muted">
      Showing {{ meta.from ?? 0 }}–{{ meta.to ?? 0 }} of {{ meta.total }}
    </p>
    <div v-if="meta.last_page > 1" class="flex items-center gap-2">
      <RouterLink
        v-if="meta.current_page > 1"
        :to="pageLink(meta.current_page - 1)"
        :class="linkClass"
      >
        Previous
      </RouterLink>
      <span class="px-2 text-sm text-muted"
        >Page {{ meta.current_page }} of {{ meta.last_page }}</span
      >
      <RouterLink
        v-if="meta.current_page < meta.last_page"
        :to="pageLink(meta.current_page + 1)"
        :class="linkClass"
      >
        Next
      </RouterLink>
    </div>
  </nav>
</template>
