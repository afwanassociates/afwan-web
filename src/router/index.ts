import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { prefersReducedMotion } from '@/lib/scroll'
import { ROLES, homeRouteFor } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'
import { authGuard } from '@/router/guard'
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
  }
}

const siteName = 'Afwan Associates Ltd'
const staffTitle = (page: string) => `${page} | Staff portal | ${siteName}`

const AreaDashboardView = () => import('@/views/staff/AreaDashboardView.vue')

/** One dashboard route per role: /staff/<slug>. */
function areaRoute(role: Role) {
  const { slug, routeName, label } = ROLES[role]
  return {
    path: slug,
    name: routeName,
    component: AreaDashboardView,
    meta: { area: role, title: staffTitle(label) },
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: `${siteName} | Manpower Recruitment and Supply` },
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
        areaRoute('accounts'),
        {
          path: 'admin/users',
          name: 'staff-users',
          component: () => import('@/views/staff/UsersView.vue'),
          meta: { area: 'admin', title: staffTitle('Users') },
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
      // Passport data entry: data_entry, admin and super_admin (see canAccessArea).
      path: '/data-entry',
      meta: { requiresAuth: true, layout: 'staff', area: 'data_entry' },
      children: [
        { path: '', redirect: { name: 'passports' } },
        {
          path: 'passports',
          name: 'passports',
          component: () => import('@/views/PassportListView.vue'),
          meta: { title: staffTitle('Passport list') },
        },
        {
          path: 'passports/new',
          name: 'passport-new',
          component: () => import('@/views/PassportFormView.vue'),
          meta: { title: staffTitle('Add passport') },
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
