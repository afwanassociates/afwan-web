<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createCashPayment, getOwnerLoans, searchParties, updateCashPayment } from '@/api/accounts'
import MobileBankingFields from '@/components/accounts/MobileBankingFields.vue'
import {
  CASH_CONTEXT,
  checkMobileBanking,
  EXPENSE_CATEGORIES,
  formatMoney,
  parseAmount,
} from '@/lib/accounts'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type {
  CashPayment,
  CashPaymentType,
  ExpenseCategory,
  MobileBankingProvider,
  OwnerLoan,
  Party,
  PayeeType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Cash payment form. "Paid to" is a party (refund only: parties never lend us money), an
 * owner (payment to owner, or loan repayment of one of their open loans, no more than is
 * still owed) or another payee typed by name: an expense with
 * its category (office rent, tea…), purpose and optional bill / receipt number. A party or
 * owner payment shows in their ledger. The API refuses a cash payment larger than the cash in
 * hand; bank and mobile banking payments leave cash in hand alone. Paid via cash in hand, a bank, or mobile banking (bKash, Nagad…) for any payee;
 * the amount is asked for once that is chosen.
 * `payment` null records a new one, optionally for `presetParty`.
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
  client: [{ value: 'refund', label: 'Refund', hint: 'Money paid back to the party.' }],
  owner: [
    {
      value: 'drawing',
      label: 'Payment to owner',
      hint: 'The owner takes money out of the company.',
    },
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
const expenseCategory = ref<ExpenseCategory | ''>('')
const billNo = ref('')
const amount = ref<string | number>('')
const date = ref('')
const method = ref<PaymentMethod | ''>('')
const bankName = ref('')
const bankBranch = ref('')
const bankAccountName = ref('')
const bankAccountNumber = ref('')
const mobileProvider = ref<MobileBankingProvider | ''>('')
const mobileNumber = ref('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.payment !== null)
const title = computed(() =>
  isEdit.value ? `Edit payment ${props.payment!.payment_no}` : 'Cash payment',
)
/** A party loan repayment saved before only owners could lend keeps its option while edited. */
const OLD_PARTY_LOAN_REPAYMENT = {
  value: 'loan_repayment',
  label: 'Loan repayment',
  hint: 'Repaying a loan taken from the party (old entry; parties no longer lend).',
} as const
const types = computed(() =>
  payeeType.value === 'client' &&
  props.payment?.payee_type === 'client' &&
  props.payment.payment_type === 'loan_repayment'
    ? [...TYPES.client, OLD_PARTY_LOAN_REPAYMENT]
    : TYPES[payeeType.value],
)
/* Owner loan repayment: the loan it pays back, from the owner's open loans. */
const loanId = ref<number | ''>('')
const ownerLoans = ref<OwnerLoan[] | null>(null)
const loansError = ref<string | null>(null)
const isLoanRepayment = computed(
  () => payeeType.value === 'owner' && paymentType.value === 'loan_repayment',
)
/** What may still be repaid on a loan: still owed less other repayments waiting approval. */
const available = (l: OwnerLoan) =>
  Math.max(0, Math.round((l.still_owed - l.pending_repaid) * 100) / 100)
const repayableLoans = computed(() =>
  (ownerLoans.value ?? []).filter((l) => available(l) > 0 || l.id === loanId.value),
)
const chosenLoan = computed(() => repayableLoans.value.find((l) => l.id === loanId.value) ?? null)

let loansRequest = 0
watch(
  () => [open.value, isLoanRepayment.value, party.value?.id] as const,
  async ([isOpen, isRepayment, ownerId]) => {
    ownerLoans.value = null
    loansError.value = null
    if (!isOpen || !isRepayment || !ownerId) return
    const request = ++loansRequest
    try {
      const report = await getOwnerLoans({ party_id: ownerId, for_payment: props.payment?.id })
      if (request !== loansRequest) return
      ownerLoans.value = report.data
      if (loanId.value !== '' && !repayableLoans.value.some((l) => l.id === loanId.value)) {
        loanId.value = ''
      }
      if (loanId.value === '' && repayableLoans.value.length === 1) {
        loanId.value = repayableLoans.value[0]!.id
      }
    } catch (error) {
      if (request === loansRequest && errorStatus(error) !== 401) {
        loansError.value = errorMessage(error, 'Could not load the loans of this owner.')
      }
    }
  },
)

const typeHint = computed(() => types.value.find((t) => t.value === paymentType.value)?.hint ?? '')

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.payment
  const preset = p?.party ?? props.presetParty ?? null
  payeeType.value = p?.payee_type ?? preset?.type ?? 'client'
  party.value = preset
  payeeName.value = p && !p.party ? p.payee_name : ''
  paymentType.value = p?.payment_type ?? TYPES[payeeType.value][0]!.value
  loanId.value = p?.loan_receipt?.id ?? ''
  purpose.value = p?.purpose ?? ''
  expenseCategory.value = p?.expense_category ?? ''
  billNo.value = p?.bill_no ?? ''
  amount.value = p ? p.amount.toFixed(2) : ''
  date.value = p?.date ?? businessToday()
  method.value = p?.payment_method ?? ''
  bankName.value = p?.bank_name ?? ''
  bankBranch.value = p?.bank_branch ?? ''
  bankAccountName.value = p?.bank_account_name ?? ''
  bankAccountNumber.value = p?.bank_account_number ?? ''
  mobileProvider.value = p?.mobile_provider ?? ''
  mobileNumber.value = p?.mobile_number ?? ''
  note.value = p?.note ?? ''
  errors.value = {}
  banner.value = null
})

function setPayeeType(type: PayeeType) {
  if (payeeType.value === type) return
  payeeType.value = type
  party.value = null
  paymentType.value = TYPES[type][0]!.value
  loanId.value = ''
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
    if (!squish(payeeName.value)) e.payee_name = 'Enter the name of who you paid.'
    if (!expenseCategory.value) e.expense_category = 'Choose what the money was spent on.'
    if (!squish(purpose.value)) e.purpose = 'Enter the purpose (e.g. October rent).'
  } else if (!party.value) {
    e.party_id = `Choose the ${payeeType.value === 'owner' ? 'owner' : 'party'}.`
  }
  if (!date.value) e.date = 'Choose the date.'
  const parsed = parseAmount(amount.value)
  // The amount is asked for once "Paid via" is chosen.
  if (method.value && parsed.error) e.amount = parsed.error
  if (isLoanRepayment.value && party.value) {
    if (loanId.value === '') e.loan_receipt_id = 'Choose the loan being repaid.'
    else if (
      method.value &&
      chosenLoan.value &&
      parsed.amount &&
      parsed.amount > available(chosenLoan.value)
    )
      e.amount = `Only ৳ ${formatMoney(available(chosenLoan.value))} is still owed on loan ${chosenLoan.value.receipt_no}.`
  }
  if (!method.value) e.payment_method = 'Choose how the money was paid.'
  if (method.value === 'bank') {
    if (!squish(bankName.value)) e.bank_name = 'Enter the bank name.'
    if (!squish(bankBranch.value)) e.bank_branch = 'Enter the branch name.'
    if (!squish(bankAccountName.value)) e.bank_account_name = 'Enter the bank account name.'
    const accountNo = bankAccountNumber.value.replace(/\s+/g, '')
    if (!accountNo) e.bank_account_number = 'Enter the bank account number.'
    else if (!/^[0-9A-Za-z-]+$/.test(accountNo))
      e.bank_account_number = 'Use only digits, letters and dashes.'
  }
  const mobile = checkMobileBanking(mobileProvider.value, mobileNumber.value)
  if (method.value === 'mobile_banking') Object.assign(e, mobile.errors)
  errors.value = e
  if (Object.keys(e).length > 0) return

  const isBank = method.value === 'bank'
  const isMobile = method.value === 'mobile_banking'
  const payload = {
    date: date.value,
    payee_type: payeeType.value,
    party_id: isOther ? null : party.value!.id,
    payee_name: isOther ? squish(payeeName.value) : null,
    payment_type: paymentType.value,
    loan_receipt_id: isLoanRepayment.value && loanId.value !== '' ? loanId.value : null,
    expense_category: isOther ? (expenseCategory.value as ExpenseCategory) : null,
    purpose: squish(purpose.value) || null,
    bill_no: isOther ? squish(billNo.value) || null : null,
    amount: parsed.amount!,
    payment_method: method.value as PaymentMethod,
    bank_name: isBank ? squish(bankName.value) : null,
    bank_branch: isBank ? squish(bankBranch.value) : null,
    bank_account_name: isBank ? squish(bankAccountName.value) : null,
    bank_account_number: isBank ? bankAccountNumber.value.replace(/\s+/g, '') : null,
    mobile_provider: isMobile ? mobile.mobile_provider : null,
    mobile_number: isMobile ? mobile.mobile_number : null,
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
              Paid to (name)<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <input
              :id="`${id}-payee`"
              v-model="payeeName"
              type="text"
              maxlength="150"
              autocomplete="off"
              placeholder="e.g. Rahman Properties"
              :class="[inputClass, border('payee_name')]"
              :aria-invalid="errors.payee_name ? 'true' : undefined"
            />
            <p v-if="errors.payee_name" class="mt-1 text-sm text-red-700">
              {{ errors.payee_name }}
            </p>
          </div>
          <div data-field="expense_category">
            <label :for="`${id}-category`" class="block text-sm font-medium text-slate-700">
              Expense type<span class="text-red-700" aria-hidden="true"> *</span>
            </label>
            <select
              :id="`${id}-category`"
              v-model="expenseCategory"
              :class="[inputClass, border('expense_category')]"
              :aria-invalid="errors.expense_category ? 'true' : undefined"
            >
              <option value="" disabled>Choose what it was for</option>
              <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </select>
            <p v-if="errors.expense_category" class="mt-1 text-sm text-red-700">
              {{ errors.expense_category }}
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
              placeholder="e.g. October rent"
              :class="[inputClass, border('purpose')]"
              :aria-invalid="errors.purpose ? 'true' : undefined"
            />
            <p v-if="errors.purpose" class="mt-1 text-sm text-red-700">{{ errors.purpose }}</p>
          </div>
          <div data-field="bill_no">
            <label :for="`${id}-bill`" class="block text-sm font-medium text-slate-700">
              Bill / receipt no.
            </label>
            <input
              :id="`${id}-bill`"
              v-model="billNo"
              type="text"
              maxlength="50"
              autocomplete="off"
              placeholder="From the bill or voucher (optional)"
              :class="[inputClass, border('bill_no')]"
            />
            <p v-if="errors.bill_no" class="mt-1 text-sm text-red-700">{{ errors.bill_no }}</p>
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

      <div v-if="isLoanRepayment && party" data-field="loan_receipt_id">
        <label :for="`${id}-loan`" class="block text-sm font-medium text-slate-700">
          Loan to repay<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <p v-if="loansError" class="mt-1 text-sm text-red-700">{{ loansError }}</p>
        <p v-else-if="ownerLoans === null" class="mt-1 text-sm text-muted">Loading loans…</p>
        <p
          v-else-if="repayableLoans.length === 0"
          class="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-no-loans
        >
          {{ party.name }} has no open loans, so there is nothing to repay.
        </p>
        <template v-else>
          <select
            :id="`${id}-loan`"
            v-model="loanId"
            :class="[inputClass, border('loan_receipt_id')]"
            :aria-invalid="errors.loan_receipt_id ? 'true' : undefined"
          >
            <option value="" disabled>Choose a loan</option>
            <option v-for="l in repayableLoans" :key="l.id" :value="l.id">
              {{ l.receipt_no }} · {{ toDisplayDate(l.date) }} · ৳ {{ formatMoney(l.amount) }} ·
              still owed ৳ {{ formatMoney(available(l)) }}
            </option>
          </select>
          <p v-if="chosenLoan" class="mt-1 text-xs text-muted" data-loan-hint>
            Loan ৳ {{ formatMoney(chosenLoan.amount) }}, repaid ৳ {{ formatMoney(chosenLoan.repaid)
            }}<template v-if="chosenLoan.pending_repaid > 0">
              (+ ৳ {{ formatMoney(chosenLoan.pending_repaid) }} waiting approval)</template
            >. You can repay up to ৳ {{ formatMoney(available(chosenLoan)) }}.
          </p>
        </template>
        <p v-if="errors.loan_receipt_id" class="mt-1 text-sm text-red-700">
          {{ errors.loan_receipt_id }}
        </p>
      </div>

      <fieldset data-field="payment_method">
        <legend class="block text-sm font-medium text-slate-700">
          Paid via<span class="text-red-700" aria-hidden="true"> *</span>
        </legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="option in [
              { value: 'cash', label: 'Cash in hand' },
              { value: 'bank', label: 'Bank' },
              { value: 'mobile_banking', label: 'Mobile banking' },
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
        <p v-if="errors.payment_method" class="mt-1 text-sm text-red-700">
          {{ errors.payment_method }}
        </p>
      </fieldset>

      <div v-if="method === 'bank'" class="grid gap-4 sm:grid-cols-2">
        <div data-field="bank_account_name">
          <label :for="`${id}-account-name`" class="block text-sm font-medium text-slate-700">
            Bank account name<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-account-name`"
            v-model="bankAccountName"
            type="text"
            maxlength="150"
            autocomplete="off"
            :class="[inputClass, border('bank_account_name')]"
            :aria-invalid="errors.bank_account_name ? 'true' : undefined"
          />
          <p v-if="errors.bank_account_name" class="mt-1 text-sm text-red-700">
            {{ errors.bank_account_name }}
          </p>
        </div>
        <div data-field="bank_account_number">
          <label :for="`${id}-account-number`" class="block text-sm font-medium text-slate-700">
            Bank account number<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-account-number`"
            v-model="bankAccountNumber"
            type="text"
            inputmode="numeric"
            maxlength="40"
            autocomplete="off"
            :class="[inputClass, border('bank_account_number'), 'tabular-nums']"
            :aria-invalid="errors.bank_account_number ? 'true' : undefined"
          />
          <p v-if="errors.bank_account_number" class="mt-1 text-sm text-red-700">
            {{ errors.bank_account_number }}
          </p>
        </div>
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

      <MobileBankingFields
        v-if="method === 'mobile_banking'"
        v-model:provider="mobileProvider"
        v-model:number="mobileNumber"
        :errors="errors"
      />

      <div v-if="method" data-field="amount">
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
          v-else-if="method === 'cash' && cash?.settings.value?.cash_in_hand !== undefined"
          class="mt-1 text-right text-xs text-muted"
          data-cash-hint
        >
          Closing Cash on Hand: ৳ {{ formatMoney(cash.settings.value.cash_in_hand!) }}
        </p>
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
