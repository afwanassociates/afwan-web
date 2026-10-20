<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createPartyTransaction, updatePartyTransaction } from '@/api/accounts'
import { parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { LedgerLine, Party } from '@/types/accounts'

/**
 * Add or edit a hand-entered receivable (the party owes us more). Refunds are not entered here:
 * they are cash payments, so they are never recorded twice. `line` null adds one.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  party: Party
  line: Pick<LedgerLine, 'id' | 'date' | 'type' | 'note' | 'debit' | 'credit'> | null
}>()
const emit = defineEmits<{ saved: [] }>()

const id = useId()

const date = ref('')
const amount = ref<string | number>('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const title = computed(() => {
  const verb = props.line ? 'Edit' : 'Add'
  return `${verb} receivable · ${props.party.code}`
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const l = props.line
  date.value = l?.date ?? businessToday()
  amount.value = l ? (l.debit || l.credit).toFixed(2) : ''
  note.value = l?.note ?? ''
  errors.value = {}
  banner.value = null
})

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!date.value) e.date = 'Choose the date.'
  const parsed = parseAmount(amount.value)
  if (parsed.error) e.amount = parsed.error
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    date: date.value,
    type: 'receivable' as const,
    amount: parsed.amount!,
    note: note.value.trim().replace(/\s+/g, ' ') || null,
  }
  isSaving.value = true
  try {
    if (props.line) await updatePartyTransaction(props.line.id, payload)
    else await createPartyTransaction(props.party.id, payload)
    emit('saved')
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const border = (field: string) => (errors.value[field] ? 'border-red-500' : 'border-slate-300')
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <p class="text-sm text-muted" data-field="type">
        A receivable: the {{ party.type === 'owner' ? 'owner' : 'party' }} owes us more (Dr). To pay
        money back, record a refund in Cash Payment.
      </p>
      <p v-if="errors.type" class="text-sm text-red-700">{{ errors.type }}</p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="date">
          <label :for="`${id}-date`" class="block text-sm font-medium text-slate-700">
            Date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-date`"
            v-model="date"
            type="date"
            required
            :class="[inputClass, border('date')]"
            :aria-invalid="errors.date ? 'true' : undefined"
          />
          <p v-if="errors.date" class="mt-1 text-sm text-red-700">{{ errors.date }}</p>
        </div>
        <div data-field="amount">
          <label :for="`${id}-amount`" class="block text-sm font-medium text-slate-700">
            Amount<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-amount`"
            v-model="amount"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            required
            :class="[inputClass, border('amount'), 'text-right tabular-nums']"
            :aria-invalid="errors.amount ? 'true' : undefined"
          />
          <p v-if="errors.amount" class="mt-1 text-sm text-red-700">{{ errors.amount }}</p>
        </div>
      </div>

      <div data-field="note">
        <label :for="`${id}-note`" class="block text-sm font-medium text-slate-700">
          Description
        </label>
        <input
          :id="`${id}-note`"
          v-model="note"
          type="text"
          maxlength="500"
          autocomplete="off"
          :class="[inputClass, border('note')]"
        />
        <p v-if="errors.note" class="mt-1 text-sm text-red-700">{{ errors.note }}</p>
      </div>

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
