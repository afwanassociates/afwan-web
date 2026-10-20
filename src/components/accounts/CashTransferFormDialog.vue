<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createCashTransfer, updateCashTransfer } from '@/api/accounts'
import { CASH_CONTEXT, formatMoney, parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { CashTransfer, TransferDirection } from '@/types/accounts'

/**
 * Cash transfer form: deposit cash in hand to a bank, or withdraw from a bank into cash.
 * The bank is typed until Bank Management exists. The API refuses a deposit larger than the
 * cash in hand. `transfer` null records a new one.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ transfer: CashTransfer | null }>()
const emit = defineEmits<{ saved: [transfer: CashTransfer, created: boolean] }>()

const cash = inject(CASH_CONTEXT, null)
const id = useId()

const direction = ref<TransferDirection>('deposit')
const amount = ref<string | number>('')
const date = ref('')
const bankName = ref('')
const bankBranch = ref('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.transfer !== null)

watch(open, (isOpen) => {
  if (!isOpen) return
  const t = props.transfer
  direction.value = t?.direction ?? 'deposit'
  amount.value = t ? t.amount.toFixed(2) : ''
  date.value = t?.date ?? businessToday()
  bankName.value = t?.bank_name ?? ''
  bankBranch.value = t?.bank_branch ?? ''
  note.value = t?.note ?? ''
  errors.value = {}
  banner.value = null
})

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!date.value) e.date = 'Choose the date.'
  const parsed = parseAmount(amount.value)
  if (parsed.error) e.amount = parsed.error
  if (!squish(bankName.value)) e.bank_name = 'Enter the bank name.'
  if (!squish(bankBranch.value)) e.bank_branch = 'Enter the branch name.'
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    date: date.value,
    direction: direction.value,
    amount: parsed.amount!,
    bank_name: squish(bankName.value),
    bank_branch: squish(bankBranch.value),
    note: squish(note.value) || null,
  }
  isSaving.value = true
  try {
    const saved = props.transfer
      ? await updateCashTransfer(props.transfer.id, payload)
      : await createCashTransfer(payload)
    emit('saved', saved, !props.transfer)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the transfer. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const border = (field: string) => (errors.value[field] ? 'border-red-500' : 'border-slate-300')
const segment = (active: boolean) =>
  active
    ? 'bg-primary-900 text-white'
    : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="isEdit ? `Edit transfer ${transfer!.transfer_no}` : 'Cash transfer'"
    :busy="isSaving"
  >
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <fieldset data-field="direction">
        <legend class="block text-sm font-medium text-slate-700">Transfer</legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="option in [
              { value: 'deposit', label: 'Deposit cash to bank' },
              { value: 'withdrawal', label: 'Withdraw cash from bank' },
            ] as const"
            :key="option.value"
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="segment(direction === option.value)"
            :aria-pressed="direction === option.value"
            :data-direction="option.value"
            @click="direction = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="mt-1 text-xs text-muted" data-direction-hint>
          {{
            direction === 'deposit'
              ? 'Cash in hand goes down; the bank balance goes up.'
              : 'The bank balance goes down; cash in hand goes up.'
          }}
        </p>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="bank_name">
          <label :for="`${id}-bank`" class="block text-sm font-medium text-slate-700">
            Bank name<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-bank`"
            v-model="bankName"
            type="text"
            maxlength="150"
            autocomplete="off"
            :class="[inputClass, border('bank_name')]"
            :aria-invalid="errors.bank_name ? 'true' : undefined"
          />
          <p v-if="errors.bank_name" class="mt-1 text-sm text-red-700">{{ errors.bank_name }}</p>
        </div>
        <div data-field="bank_branch">
          <label :for="`${id}-branch`" class="block text-sm font-medium text-slate-700">
            Branch name<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-branch`"
            v-model="bankBranch"
            type="text"
            maxlength="150"
            autocomplete="off"
            :class="[inputClass, border('bank_branch')]"
            :aria-invalid="errors.bank_branch ? 'true' : undefined"
          />
          <p v-if="errors.bank_branch" class="mt-1 text-sm text-red-700">
            {{ errors.bank_branch }}
          </p>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
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
          <p v-if="errors.amount" class="mt-1 text-sm text-red-700" data-amount-error>
            {{ errors.amount }}
          </p>
          <p
            v-else-if="direction === 'deposit' && cash?.settings.value"
            class="mt-1 text-right text-xs text-muted"
          >
            Cash in hand today: ৳ {{ formatMoney(cash.settings.value.cash_in_hand) }}
          </p>
        </div>
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
          placeholder="e.g. deposit slip no."
          :class="[inputClass, border('note')]"
        />
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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Save transfer' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
