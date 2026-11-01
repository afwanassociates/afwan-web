<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import FinanceSummaryCards from '@/components/accounts/FinanceSummaryCards.vue'
import { fetchCashSettings } from '@/api/accounts'
import { ACCOUNTS_MANAGER_ROLES, CASH_CONTEXT } from '@/lib/accounts'
import { useAuthStore } from '@/stores/auth'
import type { CashSettings, FinanceSummary } from '@/types/accounts'

/**
 * Accounts › Cash: for the accounts head, the money summary on top (FinanceSummaryCards, with
 * today's opening cash worked out automatically); accounts users don't see it. Then the Cash Book,
 * Receive, Payment and Deposit / Withdrawal pages as tabs. Pages reload the header after
 * each save.
 */
const route = useRoute()
const auth = useAuthStore()

/** The accounts head sees the money summary; accounts users don't. */
const isHead = computed(() => !!auth.user && ACCOUNTS_MANAGER_ROLES.includes(auth.user.role))

const settings = ref<CashSettings | null>(null)
const settingsFailed = ref(false)

async function refresh() {
  try {
    settings.value = await fetchCashSettings()
    settingsFailed.value = false
  } catch {
    settingsFailed.value = true
  }
}
refresh()
provide(CASH_CONTEXT, { settings, refresh })

const tabs = [
  { name: 'accounts-cash-book', label: 'Cash Book' },
  { name: 'accounts-cash-receipts', label: 'Cash Receive' },
  { name: 'accounts-cash-payments', label: 'Cash Payment' },
  { name: 'accounts-cash-transfers', label: 'Deposit / Withdrawal' },
] as const

/** The money summary: the accounts head only (the API sends it to no one else on this page). */
const summary = computed(() =>
  isHead.value && settings.value?.cash_in_hand !== undefined
    ? (settings.value as FinanceSummary)
    : null,
)
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div>
      <h1 class="text-xl font-bold text-primary-900 sm:text-2xl">Cash Management</h1>
      <p class="mt-0.5 text-xs text-muted">
        Cash, bank and mobile banking: receipts, payments, deposits and withdrawals.
      </p>
    </div>
    <FinanceSummaryCards
      v-if="isHead"
      class="mt-4"
      :summary="summary"
      :failed="settingsFailed"
      data-cash-header
    />

    <nav
      aria-label="Cash"
      class="mt-8 flex flex-wrap gap-2 border-b border-slate-200 pb-3 print:hidden"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="rounded-full px-4 py-2 text-sm font-semibold"
        :class="
          route.name === tab.name
            ? 'bg-primary-900 text-white'
            : 'bg-white text-primary-800 ring-1 ring-slate-300 hover:bg-primary-50'
        "
        :aria-current="route.name === tab.name ? 'page' : undefined"
        :data-cash-tab="tab.name"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>

    <div class="mt-5">
      <RouterView />
    </div>
  </div>
</template>
