import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import StaffLayout from '../StaffLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'

vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [],
    step1: { total_all: 24, total_active: 20, incomplete: 3 },
    step2: { pending: 7, fit: 5, expiring_soon: 1, expired: 2, unfit: 4 },
    step3: { enabled: false, ready: 0 },
    // The badge is the Pending tab's count (step_tabs), not the stage's.
    stages: { calling: { total: 5, waiting: 9, in_process: 1, rejected: 1 } },
    step_tabs: { calling: { pending: 3, permitted: 2 } },
  })),
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
}))

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
  'all-passports',
  'medical',
  'process',
  'unfit',
  'companies',
  'admin-companies',
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
      { path: '/:step', name: 'step-page', component: Empty },
      { path: '/admin/settings', name: 'settings', component: Empty },
      { path: '/admin/settings/countries', name: 'settings-page', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount(StaffLayout, { global: { plugins: [pinia, router] } })
}

const navLabels = () =>
  wrapper.findAll('nav[aria-label="Staff portal"] a').map((a) => a.find('[data-label]').text())

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
    [
      'super_admin',
      [
        'Dashboard',
        'All Passports',
        'Add Passport',
        'Passport List',
        'Medical',
        'Calling / Work Permit',
        'Visa',
        'BMET Clearance',
        'Flight',
        'Users',
        'Companies',
        'Settings',
      ],
    ],
    [
      'admin',
      [
        'Dashboard',
        'All Passports',
        'Add Passport',
        'Passport List',
        'Medical',
        'Calling / Work Permit',
        'Visa',
        'BMET Clearance',
        'Flight',
        'Users',
        'Companies',
        'Settings',
      ],
    ],
    [
      'data_entry',
      [
        'Dashboard',
        'All Passports',
        'Add Passport',
        'Passport List',
        'Medical',
        'Calling / Work Permit',
        'Visa',
        'BMET Clearance',
        'Flight',
      ],
    ],
    // Accounts: the Company report is in the top menu.
    ['accounts', ['Dashboard']],
  ] as const)('shows %s one "Dashboard" and its own screens', async (role, labels) => {
    await mountAs(role)

    expect(navLabels()).toEqual(labels)
  })

  it.each(['super_admin', 'admin', 'data_entry', 'accounts'] as const)(
    'shows %s the "Company" report in the top menu',
    async (role) => {
      await mountAs(role, '/companies')

      const top = wrapper.findAll('nav[aria-label="Reports"] a')
      expect(top.map((a) => a.text())).toEqual(['Company'])
      expect(top[0]!.attributes('href')).toBe('/companies')
    },
  )

  it.each([
    ['admin', true],
    ['super_admin', true],
    ['data_entry', false],
    ['accounts', false],
  ] as const)('admin panel "Companies" in the sidebar for %s: %s', async (role, shown) => {
    await mountAs(role)

    const link = wrapper
      .findAll('nav[aria-label="Staff portal"] a')
      .find((a) => a.attributes('href') === '/admin-companies')
    expect(Boolean(link)).toBe(shown)
  })

  it('shows the four steps as top-level items right after Medical, with no "Process" heading', async () => {
    await mountAs('data_entry')
    await flushPromises()

    const nav = wrapper.get('nav[aria-label="Staff portal"]')
    expect(nav.text()).not.toMatch(/process/i)
    expect(nav.find('[data-group]').exists()).toBe(false)
    // Every item is a direct child of the one list, like Medical.
    const items = nav.findAll(':scope > ul > li > a')
    const labels = items.map((a) => a.get('[data-label]').text())
    const medical = labels.indexOf('Medical')
    expect(labels.slice(medical, medical + 5)).toEqual([
      'Medical',
      'Calling / Work Permit',
      'Visa',
      'BMET Clearance',
      'Flight',
    ])
    const hrefs = items.map((a) => a.attributes('href'))
    expect(hrefs.slice(medical + 1, medical + 5)).toEqual(['/calling', '/visa', '/bmet', '/flight'])
    // Same link classes and badge as Medical.
    const medicalLink = items[medical]!
    const calling = items[medical + 1]!
    expect(calling.classes()).toEqual(medicalLink.classes())
    expect(calling.get('[data-badge]').text()).toBe('3 pending')
    expect(calling.get('[data-badge]').classes()).toEqual(medicalLink.get('[data-badge]').classes())
  })

  it('highlights the open step page only', async () => {
    await mountAs('data_entry', '/visa')
    await flushPromises()

    const link = (href: string) => wrapper.get(`nav[aria-label="Staff portal"] a[href="${href}"]`)
    expect(link('/visa').attributes('aria-current')).toBe('page')
    expect(link('/visa').classes()).toContain('bg-white/15')
    expect(link('/calling').attributes('aria-current')).toBeUndefined()
    expect(link('/medical').attributes('aria-current')).toBeUndefined()
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

  it('shows the pending count on "Medical" (Unfit is a tab of Medical, not a menu item)', async () => {
    await mountAs('data_entry')
    await flushPromises()

    const link = (label: string) =>
      wrapper
        .findAll('nav[aria-label="Staff portal"] a')
        .find((a) => a.find('[data-label]').text() === label)!
    expect(link('Medical').find('[data-badge]').text()).toBe('7 pending')
    expect(navLabels()).not.toContain('Unfit Passports')
  })
})
