<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createParty, updateParty } from '@/api/accounts'
import { MOBILE_PATTERN, PARTY_TYPE_LABELS, formatMoney, parseAmount } from '@/lib/accounts'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { BalanceType, Party, PartyType } from '@/types/accounts'

/**
 * Create / edit a party or owner. The party ID (PT-0001, OW-001) is given by the server and
 * the type is chosen once, on create. `party` null creates one of type `defaultType`.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ party: Party | null; defaultType: PartyType }>()
const emit = defineEmits<{ saved: [party: Party, created: boolean] }>()

const id = useId()

const type = ref<PartyType>('client')
const name = ref('')
const mobile = ref('')
const address = ref('')
const nidPassport = ref('')
const tinBin = ref('')
const openingBalance = ref<string | number>('')
const openingBalanceType = ref<BalanceType>('receivable')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.party !== null)
const title = computed(() =>
  isEdit.value
    ? `Edit ${props.party!.code}`
    : `New ${type.value === 'owner' ? 'owner' : 'party / client'}`,
)

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.party
  type.value = p?.type ?? props.defaultType
  name.value = p?.name ?? ''
  mobile.value = p?.mobile ?? ''
  address.value = p?.address ?? ''
  nidPassport.value = p?.nid_passport ?? ''
  tinBin.value = p?.tin_bin ?? ''
  openingBalance.value = p && p.opening_balance > 0 ? p.opening_balance.toFixed(2) : ''
  openingBalanceType.value = p?.opening_balance_type ?? 'receivable'
  errors.value = {}
  banner.value = null
})

const squish = (value: string) => value.trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!squish(name.value)) e.name = 'Enter the name.'
  if (!squish(mobile.value)) e.mobile = 'Enter the mobile number.'
  else if (!MOBILE_PATTERN.test(squish(mobile.value)))
    e.mobile = 'Enter a valid mobile number (digits, spaces or dashes, optional +).'
  if (!squish(address.value)) e.address = 'Enter the address.'
  if (!nidPassport.value.trim()) e.nid_passport = 'Enter the NID or passport number.'
  const opening = parseAmount(openingBalance.value, { allowZero: true })
  if (opening.error) e.opening_balance = opening.error
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    name: squish(name.value),
    mobile: squish(mobile.value),
    address: squish(address.value),
    nid_passport: nidPassport.value.replace(/\s+/g, '').toUpperCase(),
    tin_bin: squish(tinBin.value) || null,
    opening_balance: opening.amount!,
    opening_balance_type: openingBalanceType.value,
  }
  isSaving.value = true
  try {
    const saved = props.party
      ? await updateParty(props.party.id, payload)
      : await createParty({ ...payload, type: type.value })
    emit('saved', saved, !props.party)
    open.value = false
  } catch (error) {
    if (errorStatus(error) === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (errorStatus(error) === 403) {
      banner.value = 'You do not have permission to manage parties.'
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
const describedBy = (field: string) => (errors.value[field] ? `${id}-${field}-error` : undefined)

/** Fields in form order: [key, label, required, autocomplete]. */
const textFields = [
  ['name', 'Name', true, 'off'],
  ['mobile', 'Mobile', true, 'off'],
  ['address', 'Address', true, 'off'],
  ['nid_passport', 'NID / Passport', true, 'off'],
  ['tin_bin', 'TIN / BIN (optional)', false, 'off'],
] as const
const models = { name, mobile, address, nid_passport: nidPassport, tin_bin: tinBin }
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
      <fieldset v-if="!isEdit" data-field="type">
        <legend class="block text-sm font-medium text-slate-700">Type</legend>
        <div class="mt-1 flex gap-4">
          <label
            v-for="(label, value) in PARTY_TYPE_LABELS"
            :key="value"
            class="flex items-center gap-2"
          >
            <input v-model="type" type="radio" :value="value" :name="`${id}-type`" />
            {{ label }}
          </label>
        </div>
        <p class="mt-1 text-xs text-muted">
          The ID is given automatically ({{ type === 'owner' ? 'OW-001' : 'PT-0001' }}, …) and
          cannot be changed later.
        </p>
      </fieldset>
      <p v-else class="text-sm text-muted">
        {{ party!.type_label }} · ID <strong class="text-ink">{{ party!.code }}</strong>
      </p>

      <div v-for="[key, label, required, autocomplete] in textFields" :key="key" :data-field="key">
        <label :for="`${id}-${key}`" class="block text-sm font-medium text-slate-700">
          {{ label }}<span v-if="required" class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${id}-${key}`"
          v-model="models[key].value"
          type="text"
          :inputmode="key === 'mobile' ? 'tel' : undefined"
          :autocomplete="autocomplete"
          :required="required"
          :maxlength="key === 'address' ? 500 : key === 'name' ? 150 : 50"
          :class="[inputClass, border(key)]"
          :aria-invalid="errors[key] ? 'true' : undefined"
          :aria-describedby="describedBy(key)"
        />
        <p v-if="errors[key]" :id="`${id}-${key}-error`" class="mt-1 text-sm text-red-700">
          {{ errors[key] }}
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="opening_balance">
          <label :for="`${id}-opening`" class="block text-sm font-medium text-slate-700">
            Opening balance
          </label>
          <input
            :id="`${id}-opening`"
            v-model="openingBalance"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            :class="[inputClass, border('opening_balance'), 'text-right tabular-nums']"
            :aria-invalid="errors.opening_balance ? 'true' : undefined"
            :aria-describedby="describedBy('opening_balance')"
          />
          <p
            v-if="errors.opening_balance"
            :id="`${id}-opening_balance-error`"
            class="mt-1 text-sm text-red-700"
          >
            {{ errors.opening_balance }}
          </p>
        </div>
        <div data-field="opening_balance_type">
          <label :for="`${id}-side`" class="block text-sm font-medium text-slate-700">
            Balance side
          </label>
          <select
            :id="`${id}-side`"
            v-model="openingBalanceType"
            :class="[inputClass, 'border-slate-300']"
          >
            <option value="receivable">Receivable (they owe us · Dr)</option>
            <option value="payable">Payable (we owe them · Cr)</option>
          </select>
        </div>
      </div>
      <p v-if="isEdit && party!.totals" class="text-xs text-muted">
        Current closing balance: {{ formatMoney(Math.abs(party!.totals.closing_balance)) }}
        {{ party!.totals.closing_balance >= 0 ? 'Dr' : 'Cr' }}. Changing the opening balance changes
        it too.
      </p>

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
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
