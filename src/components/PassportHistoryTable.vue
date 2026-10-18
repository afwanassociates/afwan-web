<script setup lang="ts">
import { toDisplayDate } from '@/lib/dates'
import type { PassportHistoryEvent, StatusTone } from '@/types/passport'

/**
 * A passport's history from entry to flight, oldest first (GET /passports/{id}/history):
 * one row per event with its step, what happened, its dates and who recorded it.
 */
defineProps<{ events: PassportHistoryEvent[] }>()

const TEXT: Record<StatusTone, string> = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  green: 'text-green-700',
  gray: 'text-gray-600',
}
const toneText = (tone: string) => TEXT[tone as StatusTone] ?? TEXT.gray

const detailValue = (d: PassportHistoryEvent['details'][number]) =>
  d.type === 'date' ? toDisplayDate(d.value) : d.value
</script>

<template>
  <p v-if="events.length === 0" class="py-6 text-center text-muted">No history yet.</p>

  <template v-else>
    <!-- Phones: cards -->
    <ul class="divide-y divide-stroke md:hidden">
      <li v-for="event in events" :key="event.key" class="py-4" data-history-event>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-semibold" :class="toneText(event.tone)">{{ event.title }}</span>
          <span class="text-sm text-ink">{{ toDisplayDate(event.date) }}</span>
        </div>
        <p class="text-xs text-muted">{{ event.step_label }}</p>
        <dl
          v-if="event.details.length"
          class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
        >
          <template v-for="d in event.details" :key="d.label">
            <dt class="text-muted">{{ d.label }}</dt>
            <dd class="text-slate-800">{{ detailValue(d) }}</dd>
          </template>
        </dl>
        <p class="mt-1 text-sm text-muted">Recorded by {{ event.recorded_by?.name ?? '—' }}</p>
        <p v-if="event.remarks" class="mt-1 text-sm break-words text-slate-700">
          {{ event.remarks }}
        </p>
      </li>
    </ul>

    <!-- Tablets and up: table -->
    <div class="hidden overflow-x-auto md:block">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
          <tr>
            <th scope="col" class="py-3 pr-4 font-semibold">Date</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Step</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Event</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Details</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Recorded by</th>
            <th scope="col" class="py-3 font-semibold">Remarks</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stroke">
          <tr v-for="event in events" :key="event.key" class="align-top" data-history-event>
            <td class="py-3 pr-4 whitespace-nowrap text-ink">{{ toDisplayDate(event.date) }}</td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-700">{{ event.step_label }}</td>
            <td class="py-3 pr-4 font-semibold whitespace-nowrap" :class="toneText(event.tone)">
              {{ event.title }}
            </td>
            <td class="py-3 pr-4 text-slate-700">
              <template v-if="event.details.length">
                <span v-for="d in event.details" :key="d.label" class="block">
                  <span class="text-muted">{{ d.label }}:</span> {{ detailValue(d) }}
                </span>
              </template>
              <template v-else>—</template>
            </td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-700">
              {{ event.recorded_by?.name ?? '—' }}
            </td>
            <td class="py-3 break-words text-slate-700">{{ event.remarks || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
