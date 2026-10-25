import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import api from '@/lib/api'
import router from '@/router'
import { postLoginTarget } from '@/router/guard'
import { DEACTIVATED_MESSAGE, useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  CURRENT_USER_PATH: '/api/user',
}))

const get = vi.mocked(api.get)

/** Fresh store for each test; `role` logs a user in, null is a guest. */
function setSession(role: Role | null) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = role ? makeUser({ role }) : null
  auth.isReady = true
  return auth
}

beforeAll(() => {
  // jsdom has no scrolling; the router's scrollBehavior calls it after each navigation.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

beforeEach(async () => {
  vi.resetAllMocks()
  // Start every test from the public home page as a guest.
  setSession(null)
  await router.push('/')
})

describe('router guard (real routes)', () => {
  describe('guests', () => {
    it.each(['/staff/admin', '/staff/super-admin', '/staff/admin/users?page=2'])(
      'are sent from %s to login with a redirect',
      async (path) => {
        setSession(null)
        await router.push(path)

        expect(router.currentRoute.value.name).toBe('login')
        expect(router.currentRoute.value.query.redirect).toBe(path)
      },
    )

    it('can open public pages', async () => {
      await router.push('/login')
      expect(router.currentRoute.value.name).toBe('login')
    })

    it('waits for GET /api/user on the first navigation', async () => {
      const auth = setSession(null)
      auth.isReady = false
      get.mockResolvedValue({ data: { data: makeUser({ role: 'accounts' }) } })

      await router.push('/staff/accounts')

      expect(get).toHaveBeenCalledWith('/api/user')
      expect(router.currentRoute.value.name).toBe('staff-accounts')
    })

    it('are sent to login when the account is deactivated (403)', async () => {
      const auth = setSession(null)
      auth.isReady = false
      get.mockRejectedValue(httpError(403, { message: 'Deactivated.' }))

      await router.push('/staff/admin')

      expect(router.currentRoute.value.name).toBe('login')
      expect(auth.notice).toBe(DEACTIVATED_MESSAGE)
    })
  })

  describe('admin panel › Companies (/staff/admin/companies)', () => {
    it.each(['admin', 'super_admin'] as const)('%s can open it', async (role) => {
      setSession(role)
      await router.push('/staff/admin/companies')

      expect(router.currentRoute.value.name).toBe('admin-companies')
    })

    it.each(['data_entry', 'accounts'] as const)('%s gets the 403 page', async (role) => {
      setSession(role)
      await router.push('/staff/admin/companies?status=inactive')

      expect(router.currentRoute.value.name).toBe('forbidden')
      expect(router.currentRoute.value.query.from).toBe('/staff/admin/companies?status=inactive')
    })

    it('sends guests to login', async () => {
      setSession(null)
      await router.push('/staff/admin/companies')

      expect(router.currentRoute.value.name).toBe('login')
    })

    it.each(['admin', 'super_admin', 'data_entry', 'accounts'] as const)(
      '%s can open the Company report',
      async (role) => {
        setSession(role)
        await router.push('/reports/companies')

        expect(router.currentRoute.value.name).toBe('companies')
      },
    )

    it('has no Reference report any more', () => {
      expect(router.hasRoute('references-report')).toBe(false)
      expect(router.hasRoute('reference-report')).toBe(false)
    })
  })

  describe('step pages (/calling, /visa, /bmet, /flight)', () => {
    it.each(['calling', 'visa', 'bmet', 'flight'])(
      '/data-entry/%s opens the shared step page with that key',
      async (key) => {
        setSession('data_entry')
        await router.push(`/data-entry/${key}`)

        const current = router.currentRoute.value
        expect(current.name).toBe('step-page')
        expect(current.params.step).toBe(key)
        expect(current.fullPath).not.toContain('process')
        const component = (path: string) => {
          const matched = router.resolve(path).matched
          return matched[matched.length - 1]!.components!.default
        }
        expect(component(current.fullPath)).toBe(component('/data-entry/calling'))
      },
    )

    it('fixed pages still win over the step route', () => {
      expect(router.resolve('/data-entry/medical').name).toBe('medical')
      expect(router.resolve('/data-entry/passports').name).toBe('passports')
      expect(router.resolve('/reports/passports').name).toBe('all-passports')
    })

    it.each([
      ['/data-entry/process', '/data-entry/calling'],
      ['/data-entry/process?tab=visa', '/data-entry/visa'],
      ['/data-entry/process?tab=completed', '/data-entry/flight?tab=completed'],
      ['/data-entry/process/calling', '/data-entry/calling'],
      ['/data-entry/process/visa', '/data-entry/visa'],
      ['/data-entry/process/bmet?tab=rejected', '/data-entry/bmet?tab=rejected'],
      ['/data-entry/process/flight', '/data-entry/flight'],
    ])('the old %s redirects to %s', async (from, to) => {
      setSession('data_entry')
      await router.push(from)

      expect(router.currentRoute.value.fullPath).toBe(to)
    })

    it('follow the Medical route guard: accounts gets the 403 page', async () => {
      setSession('accounts')
      await router.push('/data-entry/visa')

      expect(router.currentRoute.value.name).toBe('forbidden')
      await router.push('/data-entry/medical')
      expect(router.currentRoute.value.name).toBe('forbidden')
    })
  })

  describe('wrong role', () => {
    it.each([
      ['admin', '/staff/super-admin'],
      // Each role opens only its own dashboard, even higher ones.
      ['super_admin', '/staff/admin'],
      ['super_admin', '/staff/data-entry'],
      ['super_admin', '/staff/accounts'],
      ['admin', '/staff/data-entry'],
      ['admin', '/staff/accounts'],
      ['data_entry', '/staff/admin'],
      ['data_entry', '/staff/accounts'],
      ['accounts', '/staff/data-entry'],
      ['accounts', '/data-entry/medical'],
      ['accounts', '/data-entry/medical?tab=unfit'],
      ['accounts', '/data-entry/passports/42'],
      ['accounts', '/staff/admin/users'],
      // Add Passport to Flight is the data entry team's alone, even for admins.
      ['admin', '/data-entry/passports'],
      ['admin', '/data-entry/passports/new'],
      ['admin', '/data-entry/medical'],
      ['admin', '/data-entry/flight'],
      ['super_admin', '/data-entry/passports'],
      ['super_admin', '/data-entry/visa'],
      // The operations head: passport work and its users, not accounts or the admin panel.
      ['operation_head', '/staff/data-entry'],
      ['operation_head', '/staff/admin'],
      ['operation_head', '/accounts/parties'],
      ['operation_head', '/staff/admin/companies'],
    ] as const)('%s opening %s gets the 403 page', async (role, path) => {
      setSession(role)
      await router.push(path)

      expect(router.currentRoute.value.name).toBe('forbidden')
      expect(router.currentRoute.value.query.from).toBe(path)
      expect(router.currentRoute.value.meta.layout).toBe('staff')
    })
  })

  describe('All Passports', () => {
    it.each(['super_admin', 'data_entry', 'accounts'] as const)(
      'the old /data-entry/all-passports link takes %s to /reports/passports',
      async (role) => {
        setSession(role)
        await router.push('/data-entry/all-passports?q=rahim')

        expect(router.currentRoute.value.name).toBe('all-passports')
        expect(router.currentRoute.value.fullPath).toBe('/reports/passports?q=rahim')
      },
    )
  })

  describe('right role', () => {
    it.each([
      ['super_admin', '/staff/super-admin'],
      ['super_admin', '/reports/passports'],
      ['data_entry', '/data-entry/passports'],
      ['data_entry', '/reports/passports'],
      // All Passports is read-only, so accounts may open it.
      ['accounts', '/reports/passports'],
      ['super_admin', '/staff/admin/users'],
      ['admin', '/staff/admin'],
      ['admin', '/reports/passports'],
      ['admin', '/staff/admin/users'],
      ['data_entry', '/staff/data-entry'],
      ['accounts', '/staff/accounts'],
      ['operation_head', '/staff/operation-head'],
      ['operation_head', '/data-entry/passports'],
      ['operation_head', '/data-entry/medical'],
      ['operation_head', '/data-entry/flight'],
      ['operation_head', '/reports/passports'],
      ['operation_head', '/staff/admin/users'],
    ] as const)('%s can open %s', async (role, path) => {
      setSession(role)
      await router.push(path)

      expect(router.currentRoute.value.fullPath).toBe(path)
    })

    it.each([
      ['super_admin', 'staff-super-admin'],
      ['admin', 'staff-admin'],
      ['data_entry', 'staff-data-entry'],
      ['accounts', 'staff-accounts'],
      ['operation_head', 'staff-operation-head'],
    ] as const)('%s opening /login is sent home (%s)', async (role, name) => {
      setSession(role)
      await router.push('/login')

      expect(router.currentRoute.value.name).toBe(name)
    })

    it('/staff goes to the role home', async () => {
      setSession('data_entry')
      await router.push('/staff')

      expect(router.currentRoute.value.name).toBe('staff-data-entry')
    })
  })
})

describe('admin settings route', () => {
  it.each([
    ['data_entry', '/admin/settings'],
    ['accounts', '/admin/settings'],
  ] as const)('the overview is blocked for %s (403 page)', async (role, path) => {
    setSession(role)
    await router.push(path)

    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it.each(['admin', 'super_admin'] as const)('the overview opens for %s', async (role) => {
    setSession(role)
    await router.push('/admin/settings')

    expect(router.currentRoute.value.name).toBe('settings')
  })

  it.each(['data_entry', 'accounts'] as const)('is blocked for %s (403 page)', async (role) => {
    setSession(role)
    await router.push('/admin/settings/countries')

    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it.each(['admin', 'super_admin'] as const)('opens for %s', async (role) => {
    setSession(role)
    await router.push('/admin/settings/countries')

    expect(router.currentRoute.value.name).toBe('settings-countries')
    expect(router.currentRoute.value.meta.layout).toBe('staff')
  })

  it('sends guests to login', async () => {
    setSession(null)
    await router.push('/admin/settings/countries')

    expect(router.currentRoute.value.name).toBe('login')
  })

  it('is not a valid post-login target for data_entry', () => {
    expect(postLoginTarget(router, 'data_entry', '/admin/settings/countries')).toEqual({
      name: 'staff-data-entry',
    })
  })
})

describe('old Unfit Passports address', () => {
  it('redirects to the Unfit tab of the Medical page, keeping the search', async () => {
    setSession('data_entry')
    await router.push('/data-entry/unfit?q=ZW0751612')

    expect(router.currentRoute.value.name).toBe('medical')
    expect(router.currentRoute.value.query).toEqual({ q: 'ZW0751612', tab: 'unfit' })
  })
})

describe('postLoginTarget', () => {
  it('uses ?redirect when the role may open it', () => {
    expect(postLoginTarget(router, 'admin', '/staff/admin/users?page=2')).toBe(
      '/staff/admin/users?page=2',
    )
  })

  it.each([
    ['a page the role cannot open', '/staff/super-admin'],
    ['an external URL', '//evil.example.com/x'],
    ['an absolute URL', 'https://evil.example.com'],
    ['an unknown page', '/no-such-page'],
    ['the login page', '/login'],
    ['nothing', undefined],
  ])('falls back to the role home for %s', (_label, redirect) => {
    expect(postLoginTarget(router, 'admin', redirect)).toEqual({ name: 'staff-admin' })
  })
})
