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
  // Passport entry (data_entry area) is for the data entry team and its operations head only,
  // and accounts for the accounts team: admins see reports and approvals, not these areas.
  super_admin: {
    super_admin: true,
    admin: true,
    accounts_head: false,
    operation_head: false,
    data_entry: false,
    accounts: false,
  },
  admin: {
    super_admin: false,
    admin: true,
    accounts_head: false,
    operation_head: false,
    data_entry: false,
    accounts: false,
  },
  accounts_head: {
    super_admin: false,
    admin: false,
    accounts_head: true,
    operation_head: false,
    data_entry: false,
    accounts: true,
  },
  operation_head: {
    super_admin: false,
    admin: false,
    accounts_head: false,
    operation_head: true,
    data_entry: true,
    accounts: false,
  },
  data_entry: {
    super_admin: false,
    admin: false,
    accounts_head: false,
    operation_head: false,
    data_entry: true,
    accounts: false,
  },
  accounts: {
    super_admin: false,
    admin: false,
    accounts_head: false,
    operation_head: false,
    data_entry: false,
    accounts: true,
  },
}

const cases = ROLE_LIST.flatMap((role) =>
  ROLE_LIST.map((area) => ({ role, area, expected: matrix[role][area] })),
)

describe('canAccessArea', () => {
  it('covers every role and area', () => {
    expect(cases).toHaveLength(36)
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
    ['operation_head', 'staff-operation-head'],
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
    expect(dashboardEndpointFor('operation_head')).toBe('/api/operation-head/dashboard')
  })
})

describe('ROLE_LIST', () => {
  it('is sorted by rank, highest first', () => {
    expect(ROLE_LIST).toEqual([
      'super_admin',
      'admin',
      'accounts_head',
      'operation_head',
      'accounts',
      'data_entry',
    ])
  })
})

describe('user management', () => {
  it('follows the hierarchy: each head manages their own team only', () => {
    expect(ROLES.admin.manages).toEqual([
      'accounts_head',
      'operation_head',
      'accounts',
      'data_entry',
    ])
    expect(ROLES.accounts_head.manages).toEqual(['accounts'])
    expect(ROLES.operation_head.manages).toEqual(['data_entry'])
    expect(USER_MANAGER_ROLES).toEqual(['super_admin', 'admin', 'accounts_head', 'operation_head'])
  })
})
