import { describe, it, expect } from 'vitest'
import {
  ROLES,
  ROLE_LIST,
  USER_MANAGER_ROLES,
  canAccessArea,
  dashboardEndpointFor,
  homeRouteFor,
} from '@/lib/roles'
import type { Role } from '@/types/auth'

// Expected access for every role (rows) × area (columns), from the API's rules.
const matrix: Record<Role, Record<Role, boolean>> = {
  super_admin: {
    super_admin: true,
    admin: true,
    accounts_head: true,
    data_entry: true,
    accounts: true,
  },
  admin: { super_admin: false, admin: true, accounts_head: true, data_entry: true, accounts: true },
  accounts_head: {
    super_admin: false,
    admin: false,
    accounts_head: true,
    data_entry: false,
    accounts: true,
  },
  data_entry: {
    super_admin: false,
    admin: false,
    accounts_head: false,
    data_entry: true,
    accounts: false,
  },
  accounts: {
    super_admin: false,
    admin: false,
    accounts_head: false,
    data_entry: false,
    accounts: true,
  },
}

const cases = ROLE_LIST.flatMap((role) =>
  ROLE_LIST.map((area) => ({ role, area, expected: matrix[role][area] })),
)

describe('canAccessArea', () => {
  it('covers every role and area', () => {
    expect(cases).toHaveLength(25)
  })

  it.each(cases)('$role → $area area: $expected', ({ role, area, expected }) => {
    expect(canAccessArea(role, area)).toBe(expected)
  })

  it('never lets a lower or equal rank into the super_admin area', () => {
    for (const role of ROLE_LIST.filter((r) => r !== 'super_admin')) {
      expect(canAccessArea(role, 'super_admin')).toBe(false)
    }
  })
})

describe('homeRouteFor', () => {
  it.each([
    ['super_admin', 'staff-super-admin'],
    ['admin', 'staff-admin'],
    ['data_entry', 'staff-data-entry'],
    ['accounts_head', 'staff-accounts-head'],
    ['accounts', 'staff-accounts'],
  ] as const)('%s → %s', (role, name) => {
    expect(homeRouteFor(role)).toEqual({ name })
  })

  it('is always an area the role can open', () => {
    for (const role of ROLE_LIST) {
      const area = ROLE_LIST.find((r) => ROLES[r].routeName === homeRouteFor(role).name)
      expect(area && canAccessArea(role, area)).toBe(true)
    }
  })
})

describe('dashboardEndpointFor', () => {
  it('builds /api/<slug>/dashboard', () => {
    expect(dashboardEndpointFor('super_admin')).toBe('/api/super-admin/dashboard')
    expect(dashboardEndpointFor('data_entry')).toBe('/api/data-entry/dashboard')
  })
})

describe('ROLE_LIST', () => {
  it('is sorted by rank, highest first', () => {
    expect(ROLE_LIST).toEqual(['super_admin', 'admin', 'accounts_head', 'accounts', 'data_entry'])
  })
})

describe('user management', () => {
  it('follows the hierarchy: the accounts head manages accounts users only', () => {
    expect(ROLES.admin.manages).toEqual(['accounts_head', 'accounts', 'data_entry'])
    expect(ROLES.accounts_head.manages).toEqual(['accounts'])
    expect(USER_MANAGER_ROLES).toEqual(['super_admin', 'admin', 'accounts_head'])
  })
})
