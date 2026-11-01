<script setup lang="ts">
import { computed, useId } from 'vue'
import { MOBILE_BANKING_PROVIDERS, walletLabel } from '@/lib/accounts'
import type { MobileBankingProvider } from '@/types/accounts'

/**
 * The mobile banking fields of a cash receipt or payment: the service (bKash, Nagad…)
 * and the wallet number, whose label follows the service ("bKash number").
 */
const provider = defineModel<MobileBankingProvider | ''>('provider', { required: true })
const number = defineModel<string>('number', { required: true })
defineProps<{ errors: Record<string, string> }>()

const id = useId()
const numberLabel = computed(() => walletLabel(provider.value))

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <div data-field="mobile_provider">
      <label :for="`${id}-provider`" class="block text-sm font-medium text-slate-700">
        Mobile banking service<span class="text-red-700" aria-hidden="true"> *</span>
      </label>
      <select
        :id="`${id}-provider`"
        v-model="provider"
        :class="[inputClass, errors.mobile_provider ? 'border-red-500' : 'border-slate-300']"
        :aria-invalid="errors.mobile_provider ? 'true' : undefined"
      >
        <option value="" disabled>Choose a service</option>
        <option v-for="p in MOBILE_BANKING_PROVIDERS" :key="p.value" :value="p.value">
          {{ p.label }}
        </option>
      </select>
      <p v-if="errors.mobile_provider" class="mt-1 text-sm text-red-700">
        {{ errors.mobile_provider }}
      </p>
    </div>
    <div data-field="mobile_number">
      <label :for="`${id}-wallet`" class="block text-sm font-medium text-slate-700">
        {{ numberLabel }}<span class="text-red-700" aria-hidden="true"> *</span>
      </label>
      <input
        :id="`${id}-wallet`"
        v-model="number"
        type="tel"
        inputmode="numeric"
        maxlength="20"
        placeholder="01XXXXXXXXX"
        autocomplete="off"
        :class="[
          inputClass,
          errors.mobile_number ? 'border-red-500' : 'border-slate-300',
          'tabular-nums',
        ]"
        :aria-invalid="errors.mobile_number ? 'true' : undefined"
      />
      <p v-if="errors.mobile_number" class="mt-1 text-sm text-red-700">
        {{ errors.mobile_number }}
      </p>
    </div>
  </div>
</template>
