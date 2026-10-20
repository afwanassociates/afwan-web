<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import CashSettingsDialog from '@/components/accounts/CashSettingsDialog.vue'
import { fetchCashSettings } from '@/api/accounts'
import { useToast } from '@/composables/useToast'
import { CASH_CONTEXT, formatMoney } from '@/lib/accounts'
import { toDisplayDate } from '@/lib/dates'
import { ADMIN_ROLES } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import type { CashSettings } from '@/types/accounts'

/**
 * Accounts › Cash: today's cash in hand and the opening balance on top, then the Cash Book,
 * Receive, Payment and Transfer pages as tabs. Pages reload the header after each save.
 */
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()

const canSetOpening = computed(() => !!auth.user && ADMIN_ROLES.includes(auth.user.role))

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
  { name: 'accounts-cash-transfers', label: 'Cash Transfer' },
] as const

const openingOpen = ref(false)
function onOpeningSaved(saved: CashSettings) {
  settings.value = saved
  toast.success('Cash opening balance saved.')
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Cash Management</h1>
        <p class="mt-1 text-sm text-muted">
          Cash in hand: receipts, payments, deposits to and withdrawals from the bank.
        </p>
      </div>
      <div class="flex flex-wrap items-stretch gap-3" data-cash-header>
        <div class="glass-card px-4 py-3 ring-2 ring-accent-400">
          <p class="text-xs font-semibold tracking-wider text-muted uppercase">
            Cash in hand today
          </p>
          <p class="text-xl font-bold text-ink tabular-nums" data-cash-in-hand>
            <template v-if="settings">৳ {{ formatMoney(settings.cash_in_hand) }}</template>
            <template v-else-if="settingsFailed">—</template>
            <template v-else>…</template>
          </p>
        </div>
        <RouterLink
          v-if="settings && settings.pending.count > 0"
          :to="{ name: 'accounts-approvals' }"
          class="glass-card block px-4 py-3 ring-1 ring-amber-300 hover:bg-amber-50/60"
          data-cash-pending
        >
          <p class="text-xs font-semibold tracking-wider text-amber-800 uppercase">
            Waiting approval · {{ settings.pending.count }}
          </p>
          <p class="text-sm font-semibold text-ink tabular-nums">
            +৳ {{ formatMoney(settings.pending.in) }}
            <span class="text-muted">/</span>
            −৳ {{ formatMoney(settings.pending.out) }}
          </p>
          <p class="text-xs text-muted">Not in cash in hand yet</p>
        </RouterLink>
        <div class="glass-card px-4 py-3">
          <p class="text-xs font-semibold tracking-wider text-muted uppercase">Opening balance</p>
          <p class="text-sm font-semibold text-ink tabular-nums" data-opening>
            <template v-if="settings?.opening_date">
              ৳ {{ formatMoney(settings.opening_balance) }}
              <span class="font-normal text-muted"
                >on {{ toDisplayDate(settings.opening_date) }}</span
              >
            </template>
            <template v-else-if="settings">Not set</template>
          </p>
          <button
            v-if="canSetOpening"
            type="button"
            class="mt-1 text-xs font-semibold text-primary-700 underline-offset-4 hover:underline"
            data-set-opening
            @click="openingOpen = true"
          >
            {{ settings?.opening_date ? 'Change' : 'Set opening balance' }}
          </button>
        </div>
      </div>
    </div>

    <nav aria-label="Cash" class="mt-6 flex flex-wrap gap-2 print:hidden">
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

    <div class="mt-4">
      <RouterView />
    </div>

    <CashSettingsDialog v-model:open="openingOpen" :settings="settings" @saved="onOpeningSaved" />
  </div>
</template>
