<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createCashPayment, searchParties, updateCashPayment } from '@/api/accounts'
import { CASH_CONTEXT, formatMoney, parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type {
  CashPayment,
  CashPaymentType,
  Party,
  PayeeType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Cash payment form. "Paid to" is a party (refund or loan repayment), an owner (drawing or
 * loan repayment) or another payee typed by name with a purpose (an expense). A party or
 * owner payment shows in their ledger. The API refuses a cash payment larger than the cash
 * in hand. `payment` null records a new one, optionally for `presetParty`.
 */
type Payee = Pick<Party, 'id' | 'code' | 'type' | 'name' | 'mobile' | 'address'>

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ payment: CashPayment | null; presetParty?: Payee | null }>()
const emit = defineEmits<{ saved: [payment: CashPayment, created: boolean] }>()

const cash = inject(CASH_CONTEXT, null)
const id = useId()

const PAYEES = [
  { value: 'client', label: 'Party / Client' },
  { value: 'owner', label: 'Company owner' },
  { value: 'other', label: 'Other' },
] as const

const TYPES: Record<PayeeType, { value: CashPaymentType; label: string; hint: string }[]> = {
  client: [
    { value: 'refund', label: 'Refund', hint: 'Money paid back to the party.' },
    {
      value: 'loan_repayment',
      label: 'Loan repayment',
      hint: 'Repaying a loan taken from the party.',
    },
  ],
  owner: [
    { value: 'drawing', label: 'Owner drawing', hint: 'The owner takes money out of the company.' },
    {
      value: 'loan_repayment',
      label: 'Loan repayment',
      hint: 'Repaying a loan taken from the owner.',
    },
  ],
  other: [{ value: 'expense', label: 'Expense', hint: 'Any other payment, e.g. office rent.' }],
}

const payeeType = ref<PayeeType>('client')
const party = ref<Payee | null>(null)
const payeeName = ref('')
const paymentType = ref<CashPaymentType>('refund')
const purpose = ref('')
const amount = ref<string | number>('')
const date = ref('')
const method = ref<PaymentMethod>('cash')
const bankName = ref('')
const bankBranch = ref('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.payment !== null)
const title = computed(() =>
  isEdit.value ? `Edit payment ${props.payment!.payment_no}` : 'Cash payment',
)
const types = computed(() => TYPES[payeeType.value])
const typeHint = computed(() => types.value.find((t) => t.value === paymentType.value)?.hint ?? '')

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.payment
  const preset = p?.party ?? props.presetParty ?? null
  payeeType.value = p?.payee_type ?? preset?.type ?? 'client'
  party.value = preset
  payeeName.value = p && !p.party ? p.payee_name : ''
  paymentType.value = p?.payment_type ?? TYPES[payeeType.value][0]!.value
  purpose.value = p?.purpose ?? ''
  amount.value = p ? p.amount.toFixed(2) : ''
  date.value = p?.date ?? businessToday()
  method.value = p?.payment_method ?? 'cash'
  bankName.value = p?.bank_name ?? ''
  bankBranch.value = p?.bank_branch ?? ''
  note.value = p?.note ?? ''
  errors.value = {}
  banner.value = null
})

function setPayeeType(type: PayeeType) {
  if (payeeType.value === type) return
  payeeType.value = type
  party.value = null
  paymentType.value = TYPES[type][0]!.value
}

const fetchPayees = (q: string): Promise<Payee[]> =>
  searchParties(payeeType.value === 'owner' ? 'owner' : 'client', q)
const payeeSubtitle = (p: Payee) => `${p.code} · ${p.mobile}`

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const isOther = payeeType.value === 'other'
  const e: Record<string, string> = {}
  if (isOther) {
    if (!squish(payeeName.value)) e.payee_name = 'Enter the payee name.'
    if (!squish(purpose.value)) e.purpose = 'Enter the purpose (e.g. office rent).'
  } else if (!party.value) {
    e.party_id = `Choose the ${payeeType.value === 'owner' ? 'owner' : 'party'}.`
  }
  if (!date.value) e.date = 'Choose the date.'
  const parsed = parseAmount(amount.value)
  if (parsed.error) e.amount = parsed.error
  if (method.value === 'bank') {
    if (!squish(bankName.value)) e.bank_name = 'Enter the bank name.'
    if (!squish(bankBranch.value)) e.bank_branch = 'Enter the branch name.'
  }
  errors.value = e
  if (Object.keys(e).length > 0) return

  const isBank = method.value === 'bank'
  const payload = {
    date: date.value,
    payee_type: payeeType.value,
    party_id: isOther ? null : party.value!.id,
    payee_name: isOther ? squish(payeeName.value) : null,
    payment_type: paymentType.value,
    purpose: squish(purpose.value) || null,
    amount: parsed.amount!,
    payment_method: method.value,
    bank_name: isBank ? squish(bankName.value) : null,
    bank_branch: isBank ? squish(bankBranch.value) : null,
    note: squish(note.value) || null,
  }
  isSaving.value = true
  try {
    const saved = props.payment
      ? await updateCashPayment(props.payment.id, payload)
      : await createCashPayment(payload)
    emit('saved', saved, !props.payment)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'You do not have permission to record payments.'
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the payment. Please try again.')
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
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <fieldset data-field="payee_type">
        <legend class="block text-sm font-medium text-slate-700">Paid to</legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="option in PAYEES"
            :key="option.value"
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="segment(payeeType === option.value)"
            :aria-pressed="payeeType === option.value"
            :data-payee-type="option.value"
            @click="setPayeeType(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>

      <template v-if="payeeType === 'other'">
        <div class="grid gap-4 sm:grid-cols-2">
          <div data-field="payee_name">
            <label :for="`${id}-payee`" class="block text-sm font-medium text-slate-700">
              Payee name<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-payee`"
              v-model="payeeName"
              type="text"
              maxlength="150"
              autocomplete="off"
              :class="[inputClass, border('payee_name')]"
              :aria-invalid="errors.payee_name ? 'true' : undefined"
            />
            <p v-if="errors.payee_name" class="mt-1 text-sm text-red-700">
              {{ errors.payee_name }}
            </p>
          </div>
          <div data-field="purpose">
            <label :for="`${id}-purpose`" class="block text-sm font-medium text-slate-700">
              Purpose<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-purpose`"
              v-model="purpose"
              type="text"
              maxlength="150"
              autocomplete="off"
              placeholder="e.g. Office rent"
              :class="[inputClass, border('purpose')]"
              :aria-invalid="errors.purpose ? 'true' : undefined"
            />
            <p v-if="errors.purpose" class="mt-1 text-sm text-red-700">{{ errors.purpose }}</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div data-field="party_id">
          <SearchSelect
            :key="payeeType"
            v-model="party"
            :fetch="fetchPayees"
            :label="payeeType === 'owner' ? 'Owner' : 'Party'"
            placeholder="Search name, ID or mobile"
            :subtitle-of="payeeSubtitle"
            :error="errors.party_id"
            required
          />
        </div>
        <dl
          v-if="party"
          class="grid gap-x-4 gap-y-1 rounded-lg bg-primary-50/60 p-3 text-sm sm:grid-cols-[auto_1fr]"
          data-payee
        >
          <dt class="text-muted">ID</dt>
          <dd class="font-mono">{{ party.code }}</dd>
          <dt class="text-muted">Name</dt>
          <dd class="font-medium text-ink">{{ party.name }}</dd>
          <dt class="text-muted">Mobile</dt>
          <dd>{{ party.mobile }}</dd>
          <dt class="text-muted">Address</dt>
          <dd>{{ party.address }}</dd>
        </dl>
      </template>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset data-field="payment_type">
          <legend class="block text-sm font-medium text-slate-700">Payment for</legend>
          <div class="mt-2 flex flex-wrap gap-4">
            <label v-for="t in types" :key="t.value" class="flex items-center gap-2">
              <input v-model="paymentType" type="radio" :value="t.value" :name="`${id}-ptype`" />
              {{ t.label }}
            </label>
          </div>
          <p v-if="errors.payment_type" class="mt-1 text-sm text-red-700">
            {{ errors.payment_type }}
          </p>
        </fieldset>
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
      <p class="-mt-2 text-xs text-muted" data-type-hint>{{ typeHint }}</p>

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
          :class="[inputClass, border('amount'), 'text-right text-lg tabular-nums']"
          :aria-invalid="errors.amount ? 'true' : undefined"
        />
        <p v-if="errors.amount" class="mt-1 text-sm text-red-700" data-amount-error>
          {{ errors.amount }}
        </p>
        <p
          v-else-if="method === 'cash' && cash?.settings.value"
          class="mt-1 text-right text-xs text-muted"
          data-cash-hint
        >
          Cash in hand today: ৳ {{ formatMoney(cash.settings.value.cash_in_hand) }}
        </p>
      </div>

      <fieldset data-field="payment_method">
        <legend class="block text-sm font-medium text-slate-700">Paid via</legend>
        <div class="mt-1 flex gap-2">
          <button
            v-for="option in [
              { value: 'cash', label: 'Cash in hand' },
              { value: 'bank', label: 'Bank' },
            ] as const"
            :key="option.value"
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="segment(method === option.value)"
            :aria-pressed="method === option.value"
            :data-method="option.value"
            @click="method = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>

      <div v-if="method === 'bank'" class="grid gap-4 sm:grid-cols-2">
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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Save payment' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
