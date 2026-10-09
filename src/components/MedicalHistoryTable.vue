<script setup lang="ts">
import MedicalStatusBadge from '@/components/MedicalStatusBadge.vue'
import { toDisplayDate } from '@/lib/dates'
import { isMedicalAdmin } from '@/lib/medical'
import type { Role } from '@/types/auth'
import type { MedicalRecord } from '@/types/medical'

/**
 * A passport's medical records, newest first. Edit follows the API (own records for data
 * entry); Delete is for admin and super admin only.
 */
const props = defineProps<{
  records: MedicalRecord[]
  role: Role | undefined
}>()
defineEmits<{ edit: [record: MedicalRecord]; delete: [record: MedicalRecord] }>()

const canDelete = (record: MedicalRecord) => record.can.delete && isMedicalAdmin(props.role)

const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-primary-50 focus-visible:bg-primary-50'
</script>

<template>
  <p v-if="records.length === 0" class="py-6 text-center text-muted">No medical records yet.</p>

  <template v-else>
    <!-- Phones: cards -->
    <ul class="divide-y divide-stroke md:hidden">
      <li v-for="record in records" :key="record.id" class="py-4" data-record>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-semibold text-ink">{{ toDisplayDate(record.medical_date) }}</span>
          <MedicalStatusBadge :status="record.result" :valid-until="record.valid_until" />
        </div>
        <p class="mt-1 text-sm text-muted">Recorded by {{ record.recorded_by?.name ?? '—' }}</p>
        <p v-if="record.remarks" class="mt-1 text-sm break-words text-slate-700">
          {{ record.remarks }}
        </p>
        <div class="mt-2 -ml-2 flex gap-1">
          <button
            v-if="record.can.update"
            type="button"
            :class="[actionClass, 'text-primary-700']"
            @click="$emit('edit', record)"
          >
            Edit<span class="sr-only"> medical of {{ toDisplayDate(record.medical_date) }}</span>
          </button>
          <button
            v-if="canDelete(record)"
            type="button"
            :class="[actionClass, 'text-red-700 hover:bg-red-50']"
            @click="$emit('delete', record)"
          >
            Delete<span class="sr-only"> medical of {{ toDisplayDate(record.medical_date) }}</span>
          </button>
        </div>
      </li>
    </ul>

    <!-- Tablets and up: table -->
    <div class="hidden overflow-x-auto md:block">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
          <tr>
            <th scope="col" class="py-3 pr-4 font-semibold">Medical date</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Result</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Valid until</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Recorded by</th>
            <th scope="col" class="py-3 pr-4 font-semibold">Remarks</th>
            <th scope="col" class="py-3 font-semibold"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stroke">
          <tr v-for="record in records" :key="record.id" class="align-top" data-record>
            <td class="py-3 pr-4 whitespace-nowrap text-ink">
              {{ toDisplayDate(record.medical_date) }}
            </td>
            <td class="py-3 pr-4">
              <MedicalStatusBadge :status="record.result" />
            </td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-700">
              {{ toDisplayDate(record.valid_until) || '—' }}
            </td>
            <td class="py-3 pr-4 whitespace-nowrap text-slate-700">
              {{ record.recorded_by?.name ?? '—' }}
            </td>
            <td class="py-3 pr-4 break-words text-slate-700">{{ record.remarks || '—' }}</td>
            <td class="py-3">
              <div class="flex justify-end gap-1">
                <button
                  v-if="record.can.update"
                  type="button"
                  :class="[actionClass, 'text-primary-700']"
                  @click="$emit('edit', record)"
                >
                  Edit<span class="sr-only">
                    medical of {{ toDisplayDate(record.medical_date) }}</span
                  >
                </button>
                <button
                  v-if="canDelete(record)"
                  type="button"
                  :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                  @click="$emit('delete', record)"
                >
                  Delete<span class="sr-only">
                    medical of {{ toDisplayDate(record.medical_date) }}</span
                  >
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
