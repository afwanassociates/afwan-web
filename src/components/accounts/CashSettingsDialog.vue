<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { updateCashSettings } from '@/api/accounts'
import { parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { CashSettings } from '@/types/accounts'

/**
 * Admin form for the company's cash opening balance: the cash in hand on the date the cash
 * book starts. The API refuses a date after existing cash entries, or an amount that would
 * make a later day negative.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ settings: CashSettings | null }>()
const emit = defineEmits<{ saved: [settings: CashSettings] }>()

const id = useId()
const amount = ref<string | number>('')
const date = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  const s = props.settings
  amount.value = s && s.opening_balance > 0 ? s.opening_balance.toFixed(2) : ''
  date.value = s?.opening_date ?? businessToday()
  errors.value = {}
  banner.value = null
})

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  const parsed = parseAmount(amount.value, { allowZero: true })
  if (parsed.error) e.opening_balance = parsed.error
  if (!date.value) e.opening_date = 'Choose the date.'
  errors.value = e
  if (Object.keys(e).length > 0) return

  isSaving.value = true
  try {
    const saved = await updateCashSettings({
      opening_balance: parsed.amount!,
      opening_date: date.value,
    })
    emit('saved', saved)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'Only admins can set the cash opening balance.'
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
  <BaseDialog v-model:open="open" title="Cash opening balance" :busy="isSaving">
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <p class="mb-4 text-sm text-muted">
      The cash in hand on the day the cash book starts. Cash entries can't be dated before it.
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="opening_balance">
          <label :for="`${id}-amount`" class="block text-sm font-medium text-slate-700">
            Opening cash in hand<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-amount`"
            v-model="amount"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            :class="[inputClass, border('opening_balance'), 'text-right tabular-nums']"
            :aria-invalid="errors.opening_balance ? 'true' : undefined"
          />
          <p v-if="errors.opening_balance" class="mt-1 text-sm text-red-700">
            {{ errors.opening_balance }}
          </p>
        </div>
        <div data-field="opening_date">
          <label :for="`${id}-date`" class="block text-sm font-medium text-slate-700">
            As at date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-date`"
            v-model="date"
            type="date"
            :class="[inputClass, border('opening_date')]"
            :aria-invalid="errors.opening_date ? 'true' : undefined"
          />
          <p v-if="errors.opening_date" class="mt-1 text-sm text-red-700">
            {{ errors.opening_date }}
          </p>
        </div>
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
