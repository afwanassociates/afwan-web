<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import ReferenceTypeToggle from '@/components/ReferenceTypeToggle.vue'
import { createParty, updateParty } from '@/api/accounts'
import {
  MOBILE_PATTERN,
  OWNER_DESIGNATIONS,
  PARTY_TYPE_LABELS,
  formatMoney,
  parseAmount,
} from '@/lib/accounts'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { BalanceType, OwnerDesignation, Party, PartyKind, PartyType } from '@/types/accounts'

/**
 * Create / edit a party or owner. The party ID (PT-0001, OW-001) is given by the server and
 * the type is chosen once, on create. `party` null creates one of type `defaultType`.
 *
 * A client is an agency (with an RL number and an agency owner) or a person, and is also the
 * reference of the passports it gives: data entry adds clients with only a name and phone,
 * so a client's address and NID / passport are optional. Owners need every field.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ party: Party | null; defaultType: PartyType }>()
const emit = defineEmits<{ saved: [party: Party, created: boolean] }>()

const id = useId()

const type = ref<PartyType>('client')
const kind = ref<PartyKind>('agency')
const rlNumber = ref('')
const name = ref('')
const agencyOwnerName = ref('')
const designation = ref<OwnerDesignation | ''>('')
const mobile = ref('')
const address = ref('')
const nidPassport = ref('')
const tinBin = ref('')
const notes = ref('')
const openingBalance = ref<string | number>('')
const openingBalanceType = ref<BalanceType>('receivable')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => props.party !== null)
const isClient = computed(() => type.value === 'client')
/** Only agencies have an RL number and an agency owner. */
const isAgency = computed(() => isClient.value && kind.value === 'agency')
const title = computed(() =>
  isEdit.value
    ? `Edit ${props.party!.code}`
    : `New ${type.value === 'owner' ? 'owner' : 'Party / Client'}`,
)

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.party
  type.value = p?.type ?? props.defaultType
  kind.value = p?.kind ?? 'agency'
  rlNumber.value = p?.rl_number ?? ''
  name.value = p?.name ?? ''
  designation.value = p?.designation ?? ''
  mobile.value = p?.mobile ?? ''
  address.value = p?.address ?? ''
  nidPassport.value = p?.nid_passport ?? ''
  agencyOwnerName.value = p?.agency_owner_name ?? ''
  tinBin.value = p?.tin_bin ?? ''
  notes.value = p?.notes ?? ''
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
  if (isAgency.value && !squish(rlNumber.value)) e.rl_number = 'Enter the RL number of the agency.'
  if (!squish(name.value)) e.name = isAgency.value ? 'Enter the agency name.' : 'Enter the name.'
  if (!isClient.value && !designation.value) e.designation = 'Choose the designation.'
  if (!squish(mobile.value))
    e.mobile = isAgency.value ? "Enter the agency's mobile number." : 'Enter the mobile number.'
  else if (!MOBILE_PATTERN.test(squish(mobile.value)))
    e.mobile = 'Enter a valid mobile number (digits, spaces or dashes, optional +).'
  if (!isClient.value && !squish(address.value)) e.address = 'Enter the address.'
  if (!isClient.value && !nidPassport.value.trim())
    e.nid_passport = 'Enter the NID or passport number.'
  const opening = parseAmount(openingBalance.value, { allowZero: true })
  if (opening.error) e.opening_balance = opening.error
  errors.value = e
  if (Object.keys(e).length > 0) return

  const payload = {
    ...(isClient.value ? { kind: kind.value } : { designation: designation.value || undefined }),
    rl_number: isAgency.value ? squish(rlNumber.value).toUpperCase() : null,
    name: squish(name.value),
    mobile: squish(mobile.value),
    address: squish(address.value) || null,
    agency_owner_name: isAgency.value ? squish(agencyOwnerName.value) || null : null,
    nid_passport: nidPassport.value.replace(/\s+/g, '').toUpperCase() || null,
    tin_bin: squish(tinBin.value) || null,
    notes: notes.value.trim() || null,
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

/**
 * Fields in form order: [key, label, required, autocomplete]. An agency also has the agency
 * owner's name, and its NID / passport is the agency owner's. A client's address and NID /
 * passport are optional (data entry adds clients with only a name and phone).
 */
const textFields = computed(
  () =>
    [
      ['rl_number', 'RL Number', true, 'off'],
      ['name', isAgency.value ? 'Agency Name' : 'Name', true, 'off'],
      ['mobile', isAgency.value ? 'Agency Mobile' : 'Mobile', true, 'off'],
      [
        'address',
        isAgency.value
          ? 'Agency Address (optional)'
          : isClient.value
            ? 'Address (optional)'
            : 'Address',
        !isClient.value,
        'off',
      ],
      ['tin_bin', 'TIN / BIN (optional)', false, 'off'],
      ['agency_owner_name', 'Agency owner name (optional)', false, 'off'],
      [
        'nid_passport',
        isAgency.value
          ? 'Agency owner NID / Passport (optional)'
          : isClient.value
            ? 'NID / Passport (optional)'
            : 'NID / Passport',
        !isClient.value,
        'off',
      ],
    ] as const,
)
/** A hint in each empty field: what to type, with an example. */
const placeholders = computed<Record<string, string>>(() => ({
  rl_number: 'e.g. RL 1234',
  name: isAgency.value
    ? 'e.g. Karim Overseas'
    : isClient.value
      ? 'e.g. Md Abdul Karim'
      : "Owner's full name",
  mobile: 'e.g. 01711-000000',
  address: 'e.g. House 7, Road 45, Gulshan-2, Dhaka',
  tin_bin: 'e.g. 123456789012',
  agency_owner_name: 'e.g. Md Abdul Karim',
  nid_passport: 'NID or passport number',
}))
/** Agencies only: the RL number and the agency owner. */
const AGENCY_ONLY = ['rl_number', 'agency_owner_name'] as const
const visibleFields = computed(() =>
  textFields.value.filter(
    ([key]) => isAgency.value || !(AGENCY_ONLY as readonly string[]).includes(key),
  ),
)
const models = {
  rl_number: rlNumber,
  name,
  agency_owner_name: agencyOwnerName,
  mobile,
  address,
  nid_passport: nidPassport,
  tin_bin: tinBin,
}
</script>

<template>
  <!-- Wide, with the fields in columns, so the whole form and its buttons fit on one screen. -->
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving" wide>
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form
      class="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3"
      novalidate
      @submit.prevent="save"
    >
      <fieldset v-if="!isEdit" class="sm:col-span-2 lg:col-span-3" data-field="type">
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
      <p v-else class="text-sm text-muted sm:col-span-2 lg:col-span-3">
        {{ party!.type_label }} · ID <strong class="text-ink">{{ party!.code }}</strong>
      </p>

      <div v-if="isClient" class="sm:col-span-2 lg:col-span-3" data-field="kind">
        <ReferenceTypeToggle v-model="kind" label="Agency or person" />
        <p class="mt-1 text-xs text-muted">
          An agency has an RL number; a person does not. The passport team sees this party as a
          reference.
        </p>
        <p v-if="errors.kind" class="mt-1 text-sm text-red-700">{{ errors.kind }}</p>
      </div>

      <div
        v-for="[key, label, required, autocomplete] in visibleFields"
        :key="key"
        :data-field="key"
      >
        <label :for="`${id}-${key}`" class="block text-sm font-medium text-slate-700">
          {{ label }}<span v-if="required" class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${id}-${key}`"
          v-model="models[key].value"
          type="text"
          :inputmode="key === 'mobile' ? 'tel' : undefined"
          :placeholder="placeholders[key]"
          :autocomplete="autocomplete"
          :required="required"
          :maxlength="
            key === 'address' ? 500 : key === 'name' || key === 'agency_owner_name' ? 150 : 50
          "
          :class="[inputClass, border(key)]"
          :aria-invalid="errors[key] ? 'true' : undefined"
          :aria-describedby="describedBy(key)"
        />
        <p v-if="errors[key]" :id="`${id}-${key}-error`" class="mt-1 text-sm text-red-700">
          {{ errors[key] }}
        </p>
      </div>

      <div v-if="!isClient" data-field="designation">
        <label :for="`${id}-designation`" class="block text-sm font-medium text-slate-700">
          Designation<span class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <select
          :id="`${id}-designation`"
          v-model="designation"
          required
          :class="[inputClass, border('designation')]"
          :aria-invalid="errors.designation ? 'true' : undefined"
          :aria-describedby="describedBy('designation')"
        >
          <option value="" disabled>Choose…</option>
          <option v-for="d in OWNER_DESIGNATIONS" :key="d.value" :value="d.value">
            {{ d.label }}
          </option>
        </select>
        <p
          v-if="errors.designation"
          :id="`${id}-designation-error`"
          class="mt-1 text-sm text-red-700"
        >
          {{ errors.designation }}
        </p>
      </div>

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
      <div class="sm:col-span-2 lg:col-span-3" data-field="notes">
        <label :for="`${id}-notes`" class="block text-sm font-medium text-slate-700">
          Notes (optional)
        </label>
        <textarea
          :id="`${id}-notes`"
          v-model="notes"
          rows="2"
          maxlength="2000"
          :class="[inputClass, border('notes')]"
          :aria-invalid="errors.notes ? 'true' : undefined"
          :aria-describedby="describedBy('notes')"
        />
        <p v-if="errors.notes" :id="`${id}-notes-error`" class="mt-1 text-sm text-red-700">
          {{ errors.notes }}
        </p>
      </div>

      <p v-if="isEdit && party!.totals" class="text-xs text-muted sm:col-span-2 lg:col-span-3">
        Current closing balance: {{ formatMoney(Math.abs(party!.totals.closing_balance)) }}
        {{ party!.totals.closing_balance >= 0 ? 'Dr' : 'Cr' }}. Changing the opening balance changes
        it too.
      </p>

      <div
        class="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-3"
      >
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
