<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LatestStatusText from '@/components/LatestStatusText.vue'
import PassportExpiryBadge from '@/components/PassportExpiryBadge.vue'
import { businessToday, toDisplayDate } from '@/lib/dates'
import type { PassportOverview } from '@/types/passport'

/**
 * Read-only passport overview (All Passports): a table on wide screens, cards on narrow
 * ones. No actions. The "Latest status" header sorts by the status date.
 */
defineProps<{
  entries: PassportOverview[]
  /** Current direction of the status-date sort, or null when sorted by something else. */
  statusSort: 'asc' | 'desc' | null
}>()
defineEmits<{ sortStatus: [] }>()

/** created_at is a timestamp: show its Dhaka calendar date. */
const enteredOn = (createdAt: string) => {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '' : toDisplayDate(businessToday(date))
}

const typeLabel = (type: string) => (type === 'agency' ? 'Agency' : 'Person')

const headers = [
  'Passport name',
  'Passport number',
  'Latest status',
  'Country',
  'Passport expiry',
  'Reference',
  'Company',
  'Received',
  'Entered by',
]
</script>

<template>
  <!-- Phones: cards, no buttons -->
  <ul class="divide-y divide-stroke md:hidden">
    <li v-for="entry in entries" :key="entry.id" class="py-4" data-row>
      <RouterLink
        :to="{ name: 'passport-detail', params: { id: entry.id } }"
        class="block rounded-sm"
      >
        <span
          class="block font-semibold break-words text-primary-900 underline-offset-4 hover:underline"
        >
          {{ entry.passport_name }}
        </span>
        <span class="block font-mono text-sm tracking-wider text-slate-700">
          {{ entry.passport_number }}
        </span>
      </RouterLink>
      <div class="mt-2 text-base">
        <LatestStatusText :latest-status="entry.latest_status" />
      </div>
      <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt class="text-muted">Date of birth</dt>
        <dd class="text-slate-800">{{ toDisplayDate(entry.date_of_birth) || '—' }}</dd>
        <dt class="text-muted">Country</dt>
        <dd class="text-slate-800">{{ entry.country?.name ?? '—' }}</dd>
        <dt class="text-muted">Passport expiry</dt>
        <dd class="flex flex-wrap items-center gap-2 text-slate-800">
          {{ toDisplayDate(entry.passport_expiry_date) || '—' }}
          <PassportExpiryBadge :expiry-date="entry.passport_expiry_date" />
        </dd>
        <dt class="text-muted">Reference</dt>
        <dd class="text-slate-800">
          {{ entry.reference.name }}
          <span class="text-xs text-muted">({{ typeLabel(entry.reference.type) }})</span>
        </dd>
        <dt class="text-muted">Company</dt>
        <dd class="text-slate-800">
          {{ entry.company.name }}
          <span class="text-xs text-muted">· {{ entry.company.country.name }}</span>
        </dd>
        <dt class="text-muted">Received</dt>
        <dd class="text-slate-800">{{ toDisplayDate(entry.passport_received_date) }}</dd>
        <dt class="text-muted">Entered by</dt>
        <dd class="text-slate-800">
          {{ entry.entered_by?.name ?? '—' }}
          <span class="text-xs text-muted">{{ enteredOn(entry.created_at) }}</span>
        </dd>
      </dl>
    </li>
  </ul>

  <!-- Tablets and up: table -->
  <div class="hidden overflow-x-auto md:block">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
        <tr>
          <th
            v-for="header in headers"
            :key="header"
            scope="col"
            class="py-3 pr-4 font-semibold whitespace-nowrap"
            :aria-sort="
              header === 'Latest status'
                ? statusSort === 'asc'
                  ? 'ascending'
                  : statusSort === 'desc'
                    ? 'descending'
                    : 'none'
                : undefined
            "
          >
            <button
              v-if="header === 'Latest status'"
              type="button"
              class="inline-flex items-center gap-1 rounded-sm uppercase hover:text-primary-900"
              data-sort-status
              @click="$emit('sortStatus')"
            >
              Latest status
              <span aria-hidden="true">{{
                statusSort === 'asc' ? '↑' : statusSort === 'desc' ? '↓' : '↕'
              }}</span>
              <span class="sr-only">
                (sort by status date{{
                  statusSort === 'desc'
                    ? ', newest first'
                    : statusSort === 'asc'
                      ? ', oldest first'
                      : ''
                }})
              </span>
            </button>
            <template v-else>{{ header }}</template>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stroke">
        <tr v-for="entry in entries" :key="entry.id" class="align-top" data-row>
          <td class="py-3 pr-4">
            <RouterLink
              :to="{ name: 'passport-detail', params: { id: entry.id } }"
              class="rounded-sm font-semibold text-primary-900 underline-offset-4 hover:underline"
            >
              {{ entry.passport_name }}
            </RouterLink>
            <span v-if="entry.date_of_birth" class="block text-xs text-muted">
              Born {{ toDisplayDate(entry.date_of_birth) }}
            </span>
          </td>
          <td class="py-3 pr-4 font-mono tracking-wider whitespace-nowrap text-slate-800">
            {{ entry.passport_number }}
          </td>
          <td class="py-3 pr-4 whitespace-nowrap">
            <LatestStatusText :latest-status="entry.latest_status" />
          </td>
          <td class="py-3 pr-4 text-slate-800">{{ entry.country?.name ?? '—' }}</td>
          <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
            <span class="block">{{ toDisplayDate(entry.passport_expiry_date) || '—' }}</span>
            <PassportExpiryBadge :expiry-date="entry.passport_expiry_date" />
          </td>
          <td class="py-3 pr-4 text-slate-800">
            {{ entry.reference.name }}
            <span class="block text-xs text-muted">{{ typeLabel(entry.reference.type) }}</span>
          </td>
          <td class="py-3 pr-4 text-slate-800">
            {{ entry.company.name }}
            <span class="block text-xs text-muted">{{ entry.company.country.name }}</span>
          </td>
          <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
            {{ toDisplayDate(entry.passport_received_date) }}
          </td>
          <td class="py-3 whitespace-nowrap text-slate-800">
            {{ entry.entered_by?.name ?? '—' }}
            <span class="block text-xs text-muted">{{ enteredOn(entry.created_at) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
