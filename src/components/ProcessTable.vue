<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ValidityBadge from '@/components/ValidityBadge.vue'
import { toDisplayDate } from '@/lib/dates'
import { TONE_BADGE, humanize, statusTone } from '@/lib/workflow'
import type { PassportEntry } from '@/types/passport'
import type { StepRecordSummary } from '@/types/workflow'

/**
 * Passports at one workflow step (Process page): the step's latest record per row.
 * `flight` mode shows the flight details instead of reference/validity columns.
 */
const props = defineProps<{
  entries: PassportEntry[]
  /** Step whose record each row shows (flight for the Completed tab). */
  stepKey: string
  flight: boolean
}>()
defineSlots<{
  actions?(props: { entry: PassportEntry; record: StepRecordSummary | null }): unknown
}>()

const recordOf = (entry: PassportEntry): StepRecordSummary | null =>
  entry.workflow.steps.find((s) => s.key === props.stepKey)?.record ?? null

/** Row status: the record's own label (e.g. "Visa issued"), or the stage status (e.g. Waiting). */
function statusOf(entry: PassportEntry) {
  const record = recordOf(entry)
  const value =
    entry.current_stage === 'completed' ? 'completed' : (entry.stage_status ?? record?.status)
  return {
    text: record && value !== 'waiting' ? record.status_label : humanize(value ?? 'waiting'),
    tone: statusTone(value),
  }
}

const detail = (entry: PassportEntry, name: string) => recordOf(entry)?.details?.[name] || '—'

const headers = computed(() =>
  props.flight
    ? [
        'Passport',
        'Country',
        'Company',
        'Status',
        'Airline',
        'Flight no.',
        'Departure',
        'Ticket / PNR',
      ]
    : [
        'Passport',
        'Country',
        'Company',
        'Status',
        'Reference no.',
        'Date',
        'Valid until',
        'Days left',
      ],
)
</script>

<template>
  <!-- Phones: cards -->
  <ul class="divide-y divide-stroke md:hidden">
    <li v-for="entry in entries" :key="entry.id" class="py-4" data-row>
      <div class="flex items-start justify-between gap-3">
        <RouterLink
          :to="{ name: 'passport-detail', params: { id: entry.id } }"
          class="min-w-0 rounded-sm"
        >
          <span class="block font-semibold break-words text-primary-900 hover:underline">
            {{ entry.passport_name }}
          </span>
          <span class="block font-mono text-sm tracking-wider text-slate-700">
            {{ entry.passport_number }}
          </span>
        </RouterLink>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
          :class="TONE_BADGE[statusOf(entry).tone]"
          data-row-status
        >
          {{ statusOf(entry).text }}
        </span>
      </div>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-muted">Company</dt>
        <dd class="text-slate-800">
          {{ entry.company.name }}
          <span class="text-xs text-muted">· {{ entry.company.country.name }}</span>
        </dd>
        <template v-if="flight">
          <dt class="text-muted">Flight</dt>
          <dd class="text-slate-800">
            {{ detail(entry, 'airline') }} {{ detail(entry, 'flight_no') }}
          </dd>
          <dt class="text-muted">Departure</dt>
          <dd class="text-slate-800">
            {{ toDisplayDate(recordOf(entry)?.details?.departure_date) || '—' }}
          </dd>
          <dt class="text-muted">Ticket / PNR</dt>
          <dd class="text-slate-800">{{ detail(entry, 'ticket_pnr') }}</dd>
        </template>
        <template v-else>
          <dt class="text-muted">Reference</dt>
          <dd class="text-slate-800">{{ recordOf(entry)?.reference_no || '—' }}</dd>
          <dt class="text-muted">Date</dt>
          <dd class="text-slate-800">{{ toDisplayDate(recordOf(entry)?.step_date) || '—' }}</dd>
          <dt class="text-muted">Valid until</dt>
          <dd class="flex flex-wrap items-center gap-2 text-slate-800">
            {{ toDisplayDate(recordOf(entry)?.valid_until) || '—' }}
            <ValidityBadge
              :status="recordOf(entry)?.validity_status"
              :days-left="recordOf(entry)?.days_left"
            />
          </dd>
        </template>
      </dl>
      <div class="mt-2 flex flex-wrap gap-1">
        <slot name="actions" :entry="entry" :record="recordOf(entry)" />
      </div>
    </li>
  </ul>

  <!-- Tablets and up: table -->
  <div class="hidden overflow-x-auto md:block">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
        <tr>
          <th
            v-for="h in headers"
            :key="h"
            scope="col"
            class="py-3 pr-4 font-semibold whitespace-nowrap"
          >
            {{ h }}
          </th>
          <th scope="col" class="py-3 font-semibold"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stroke">
        <tr v-for="entry in entries" :key="entry.id" class="align-middle" data-row>
          <td class="py-3 pr-4">
            <RouterLink
              :to="{ name: 'passport-detail', params: { id: entry.id } }"
              class="rounded-sm font-semibold text-primary-900 underline-offset-4 hover:underline"
            >
              {{ entry.passport_name }}
            </RouterLink>
            <span class="block font-mono text-xs tracking-wider text-slate-600">
              {{ entry.passport_number }}
            </span>
          </td>
          <td class="py-3 pr-4 text-slate-800">{{ entry.country?.name ?? '—' }}</td>
          <td class="py-3 pr-4 text-slate-800">
            {{ entry.company.name }}
            <span class="block text-xs text-muted">{{ entry.company.country.name }}</span>
          </td>
          <td class="py-3 pr-4">
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
              :class="TONE_BADGE[statusOf(entry).tone]"
              data-row-status
            >
              {{ statusOf(entry).text }}
            </span>
          </td>
          <template v-if="flight">
            <td class="py-3 pr-4 text-slate-800">{{ detail(entry, 'airline') }}</td>
            <td class="py-3 pr-4 font-mono text-slate-800">{{ detail(entry, 'flight_no') }}</td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
              {{ toDisplayDate(recordOf(entry)?.details?.departure_date) || '—' }}
            </td>
            <td class="py-3 pr-4 font-mono text-slate-800">{{ detail(entry, 'ticket_pnr') }}</td>
          </template>
          <template v-else>
            <td class="py-3 pr-4 text-slate-800">{{ recordOf(entry)?.reference_no || '—' }}</td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
              {{ toDisplayDate(recordOf(entry)?.step_date) || '—' }}
            </td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-800">
              <span class="block">{{ toDisplayDate(recordOf(entry)?.valid_until) || '—' }}</span>
              <ValidityBadge
                :status="recordOf(entry)?.validity_status"
                :days-left="recordOf(entry)?.days_left"
              />
            </td>
            <td class="py-3 pr-4 text-slate-800 tabular-nums">
              {{ recordOf(entry)?.days_left ?? '—' }}
            </td>
          </template>
          <td class="py-3">
            <div class="flex flex-wrap justify-end gap-1">
              <slot name="actions" :entry="entry" :record="recordOf(entry)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
