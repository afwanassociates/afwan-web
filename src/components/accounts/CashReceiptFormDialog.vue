<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import {
  createCashReceipt,
  fetchReceiptOptions,
  getOwnerLoans,
  searchParties,
  updateCashReceipt,
} from '@/api/accounts'
import MobileBankingFields from '@/components/accounts/MobileBankingFields.vue'
import { checkMobileBanking, formatMoney, parseAmount } from '@/lib/accounts'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { CountryOption } from '@/types/country'
import type {
  BusinessType,
  CashReceipt,
  CashReceiptType,
  MobileBankingProvider,
  OwnerLoan,
  Party,
  PartyType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Cash receive form. "Received from" picks a party or an owner; their name, mobile and
 * address come from the party record (shown read only), so the ledger always points at one
 * real person. A party's money is a payment against what they owe; an owner's money is either
 * capital, or the return of a loan the company gave them (choosing the open loan, no more than
 * is outstanding);
 * the money came as cash in hand, into a bank (naming the bank, branch and account), or by
 * mobile banking (bKash, Nagad…). The amount is asked for once "Received via" is chosen.
 * A party's money also names the business it is for (recruitment by default; land, solar,
 * railway) and, for recruitment, the country (starting at the default country).
 * `receipt` null records a new one, optionally for `presetParty` (and `presetLoan`: a loan
 * return of that loan).
 */
type Payer = Pick<Party, 'id' | 'code' | 'type' | 'name' | 'mobile' | 'address'>

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  receipt: CashReceipt | null
  presetParty?: Payer | null
  presetLoanId?: number | null
}>()
const emit = defineEmits<{ saved: [receipt: CashReceipt, created: boolean] }>()

const id = useId()

const partyType = ref<PartyType>('client')
const party = ref<Payer | null>(null)
const receiptType = ref<CashReceiptType>('cash')
const businessType = ref<BusinessType>('recruitment')
const countryCode = ref('')
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

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'land', label: 'Land' },
  { value: 'solar', label: 'Solar' },
  { value: 'railway', label: 'Railway' },
]

/** Active countries and the default country, loaded once the form first opens. */
const countries = ref<CountryOption[]>([])
const defaultCountry = ref('')
let optionsLoaded = false

async function loadOptions() {
  if (optionsLoaded) return
  try {
    const options = await fetchReceiptOptions()
    optionsLoaded = true
    countries.value = options.countries
    defaultCountry.value = options.default_country.code
    if (open.value && !countryCode.value && !props.receipt?.country) {
      countryCode.value = defaultCountry.value
    }
  } catch {
    // The country field shows its own error on save; the rest of the form still works.
  }
}

/** The list, plus an edited receipt's country if it has been deactivated since. */
const countryOptions = computed(() => {
  const current = props.receipt?.country
  if (!current || countries.value.some((c) => c.code === current.code)) return countries.value
  return [{ ...current, is_pinned: false }, ...countries.value]
})

const isEdit = computed(() => props.receipt !== null)
const title = computed(() =>
  isEdit.value ? `Edit receipt ${props.receipt!.receipt_no}` : 'Cash receive',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  const r = props.receipt
  const preset = r?.party ?? props.presetParty ?? null
  partyType.value = preset?.type ?? 'client'
  party.value = preset
  receiptType.value = r?.receipt_type ?? (props.presetLoanId ? 'loan_return' : 'cash')
  loanId.value = r?.owner_loan?.id ?? props.presetLoanId ?? ''
  businessType.value = r?.business_type ?? 'recruitment'
  countryCode.value = r?.country?.code ?? defaultCountry.value
  amount.value = r ? r.amount.toFixed(2) : ''
  date.value = r?.date ?? businessToday()
  method.value = r?.payment_method ?? ''
  bankName.value = r?.bank_name ?? ''
  bankBranch.value = r?.bank_branch ?? ''
  bankAccountName.value = r?.bank_account_name ?? ''
  bankAccountNumber.value = r?.bank_account_number ?? ''
  mobileProvider.value = r?.mobile_provider ?? ''
  mobileNumber.value = r?.mobile_number ?? ''
  note.value = r?.note ?? ''
  errors.value = {}
  banner.value = null
  void loadOptions()
})

function setPartyType(type: PartyType) {
  if (partyType.value === type) return
  partyType.value = type
  party.value = null
  receiptType.value = 'cash'
  loanId.value = ''
}

/* Owner loan return: the loan it settles, from the owner's open loans. */
const loanId = ref<number | ''>('')
const ownerLoans = ref<OwnerLoan[] | null>(null)
const loansError = ref<string | null>(null)
const isLoanReturn = computed(
  () => partyType.value === 'owner' && receiptType.value === 'loan_return',
)
/** What may still be returned on a loan: outstanding less returns and bills waiting approval. */
const available = (l: OwnerLoan) =>
  Math.max(0, Math.round((l.outstanding - l.pending_returned - l.pending_billed) * 100) / 100)
const openLoans = computed(() =>
  (ownerLoans.value ?? []).filter((l) => available(l) > 0 || l.id === loanId.value),
)
const chosenLoan = computed(() => openLoans.value.find((l) => l.id === loanId.value) ?? null)

let loansRequest = 0
watch(
  () => [open.value, isLoanReturn.value, party.value?.id] as const,
  async ([isOpen, isReturn, ownerId]) => {
    ownerLoans.value = null
    loansError.value = null
    if (!isOpen || !isReturn || !ownerId) return
    const request = ++loansRequest
    try {
      const report = await getOwnerLoans({ party_id: ownerId, for_receipt: props.receipt?.id })
      if (request !== loansRequest) return
      ownerLoans.value = report.data
      if (loanId.value !== '' && !openLoans.value.some((l) => l.id === loanId.value)) {
        loanId.value = ''
      }
      if (loanId.value === '' && openLoans.value.length === 1) {
        loanId.value = openLoans.value[0]!.id
      }
    } catch (error) {
      if (request === loansRequest && errorStatus(error) !== 401) {
        loansError.value = errorMessage(error, 'Could not load the loans of this owner.')
      }
    }
  },
)

const fetchPayers = (q: string): Promise<Payer[]> => searchParties(partyType.value, q)
const payerSubtitle = (p: Payer) => `${p.code} · ${p.mobile}`

/** What this receipt will do in the books, in plain words. */
const effect = computed(() => {
  if (partyType.value === 'client') return 'A payment against what the party owes us (Cr).'
  return receiptType.value === 'loan_return'
    ? 'The owner gives back money the company lent them: it settles that loan (Cr).'
    : 'Money the owner puts into the company: capital (Cr).'
})

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!party.value) e.party_id = `Choose the ${partyType.value === 'owner' ? 'owner' : 'party'}.`
  const isClient = partyType.value === 'client'
  const isRecruitment = isClient && businessType.value === 'recruitment'
  if (isRecruitment && !countryCode.value) e.country_code = 'Choose the country.'
  if (!date.value) e.date = 'Choose the date.'
  const parsed = parseAmount(amount.value)
  if (!method.value) e.payment_method = 'Choose how the money was received.'
  else if (parsed.error) e.amount = parsed.error
  if (isLoanReturn.value && party.value) {
    if (loanId.value === '') e.owner_loan_id = 'Choose the loan being returned.'
    else if (
      method.value &&
      chosenLoan.value &&
      parsed.amount &&
      parsed.amount > available(chosenLoan.value)
    )
      e.amount = `Only ৳ ${formatMoney(available(chosenLoan.value))} is outstanding on loan ${chosenLoan.value.payment_no}.`
  }
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
    party_type: partyType.value,
    party_id: party.value!.id,
    receipt_type: isClient ? ('cash' as const) : receiptType.value,
    owner_loan_id: isLoanReturn.value && loanId.value !== '' ? loanId.value : null,
    business_type: isClient ? businessType.value : null,
    country_code: isRecruitment ? countryCode.value : null,
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
    const saved = props.receipt
      ? await updateCashReceipt(props.receipt.id, payload)
      : await createCashReceipt(payload)
    emit('saved', saved, !props.receipt)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'You do not have permission to record receipts.'
    } else if (errorStatus(error) !== 401) {
      banner.value = errorMessage(error, 'Could not save the receipt. Please try again.')
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
      <fieldset data-field="party_type">
        <legend class="block text-sm font-medium text-slate-700">Received from</legend>
        <div class="mt-1 flex gap-2">
          <button
            v-for="option in [
              { value: 'client', label: 'Party / Client' },
              { value: 'owner', label: 'Company owner' },
            ] as const"
            :key="option.value"
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            :class="segment(partyType === option.value)"
            :aria-pressed="partyType === option.value"
            :data-party-type="option.value"
            @click="setPartyType(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </fieldset>

      <div data-field="party_id">
        <SearchSelect
          :key="partyType"
          v-model="party"
          :fetch="fetchPayers"
          :label="partyType === 'owner' ? 'Owner' : 'Party'"
          placeholder="Search name, ID or mobile"
          :subtitle-of="payerSubtitle"
          :error="errors.party_id"
          required
        />
      </div>

      <dl
        v-if="party"
        class="grid gap-x-4 gap-y-1 rounded-lg bg-primary-50/60 p-3 text-sm sm:grid-cols-[auto_1fr]"
        data-payer
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

      <template v-if="partyType === 'client'">
        <fieldset data-field="business_type">
          <legend class="block text-sm font-medium text-slate-700">
            Business<span class="text-red-700" aria-hidden="true"> *</span>
          </legend>
          <div class="mt-1 flex flex-wrap gap-2">
            <button
              v-for="option in BUSINESS_TYPES"
              :key="option.value"
              type="button"
              class="rounded-full px-4 py-2 text-sm font-semibold"
              :class="segment(businessType === option.value)"
              :aria-pressed="businessType === option.value"
              :data-business="option.value"
              @click="businessType = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <p v-if="errors.business_type" class="mt-1 text-sm text-red-700">
            {{ errors.business_type }}
          </p>
        </fieldset>

        <div v-if="businessType === 'recruitment'" data-field="country_code">
          <label :for="`${id}-country`" class="block text-sm font-medium text-slate-700">
            Country<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <select
            :id="`${id}-country`"
            v-model="countryCode"
            required
            :class="[inputClass, border('country_code')]"
            :aria-invalid="errors.country_code ? 'true' : undefined"
          >
            <option value="" disabled>Choose the country</option>
            <option v-for="country in countryOptions" :key="country.code" :value="country.code">
              {{ country.name }}
            </option>
          </select>
          <p v-if="errors.country_code" class="mt-1 text-sm text-red-700">
            {{ errors.country_code }}
          </p>
        </div>
      </template>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset v-if="partyType === 'owner'" data-field="receipt_type">
          <legend class="block text-sm font-medium text-slate-700">Money is</legend>
          <div class="mt-2 flex flex-wrap gap-4">
            <label class="flex items-center gap-2">
              <input v-model="receiptType" type="radio" value="cash" :name="`${id}-rtype`" />
              Capital
            </label>
            <label class="flex items-center gap-2">
              <input v-model="receiptType" type="radio" value="loan_return" :name="`${id}-rtype`" />
              Loan return
            </label>
          </div>
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
      <p class="-mt-2 text-xs text-muted" data-effect>{{ effect }}</p>

      <div v-if="isLoanReturn && party" data-field="owner_loan_id">
        <label :for="`${id}-loan`" class="block text-sm font-medium text-slate-700">
          Loan being returned<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <p v-if="loansError" class="mt-1 text-sm text-red-700">{{ loansError }}</p>
        <p v-else-if="ownerLoans === null" class="mt-1 text-sm text-muted">Loading loans…</p>
        <p
          v-else-if="openLoans.length === 0"
          class="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-no-loans
        >
          {{ party.name }} has no open loans, so there is nothing to return.
        </p>
        <template v-else>
          <select
            :id="`${id}-loan`"
            v-model="loanId"
            :class="[inputClass, border('owner_loan_id')]"
            :aria-invalid="errors.owner_loan_id ? 'true' : undefined"
          >
            <option value="" disabled>Choose a loan</option>
            <option v-for="l in openLoans" :key="l.id" :value="l.id">
              {{ l.payment_no }} · {{ toDisplayDate(l.date) }} · ৳ {{ formatMoney(l.amount) }} ·
              outstanding ৳ {{ formatMoney(available(l)) }}
            </option>
          </select>
          <p v-if="chosenLoan" class="mt-1 text-xs text-muted" data-loan-hint>
            Loan ৳ {{ formatMoney(chosenLoan.amount) }} · returned ৳
            {{ formatMoney(chosenLoan.returned) }} · bills ৳ {{ formatMoney(chosenLoan.billed)
            }}<template v-if="chosenLoan.pending_returned + chosenLoan.pending_billed > 0">
              (+ ৳
              {{ formatMoney(chosenLoan.pending_returned + chosenLoan.pending_billed) }} waiting
              approval)</template
            >. Up to ৳ {{ formatMoney(available(chosenLoan)) }} can be returned.
          </p>
        </template>
        <p v-if="errors.owner_loan_id" class="mt-1 text-sm text-red-700">
          {{ errors.owner_loan_id }}
        </p>
      </div>

      <fieldset data-field="payment_method">
        <legend class="block text-sm font-medium text-slate-700">
          Received via<span class="text-red-700" aria-hidden="true"> *</span>
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
        <p v-if="errors.amount" class="mt-1 text-sm text-red-700">{{ errors.amount }}</p>
        <p v-else-if="parseAmount(amount).amount" class="mt-1 text-right text-xs text-muted">
          ৳ {{ formatMoney(parseAmount(amount).amount!) }}
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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Save receipt' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
