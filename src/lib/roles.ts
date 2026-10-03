import type { Role } from '@/types/auth'

/**
 * Client-side mirror of the API's role rules. These only shape the UI;
 * the API enforces the real rules, so callers must still handle 403.
 *
 * To add a role: add one entry here and its area route in src/router/index.ts.
 */
interface RoleConfig {
  rank: number
  /** Label for menus (the API's role_label is used for the logged-in user). */
  label: string
  /** URL segment shared by the staff route (/staff/<slug>) and the API (/api/<slug>/dashboard). */
  slug: string
  /** Name of the staff area route. */
  routeName: string
}

export const ROLES: Record<Role, RoleConfig> = {
  super_admin: {
    rank: 100,
    label: 'Super Admin',
    slug: 'super-admin',
    routeName: 'staff-super-admin',
  },
  admin: { rank: 80, label: 'Admin', slug: 'admin', routeName: 'staff-admin' },
  data_entry: {
    rank: 10,
    label: 'Data Entry Team',
    slug: 'data-entry',
    routeName: 'staff-data-entry',
  },
  accounts: { rank: 10, label: 'Accounts Team', slug: 'accounts', routeName: 'staff-accounts' },
}

/** All roles, highest rank first (for menus and filters). */
export const ROLE_LIST = (Object.keys(ROLES) as Role[]).sort(
  (a, b) => ROLES[b].rank - ROLES[a].rank,
)

/**
 * A user may open a work area if it is their own role's area, or their rank is
 * strictly higher and the area is not super_admin.
 */
export function canAccessArea(userRole: Role, areaRole: Role): boolean {
  if (userRole === areaRole) return true
  if (areaRole === 'super_admin') return false
  const user = ROLES[userRole]
  const area = ROLES[areaRole]
  if (!user || !area) return false
  return user.rank > area.rank
}

/** Route name of the role's home area. */
export function homeRouteFor(role: Role): { name: string } {
  return { name: ROLES[role]?.routeName ?? 'home' }
}

/** Path of the role's work-area API endpoint. */
export function dashboardEndpointFor(role: Role): string {
  return `/api/${ROLES[role].slug}/dashboard`
}
