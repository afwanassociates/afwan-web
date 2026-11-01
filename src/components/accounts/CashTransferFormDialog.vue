<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createCashTransfer, updateCashTransfer } from '@/api/accounts'
import MobileBankingFields from '@/components/accounts/MobileBankingFields.vue'
import {
  CASH_CONTEXT,
  checkMobileBanking,
  formatMoney,
  MOBILE_PATTERN,
  parseAmount,
} from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type {
  CashTransfer,
  MobileBankingProvider,
  TransferChannel,
  TransferDirection,
} from '@/types/accounts'

/**
 * Deposit / withdrawal form: deposit cash in hand to a bank or a mobile banking wallet (cash in),
 * or withdraw from one into cash (cash out). A wallet takes the service (bKash, Nagad…) and the
 * wallet number, and who did it (name and mobile; NID or passport optional).
 * The bank is typed until Bank Management exists. A deposit also takes the deposit slip
 * number, shown first, and who deposited it (name,
 * mobile, NID or passport), all required; a withdrawal takes the cheque number, shown first,
 * and the same three details of who withdrew it ("Withdrawn by"). A new transfer starts on
 * today's date (Dhaka). The API refuses a deposit larger than the cash in
 * hand. `transfer` null records a new one.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ transfer: CashTransfer | null }>()
const emit = defineEmits<{ saved: [transfer: CashTransfer, created: boolean] }>()

const cash = inject(CASH_CONTEXT, null)
const id = useId()

const channel = ref<TransferChannel>('bank')
const direction = ref<TransferDirection>('deposit')
const amount = ref<string | number>('')
const date = ref('')
const bankName = ref('')
const bankBranch = ref('')
const mobileProvider = ref<MobileBankingProvider | ''>('')
const mobileNumber = ref('')
const chequeNo = ref('')
const slipNo = ref('')
const refName = ref('')
const refMobile = ref('')
const refNid = ref('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.transfer !== null)
const isBank = computed(() => channel.value === 'bank')

const directionOptions = computed(() =>
  isBank.value
    ? ([
        { value: 'deposit', label: 'Deposit cash to bank' },
        { value: 'withdrawal', label: 'Withdraw cash from bank' },
      ] as const)
    : ([
        { value: 'deposit', label: 'Cash in to mobile banking' },
        { value: 'withdrawal', label: 'Cash out from mobile banking' },
      ] as const),
)
const directionHint = computed(() => {
  const account = isBank.value ? 'the bank balance' : 'the mobile banking balance'
  return direction.value === 'deposit'
    ? `Cash in hand goes down; ${account} goes up.`
    : `${account[0]!.toUpperCase()}${account.slice(1)} goes down; cash in hand goes up.`
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const t = props.transfer
  channel.value = t?.channel ?? 'bank'
  direction.value = t?.direction ?? 'deposit'
  amount.value = t ? t.amount.toFixed(2) : ''
  date.value = t?.date ?? businessToday()
  bankName.value = t?.bank_name ?? ''
  bankBranch.value = t?.bank_branch ?? ''
  mobileProvider.value = t?.mobile_provider ?? ''
  mobileNumber.value = t?.mobile_number ?? ''
  chequeNo.value = t?.cheque_no ?? ''
  slipNo.value = t?.deposit_slip_no ?? ''
  refName.value = t?.reference_name ?? ''
  refMobile.value = t?.reference_mobile ?? ''
  refNid.value = t?.reference_nid_passport ?? ''
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
  const isDeposit = direction.value === 'deposit'
  const bank = isBank.value
  if (bank) {
    if (!squish(bankName.value)) e.bank_name = 'Enter the bank name.'
    if (!squish(bankBranch.value)) e.bank_branch = 'Enter the branch name.'
    if (!isDeposit && !squish(chequeNo.value)) e.cheque_no = 'Enter the cheque number.'
    if (isDeposit && !squish(slipNo.value)) e.deposit_slip_no = 'Enter the deposit slip number.'
  }
  const mobile = checkMobileBanking(mobileProvider.value, mobileNumber.value)
  if (!bank) Object.assign(e, mobile.errors)
  const who = isDeposit ? "the depositor's" : "the withdrawer's"
  if (!squish(refName.value)) e.reference_name = `Enter ${who} name.`
  if (!squish(refMobile.value)) e.reference_mobile = `Enter ${who} mobile number.`
  else if (!MOBILE_PATTERN.test(squish(refMobile.value)))
    e.reference_mobile = 'Enter a valid mobile number (digits, spaces or dashes, optional +).'
  if (bank && !refNid.value.trim())
    e.reference_nid_passport = `Enter ${who} NID or passport number.`
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    date: date.value,
    direction: direction.value,
    channel: channel.value,
    amount: parsed.amount!,
    bank_name: bank ? squish(bankName.value) : null,
    bank_branch: bank ? squish(bankBranch.value) : null,
    mobile_provider: bank ? null : mobile.mobile_provider,
    mobile_number: bank ? null : mobile.mobile_number,
    cheque_no: bank && !isDeposit ? squish(chequeNo.value) : null,
    deposit_slip_no: bank && isDeposit ? squish(slipNo.value) : null,
    reference_name: squish(refName.value),
    reference_mobile: squish(refMobile.value),
    reference_nid_passport: refNid.value.replace(/\s+/g, '').toUpperCase() || null,
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
    :title="isEdit ? `Edit ${transfer!.transfer_no}` : 'Deposit / withdrawal'"
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
      <fieldset data-field="channel">
        <legend class="block text-sm font-medium text-slate-700">Account</legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="option in [
              { value: 'bank', label: 'Bank' },
              { value: 'mobile_banking', label: 'Mobile banking' },
            ] as const"
            :key="option.value"
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="segment(channel === option.value)"
            :aria-pressed="channel === option.value"
            :data-channel="option.value"
            @click="channel = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>

      <fieldset data-field="direction">
        <legend class="block text-sm font-medium text-slate-700">Transfer</legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="option in directionOptions"
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
        <p class="mt-1 text-xs text-muted" data-direction-hint>{{ directionHint }}</p>
      </fieldset>

      <MobileBankingFields
        v-if="!isBank"
        v-model:provider="mobileProvider"
        v-model:number="mobileNumber"
        :errors="errors"
      />

      <div v-if="isBank && direction === 'withdrawal'" class="grid gap-4 sm:grid-cols-2">
        <div data-field="cheque_no">
          <label :for="`${id}-cheque`" class="block text-sm font-medium text-slate-700">
            Cheque no.<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-cheque`"
            v-model="chequeNo"
            type="text"
            maxlength="50"
            autocomplete="off"
            :class="[inputClass, border('cheque_no')]"
            :aria-invalid="errors.cheque_no ? 'true' : undefined"
          />
          <p v-if="errors.cheque_no" class="mt-1 text-sm text-red-700">{{ errors.cheque_no }}</p>
        </div>
      </div>

      <template v-if="isBank && direction === 'deposit'">
        <div class="grid gap-4 sm:grid-cols-2">
          <div data-field="deposit_slip_no">
            <label :for="`${id}-slip`" class="block text-sm font-medium text-slate-700">
              Deposit slip no.<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-slip`"
              v-model="slipNo"
              type="text"
              maxlength="50"
              autocomplete="off"
              :class="[inputClass, border('deposit_slip_no')]"
              :aria-invalid="errors.deposit_slip_no ? 'true' : undefined"
            />
            <p v-if="errors.deposit_slip_no" class="mt-1 text-sm text-red-700">
              {{ errors.deposit_slip_no }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="isBank" class="grid gap-4 sm:grid-cols-2">
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
            v-else-if="direction === 'deposit' && cash?.settings.value?.cash_in_hand !== undefined"
            class="mt-1 text-right text-xs text-muted"
          >
            Closing Cash on Hand: ৳ {{ formatMoney(cash.settings.value.cash_in_hand!) }}
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

      <fieldset data-depositor>
        <legend class="block text-sm font-semibold text-slate-800">
          {{ direction === 'deposit' ? 'Deposited by' : 'Withdrawn by' }}
        </legend>
        <div class="mt-1 grid gap-4 sm:grid-cols-3">
          <div data-field="reference_name">
            <label :for="`${id}-ref-name`" class="block text-sm font-medium text-slate-700">
              Name<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-ref-name`"
              v-model="refName"
              type="text"
              maxlength="150"
              autocomplete="off"
              :class="[inputClass, border('reference_name')]"
              :aria-invalid="errors.reference_name ? 'true' : undefined"
            />
            <p v-if="errors.reference_name" class="mt-1 text-sm text-red-700">
              {{ errors.reference_name }}
            </p>
          </div>
          <div data-field="reference_mobile">
            <label :for="`${id}-ref-mobile`" class="block text-sm font-medium text-slate-700">
              Mobile<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-ref-mobile`"
              v-model="refMobile"
              type="tel"
              maxlength="30"
              autocomplete="off"
              placeholder="01XXXXXXXXX"
              :class="[inputClass, border('reference_mobile')]"
              :aria-invalid="errors.reference_mobile ? 'true' : undefined"
            />
            <p v-if="errors.reference_mobile" class="mt-1 text-sm text-red-700">
              {{ errors.reference_mobile }}
            </p>
          </div>
          <div data-field="reference_nid_passport">
            <label :for="`${id}-ref-nid`" class="block text-sm font-medium text-slate-700">
              NID / Passport<span v-if="isBank" class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-ref-nid`"
              v-model="refNid"
              type="text"
              maxlength="50"
              autocomplete="off"
              :class="[inputClass, border('reference_nid_passport')]"
              :aria-invalid="errors.reference_nid_passport ? 'true' : undefined"
            />
            <p v-if="errors.reference_nid_passport" class="mt-1 text-sm text-red-700">
              {{ errors.reference_nid_passport }}
            </p>
          </div>
        </div>
      </fieldset>

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
