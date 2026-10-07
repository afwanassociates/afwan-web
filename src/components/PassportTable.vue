<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { toDisplayDate } from '@/lib/dates'
import type { PassportEntry } from '@/types/passport'

/** Passport entries as a table on wide screens and as cards on narrow ones. */
const props = defineProps<{
  entries: PassportEntry[]
  /** Id of the logged-in user, to show "You" in "Entered by". */
  currentUserId: number | null
}>()
defineEmits<{ delete: [entry: PassportEntry] }>()

function enteredBy(entry: PassportEntry) {
  if (entry.created_by === null) return '—'
  return entry.created_by === props.currentUserId ? 'You' : `Staff #${entry.created_by}`
}

const badgeClass = (entry: PassportEntry) =>
  entry.reference.type === 'agency'
    ? 'bg-accent-100 text-accent-800'
    : 'bg-primary-50 text-primary-800'

const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-primary-50 focus-visible:bg-primary-50'
</script>

<template>
  <!-- Phones: cards -->
  <ul class="divide-y divide-stroke md:hidden">
    <li v-for="entry in entries" :key="entry.id" class="py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold break-words text-primary-900">{{ entry.passport_name }}</p>
          <p class="font-mono text-sm tracking-wider text-slate-700">
            {{ entry.passport_number }}
          </p>
        </div>
        <p class="shrink-0 text-sm text-muted">
          {{ toDisplayDate(entry.passport_received_date) }}
        </p>
      </div>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-muted">Reference</dt>
        <dd class="flex flex-wrap items-center gap-2 text-slate-800">
          {{ entry.reference.name }}
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="badgeClass(entry)">
            {{ entry.reference.type_label }}
          </span>
        </dd>
        <dt class="text-muted">Company</dt>
        <dd class="text-slate-800">
          {{ entry.company.name }}
          <span class="text-xs text-muted">· {{ entry.company.country.name }}</span>
        </dd>
        <dt class="text-muted">Entered by</dt>
        <dd class="text-slate-800">{{ enteredBy(entry) }}</dd>
      </dl>
      <div v-if="entry.can.update || entry.can.delete" class="mt-2 -ml-2 flex gap-1">
        <RouterLink
          v-if="entry.can.update"
          :to="{ name: 'passport-edit', params: { id: entry.id } }"
          :class="[actionClass, 'text-primary-700']"
        >
          Edit<span class="sr-only"> passport {{ entry.passport_number }}</span>
        </RouterLink>
        <button
          v-if="entry.can.delete"
          type="button"
          :class="[actionClass, 'text-red-700 hover:bg-red-50']"
          @click="$emit('delete', entry)"
        >
          Delete<span class="sr-only"> passport {{ entry.passport_number }}</span>
        </button>
      </div>
    </li>
  </ul>

  <!-- Tablets and up: table -->
  <div class="hidden overflow-x-auto md:block">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
        <tr>
          <th scope="col" class="py-3 pr-4 font-semibold">Passport name</th>
          <th scope="col" class="py-3 pr-4 font-semibold">Passport number</th>
          <th scope="col" class="py-3 pr-4 font-semibold">Reference</th>
          <th scope="col" class="py-3 pr-4 font-semibold">Company</th>
          <th scope="col" class="py-3 pr-4 font-semibold whitespace-nowrap">Received</th>
          <th scope="col" class="py-3 pr-4 font-semibold whitespace-nowrap">Entered by</th>
          <th scope="col" class="py-3 font-semibold"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stroke">
        <tr v-for="entry in entries" :key="entry.id" class="align-middle">
          <td class="py-3 pr-4 font-semibold text-primary-900">{{ entry.passport_name }}</td>
          <td class="py-3 pr-4 font-mono tracking-wider whitespace-nowrap text-slate-800">
            {{ entry.passport_number }}
          </td>
          <td class="py-3 pr-4 text-slate-800">
            <span class="flex flex-wrap items-center gap-2">
              {{ entry.reference.name }}
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="badgeClass(entry)"
              >
                {{ entry.reference.type_label }}
              </span>
            </span>
          </td>
          <td class="py-3 pr-4 text-slate-800">
            {{ entry.company.name }}
            <span class="block text-xs text-muted">{{ entry.company.country.name }}</span>
          </td>
          <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
            {{ toDisplayDate(entry.passport_received_date) }}
          </td>
          <td class="py-3 pr-4 whitespace-nowrap text-slate-800">{{ enteredBy(entry) }}</td>
          <td class="py-3">
            <div class="flex justify-end gap-1">
              <RouterLink
                v-if="entry.can.update"
                :to="{ name: 'passport-edit', params: { id: entry.id } }"
                :class="[actionClass, 'text-primary-700']"
              >
                Edit<span class="sr-only"> passport {{ entry.passport_number }}</span>
              </RouterLink>
              <button
                v-if="entry.can.delete"
                type="button"
                :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                @click="$emit('delete', entry)"
              >
                Delete<span class="sr-only"> passport {{ entry.passport_number }}</span>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
