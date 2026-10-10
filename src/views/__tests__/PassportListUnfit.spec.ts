import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportListView from '../PassportListView.vue'
import { listPassports } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { PassportEntry, PassportFilters } from '@/types/passport'

vi.mock('@/api/passports', () => ({ listPassports: vi.fn(), deletePassport: vi.fn() }))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [],
    step1: { total_all: 4, total_active: 1, incomplete: 0 },
    step2: { pending: 1, fit: 0, expiring_soon: 0, expired: 0, unfit: 3 },
    step3: { enabled: false, ready: 0 },
  })),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))

const page = (data: PassportEntry[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: data.length,
    from: 1,
    to: data.length,
  },
})

let wrapper: VueWrapper
let router: Router

async function mountList(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'data_entry' })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports', name: 'passports', component: PassportListView },
      { path: '/passports/new', name: 'passport-new', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/unfit', name: 'unfit', component: Empty },
      { path: '/all-passports', name: 'all-passports', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
      { path: '/process', name: 'process', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

/** The main list is empty for the search; the unfit check finds `unfitTotal` matches. */
function mockSearch(unfitTotal: number) {
  vi.mocked(listPassports).mockImplementation(async (filters: PassportFilters) =>
    filters.medical_status === 'unfit'
      ? page(Array.from({ length: unfitTotal }, () => makePassport()))
      : page([]),
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('Passport List without medical parts', () => {
  it('has no step bar, and links to All Passports with the total', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([makePassport()]))
    await mountList('/passports')

    expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(false)
    const link = wrapper.get('[data-all-link]')
    expect(link.text()).toBe('View all passports (4)')
    expect(link.attributes('href')).toBe('/all-passports')
  })

  it('shows a hint when the searched passport is only in the Unfit list', async () => {
    mockSearch(1)
    await mountList('/passports?q=ZW0751612')

    expect(listPassports).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'ZW0751612', medical_status: 'unfit' }),
    )
    const hint = wrapper.get('[data-unfit-hint]')
    expect(hint.text()).toBe('Not found here. Check Medical → Unfit.')
    expect(hint.get('a').attributes('href')).toBe('/medical?tab=unfit&q=ZW0751612')
  })

  it('shows no hint when the Unfit list has no match either', async () => {
    mockSearch(0)
    await mountList('/passports?q=NOPE123')

    expect(wrapper.find('[data-unfit-hint]').exists()).toBe(false)
  })

  it('still renders its Edit action (unchanged by the All Passports overview)', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([makePassport()]))
    await mountList('/passports')

    const edit = wrapper.findAll('a').find((a) => a.text().startsWith('Edit'))
    expect(edit?.attributes('href')).toBe('/passports/42/edit')
  })
})
