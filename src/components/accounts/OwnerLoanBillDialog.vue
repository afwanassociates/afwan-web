<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import ScanFileInput from '@/components/ScanFileInput.vue'
import { createOwnerLoanBill, updateOwnerLoanBill } from '@/api/accounts'
import { EXPENSE_CATEGORIES, formatMoney, parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { ExpenseCategory, OwnerLoan, OwnerLoanBill } from '@/types/accounts'

/**
 * A company bill the owner paid with a loan the company gave them, with a copy of the bill
 * (photo or PDF). Once approved it settles that much of the loan; no money moves, so cash in
 * hand does not change. `bill` null records a new one on `loan`; a new copy replaces the old
 * one when editing.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ loan: OwnerLoan | null; bill: OwnerLoanBill | null }>()
const emit = defineEmits<{ saved: [bill: OwnerLoanBill, created: boolean] }>()

const id = useId()

const date = ref('')
const category = ref<ExpenseCategory | ''>('')
const purpose = ref('')
const billNo = ref('')
const amount = ref<string | number>('')
const note = ref('')
const copy = ref<File | null>(null)
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.bill !== null)
const title = computed(() => (isEdit.value ? 'Edit loan bill' : 'Settle loan with a bill'))

/** What the bill may settle: outstanding less what waits for approval (this bill aside). */
const available = computed(() => {
  const l = props.loan
  if (!l) return 0
  const own = props.bill && props.bill.status === 'pending' ? props.bill.amount : 0
  return Math.max(
    0,
    Math.round((l.outstanding - l.pending_returned - l.pending_billed + own) * 100) / 100,
  )
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const b = props.bill
  date.value = b?.date ?? businessToday()
  category.value = b?.expense_category ?? ''
  purpose.value = b?.purpose ?? ''
  billNo.value = b?.bill_no ?? ''
  amount.value = b ? b.amount.toFixed(2) : ''
  note.value = b?.note ?? ''
  copy.value = null
  errors.value = {}
  banner.value = null
})

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value || !props.loan) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!date.value) e.date = 'Choose the date of the bill.'
  if (!category.value) e.expense_category = 'Choose what the bill was for.'
  if (!squish(purpose.value)) e.purpose = 'Enter what the bill was (e.g. October office rent).'
  const parsed = parseAmount(amount.value)
  if (parsed.error) e.amount = parsed.error
  else if (parsed.amount! > available.value)
    e.amount = `Only ৳ ${formatMoney(available.value)} is outstanding on loan ${props.loan.payment_no}.`
  if (!isEdit.value && !copy.value) e.bill_copy = 'Attach a copy of the bill (photo or PDF).'
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    date: date.value,
    expense_category: category.value as ExpenseCategory,
    purpose: squish(purpose.value),
    bill_no: squish(billNo.value) || null,
    amount: parsed.amount!,
    note: squish(note.value) || null,
  }
  isSaving.value = true
  try {
    const saved = props.bill
      ? await updateOwnerLoanBill(props.bill.id, payload, copy.value)
      : await createOwnerLoanBill(props.loan.id, payload, copy.value!)
    emit('saved', saved, !props.bill)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'You do not have permission to change this bill.'
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the bill. Please try again.')
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
    <p v-if="loan" class="mb-4 rounded-lg bg-primary-50/60 p-3 text-sm" data-loan>
      Loan <strong class="font-mono">{{ loan.payment_no }}</strong> to {{ loan.owner.name }} · ৳
      {{ formatMoney(loan.amount) }} · this bill can settle up to
      <strong>৳ {{ formatMoney(available) }}</strong
      >. No money moves: cash in hand does not change.
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="expense_category">
          <label :for="`${id}-category`" class="block text-sm font-medium text-slate-700">
            Bill for<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <select
            :id="`${id}-category`"
            v-model="category"
            :class="[inputClass, border('expense_category')]"
            :aria-invalid="errors.expense_category ? 'true' : undefined"
          >
            <option value="" disabled>Choose…</option>
            <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
          <p v-if="errors.expense_category" class="mt-1 text-sm text-red-700">
            {{ errors.expense_category }}
          </p>
        </div>
        <div data-field="date">
          <label :for="`${id}-date`" class="block text-sm font-medium text-slate-700">
            Bill date<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-date`"
            v-model="date"
            type="date"
            :class="[inputClass, border('date')]"
            :aria-invalid="errors.date ? 'true' : undefined"
          />
          <p v-if="errors.date" class="mt-1 text-sm text-red-700">{{ errors.date }}</p>
        </div>
      </div>

      <div data-field="purpose">
        <label :for="`${id}-purpose`" class="block text-sm font-medium text-slate-700">
          What it was<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${id}-purpose`"
          v-model="purpose"
          type="text"
          maxlength="150"
          autocomplete="off"
          placeholder="e.g. October office rent"
          :class="[inputClass, border('purpose')]"
          :aria-invalid="errors.purpose ? 'true' : undefined"
        />
        <p v-if="errors.purpose" class="mt-1 text-sm text-red-700">{{ errors.purpose }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="bill_no">
          <label :for="`${id}-billno`" class="block text-sm font-medium text-slate-700">
            Bill no.
          </label>
          <input
            :id="`${id}-billno`"
            v-model="billNo"
            type="text"
            maxlength="50"
            autocomplete="off"
            :class="[inputClass, border('bill_no')]"
          />
          <p v-if="errors.bill_no" class="mt-1 text-sm text-red-700">{{ errors.bill_no }}</p>
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
            :class="[inputClass, border('amount'), 'text-right tabular-nums']"
            :aria-invalid="errors.amount ? 'true' : undefined"
          />
          <p v-if="errors.amount" class="mt-1 text-sm text-red-700">{{ errors.amount }}</p>
        </div>
      </div>

      <div data-field="bill_copy">
        <ScanFileInput
          v-model="copy"
          label="Bill copy"
          :required="!isEdit"
          :current-name="bill?.copy_name ?? null"
          :error="errors.bill_copy"
          :disabled="isSaving"
          @clear-error="delete errors.bill_copy"
        />
      </div>

      <div data-field="note">
        <label :for="`${id}-note`" class="block text-sm font-medium text-slate-700">Note</label>
        <input
          :id="`${id}-note`"
          v-model="note"
          type="text"
          maxlength="500"
          autocomplete="off"
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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Save bill' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
