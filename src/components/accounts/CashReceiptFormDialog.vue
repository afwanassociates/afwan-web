<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createCashReceipt, searchParties, updateCashReceipt } from '@/api/accounts'
import { formatMoney, parseAmount } from '@/lib/accounts'
import { businessToday } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type {
  CashReceipt,
  CashReceiptType,
  Party,
  PartyType,
  PaymentMethod,
} from '@/types/accounts'

/**
 * Cash receive form. "Received from" picks a party or an owner; their name, mobile and
 * address come from the party record (shown read only), so the ledger always points at one
 * real person. Type is cash or loan; the money came as cash in hand or into a bank.
 * `receipt` null records a new one, optionally for `presetParty`.
 */
type Payer = Pick<Party, 'id' | 'code' | 'type' | 'name' | 'mobile' | 'address'>

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ receipt: CashReceipt | null; presetParty?: Payer | null }>()
const emit = defineEmits<{ saved: [receipt: CashReceipt, created: boolean] }>()

const id = useId()

const partyType = ref<PartyType>('client')
const party = ref<Payer | null>(null)
const receiptType = ref<CashReceiptType>('cash')
const amount = ref<string | number>('')
const date = ref('')
const method = ref<PaymentMethod>('cash')
const bankName = ref('')
const bankBranch = ref('')
const note = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

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
  receiptType.value = r?.receipt_type ?? 'cash'
  amount.value = r ? r.amount.toFixed(2) : ''
  date.value = r?.date ?? businessToday()
  method.value = r?.payment_method ?? 'cash'
  bankName.value = r?.bank_name ?? ''
  bankBranch.value = r?.bank_branch ?? ''
  note.value = r?.note ?? ''
  errors.value = {}
  banner.value = null
})

function setPartyType(type: PartyType) {
  if (partyType.value === type) return
  partyType.value = type
  party.value = null
}

const fetchPayers = (q: string): Promise<Payer[]> => searchParties(partyType.value, q)
const payerSubtitle = (p: Payer) => `${p.code} · ${p.mobile}`

/** What this receipt will do in the books, in plain words. */
const effect = computed(() => {
  const who = partyType.value === 'owner' ? 'owner' : 'party'
  if (receiptType.value === 'loan') return `A loan from the ${who}: we owe it back (Cr).`
  return partyType.value === 'owner'
    ? 'Capital paid in by the owner (Cr).'
    : 'A payment against what the party owes us (Cr).'
})

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!party.value) e.party_id = `Choose the ${partyType.value === 'owner' ? 'owner' : 'party'}.`
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
    party_type: partyType.value,
    party_id: party.value!.id,
    receipt_type: receiptType.value,
    amount: parsed.amount!,
    payment_method: method.value,
    bank_name: isBank ? squish(bankName.value) : null,
    bank_branch: isBank ? squish(bankBranch.value) : null,
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

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset data-field="receipt_type">
          <legend class="block text-sm font-medium text-slate-700">Type</legend>
          <div class="mt-2 flex gap-4">
            <label class="flex items-center gap-2">
              <input v-model="receiptType" type="radio" value="cash" :name="`${id}-rtype`" /> Cash
            </label>
            <label class="flex items-center gap-2">
              <input v-model="receiptType" type="radio" value="loan" :name="`${id}-rtype`" /> Loan
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
        <p v-if="errors.amount" class="mt-1 text-sm text-red-700">{{ errors.amount }}</p>
        <p v-else-if="parseAmount(amount).amount" class="mt-1 text-right text-xs text-muted">
          ৳ {{ formatMoney(parseAmount(amount).amount!) }}
        </p>
      </div>

      <fieldset data-field="payment_method">
        <legend class="block text-sm font-medium text-slate-700">Received via</legend>
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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Save receipt' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
