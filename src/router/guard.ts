import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { canAccessArea, homeRouteFor } from '@/lib/roles'
import type { Role } from '@/types/auth'

/**
 * True if the user can open the route: its `area` (if any) is one the role can open and
 * its `roles` list (if any) includes the role.
 */
export function canOpenRoute(role: Role, route: Pick<RouteLocationNormalized, 'meta'>): boolean {
  if (route.meta.area && !canAccessArea(role, route.meta.area)) return false
  if (route.meta.roles && !route.meta.roles.includes(role)) return false
  return true
}

/**
 * Global guard: waits for the first GET /api/user, then
 * - guests on a protected route → login (with ?redirect)
 * - logged-in users on a guest-only route (login) → their home
 * - logged-in users without access to the area → the 403 page
 */
export async function authGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const auth = useAuthStore()
  if (!auth.isReady) await auth.fetchUser()

  const user = auth.user
  if (!user) {
    // A pending notice (e.g. "account deactivated") must be shown on the login page.
    if (auth.notice && to.name !== 'login') return { name: 'login' }
    if (to.meta.requiresAuth) return { name: 'login', query: { redirect: to.fullPath } }
    return true
  }

  if (to.meta.guestOnly) return homeRouteFor(user.role)
  if (!canOpenRoute(user.role, to)) {
    return { name: 'forbidden', query: { from: to.fullPath }, replace: true }
  }
  return true
}

/**
 * Where to go after login: ?redirect if it is an internal page the user may open, else their home.
 */
export function postLoginTarget(router: Router, role: Role, redirect: unknown): RouteLocationRaw {
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    const target = router.resolve(redirect)
    const usable =
      target.matched.length > 0 &&
      target.name !== 'not-found' &&
      !target.meta.guestOnly &&
      canOpenRoute(role, target)
    if (usable) return target.fullPath
  }
  return homeRouteFor(role)
}
