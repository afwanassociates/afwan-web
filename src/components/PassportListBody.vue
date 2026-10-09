<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import type { Paginated } from '@/types/auth'

/** Loading skeleton, error, empty state and pagination around a passport table. */
defineProps<{
  list: Paginated<unknown> | null
  isLoading: boolean
  loadError: string | null
  pageLink: (page: number) => RouteLocationRaw
  emptyTitle: string
  emptyText?: string
}>()
defineEmits<{ retry: [] }>()
defineSlots<{ default(): unknown; empty?(): unknown }>()
</script>

<template>
  <div :aria-busy="isLoading">
    <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="$emit('retry')">
        Try again
      </button>
    </div>

    <div v-else-if="!list" class="animate-pulse space-y-3 py-4" data-skeleton>
      <div v-for="n in 6" :key="n" class="flex gap-4">
        <div class="h-4 w-1/4 rounded bg-slate-200" />
        <div class="h-4 w-1/6 rounded bg-slate-200" />
        <div class="h-4 w-1/5 rounded bg-slate-200" />
        <div class="hidden h-4 w-1/6 rounded bg-slate-200 md:block" />
      </div>
      <span class="sr-only">Loading passports…</span>
    </div>

    <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
      <p class="font-semibold text-ink">{{ emptyTitle }}</p>
      <p v-if="emptyText" class="mt-1 text-sm text-muted">{{ emptyText }}</p>
      <slot name="empty" />
    </div>

    <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
      <slot />

      <nav
        aria-label="Pagination"
        class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
      >
        <p class="text-sm text-muted">
          Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
        </p>
        <div class="flex items-center gap-2">
          <RouterLink
            v-if="list.meta.current_page > 1"
            :to="pageLink(list.meta.current_page - 1)"
            class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            Previous
          </RouterLink>
          <span class="px-2 text-sm text-muted" aria-current="page">
            Page {{ list.meta.current_page }} of {{ list.meta.last_page }}
          </span>
          <RouterLink
            v-if="list.meta.current_page < list.meta.last_page"
            :to="pageLink(list.meta.current_page + 1)"
            class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
          >
            Next
          </RouterLink>
        </div>
      </nav>
    </div>
  </div>
</template>
