import { describe, it, expect, vi } from 'vitest'
import router from '@/router'
import { SETTINGS_PAGES, SETTINGS_SECTION_ROLES, settingsPagesFor } from '@/lib/settingsPages'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  CURRENT_USER_PATH: '/api/user',
}))

describe('SETTINGS_PAGES registry', () => {
  it.each(SETTINGS_PAGES.map((page) => [page.name, page] as const))(
    '%s has a route under /admin/settings with its roles',
    (_name, page) => {
      const resolved = router.resolve({ name: page.name })

      expect(resolved.path).toBe(`/admin/settings/${page.path}`)
      expect(resolved.meta.roles).toEqual(page.roles)
      expect(resolved.meta.layout).toBe('staff')
      expect(resolved.meta.requiresAuth).toBe(true)
    },
  )

  it('has unique names and paths', () => {
    expect(new Set(SETTINGS_PAGES.map((p) => p.name)).size).toBe(SETTINGS_PAGES.length)
    expect(new Set(SETTINGS_PAGES.map((p) => p.path)).size).toBe(SETTINGS_PAGES.length)
  })

  it('gives admins and super admins every page and other roles none', () => {
    expect(settingsPagesFor('super_admin')).toHaveLength(SETTINGS_PAGES.length)
    expect(settingsPagesFor('admin')).toHaveLength(SETTINGS_PAGES.length)
    expect(settingsPagesFor('data_entry')).toEqual([])
    expect(settingsPagesFor('accounts')).toEqual([])
    expect([...SETTINGS_SECTION_ROLES].sort()).toEqual(['admin', 'super_admin'])
  })
})
