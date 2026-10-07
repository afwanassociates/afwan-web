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
      ['accounts', '/staff/admin/users'],
    ] as const)('%s opening %s gets the 403 page', async (role, path) => {
      setSession(role)
      await router.push(path)

      expect(router.currentRoute.value.name).toBe('forbidden')
      expect(router.currentRoute.value.query.from).toBe(path)
      expect(router.currentRoute.value.meta.layout).toBe('staff')
    })
  })

  describe('right role', () => {
    it.each([
      ['super_admin', '/staff/super-admin'],
      ['super_admin', '/data-entry/passports'],
      ['super_admin', '/staff/admin/users'],
      ['admin', '/staff/admin'],
      ['admin', '/data-entry/passports'],
      ['admin', '/staff/admin/users'],
      ['data_entry', '/staff/data-entry'],
      ['accounts', '/staff/accounts'],
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
