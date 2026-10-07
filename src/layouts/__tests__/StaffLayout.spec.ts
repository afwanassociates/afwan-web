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
  'home',
  'login',
  'staff-super-admin',
  'staff-admin',
  'staff-data-entry',
  'staff-accounts',
  'staff-users',
  'passports',
  'passport-new',
  'settings-countries',
]

async function mountAs(role: Role) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role })
  auth.isReady = true
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({ path: `/${name}`, name, component: Empty })),
  })
  await router.push('/home')
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

  it('shows the passport screens to data_entry', async () => {
    await mountAs('data_entry')

    expect(navLabels()).toEqual(['Data Entry Team area', 'Add Passport', 'Passport List'])
  })
})
