<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PassportCell from '@/components/PassportCell.vue'
import { COLUMN_LABELS, type PassportColumn } from '@/lib/passportColumns'
import { businessToday } from '@/lib/dates'
import type { PassportEntry } from '@/types/passport'

/**
 * Passport entries as a table on wide screens and as cards on narrow ones.
 * The passport name (linked to its detail page) and number always come first; `columns`
 * picks the rest. The `actions` slot replaces the default Edit / Delete buttons.
 */
withDefaults(
  defineProps<{
    entries: PassportEntry[]
    /** Id of the logged-in user, to show "You" in "Entered by". */
    currentUserId: number | null
    columns?: PassportColumn[]
    /** Extra classes for a row or card, e.g. to mark unfit passports. */
    rowClass?: (entry: PassportEntry) => string | undefined
  }>(),
  { columns: () => ['reference', 'company', 'received', 'entered_by'], rowClass: undefined },
)
defineEmits<{ delete: [entry: PassportEntry] }>()
defineSlots<{ actions?(props: { entry: PassportEntry }): unknown }>()

const today = businessToday()

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
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <template v-for="column in columns" :key="column">
          <dt class="text-muted">{{ COLUMN_LABELS[column] }}</dt>
          <dd class="min-w-0 text-slate-800">
            <PassportCell
              :entry="entry"
              :column="column"
              :today="today"
              :current-user-id="currentUserId"
            />
          </dd>
        </template>
      </dl>
      <div class="mt-2 -ml-2 flex flex-wrap gap-1">
        <slot name="actions" :entry="entry">
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
        </slot>
      </div>
    </li>
  </ul>

  <!-- Tablets and up: table -->
  <div class="hidden overflow-x-auto md:block">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
        <tr>
          <th scope="col" class="py-3 pr-4 font-semibold">Passport</th>
          <th
            v-for="column in columns"
            :key="column"
            scope="col"
            class="py-3 pr-4 font-semibold whitespace-nowrap"
          >
            {{ COLUMN_LABELS[column] }}
          </th>
          <th scope="col" class="py-3 font-semibold"><span class="sr-only">Actions</span></th>
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
          <td v-for="column in columns" :key="column" class="py-3 pr-4 text-slate-800">
            <PassportCell
              :entry="entry"
              :column="column"
              :today="today"
              :current-user-id="currentUserId"
            />
          </td>
          <td class="py-3">
            <div class="flex flex-wrap justify-end gap-1">
              <slot name="actions" :entry="entry">
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
              </slot>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
