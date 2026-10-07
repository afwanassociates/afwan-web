import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import StaffLayout from '../StaffLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'

let wrapper: VueWrapper

const Empty = { template: '<div />' }
const ROUTE_NAMES = [
  'settings-countries',
  'home',
  'login',
  'staff-super-admin',
  'staff-admin',
  'staff-data-entry',
  'staff-accounts',
  'staff-users',
  'passports',
  'passport-new',
]

async function mountAs(role: Role, path = '/home') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role })
  auth.isReady = true
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...ROUTE_NAMES.map((name) => ({ path: `/${name}`, name, component: Empty })),
      { path: '/admin/settings', name: 'settings', component: Empty },
      { path: '/admin/settings/countries', name: 'settings-page', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount(StaffLayout, { global: { plugins: [pinia, router] } })
}

const navLabels = () => wrapper.findAll('nav[aria-label="Staff portal"] a').map((a) => a.text())

afterEach(() => wrapper.unmount())

describe('StaffLayout menu', () => {
  it.each(['data_entry', 'accounts'] as const)('hides "Settings" from %s', async (role) => {
    await mountAs(role)

    expect(navLabels()).not.toContain('Settings')
  })

  it.each(['admin', 'super_admin'] as const)('shows "Settings" to %s', async (role) => {
    await mountAs(role)

    expect(navLabels()).toContain('Settings')
  })

  it('links "Settings" to the settings overview and highlights it on every settings page', async () => {
    await mountAs('admin', '/admin/settings/countries')

    const settings = wrapper
      .findAll('nav[aria-label="Staff portal"] a')
      .find((a) => a.text() === 'Settings')!
    expect(settings.attributes('href')).toBe('/admin/settings')
    expect(settings.attributes('aria-current')).toBe('page')
    expect(settings.classes()).toContain('bg-white/15')
  })

  it.each([
    ['super_admin', ['Dashboard', 'Add Passport', 'Passport List', 'Users', 'Settings']],
    ['admin', ['Dashboard', 'Add Passport', 'Passport List', 'Users', 'Settings']],
    ['data_entry', ['Dashboard', 'Add Passport', 'Passport List']],
    ['accounts', ['Dashboard']],
  ] as const)('shows %s one "Dashboard" and its own screens', async (role, labels) => {
    await mountAs(role)

    expect(navLabels()).toEqual(labels)
  })

  it.each([
    ['super_admin', '/staff-super-admin'],
    ['admin', '/staff-admin'],
    ['data_entry', '/staff-data-entry'],
    ['accounts', '/staff-accounts'],
  ] as const)('links "Dashboard" to the %s dashboard only', async (role, href) => {
    await mountAs(role)

    const dashboard = wrapper.findAll('nav[aria-label="Staff portal"] a')[0]!
    expect(dashboard.attributes('href')).toBe(href)
  })
})
