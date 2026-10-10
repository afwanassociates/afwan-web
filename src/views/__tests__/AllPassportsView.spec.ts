import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import AllPassportsView from '../AllPassportsView.vue'
import { listPassportOverview } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { PassportFilters, PassportOverview } from '@/types/passport'

vi.mock('@/api/passports', () => ({ listPassportOverview: vi.fn(), listPassports: vi.fn() }))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [
      { key: 'passport', label: 'Passport', enabled: true },
      { key: 'medical', label: 'Medical', enabled: true },
      { key: 'step3', label: 'Step 3', enabled: false },
    ],
    step1: { total_all: 24, total_active: 20, incomplete: 3 },
    step2: { pending: 7, fit: 5, expiring_soon: 1, expired: 2, unfit: 4 },
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

function overview(overrides: Partial<PassportOverview> = {}): PassportOverview {
  return {
    id: 7,
    passport_name: 'ESTELLE TILLMAN',
    passport_number: 'PR8212426',
    date_of_birth: '1990-05-17',
    country: { code: 'BD', name: 'Bangladesh' },
    passport_expiry_date: '2031-09-29',
    company: { id: 3, name: 'Desert Rose', country: { code: 'MY', name: 'Malaysia' } },
    reference: { id: 5, name: 'Green Field', type: 'agency' },
    passport_received_date: '2025-10-25',
    entered_by: { id: 3, name: 'Data Entry' },
    created_at: '2026-10-04T12:44:46.000000Z',
    latest_status: {
      stage: 'medical',
      stage_label: 'Medical',
      status: 'unfit',
      status_label: 'Unfit',
      text: 'Medical: Unfit',
      tone: 'red',
      date: '2026-10-08',
    },
    ...overrides,
  }
}

const page = (data: PassportOverview[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 3, per_page: 15, total: 40, from: 1, to: data.length },
})

let wrapper: VueWrapper
let router: Router

async function mountPage(role: Role = 'admin', path = '/all-passports') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/all-passports', name: 'all-passports', component: AllPassportsView },
      { path: '/passports', name: 'passports', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
      { path: '/process', name: 'process', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

/** Filters of the latest list request (the test tsconfig has no Array.prototype.at). */
const lastFilters = (): PassportFilters | undefined => {
  const calls = vi.mocked(listPassportOverview).mock.calls
  return calls[calls.length - 1]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPassportOverview).mockResolvedValue(page([overview()]))
})
afterEach(() => wrapper.unmount())

describe('All Passports (read-only overview)', () => {
  it.each(['admin', 'super_admin', 'data_entry'] as const)(
    'has no chips, medical or stage filters, or action buttons (%s)',
    async (role) => {
      await mountPage(role)

      expect(wrapper.find('[data-chip]').exists()).toBe(false)
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
      const text = wrapper.text()
      expect(text).not.toMatch(/Medical status|Stage/)
      const controls = wrapper
        .findAll('button, a')
        .map((el) => el.text())
        .filter((t) => /^(Edit|Record|Re-test|Repeat|Delete|Update status)/.test(t))
      expect(controls).toEqual([])
    },
  )

  it('keeps the step bar (overview mode), the search and the pagination', async () => {
    await mountPage()

    const bar = wrapper.get('nav[aria-label="Workflow steps"]')
    expect(bar.find('[aria-current]').exists()).toBe(false)
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    expect(wrapper.find('nav[aria-label="Pagination"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Every passport in every status, including unfit.')
  })

  it('has the overview columns, without Medical, Stage or progress dots', async () => {
    await mountPage()

    expect(
      wrapper.findAll('thead th').map((th) =>
        th
          .text()
          .replace(/[↑↓↕]|\(.*\)/g, '')
          .trim(),
      ),
    ).toEqual([
      'Passport name',
      'Passport number',
      'Latest status',
      'Country',
      'Passport expiry',
      'Reference',
      'Company',
      'Received',
      'Entered by',
    ])
    expect(wrapper.find('[data-mode="compact"]').exists()).toBe(false)

    const row = wrapper.get('tr[data-row]')
    expect(row.text()).toContain('Born 17-05-1990')
    expect(row.get('[data-status-text]').text()).toBe('Medical: Unfit')
    expect(row.get('[data-expiry-badge]').text()).toBe('Valid')
    expect(row.text()).toContain('Agency')
    expect(row.text()).toContain('Malaysia')
    expect(row.text()).toContain('Data Entry')
    expect(row.get('a').attributes('href')).toBe('/passports/7')
  })

  it('always asks for the overview of every status, newest status first', async () => {
    await mountPage()

    expect(lastFilters()).toEqual(
      expect.objectContaining({
        view: 'overview',
        medical_status: 'all',
        sort: 'status_date',
        direction: 'desc',
        page: 1,
      }),
    )
  })

  it('ignores and drops the old status and stage parameters', async () => {
    await mountPage('admin', '/all-passports?status=unfit&stage=medical&q=rahim')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ q: 'rahim' })
    expect(lastFilters()).toEqual(expect.objectContaining({ medical_status: 'all', q: 'rahim' }))
  })

  it('sorts by status date from the "Latest status" header', async () => {
    await mountPage()
    const header = () => wrapper.get('th[aria-sort]')
    expect(header().attributes('aria-sort')).toBe('descending')

    await wrapper.get('[data-sort-status]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.sort).toBe('status_date:asc')
    expect(lastFilters()).toEqual(
      expect.objectContaining({ sort: 'status_date', direction: 'asc' }),
    )
    expect(header().attributes('aria-sort')).toBe('ascending')
  })
})
