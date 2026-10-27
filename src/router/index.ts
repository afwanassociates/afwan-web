import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { prefersReducedMotion } from '@/lib/scroll'
import {
  PASSPORT_MANAGER_ROLES,
  PASSPORT_ROLES,
  ROLES,
  USER_MANAGER_ROLES,
  homeRouteFor,
} from '@/lib/roles'
import { ACCOUNTS_ROLES, APPROVALS_ROLES } from '@/lib/accounts'
import { REPORT_ROLES } from '@/lib/companyReport'
import { SETTINGS_PAGES, SETTINGS_SECTION_ROLES } from '@/lib/settingsPages'
import { useAuthStore } from '@/stores/auth'
import { authGuard } from '@/router/guard'
import { SITE_NAME, staffTitle } from '@/lib/pageTitle'
import type { Role } from '@/types/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Which layout App.vue renders around the page. Defaults to the public layout. */
    layout?: 'public' | 'staff'
    requiresAuth?: boolean
    /** Only for guests (logged-in users are sent to their home). */
    guestOnly?: boolean
    /** Work area the page belongs to; see canAccessArea() in src/lib/roles.ts. */
    area?: Role
    /** Exact roles allowed (checked in addition to `area`). */
    roles?: readonly Role[]
  }
}

const siteName = SITE_NAME

const AreaDashboardView = () => import('@/views/staff/AreaDashboardView.vue')

/** One dashboard per role at /staff/<slug>; only that role may open it. */
function areaRoute(role: Role) {
  const { slug, routeName, label } = ROLES[role]
  return {
    path: slug,
    name: routeName,
    component: AreaDashboardView,
    meta: { area: role, roles: [role], title: staffTitle(`${label} dashboard`) },
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: `${siteName} | Trade, Construction and Development` },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: `Login | ${siteName}`, guestOnly: true },
    },
    {
      path: '/staff',
      meta: { requiresAuth: true, layout: 'staff' },
      children: [
        {
          path: '',
          name: 'staff',
          redirect: () => {
            const user = useAuthStore().user
            return user ? homeRouteFor(user.role) : { name: 'login' }
          },
        },
        areaRoute('super_admin'),
        areaRoute('admin'),
        areaRoute('data_entry'),
        areaRoute('accounts_head'),
        areaRoute('operation_head'),
        areaRoute('accounts'),
        {
          // Admins manage heads, accounts and data entry users; the accounts head, accounts
          // users; the operations head, data entry users.
          path: 'admin/users',
          name: 'staff-users',
          component: () => import('@/views/staff/UsersView.vue'),
          meta: { roles: USER_MANAGER_ROLES, title: staffTitle('Users') },
        },
        {
          // Companies management (create, edit, deactivate, delete): the operations head only.
          path: 'admin/companies',
          name: 'admin-companies',
          component: () => import('@/views/admin/CompaniesAdminView.vue'),
          meta: { roles: PASSPORT_MANAGER_ROLES, title: staffTitle('Companies') },
        },
        {
          // References management, the same way as companies: the operations head only.
          path: 'admin/references',
          name: 'admin-references',
          component: () => import('@/views/admin/ReferencesAdminView.vue'),
          meta: { roles: PASSPORT_MANAGER_ROLES, title: staffTitle('References') },
        },
        {
          path: 'forbidden',
          name: 'forbidden',
          component: () => import('@/views/staff/ForbiddenView.vue'),
          meta: { title: staffTitle('Access denied') },
        },
      ],
    },
    {
      // Passport entry, medical and every workflow step (Add Passport to Flight): the data
      // entry team and its operations head. Admins see the passports through the reports.
      path: '/data-entry',
      meta: {
        requiresAuth: true,
        layout: 'staff',
        area: 'data_entry',
        roles: PASSPORT_ROLES,
      },
      children: [
        { path: '', redirect: { name: 'passports' } },
        {
          path: 'passports',
          name: 'passports',
          component: () => import('@/views/PassportListView.vue'),
          meta: { title: staffTitle('Passport Entry List') },
        },
        {
          path: 'passports/new',
          name: 'passport-new',
          component: () => import('@/views/PassportFormView.vue'),
          meta: { title: staffTitle('Add passport') },
        },
        {
          // All Passports moved under /reports (accounts may read it); keep old links working.
          path: 'all-passports',
          redirect: (to) => ({ name: 'all-passports', query: to.query }),
        },
        {
          path: 'passports/:id(\\d+)',
          name: 'passport-detail',
          component: () => import('@/views/PassportDetailView.vue'),
          meta: { title: staffTitle('Passport') },
        },
        {
          // Old links: /process[?tab=<step>|completed] and /process/<step> open the step pages.
          path: 'process',
          redirect: (to) => {
            const tab = typeof to.query.tab === 'string' ? to.query.tab : ''
            if (tab === 'completed')
              return { name: 'step-page', params: { step: 'flight' }, query: { tab } }
            // `query: {}`: the old ?tab= is not carried over to the step page.
            return {
              name: 'step-page',
              params: { step: /^[a-z_]+$/.test(tab) ? tab : 'calling' },
              query: {},
            }
          },
        },
        {
          path: 'process/:step([a-z_]+)',
          redirect: (to) => ({
            name: 'step-page',
            params: { step: to.params.step },
            query: to.query,
          }),
        },
        {
          // One page per workflow step (/calling, /visa, …), like /medical. The step key comes
          // from the config; fixed paths (passports, medical, …) always win over this one.
          // The page sets its own title from the step's label.
          path: ':step([a-z_]+)',
          name: 'step-page',
          component: () => import('@/views/StepListPage.vue'),
        },
        {
          path: 'medical',
          name: 'medical',
          component: () => import('@/views/MedicalView.vue'),
          meta: { title: staffTitle('Medical') },
        },
        {
          // Unfit passports are a tab of the Medical page; keep old links working.
          path: 'unfit',
          name: 'unfit',
          redirect: (to) => ({ name: 'medical', query: { ...to.query, tab: 'unfit' } }),
        },
        {
          path: 'passports/:id(\\d+)/edit',
          name: 'passport-edit',
          component: () => import('@/views/PassportFormView.vue'),
          meta: { title: staffTitle('Edit passport') },
        },
      ],
    },
    {
      // Read-only reports (Company, Reference, All Passports): every staff role.
      path: '/reports',
      meta: { requiresAuth: true, layout: 'staff', roles: REPORT_ROLES },
      children: [
        { path: '', redirect: { name: 'companies' } },
        {
          // The read-only All Passports overview.
          path: 'passports',
          name: 'all-passports',
          component: () => import('@/views/AllPassportsView.vue'),
          meta: { title: staffTitle('All passports') },
        },
        {
          path: 'companies',
          name: 'companies',
          component: () => import('@/views/CompaniesView.vue'),
          meta: { title: staffTitle('Company report') },
        },
        {
          path: 'companies/:id(\\d+)',
          name: 'company-report',
          component: () => import('@/views/CompanyView.vue'),
          meta: { title: staffTitle('Company') },
        },
        {
          // Reference-wise report: like the company report, without quota or balance.
          path: 'references',
          name: 'reference-report',
          component: () => import('@/views/ReferenceReportView.vue'),
          meta: { title: staffTitle('Reference report') },
        },
        {
          path: 'references/:id(\\d+)',
          name: 'reference-report-detail',
          component: () => import('@/views/ReferenceView.vue'),
          meta: { title: staffTitle('Reference') },
        },
      ],
    },
    {
      // Accounts: parties / owners with their ledgers, and cash management, for the accounts
      // team (deleting parties and the opening balance: the accounts head). Admins only open
      // the Approvals page.
      path: '/accounts',
      meta: { requiresAuth: true, layout: 'staff', roles: ACCOUNTS_ROLES },
      children: [
        { path: '', redirect: { name: 'accounts-parties' } },
        {
          path: 'parties',
          name: 'accounts-parties',
          component: () => import('@/views/accounts/PartiesView.vue'),
          meta: { title: staffTitle('Parties') },
        },
        {
          // The page sets its own title from the party.
          path: 'parties/:id(\\d+)',
          name: 'accounts-party-ledger',
          component: () => import('@/views/accounts/PartyLedgerView.vue'),
          meta: { title: staffTitle('Party ledger') },
        },
        {
          // Entries waiting for approval (and returned ones); approvers approve here.
          path: 'approvals',
          name: 'accounts-approvals',
          component: () => import('@/views/accounts/ApprovalsView.vue'),
          meta: { roles: APPROVALS_ROLES, title: staffTitle('Approvals') },
        },
        {
          // Cash management: the layout shows today's cash in hand and the tabs.
          path: 'cash',
          component: () => import('@/views/accounts/CashLayout.vue'),
          children: [
            { path: '', redirect: { name: 'accounts-cash-book' } },
            {
              path: 'book',
              name: 'accounts-cash-book',
              component: () => import('@/views/accounts/CashBookView.vue'),
              meta: { title: staffTitle('Cash Book') },
            },
            {
              path: 'receive',
              name: 'accounts-cash-receipts',
              component: () => import('@/views/accounts/CashReceiptsView.vue'),
              meta: { title: staffTitle('Cash Receive') },
            },
            {
              path: 'payment',
              name: 'accounts-cash-payments',
              component: () => import('@/views/accounts/CashPaymentsView.vue'),
              meta: { title: staffTitle('Cash Payment') },
            },
            {
              path: 'transfer',
              name: 'accounts-cash-transfers',
              component: () => import('@/views/accounts/CashTransfersView.vue'),
              meta: { title: staffTitle('Cash Transfer') },
            },
          ],
        },
      ],
    },
    {
      // Settings section. Its pages come from SETTINGS_PAGES (src/lib/settingsPages.ts).
      path: '/admin/settings',
      component: () => import('@/views/admin/SettingsLayout.vue'),
      meta: { requiresAuth: true, layout: 'staff', roles: SETTINGS_SECTION_ROLES },
      children: [
        {
          path: '',
          name: 'settings',
          component: () => import('@/views/admin/SettingsIndexView.vue'),
          meta: { title: staffTitle('Settings') },
        },
        ...SETTINGS_PAGES.map((page) => ({
          path: page.path,
          name: page.name,
          component: page.component,
          meta: { roles: page.roles, title: staffTitle(`${page.label} | Settings`) },
        })),
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: `Page not found | ${siteName}` },
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }
    return { top: 0 }
  },
})

router.beforeEach(authGuard)

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : siteName
})

export default router
