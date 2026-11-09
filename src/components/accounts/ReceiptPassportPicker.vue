<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { fetchPartyPassports } from '@/api/accounts'
import { formatMoney, parseAmount, passportPaymentBadge } from '@/lib/accounts'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { PartyPassport, PartyPassportGroups } from '@/types/accounts'

/**
 * "What this money pays for" on a party's recruitment cash receipt: the party's passports of
 * the receipt's country, by company. Ticking passports of a company asks for the amount
 * received for that company (typed, no fixed rate) and whether it pays them off (full
 * payment) or is a part payment, after which more receipts may pay them. Passports paid off
 * by another receipt (approved or waiting) show that receipt and cannot be ticked;
 * when editing, the receipt's own passports are ticked and may be unticked.
 *
 * v-model: per company id, the ticked passport ids and the typed amount.
 */
export type PassportSelection = Record<
  number,
  { passportIds: number[]; amount: string; fullPayment: boolean }
>

const selection = defineModel<PassportSelection>({ required: true })
const props = defineProps<{
  partyId: number
  countryCode: string
  receiptId: number | null
  /** Errors per company id (amount or passports). */
  errors: Record<number, string>
}>()
const emit = defineEmits<{ loaded: [groups: PartyPassportGroups['data']] }>()

const id = useId()
const groups = ref<PartyPassportGroups['data'] | null>(null)
const loadError = ref<string | null>(null)
/** Companies whose passport list is open. */
const expanded = ref(new Set<number>())

const selectable = (p: PartyPassport) => p.can_tick

let request = 0
watch(
  () => [props.partyId, props.countryCode, props.receiptId] as const,
  async ([partyId, country, receiptId]) => {
    const current = ++request
    groups.value = null
    loadError.value = null
    if (!country) return
    try {
      const result = await fetchPartyPassports(partyId, {
        country_code: country,
        ...(receiptId ? { receipt_id: receiptId } : {}),
      })
      if (current !== request) return
      groups.value = result.data
      // Keep only ticks that are still possible; open the companies with something to tick.
      const next: PassportSelection = {}
      for (const group of result.data) {
        const allowed = new Set(group.passports.filter(selectable).map((p) => p.id))
        const picked = selection.value[group.company.id]
        if (picked) {
          const ids = picked.passportIds.filter((pid) => allowed.has(pid))
          if (ids.length > 0) next[group.company.id] = { ...picked, passportIds: ids }
        }
      }
      selection.value = next
      expanded.value = new Set(
        result.data
          .filter((g) => next[g.company.id] || g.passports.some(selectable))
          .map((g) => g.company.id),
      )
      emit('loaded', result.data)
    } catch (error) {
      if (current === request && errorStatus(error) !== 401) {
        loadError.value = errorMessage(error, 'Could not load the passports of this party.')
      }
    }
  },
  { immediate: true },
)

function toggleCompany(companyId: number) {
  const next = new Set(expanded.value)
  if (!next.delete(companyId)) next.add(companyId)
  expanded.value = next
}

function setPicked(companyId: number, ids: number[]) {
  const next = { ...selection.value }
  if (ids.length === 0) delete next[companyId]
  else
    next[companyId] = {
      passportIds: ids,
      amount: next[companyId]?.amount ?? '',
      fullPayment: next[companyId]?.fullPayment ?? false,
    }
  selection.value = next
}

function togglePassport(companyId: number, passportId: number, checked: boolean) {
  const ids = selection.value[companyId]?.passportIds ?? []
  setPicked(companyId, checked ? [...ids, passportId] : ids.filter((pid) => pid !== passportId))
}

const tickable = (companyId: number) =>
  groups.value?.find((g) => g.company.id === companyId)?.passports.filter(selectable) ?? []

function toggleAll(companyId: number, checked: boolean) {
  setPicked(companyId, checked ? tickable(companyId).map((p) => p.id) : [])
}

const allTicked = (companyId: number) => {
  const all = tickable(companyId)
  const picked = selection.value[companyId]?.passportIds ?? []
  return all.length > 0 && all.every((p) => picked.includes(p.id))
}

function setFullPayment(companyId: number, fullPayment: boolean) {
  const picked = selection.value[companyId]
  if (!picked) return
  selection.value = { ...selection.value, [companyId]: { ...picked, fullPayment } }
}

function setAmount(companyId: number, amount: string) {
  const picked = selection.value[companyId]
  if (!picked) return
  selection.value = { ...selection.value, [companyId]: { ...picked, amount } }
}

const isTicked = (companyId: number, passportId: number) =>
  selection.value[companyId]?.passportIds.includes(passportId) ?? false

const tickedCount = computed(() =>
  Object.values(selection.value).reduce((sum, s) => sum + s.passportIds.length, 0),
)
const tickedTotal = computed(() =>
  Object.values(selection.value).reduce((sum, s) => sum + (parseAmount(s.amount).amount ?? 0), 0),
)

const statusBadge = (p: PartyPassport) =>
  p.on_this_receipt && p.status !== 'part_paid'
    ? { text: 'On this receipt', cls: 'bg-primary-50 text-primary-800 ring-primary-200' }
    : passportPaymentBadge(p)

const inputClass =
  'block w-full rounded-lg border bg-white px-3 py-2 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <section class="rounded-xl border border-stroke p-4" data-passport-picker>
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold text-ink">Passports this money pays for</h3>
      <p v-if="tickedCount > 0" class="text-sm text-muted" data-picked-summary>
        {{ tickedCount }} passport{{ tickedCount === 1 ? '' : 's' }} · ৳
        {{ formatMoney(tickedTotal) }}
      </p>
    </div>
    <p class="mt-1 text-xs text-muted">
      Tick the passports and type the amount for each company. Leave all unticked for money that is
      not for particular passports.
    </p>

    <p v-if="loadError" class="mt-3 text-sm text-red-700" role="alert">{{ loadError }}</p>
    <p v-else-if="groups === null" class="mt-3 text-sm text-muted">Loading passports…</p>
    <p
      v-else-if="groups.length === 0"
      class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted"
      data-no-passports
    >
      This party has no passports for this country.
    </p>

    <ul v-else class="mt-3 space-y-3">
      <li
        v-for="group in groups"
        :key="group.company.id"
        class="rounded-lg border border-stroke"
        :data-company="group.company.id"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            class="flex items-center gap-2 text-left font-semibold text-primary-900"
            :aria-expanded="expanded.has(group.company.id) ? 'true' : 'false'"
            :aria-controls="`${id}-c${group.company.id}`"
            data-company-toggle
            @click="toggleCompany(group.company.id)"
          >
            <svg
              class="h-4 w-4 transition-transform motion-reduce:transition-none"
              :class="expanded.has(group.company.id) ? 'rotate-90' : ''"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 5l6 5-6 5V5z" />
            </svg>
            {{ group.company.name }}
          </button>
          <p class="text-xs text-muted" data-counts>
            {{ group.counts.total }} passports · {{ group.counts.paid }} paid
            <template v-if="group.counts.pending">· {{ group.counts.pending }} pending</template>
            <template v-if="group.counts.part_paid"
              >· {{ group.counts.part_paid }} part paid</template
            >
            · <span class="font-semibold text-ink">{{ group.counts.unpaid }} unpaid</span>
          </p>
        </div>

        <div v-if="expanded.has(group.company.id)" :id="`${id}-c${group.company.id}`">
          <label
            v-if="tickable(group.company.id).length > 1"
            class="flex items-center gap-2 border-t border-stroke px-3 py-2 text-sm font-medium"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-primary-700"
              :checked="allTicked(group.company.id)"
              data-tick-all
              @change="toggleAll(group.company.id, ($event.target as HTMLInputElement).checked)"
            />
            Tick all {{ tickable(group.company.id).length }} not paid off
          </label>
          <ul class="max-h-64 divide-y divide-stroke overflow-y-auto border-t border-stroke">
            <li v-for="p in group.passports" :key="p.id" :data-passport="p.id">
              <label
                class="flex items-center gap-3 px-3 py-2 text-sm"
                :class="selectable(p) ? 'cursor-pointer hover:bg-primary-50/50' : 'opacity-70'"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-primary-700"
                  :checked="isTicked(group.company.id, p.id)"
                  :disabled="!selectable(p) && !isTicked(group.company.id, p.id)"
                  @change="
                    togglePassport(
                      group.company.id,
                      p.id,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                <span class="w-12 font-mono text-xs text-muted">#{{ p.entry_no }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-ink">{{ p.passport_name }}</span>
                  <span class="block text-xs text-muted">
                    {{ p.passport_number }}<template v-if="p.stage"> · {{ p.stage }}</template>
                    <template v-if="p.is_deleted"> · deleted</template>
                  </span>
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1"
                  :class="statusBadge(p).cls"
                  data-status
                  >{{ statusBadge(p).text }}</span
                >
              </label>
            </li>
          </ul>
        </div>

        <div
          v-if="selection[group.company.id]"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke bg-primary-50/40 px-3 py-2"
          data-company-amount
        >
          <label :for="`${id}-a${group.company.id}`" class="text-sm font-medium text-slate-700">
            Amount for {{ selection[group.company.id]!.passportIds.length }} passport{{
              selection[group.company.id]!.passportIds.length === 1 ? '' : 's'
            }}<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="`${id}-a${group.company.id}`"
            :value="selection[group.company.id]!.amount"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            :class="[
              inputClass,
              'w-40 text-right tabular-nums',
              errors[group.company.id] ? 'border-red-500' : 'border-slate-300',
            ]"
            :aria-invalid="errors[group.company.id] ? 'true' : undefined"
            @input="setAmount(group.company.id, ($event.target as HTMLInputElement).value)"
          />
          <fieldset class="w-full" data-payment-kind>
            <legend class="sr-only">Full or part payment</legend>
            <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  class="h-4 w-4 accent-primary-700"
                  :name="`${id}-kind${group.company.id}`"
                  :checked="!selection[group.company.id]!.fullPayment"
                  data-part
                  @change="setFullPayment(group.company.id, false)"
                />
                Part payment
                <span class="text-xs text-muted">(more to come)</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  class="h-4 w-4 accent-primary-700"
                  :name="`${id}-kind${group.company.id}`"
                  :checked="selection[group.company.id]!.fullPayment"
                  data-full
                  @change="setFullPayment(group.company.id, true)"
                />
                Full payment
                <span class="text-xs text-muted">(paid off)</span>
              </label>
            </div>
          </fieldset>
        </div>
        <p
          v-if="errors[group.company.id]"
          class="border-t border-stroke px-3 py-2 text-sm text-red-700"
          data-company-error
        >
          {{ errors[group.company.id] }}
        </p>
      </li>
    </ul>
  </section>
</template>
