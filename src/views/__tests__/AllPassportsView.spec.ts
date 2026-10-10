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

  it('has the overview columns, without Country, Passport expiry, Medical or Stage', async () => {
    await mountPage()

    expect(wrapper.findAll('thead th').map((th) => th.text().trim())).toEqual([
      'Passport name',
      'Passport number',
      'Latest status',
      'Reference',
      'Company',
      'Received',
      'Entered by',
    ])
    expect(wrapper.find('[data-mode="compact"]').exists()).toBe(false)
    // Not in the phone cards either.
    const card = wrapper.get('li[data-row]').text()
    expect(card).not.toContain('Passport expiry')
    expect(card).not.toContain('Bangladesh') // the passport's country

    const row = wrapper.get('tr[data-row]')
    expect(row.text()).toContain('Born 17-05-1990')
    expect(row.get('[data-status-text]').text()).toBe('Medical: Unfit')
    expect(row.find('[data-expiry-badge]').exists()).toBe(false)
    expect(row.text()).not.toContain('29-09-2031')
    expect(row.text()).toContain('Agency')
    expect(row.text()).toContain('Malaysia') // the company's country stays
    expect(row.text()).toContain('Data Entry')
    expect(row.get('a').attributes('href')).toBe('/passports/7')
  })

  it('has no Company, Country or Sort-by controls and no sortable headers', async () => {
    await mountPage()

    const labels = wrapper.findAll('label').map((l) => l.text().trim())
    expect(labels).toEqual(['Search', 'Search reference', 'Search company'])
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input[role="combobox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Company country|Sort by|Any company|All countries/)
    expect(wrapper.find('th[aria-sort]').exists()).toBe(false)
    expect(wrapper.find('th button').exists()).toBe(false)
  })

  it('has no "Completed" option, card or count', async () => {
    await mountPage()

    expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
    expect(wrapper.find('[data-completed]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Completed')
    expect(wrapper.find('option').exists()).toBe(false)
  })

  it('always asks for the overview of every status, with no sort (newest first)', async () => {
    await mountPage()

    const filters = lastFilters()!
    expect(filters).toEqual(
      expect.objectContaining({ view: 'overview', medical_status: 'all', page: 1 }),
    )
    expect(filters.sort).toBeUndefined()
    expect(filters.direction).toBeUndefined()
    expect(filters).not.toHaveProperty('company_id')
    expect(filters).not.toHaveProperty('company_country_code')
  })

  it('ignores and drops old status, stage, sort, company and country parameters', async () => {
    await mountPage(
      'admin',
      '/all-passports?status=unfit&stage=medical&sort=status_date:asc&company_id=3&company_country_code=MY&q=rahim',
    )
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ q: 'rahim' })
    expect(lastFilters()).toEqual(expect.objectContaining({ medical_status: 'all', q: 'rahim' }))
    expect(lastFilters()!.sort).toBeUndefined()
    expect(lastFilters()!.company_id).toBeUndefined()
  })

  describe('reference search', () => {
    it('is debounced (300 ms) and sends ?reference= with the general search', async () => {
      vi.useFakeTimers()
      try {
        await mountPage('admin', '/all-passports?q=rahim')

        await wrapper.get('input[data-reference-search]').setValue('green f')
        await vi.advanceTimersByTimeAsync(200)
        expect(router.currentRoute.value.query.reference).toBeUndefined()

        await vi.advanceTimersByTimeAsync(150)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({ q: 'rahim', reference: 'green f' })
        expect(lastFilters()).toEqual(
          expect.objectContaining({ q: 'rahim', reference: 'green f', page: 1 }),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('is read from the URL, so a refresh or shared link keeps it', async () => {
      await mountPage('admin', '/all-passports?reference=Green&q=PR82')

      expect(wrapper.get<HTMLInputElement>('input[data-reference-search]').element.value).toBe(
        'Green',
      )
      expect(wrapper.get<HTMLInputElement>('input[data-search]').element.value).toBe('PR82')
      expect(lastFilters()).toEqual(expect.objectContaining({ reference: 'Green', q: 'PR82' }))
    })

    it('has a clear (x) button that keeps the general search', async () => {
      await mountPage('admin', '/all-passports?reference=Green&q=rahim&page=2')

      const clear = wrapper.get('button[data-clear-reference]')
      expect(clear.text()).toBe('Clear reference search')
      await clear.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ q: 'rahim' })
      expect(wrapper.find('button[data-clear-reference]').exists()).toBe(false)
      expect(lastFilters()!.reference).toBeUndefined()
    })

    it('mentions both searches in the empty state', async () => {
      vi.mocked(listPassportOverview).mockResolvedValue({
        ...page([]),
        meta: { current_page: 1, last_page: 1, per_page: 15, total: 0, from: null, to: null },
      })
      await mountPage('admin', '/all-passports?reference=nobody')

      const empty = wrapper.get('[data-empty]').text()
      expect(empty).toContain('No passports match these searches.')
      expect(empty).toContain('name or passport number, reference and company searches')
    })
  })

  describe('company search', () => {
    it('renders next to the other searches, empty, with no clear button yet', async () => {
      await mountPage()

      const input = wrapper.get<HTMLInputElement>('input[data-company-search]')
      expect(input.element.value).toBe('')
      expect(input.attributes('type')).toBe('text')
      expect(wrapper.find('button[data-clear-company]').exists()).toBe(false)
      // Still a plain text search, not the old Company dropdown.
      expect(wrapper.find('input[role="combobox"]').exists()).toBe(false)
    })

    it('is debounced (300 ms) and sends ?company= together with q and reference', async () => {
      vi.useFakeTimers()
      try {
        await mountPage('admin', '/all-passports?q=rahim&reference=green')

        await wrapper.get('input[data-company-search]').setValue('Desert R')
        await vi.advanceTimersByTimeAsync(200)
        expect(router.currentRoute.value.query.company).toBeUndefined()

        await vi.advanceTimersByTimeAsync(150)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({
          q: 'rahim',
          reference: 'green',
          company: 'Desert R',
        })
        expect(lastFilters()).toEqual(
          expect.objectContaining({
            q: 'rahim',
            reference: 'green',
            company: 'Desert R',
            page: 1,
          }),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('is read from the URL, so a refresh or shared link keeps it', async () => {
      await mountPage('admin', '/all-passports?company=desert')

      expect(wrapper.get<HTMLInputElement>('input[data-company-search]').element.value).toBe(
        'desert',
      )
      expect(lastFilters()).toEqual(expect.objectContaining({ company: 'desert' }))
      // The old company id filter is never sent.
      expect(lastFilters()!.company_id).toBeUndefined()
    })

    it('has a clear (x) button that keeps the other two searches', async () => {
      await mountPage('admin', '/all-passports?company=desert&reference=green&q=rahim&page=2')

      const clear = wrapper.get('button[data-clear-company]')
      expect(clear.text()).toBe('Clear company search')
      await clear.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ q: 'rahim', reference: 'green' })
      expect(lastFilters()!.company).toBeUndefined()
      expect(lastFilters()).toEqual(expect.objectContaining({ q: 'rahim', reference: 'green' }))
    })

    it('"Clear searches" clears all three', async () => {
      await mountPage('admin', '/all-passports?company=desert&reference=green&q=rahim')

      const clearAll = wrapper.findAll('button').find((b) => b.text() === 'Clear searches')!
      await clearAll.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({})
    })

    it('keeps the removed controls, columns and "Completed" out', async () => {
      await mountPage('admin', '/all-passports?company=desert')

      expect(wrapper.find('select').exists()).toBe(false)
      expect(wrapper.text()).not.toMatch(/Company country|Sort by|Any company|All countries/)
      const headers = wrapper.findAll('thead th').map((th) => th.text().trim())
      expect(headers).not.toContain('Country')
      expect(headers).not.toContain('Passport expiry')
      expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Completed')
    })
  })
})
