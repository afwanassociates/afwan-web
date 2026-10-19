import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import AllPassportsView from '../AllPassportsView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import { listPassportOverview } from '@/api/passports'
import { fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { searchReferences } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { PassportFilters, PassportOverview } from '@/types/passport'

vi.mock('@/api/passports', () => ({
  listPassportOverview: vi.fn(),
  listPassports: vi.fn(),
  downloadPassportOverviewCsv: vi.fn(async () => 'all-passports-01-05-2026.csv'),
}))
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
  // The step bar loads the tab labels for its chips.
  fetchWorkflowConfig: vi.fn(async () => ({ steps: [] })),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/reports', () => ({
  fetchCompanyReport: vi.fn(),
  fetchReportReferences: vi.fn(async () => []),
}))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))

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
      { path: '/:step', name: 'step-page', component: { template: '<div />' } },
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

/** A Filter by dropdown by its label (SearchSelect is generic, so props are read untyped). */
const filterSelect = (label: string) =>
  wrapper
    .findAllComponents(SearchSelect)
    .find((c) => (c.props() as Record<string, unknown>).label === label)!

describe('All Passports (read-only overview)', () => {
  describe('Export CSV', () => {
    it('sits in the page header, outside the card', async () => {
      await mountPage()

      const header = wrapper.get('[data-page-header]')
      expect(header.find('h1').text()).toBe('All Passports')
      expect(header.find('button[data-export]').text()).toContain('Export CSV')
      expect(wrapper.get('section.glass-card').find('[data-export]').exists()).toBe(false)
    })

    it('downloads every passport with the current searches (accounts too)', async () => {
      const { downloadPassportOverviewCsv } = await import('@/api/passports')
      const { useToast } = await import('@/composables/useToast')
      useToast().toasts.value = []
      await mountPage('accounts', '/all-passports?q=rahim&reference_id=8&company_id=3')

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()

      expect(downloadPassportOverviewCsv).toHaveBeenCalledWith({
        view: 'overview',
        medical_status: 'all',
        q: 'rahim',
        reference_id: 8,
        company_id: 3,
      })
      expect(useToast().toasts.value.map((t) => t.message)).toContain(
        'Downloaded all-passports-01-05-2026.csv.',
      )
    })

    it('shows an error toast when the download fails', async () => {
      const { downloadPassportOverviewCsv } = await import('@/api/passports')
      const { useToast } = await import('@/composables/useToast')
      useToast().toasts.value = []
      vi.mocked(downloadPassportOverviewCsv).mockRejectedValueOnce(new Error('boom'))
      await mountPage()

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()

      expect(useToast().toasts.value.some((t) => t.message.includes('Could not export'))).toBe(true)
    })
  })

  describe('accounts (read only)', () => {
    it('links names to the passport page for data entry, but not for accounts', async () => {
      await mountPage('data_entry')
      expect(wrapper.find('[data-row] a[href="/passports/7"]').exists()).toBe(true)
      wrapper.unmount()

      await mountPage('accounts')
      expect(wrapper.find('[data-row] a').exists()).toBe(false)
      expect(wrapper.get('[data-name]').text()).toBe(overview().passport_name)
    })

    it('searches companies through the company report for accounts', async () => {
      vi.mocked(fetchCompanyReport).mockResolvedValue({
        data: [{ id: 3, name: 'Gulf Builders', country_code: 'MY' }],
      } as Awaited<ReturnType<typeof fetchCompanyReport>>)
      await mountPage('accounts')

      // SearchSelect is generic, so its props are read untyped.
      const { fetch } = filterSelect('Filter by company').props() as {
        fetch: (q: string) => Promise<unknown>
      }
      expect(await fetch('gulf')).toEqual([
        { id: 3, name: 'Gulf Builders', country: { code: 'MY', name: 'Malaysia' } },
      ])
      expect(fetchCompanyReport).toHaveBeenCalledWith({ search: 'gulf', per_page: 20 })
      expect(searchCompanies).not.toHaveBeenCalled()
    })
  })

  it('shows no scan copy UI (lists only ever get has_scan)', async () => {
    await mountPage()

    expect(wrapper.find('[data-scan-card]').exists()).toBe(false)
    expect(wrapper.find('tbody img, tbody object').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/scan copy/i)
  })

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

  it('has no "Completed" card or count in the step bar (Completed is only a Step filter option)', async () => {
    await mountPage()

    expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
    expect(wrapper.find('[data-completed]').exists()).toBe(false)
    expect(wrapper.get('nav[aria-label="Workflow steps"]').text()).not.toContain('Completed')
    // The only selects are the Step and Date filters.
    expect(wrapper.findAll('select[data-stage-filter], select[data-date-filter]')).toHaveLength(2)
    expect(wrapper.findAll('select')).toHaveLength(2)
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

  describe('Step and date filters', () => {
    const stageSelect = () => wrapper.get<HTMLSelectElement>('select[data-stage-filter]')
    const dateSelect = () => wrapper.get<HTMLSelectElement>('select[data-date-filter]')

    it('lists every enabled step from the workflow, then Completed', async () => {
      await mountPage()

      expect(
        stageSelect()
          .findAll('option')
          .map((o) => [o.attributes('value'), o.text()]),
      ).toEqual([
        ['', 'All steps'],
        ['passport', 'Passport'],
        ['medical', 'Medical'],
        ['completed', 'Completed'],
      ])
      expect(
        dateSelect()
          .findAll('option')
          .map((o) => o.text()),
      ).toEqual(['Any time', 'Today', 'This week', 'This month', 'Custom range'])
    })

    it('sends the step and the date range (Today / This week / This month end today in Dhaka)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // 18-10-2026, Sunday, midday in Dhaka.
      vi.setSystemTime(new Date('2026-10-18T06:00:00Z'))
      try {
        await mountPage()

        await stageSelect().setValue('medical')
        await flushPromises()
        expect(router.currentRoute.value.query.stage).toBe('medical')
        expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'medical' }))

        await dateSelect().setValue('today')
        await flushPromises()
        expect(lastFilters()).toEqual(
          expect.objectContaining({
            stage: 'medical',
            status_date_from: '2026-10-18',
            status_date_to: '2026-10-18',
          }),
        )

        await dateSelect().setValue('week')
        await flushPromises()
        expect(lastFilters()).toEqual(
          expect.objectContaining({ status_date_from: '2026-10-17', status_date_to: '2026-10-18' }),
        )

        await dateSelect().setValue('month')
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({ stage: 'medical', date: 'month' })
        expect(lastFilters()).toEqual(
          expect.objectContaining({ status_date_from: '2026-10-01', status_date_to: '2026-10-18' }),
        )
        const hint = wrapper
          .get('select[data-date-filter]')
          .element.parentElement!.querySelector('p')!
        expect(hint.textContent!.replace(/\s+/g, ' ').trim()).toBe(
          "01-10-2026 – 18-10-2026 · date of the current step's status",
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('Custom range shows From / To and sends them; they are kept in the URL', async () => {
      await mountPage('admin', '/all-passports?date=custom&date_from=2026-09-01&date_to=2026-09-30')

      expect(wrapper.get<HTMLInputElement>('input[data-date-from]').element.value).toBe(
        '2026-09-01',
      )
      expect(lastFilters()).toEqual(
        expect.objectContaining({ status_date_from: '2026-09-01', status_date_to: '2026-09-30' }),
      )

      await wrapper.get('input[data-date-to]').setValue('2026-09-15')
      await flushPromises()
      expect(router.currentRoute.value.query.date_to).toBe('2026-09-15')
      expect(lastFilters()).toEqual(expect.objectContaining({ status_date_to: '2026-09-15' }))
    })

    it('Clear searches resets the step and the date; Export CSV uses them', async () => {
      const { downloadPassportOverviewCsv } = await import('@/api/passports')
      await mountPage('admin', '/all-passports?stage=completed&date=custom&date_from=2026-09-01')

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()
      expect(downloadPassportOverviewCsv).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'completed', status_date_from: '2026-09-01' }),
      )

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Clear searches')!
        .trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(wrapper.find('input[data-date-from]').exists()).toBe(false)
      expect(lastFilters()!.stage).toBeUndefined()
      expect(lastFilters()!.status_date_from).toBeUndefined()
    })
  })

  describe('Filter by reference', () => {
    const SEA = { id: 8, type: 'agency', type_label: 'Agency', name: 'Sea Star' } as const

    it('is a searchable dropdown like Filter by company, with "All references"', async () => {
      await mountPage()

      expect(wrapper.find('input[data-reference-search]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Search reference')
      expect(filterSelect('Filter by reference').props()).toMatchObject({
        placeholder: 'Search reference…',
        noneLabel: 'All references',
        clearable: true,
      })
    })

    it('choosing a reference sends ?reference_id= with the general search; clearing removes it', async () => {
      await mountPage('admin', '/all-passports?q=rahim&page=2')

      filterSelect('Filter by reference').vm.$emit('update:modelValue', SEA)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'rahim', reference_id: '8' })
      expect(lastFilters()).toEqual(
        expect.objectContaining({ q: 'rahim', reference_id: 8, page: 1 }),
      )

      filterSelect('Filter by reference').vm.$emit('update:modelValue', null)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'rahim' })
      expect(lastFilters()!.reference_id).toBeUndefined()
    })

    it('is read from the URL, and the old ?reference= text search is dropped', async () => {
      await mountPage('admin', '/all-passports?reference_id=8&reference=Green')

      expect(lastFilters()).toEqual(expect.objectContaining({ reference_id: 8 }))
      expect(router.currentRoute.value.query.reference).toBeUndefined()
    })

    it('lists references from the lookup (data entry) or the reports (accounts), limited to the chosen company', async () => {
      await mountPage('admin', '/all-passports?company_id=3')
      const fetchOf = () =>
        (filterSelect('Filter by reference').props() as { fetch: (q: string) => Promise<unknown> })
          .fetch
      await fetchOf()('sea')
      expect(searchReferences).toHaveBeenCalledWith({ q: 'sea', company_id: 3 })
      wrapper.unmount()

      await mountPage('accounts')
      await fetchOf()('sea')
      expect(fetchReportReferences).toHaveBeenCalledWith({ q: 'sea', company_id: undefined })
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

      // Only the Step and Date selects.
      expect(wrapper.findAll('select')).toHaveLength(2)
      expect(wrapper.text()).not.toMatch(/Company country|Sort by|Any company|All countries/)
      const headers = wrapper.findAll('thead th').map((th) => th.text().trim())
      expect(headers).not.toContain('Country')
      expect(headers).not.toContain('Passport expiry')
      expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
    })
  })
})
