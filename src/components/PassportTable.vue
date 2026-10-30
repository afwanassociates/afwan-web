<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PassportCell from '@/components/PassportCell.vue'
import { COLUMN_LABELS, type PassportColumn } from '@/lib/passportColumns'
import { businessToday } from '@/lib/dates'
import { STICKY_ACTIONS, TABLE_HEAD } from '@/lib/tableClasses'
import type { PassportEntry } from '@/types/passport'

/**
 * Passport entries as a table on wide screens and as cards on narrow ones.
 * The passport name (linked to its detail page) and number always come first; `columns`
 * picks the rest. The `actions` slot replaces the default Edit / Return buttons;
 * `extra-actions` adds buttons before them.
 */
withDefaults(
  defineProps<{
    entries: PassportEntry[]
    /** Id of the logged-in user (kept for callers; "Entered by" shows the real name). */
    currentUserId: number | null
    columns?: PassportColumn[]
    /** Extra classes for a row or card, e.g. to mark unfit passports. */
    rowClass?: (entry: PassportEntry) => string | undefined
    /** Wide screens: "Passport name" and "Passport number" as two columns (default: one cell). */
    splitNameNumber?: boolean
    /** Columns the page draws itself through the `cell` slot (default: none). */
    customColumns?: PassportColumn[]
    /** Show the default Edit / Return buttons when a row has no page actions (default: yes). */
    defaultActions?: boolean
    /** Keep the actions column visible at the right edge when the table scrolls sideways. */
    stickyActions?: boolean
    /** Show the serial number ("No.") first (the Passport Entry List). */
    showEntryNo?: boolean
  }>(),
  {
    columns: () => ['reference', 'company', 'received', 'entered_by'],
    rowClass: undefined,
    splitNameNumber: false,
    customColumns: () => [],
    defaultActions: true,
    stickyActions: false,
    showEntryNo: false,
  },
)
defineEmits<{ return: [entry: PassportEntry] }>()
defineSlots<{
  actions?(props: { entry: PassportEntry }): unknown
  'extra-actions'?(props: { entry: PassportEntry }): unknown
  cell?(props: { entry: PassportEntry; column: PassportColumn }): unknown
}>()

const today = businessToday()

/** Right-pinned actions column: white background and a soft edge over scrolled cells. */
const STICKY = STICKY_ACTIONS

const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-primary-50 focus-visible:bg-primary-50'
</script>

<template>
  <!-- Phones: cards -->
  <ul class="divide-y divide-stroke md:hidden">
    <li v-for="entry in entries" :key="entry.id" class="py-4" :class="rowClass?.(entry)" data-row>
      <RouterLink
        :to="{ name: 'passport-detail', params: { id: entry.id } }"
        class="block min-w-0 rounded-sm"
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
      <p v-if="showEntryNo" class="mt-1 text-xs text-muted" data-entry-no>
        No. <span class="font-semibold text-ink tabular-nums">{{ entry.entry_no }}</span>
      </p>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <template v-for="column in columns" :key="column">
          <dt class="text-muted">{{ COLUMN_LABELS[column] }}</dt>
          <dd class="min-w-0 text-slate-800">
            <slot
              v-if="customColumns.includes(column)"
              name="cell"
              :entry="entry"
              :column="column"
            />
            <PassportCell
              v-else
              :entry="entry"
              :column="column"
              :today="today"
              :current-user-id="currentUserId"
            />
          </dd>
        </template>
      </dl>
      <div class="mt-2 -ml-2 flex flex-wrap gap-1">
        <slot name="extra-actions" :entry="entry" />
        <slot name="actions" :entry="entry">
          <RouterLink
            v-if="defaultActions && entry.can.update"
            :to="{ name: 'passport-edit', params: { id: entry.id } }"
            :class="[actionClass, 'text-primary-700']"
          >
            Edit<span class="sr-only"> passport {{ entry.passport_number }}</span>
          </RouterLink>
          <button
            v-if="defaultActions && entry.can.return"
            type="button"
            :class="[actionClass, 'text-amber-800 hover:bg-amber-50']"
            :data-return-action="entry.id"
            @click="$emit('return', entry)"
          >
            Return<span class="sr-only"> passport {{ entry.passport_number }}</span>
          </button>
        </slot>
      </div>
    </li>
  </ul>

  <!-- Tablets and up: table -->
  <div class="hidden overflow-x-auto md:block">
    <table class="w-full text-left text-sm">
      <thead :class="TABLE_HEAD">
        <tr>
          <th v-if="showEntryNo" scope="col" class="py-3 pr-4 text-right font-semibold">No.</th>
          <template v-if="splitNameNumber">
            <th scope="col" class="py-3 pr-4 font-semibold whitespace-nowrap">Passport name</th>
            <th scope="col" class="py-3 pr-4 font-semibold whitespace-nowrap">Passport number</th>
          </template>
          <th v-else scope="col" class="py-3 pr-4 font-semibold">Passport</th>
          <th
            v-for="column in columns"
            :key="column"
            scope="col"
            class="py-3 pr-4 font-semibold whitespace-nowrap"
          >
            {{ COLUMN_LABELS[column] }}
          </th>
          <th scope="col" class="py-3 font-semibold" :class="{ [STICKY]: stickyActions }">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stroke">
        <tr
          v-for="entry in entries"
          :key="entry.id"
          class="align-middle"
          :class="rowClass?.(entry)"
          data-row
        >
          <td
            v-if="showEntryNo"
            class="py-3 pr-4 text-right text-slate-700 tabular-nums"
            data-cell="entry_no"
          >
            {{ entry.entry_no }}
          </td>
          <td class="py-3 pr-4" data-cell="passport_name">
            <RouterLink
              :to="{ name: 'passport-detail', params: { id: entry.id } }"
              class="rounded-sm font-semibold text-primary-900 underline-offset-4 hover:underline"
            >
              {{ entry.passport_name }}
            </RouterLink>
            <span
              v-if="!splitNameNumber"
              class="block font-mono text-xs tracking-wider text-slate-600"
            >
              {{ entry.passport_number }}
            </span>
          </td>
          <td
            v-if="splitNameNumber"
            class="py-3 pr-4 font-mono tracking-wider whitespace-nowrap text-slate-800"
            data-cell="passport_number"
          >
            {{ entry.passport_number }}
          </td>
          <td
            v-for="column in columns"
            :key="column"
            class="py-3 pr-4 text-slate-800"
            :data-column="column"
          >
            <slot
              v-if="customColumns.includes(column)"
              name="cell"
              :entry="entry"
              :column="column"
            />
            <PassportCell
              v-else
              :entry="entry"
              :column="column"
              :today="today"
              :current-user-id="currentUserId"
            />
          </td>
          <td class="py-3" :class="{ [STICKY]: stickyActions }" data-actions>
            <div class="flex flex-wrap justify-end gap-1">
              <slot name="extra-actions" :entry="entry" />
              <slot name="actions" :entry="entry">
                <RouterLink
                  v-if="defaultActions && entry.can.update"
                  :to="{ name: 'passport-edit', params: { id: entry.id } }"
                  :class="[actionClass, 'text-primary-700']"
                >
                  Edit<span class="sr-only"> passport {{ entry.passport_number }}</span>
                </RouterLink>
                <button
                  v-if="defaultActions && entry.can.return"
                  type="button"
                  :class="[actionClass, 'text-amber-800 hover:bg-amber-50']"
                  :data-return-action="entry.id"
                  @click="$emit('return', entry)"
                >
                  Return<span class="sr-only"> passport {{ entry.passport_number }}</span>
                </button>
              </slot>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
