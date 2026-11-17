<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppToast from '@/components/AppToast.vue'
import { useAuthStore } from '@/stores/auth'
import {
  ACCOUNTS_ROLES,
  APPROVALS_ROLES,
  PAYMENT_REPORT_ROLES,
  PRICE_SETTER_ROLES,
} from '@/lib/accounts'
import { REPORT_ROLES, activePassportCount } from '@/lib/companyReport'
import {
  PASSPORT_MANAGER_ROLES,
  APPROVER_ROLES,
  USER_MANAGER_ROLES,
  canAccessArea,
  homeRouteFor,
} from '@/lib/roles'
import { useApprovalBadge } from '@/composables/useApprovalBadge'
import { useAgentBadges } from '@/composables/useAgentBadges'
import {
  AGENT_DECIDER_ROLES,
  AGENT_MANAGER_ROLES,
  AGENT_PAYMENT_ROLES,
  AGENT_REPORT_ROLES,
} from '@/lib/agents'
import { fetchReportSummary } from '@/api/reports'
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
  /** A dropdown group: the label opens and closes these links (`name` is only its key). */
  children?: NavItem[]
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

// The MYGRAM agent badges: waiting for the Operations Head / the Accounts Head.
const agentBadges = useAgentBadges()
watch(
  () => [auth.user?.role, route.fullPath] as const,
  ([role]) => {
    if (role && (AGENT_MANAGER_ROLES.includes(role) || AGENT_DECIDER_ROLES.includes(role)))
      agentBadges.refresh()
  },
  { immediate: true },
)

// The All Passports and Returned Passports badges: passports not returned (as the All Passports
// list) and the "Returned" count, refreshed on every page change (passports are added and returned on
// other pages).
const totalCount = ref<number | null>(null)
const returnedCount = ref<number | null>(null)
let returnedRequest = 0
watch(
  () => [auth.user?.role, route.fullPath] as const,
  async ([role]) => {
    if (!role || !(REPORT_ROLES as readonly string[]).includes(role)) return
    const id = ++returnedRequest
    try {
      const summary = await fetchReportSummary()
      if (id === returnedRequest) {
        totalCount.value = activePassportCount(summary)
        returnedCount.value = summary.returned
      }
    } catch {
      // The badge just stays as it was.
    }
  },
  { immediate: true },
)

const navItems = computed(() => {
  const role = auth.user?.role
  if (!role) return []
  const items: NavItem[] = [{ name: homeRouteFor(role).name, label: 'Dashboard' }]
  // Payment report, right after Dashboard: the accounts head and the super admin.
  if (PAYMENT_REPORT_ROLES.includes(role)) {
    items.push({ name: 'payment-report', label: 'Payment Report', section: '/payment-report' })
  }
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
  // The MYGRAM agent report (passport counts), right after the reference report: both heads.
  if (AGENT_REPORT_ROLES.includes(role)) items.push({ name: 'agent-report', label: 'Agent Report' })
  // All Passports is read-only, so accounts see it too (without the data-entry screens).
  if (canSeeReports) {
    items.push({
      name: 'all-passports',
      label: 'All Passports',
      badge:
        totalCount.value === null ? undefined : { count: totalCount.value, label: 'passports' },
    })
    items.push({
      name: 'returned-passports',
      label: 'Returned Passports',
      badge:
        returnedCount.value === null
          ? undefined
          : { count: returnedCount.value, label: 'returned' },
    })
  }
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
    items.push({ name: 'accounts-parties', label: 'Party / Owner', section: '/accounts/parties' })
    // Passport prices (standard and party rates): the accounts head only.
    if (PRICE_SETTER_ROLES.includes(role))
      items.push({ name: 'accounts-party-rates', label: 'Party Rates' })
    items.push({ name: 'accounts-cash-book', label: 'Cash Management', section: '/accounts/cash' })
    items.push({ name: 'accounts-owner-loans', label: 'Owner loans' })
    if (AGENT_PAYMENT_ROLES.includes(role))
      items.push({
        name: 'accounts-agent-payments',
        label: 'Agent Payments',
        section: '/accounts/agents',
      })
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
  // MYGRAM agents: the list and Agent Approvals (the operations head), right above Users.
  if (AGENT_MANAGER_ROLES.includes(role)) {
    items.push({ name: 'mygram-agents', label: 'MYGRAM Agents' })
    items.push({
      name: 'agent-approvals',
      label: 'Agent Approvals',
      badge:
        agentBadges.approvals.value === null
          ? undefined
          : { count: agentBadges.approvals.value, label: 'waiting for approval' },
    })
  }
  // Users: for every role that manages another (admins, and the accounts head for accounts users).
  // The operations head has it last, under the Master Data dropdown.
  const canManageUsers = USER_MANAGER_ROLES.includes(role)
  if (canManageUsers && !PASSPORT_MANAGER_ROLES.includes(role))
    items.push({ name: 'staff-users', label: 'Users' })
  // Agent Changes (the accounts head). Companies, References and Medical Centers management
  // (create / edit / deactivate / delete an unused one): the operations head only.
  if (AGENT_DECIDER_ROLES.includes(role))
    items.push({
      name: 'agent-changes',
      label: 'Agent Changes',
      badge:
        agentBadges.changes.value === null
          ? undefined
          : { count: agentBadges.changes.value, label: 'waiting for you' },
    })
  if (PASSPORT_MANAGER_ROLES.includes(role)) {
    items.push({
      name: 'master-data',
      label: 'Master Data',
      children: [
        { name: 'admin-companies', label: 'Companies' },
        { name: 'admin-references', label: 'References' },
        { name: 'admin-medical-centers', label: 'Medical Centers' },
      ],
    })
    if (canManageUsers) items.push({ name: 'staff-users', label: 'Users' })
  }
  if (settingsPagesFor(role).length > 0) {
    items.push({ name: 'settings', label: 'Settings', section: '/admin/settings' })
  }
  return items
})

/** Dropdown groups opened by hand (a group with the current page is always open). */
const openGroups = ref<Set<string>>(new Set())
const groupIsOpen = (item: NavItem) =>
  openGroups.value.has(item.name) || Boolean(item.children?.some(isActive))

function toggleGroup(item: NavItem) {
  const next = new Set(openGroups.value)
  if (groupIsOpen(item)) {
    next.delete(item.name)
  } else {
    next.add(item.name)
  }
  openGroups.value = next
}

function isActive(item: NavItem): boolean {
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
      class="sidebar-warm fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-900 text-primary-100 transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full max-lg:invisible'"
      data-surface="dark"
    >
      <div class="flex h-16 items-center px-4">
        <!-- The company name as text in the logo's orange (no logo image), linking to the
             public website. The sidebar has the homepage's maroon and gold (.sidebar-warm). -->
        <RouterLink
          to="/"
          class="rounded-lg px-2 py-1 text-lg leading-tight font-bold tracking-wide text-flame-500 hover:text-accent-300"
          title="Public website"
          data-brand
        >
          Afwan Associates Ltd
        </RouterLink>
      </div>
      <div class="h-0.5 bg-accent-400" aria-hidden="true" />

      <nav aria-label="Staff portal" class="flex-1 overflow-y-auto p-3">
        <ul class="space-y-1">
          <li v-for="item in navItems" :key="`${item.name}-${item.params?.step ?? ''}`">
            <!-- A dropdown group: the label opens and closes its links. -->
            <template v-if="item.children">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-white/10 hover:text-white"
                :aria-expanded="groupIsOpen(item)"
                :aria-controls="`nav-group-${item.name}`"
                :data-nav-group="item.name"
                @click="toggleGroup(item)"
              >
                <span>{{ item.label }}</span>
                <svg
                  class="size-4 shrink-0 transition-transform"
                  :class="{ 'rotate-180': groupIsOpen(item) }"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <ul
                v-show="groupIsOpen(item)"
                :id="`nav-group-${item.name}`"
                class="mt-1 space-y-1 border-l border-white/15 pl-3"
              >
                <li v-for="child in item.children" :key="child.name">
                  <RouterLink
                    :to="{ name: child.name, params: child.params }"
                    class="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 hover:text-white"
                    :class="{
                      'bg-white/15 text-white shadow-[inset_3px_0_0_var(--color-accent-400)]':
                        isActive(child),
                    }"
                    :aria-current="isActive(child) ? 'page' : undefined"
                  >
                    <span data-label>{{ child.label }}</span>
                  </RouterLink>
                </li>
              </ul>
            </template>
            <RouterLink
              v-else
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
