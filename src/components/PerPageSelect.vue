<script setup lang="ts">
import { useId } from 'vue'
import { PER_PAGE_OPTIONS, perPage, setPerPage } from '@/composables/usePerPage'

/** "Rows per page" for a list's pagination bar (15, 50, 100, 200 or 300). */
const id = useId()
</script>

<template>
  <div class="flex items-center gap-2 text-sm text-muted" data-per-page>
    <label :for="id" class="whitespace-nowrap">Rows per page</label>
    <select
      :id="id"
      :value="perPage"
      class="rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-2 text-sm font-semibold text-primary-900 focus:border-primary-600"
      data-per-page-select
      @change="setPerPage(Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="n in PER_PAGE_OPTIONS" :key="n" :value="n">{{ n }}</option>
    </select>
  </div>
</template>
