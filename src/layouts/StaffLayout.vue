<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppLogo from '@/components/AppLogo.vue'
import AppToast from '@/components/AppToast.vue'
import { useAuthStore } from '@/stores/auth'
import { ACCOUNTS_ROLES, APPROVALS_ROLES } from '@/lib/accounts'
import { REPORT_ROLES } from '@/lib/companyReport'
import {
  PASSPORT_MANAGER_ROLES,
  APPROVER_ROLES,
  USER_MANAGER_ROLES,
  canAccessArea,
  homeRouteFor,
} from '@/lib/roles'
import { useApprovalBadge } from '@/composables/useApprovalBadge'
import { settingsPagesFor } from '@/lib/settingsPages'
import { isRecordStep, stepPendingCount } from '@/lib/workflow'
import { useWorkflowStore } from '@/stores/workflow'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const isLoggingOut = ref(false)

/**
 * "Dashboard" (the user's own role dashboard only), plus the passport screens for anyone who
 * can open the data-entry area, "Companies" for every role that may see the report, "Users" for anyone who can open the admin area and "Settings"
 * for anyone who may open at least one settings page.
 */
interface NavItem {
  name: string
  label: string
  /** Also highlighted on any page under this path (e.g. every settings page). */
  section?: string
  /** Count shown next to the label, with words for screen readers. */
  badge?: { count: number; label: string }
  /** Route params (e.g. the step of a step page: { step: 'visa' }). */
  params?: Record<string, string>
}

const workflow = useWorkflowStore()
watch(
  () => auth.user?.role,
  (role) => {
    if (role && canAccessArea(role, 'data_entry')) {
      workflow.load()
      workflow.loadConfig()
    }
  },
  { immediate: true },
)

// The approvals badge, refreshed on every page change (approving happens on several pages).
const approvals = useApprovalBadge()
watch(
  () => [auth.user?.role, route.fullPath] as const,
  ([role]) => {
    if (role && APPROVALS_ROLES.includes(role)) approvals.refresh()
  },
  { immediate: true },
)

const navItems = computed(() => {
  const role = auth.user?.role
  if (!role) return []
  const items: NavItem[] = [{ name: homeRouteFor(role).name, label: 'Dashboard' }]
  // The company-wise and reference-wise reports, right under Dashboard for every role.
  const canSeeReports = (REPORT_ROLES as readonly string[]).includes(role)
  if (canSeeReports) {
    items.push({ name: 'companies', label: 'Company Report', section: '/reports/companies' })
    items.push({
      name: 'reference-report',
      label: 'Reference Report',
      section: '/reports/references',
    })
  }
  // All Passports is read-only, so accounts see it too (without the data-entry screens).
  if (canSeeReports) items.push({ name: 'all-passports', label: 'All Passports' })
  if (canAccessArea(role, 'data_entry')) {
    items.push({ name: 'passport-new', label: 'Add Passport' })
    const step2 = workflow.summary?.step2
    // Passports entered with no medical slip yet: the rows of the Passport Entry List.
    items.push({
      name: 'passports',
      label: 'Passport Entry List',
      badge:
        step2?.not_started === undefined
          ? undefined
          : { count: step2.not_started, label: 'waiting for a medical slip' },
    })
    items.push({
      name: 'medical',
      label: 'Medical',
      badge: step2 ? { count: step2.pending, label: 'pending' } : undefined,
    })
    // One item per recorded step (Calling, Visa, BMET, Flight, …) in workflow order, right
    // after Medical and just like it: label from the config, the Pending count as its badge.
    const steps = [...(workflow.config?.steps ?? [])]
      .filter((s) => s.enabled && isRecordStep(s))
      .sort((a, b) => a.order - b.order)
    for (const s of steps) {
      // The step page's Pending tab count, the same number as the tab and the step bar.
      const pending = stepPendingCount(workflow.summary, s.key)
      items.push({
        name: 'step-page',
        params: { step: s.key },
        label: s.label,
        badge: pending === undefined ? undefined : { count: pending, label: 'pending' },
      })
    }
  }
  // Accounts: parties (with their ledger pages) and cash (book, receive, payment, transfer)
  // for the accounts team only, then approvals. Approvers (admins included) see "Approvals"
  // with the entries waiting; the accounts team sees "My entries" with their own entries
  // returned for correction.
  if (ACCOUNTS_ROLES.includes(role)) {
    items.push({ name: 'accounts-parties', label: 'Parties', section: '/accounts/parties' })
    items.push({ name: 'accounts-cash-book', label: 'Cash', section: '/accounts/cash' })
  }
  if (APPROVALS_ROLES.includes(role)) {
    items.push({
      name: 'accounts-approvals',
      label: APPROVER_ROLES.includes(role) ? 'Approvals' : 'My entries',
      badge:
        approvals.count.value === null
          ? undefined
          : {
              count: approvals.count.value,
              label: APPROVER_ROLES.includes(role) ? 'waiting for approval' : 'returned to you',
            },
    })
  }
  // Users: for every role that manages another (admins, and the accounts head for accounts users).
  if (USER_MANAGER_ROLES.includes(role)) items.push({ name: 'staff-users', label: 'Users' })
  // Companies and References management (create / edit / deactivate): the operations head.
  if (PASSPORT_MANAGER_ROLES.includes(role)) {
    items.push({ name: 'admin-companies', label: 'Companies' })
    items.push({ name: 'admin-references', label: 'References' })
  }
  if (settingsPagesFor(role).length > 0) {
    items.push({ name: 'settings', label: 'Settings', section: '/admin/settings' })
  }
  return items
})

function isActive(item: NavItem) {
  if (item.params)
    return (
      route.name === item.name &&
      Object.entries(item.params).every(([key, value]) => route.params[key] === value)
    )
  if (item.section) return route.path === item.section || route.path.startsWith(`${item.section}/`)
  return route.name === item.name
}

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

async function logout() {
  isLoggingOut.value = true
  try {
    await auth.logout()
  } catch {
    // The local session is cleared either way.
  } finally {
    isLoggingOut.value = false
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <div class="min-h-screen bg-primary-50/60" @keydown.esc="menuOpen = false">
    <!-- Mobile backdrop -->
    <div
      v-if="menuOpen"
      class="fixed inset-0 z-30 bg-primary-950/50 lg:hidden"
      aria-hidden="true"
      @click="menuOpen = false"
    />

    <aside
      id="staff-sidebar"
      class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-950 text-primary-100 transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible'"
      data-surface="dark"
    >
      <div class="flex h-16 items-center px-4">
        <RouterLink
          to="/"
          class="inline-block rounded-lg bg-linear-to-b from-white to-primary-50 px-3 py-2"
          aria-label="Afwan Associates Ltd — public website"
        >
          <AppLogo />
        </RouterLink>
      </div>
      <div class="h-0.5 bg-accent-400" aria-hidden="true" />

      <nav aria-label="Staff portal" class="flex-1 overflow-y-auto p-3">
        <ul class="space-y-1">
          <li v-for="item in navItems" :key="`${item.name}-${item.params?.step ?? ''}`">
            <RouterLink
              :to="{ name: item.name, params: item.params }"
              class="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/10 hover:text-white"
              :class="{
                'bg-white/15 text-white shadow-[inset_3px_0_0_var(--color-accent-400)]':
                  isActive(item),
              }"
              :aria-current="isActive(item) ? 'page' : undefined"
            >
              <span class="flex items-center justify-between gap-2">
                <span data-label>{{ item.label }}</span>
                <span
                  v-if="item.badge"
                  class="min-w-6 rounded-full bg-accent-400 px-1.5 text-center text-xs font-bold text-primary-950 tabular-nums"
                  data-badge
                >
                  {{ item.badge.count }}<span class="sr-only">{{ ` ${item.badge.label}` }}</span>
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="flex min-h-screen flex-col lg:pl-64">
      <header
        class="sticky top-0 z-20 flex h-16 items-center gap-3 bg-white/85 px-4 shadow-[0_6px_24px_-12px_rgb(21_42_80/0.35)] backdrop-blur-lg sm:px-6"
      >
        <button
          type="button"
          class="-ml-1 rounded-md p-2 text-primary-900 hover:bg-primary-50 lg:hidden"
          aria-controls="staff-sidebar"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span class="sr-only">{{ menuOpen ? 'Close menu' : 'Open menu' }}</span>
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <div v-if="auth.user" class="ml-auto min-w-0 text-right">
          <p class="truncate text-sm font-semibold text-primary-900">{{ auth.user.name }}</p>
          <p class="truncate text-xs text-slate-600">{{ auth.user.role_label }}</p>
        </div>
        <button
          type="button"
          class="btn btn-primary shrink-0 px-4 text-sm"
          :class="{ 'ml-auto': !auth.user }"
          :disabled="isLoggingOut"
          @click="logout"
        >
          {{ isLoggingOut ? 'Logging out…' : 'Logout' }}
        </button>
      </header>

      <main id="main-content" tabindex="-1" class="flex-1 p-4 focus:outline-none sm:p-6 lg:p-8">
        <slot />
      </main>
      <AppToast />
    </div>
  </div>
</template>
