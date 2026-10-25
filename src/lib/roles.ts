import type { Role } from '@/types/auth'

/**
 * Client-side mirror of the API's role rules (App\Enums\UserRole), all in this file.
 * These only shape the UI; the API enforces the real rules, so callers must still handle 403.
 *
 *   1 super_admin    everything except passport entry, including admins and settings
 *   2 admin          companies, countries, settings, accounts approvals, read-only
 *                    passport reports (no parties or cash); manages both heads,
 *                    accounts and data entry users
 *   3 accounts_head  accounts and finance (parties, cash, the opening balance and
 *                    deleting parties), approvals; manages accounts users
 *   3 operation_head passport entry like data entry, plus the corrections (delete,
 *                    undo, re-tests, edit any entry); manages data entry users
 *   4 accounts       accounts and finance; read-only passports and workflow
 *   5 data_entry     passport entry and every workflow step (only this team and the
 *                    operations head: admins see the passports through the reports)
 *
 * To add a role: add one entry here (with its areas and the roles it manages) and its area
 * route in src/router/index.ts.
 */
interface RoleConfig {
  /** Position in the hierarchy, for ordering lists (highest first). */
  rank: number
  /** Label for menus (the API's role_label is used for the logged-in user). */
  label: string
  /** URL segment shared by the staff route (/staff/<slug>) and the API (/api/<slug>/dashboard). */
  slug: string
  /** Name of the staff area route. */
  routeName: string
  /** The work areas this role may open. */
  areas: readonly Role[]
  /** The roles whose users this role may create and manage. */
  manages: readonly Role[]
}

export const ROLES: Record<Role, RoleConfig> = {
  super_admin: {
    rank: 100,
    label: 'Super Admin',
    slug: 'super-admin',
    routeName: 'staff-super-admin',
    areas: ['super_admin', 'admin'],
    manages: ['admin', 'accounts_head', 'operation_head', 'accounts', 'data_entry'],
  },
  admin: {
    rank: 80,
    label: 'Admin',
    slug: 'admin',
    routeName: 'staff-admin',
    areas: ['admin'],
    manages: ['accounts_head', 'operation_head', 'accounts', 'data_entry'],
  },
  accounts_head: {
    rank: 60,
    label: 'Accounts & Finance Head',
    slug: 'accounts-head',
    routeName: 'staff-accounts-head',
    areas: ['accounts_head', 'accounts'],
    manages: ['accounts'],
  },
  operation_head: {
    rank: 60,
    label: 'Operations Head',
    slug: 'operation-head',
    routeName: 'staff-operation-head',
    areas: ['operation_head', 'data_entry'],
    manages: ['data_entry'],
  },
  accounts: {
    rank: 20,
    label: 'Accounts Team',
    slug: 'accounts',
    routeName: 'staff-accounts',
    areas: ['accounts'],
    manages: [],
  },
  data_entry: {
    rank: 10,
    label: 'Data Entry Team',
    slug: 'data-entry',
    routeName: 'staff-data-entry',
    areas: ['data_entry'],
    manages: [],
  },
}

/** All roles, highest rank first (for menus and filters). */
export const ROLE_LIST = (Object.keys(ROLES) as Role[]).sort(
  (a, b) => ROLES[b].rank - ROLES[a].rank,
)

/** Whether a user may open a work area (listed explicitly per role, not by rank). */
export function canAccessArea(userRole: Role, areaRole: Role): boolean {
  return ROLES[userRole]?.areas.includes(areaRole) ?? false
}

/** Roles of the admin panel (companies, countries, settings). */
export const ADMIN_ROLES: readonly Role[] = ['admin', 'super_admin']

/** Roles that do passport work, Add Passport to Flight (the data-entry area). */
export const PASSPORT_ROLES: readonly Role[] = ['data_entry', 'operation_head']

/** Roles that correct passport work: delete, Undo, re-tests and editing anyone's entries. */
export const PASSPORT_MANAGER_ROLES: readonly Role[] = ['operation_head']

/** Roles that may open the admin settings (countries and defaults). */
export const SETTINGS_ROLES: readonly Role[] = ['admin', 'super_admin']

/** Roles that manage at least one other role (the Users page). */
export const USER_MANAGER_ROLES: readonly Role[] = ROLE_LIST.filter(
  (role) => ROLES[role].manages.length > 0,
)

/** Roles that approve accounts entries; nobody approves an entry they prepared or edited. */
export const APPROVER_ROLES: readonly Role[] = ['accounts_head', 'admin', 'super_admin']

/** Route name of the role's home area. */
export function homeRouteFor(role: Role): { name: string } {
  return { name: ROLES[role]?.routeName ?? 'home' }
}

/** Path of the role's work-area API endpoint. */
export function dashboardEndpointFor(role: Role): string {
  return `/api/${ROLES[role].slug}/dashboard`
}
