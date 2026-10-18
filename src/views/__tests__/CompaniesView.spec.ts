import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import CompaniesView from '../CompaniesView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { searchCompanies } from '@/api/companies'
import { searchReferences } from '@/api/references'
import { downloadCompanyReportCsv, fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { fetchDefaults } from '@/api/countries'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { CompanyReport, CompanyReportRow } from '@/types/report'

vi.mock('@/api/reports', () => ({
  fetchCompanyReport: vi.fn(),
  downloadCompanyReportCsv: vi.fn(async () => 'company-report-10-10-2026.csv'),
  fetchCompanyPassports: vi.fn(),
  fetchReportReferences: vi.fn(),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => [
    { code: 'MY', name: 'Malaysia', is_pinned: true },
    { code: 'SA', name: 'Saudi Arabia', is_pinned: false },
  ]),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))

function row(overrides: Partial<CompanyReportRow>): CompanyReportRow {
  return {
    id: 1,
    name: 'ABC Sdn Bhd',
    country_code: 'MY',
    quota: 10,
    total: 4,
    medical_fit: 3,
    medical_unfit: 1,
    medical_pending: 0,
    not_started: 0,
    calling_done: 2,
    visa_done: 1,
    bmet_done: 0,
    flight_done: 0,
    in_process: 3,
    balance: 6,
    ...overrides,
  }
}

const REPORT: CompanyReport = {
  data: [
    row({ id: 1 }),
    // Over quota: balance is negative.
    row({ id: 2, name: 'Over Quota Co', quota: 2, total: 5, in_process: 0, balance: -3 }),
    // No quota: no balance.
    row({ id: 3, name: 'No Quota Ltd', quota: null, balance: null }),
  ],
  totals: {
    quota: 12,
    total: 13,
    medical_fit: 9,
    medical_unfit: 3,
    medical_pending: 0,
    not_started: 0,
    calling_done: 6,
    visa_done: 3,
    bmet_done: 0,
    flight_done: 0,
    in_process: 6,
    balance: 3,
  },
  meta: { current_page: 1, last_page: 1, per_page: 50, total: 3 },
}

let wrapper: VueWrapper
let router: Router

async function mountAs(role: Role, path = '/reports/companies') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role })
  auth.isReady = true
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reports/companies', name: 'companies', component: CompaniesView },
      {
        path: '/reports/companies/:id',
        name: 'company-report',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push(path)
  wrapper = mount(CompaniesView, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

const rowEl = (id: number) => wrapper.get(`[data-company-row="${id}"]`)
const totalCell = (key: string) => wrapper.get(`[data-totals] [data-total="${key}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchCompanyReport).mockResolvedValue(REPORT)
})
afterEach(() => wrapper.unmount())

describe('CompaniesView', () => {
  it('lists the companies with the brief’s columns', async () => {
    await mountAs('data_entry')

    const headers = wrapper.findAll('thead th').map((th) => th.text().replace(/[↑↓]/g, '').trim())
    expect(headers).toEqual([
      'Company',
      'Quota',
      'Total',
      'Medical fit',
      'Unfit',
      'Calling',
      'Visa',
      'BMET',
      'Flight done',
      'In process',
      'Balance',
    ])
    expect(rowEl(1).text()).toContain('ABC Sdn Bhd')
    expect(rowEl(1).text()).toContain('Malaysia')
  })

  describe('totals row', () => {
    it('is at the bottom, in the table footer, with the API totals', async () => {
      await mountAs('data_entry')

      const totals = wrapper.get('tfoot [data-totals]')
      expect(totals.text()).toContain('Totals')
      expect(totals.text()).toContain('All 3 companies')
      expect(totalCell('quota').text()).toBe('12')
      expect(totalCell('total').text()).toBe('13')
      expect(totalCell('medical_unfit').text()).toBe('3')
      expect(totalCell('in_process').text()).toBe('6')
      expect(totalCell('balance').text()).toBe('3')
      // The totals come after every company row.
      const html = wrapper.get('[data-report-table]').html()
      expect(html.indexOf('data-totals')).toBeGreaterThan(html.indexOf('data-company-row="3"'))
    })

    it('mutes zero totals and shows in process in amber', async () => {
      await mountAs('data_entry')

      expect(totalCell('bmet_done').classes()).toContain('text-slate-400')
      expect(totalCell('in_process').classes()).toContain('text-amber-700')
    })

    it('shows a negative balance total in red', async () => {
      vi.mocked(fetchCompanyReport).mockResolvedValue({
        ...REPORT,
        totals: { ...REPORT.totals, balance: -2 },
      })
      await mountAs('data_entry')

      expect(totalCell('balance').text()).toBe('-2')
      expect(totalCell('balance').classes()).toContain('text-red-700')
    })
  })

  describe('balance colouring', () => {
    it('is red when negative (over quota), with words for screen readers', async () => {
      await mountAs('data_entry')

      const balance = rowEl(2).get('[data-balance]')
      expect(balance.text()).toContain('-3')
      expect(balance.classes()).toContain('text-red-700')
      expect(balance.get('.sr-only').text()).toBe('(over quota)')
    })

    it('is not red when positive, and muted when there is no quota', async () => {
      await mountAs('data_entry')

      const positive = rowEl(1).get('[data-balance]')
      expect(positive.text()).toBe('6')
      expect(positive.classes()).not.toContain('text-red-700')

      const none = rowEl(3).get('[data-balance]')
      expect(none.text()).toBe('—')
      expect(none.classes()).toContain('text-slate-400')
    })
  })

  it('mutes zero counts and shows in process in amber', async () => {
    await mountAs('data_entry')

    expect(rowEl(1).get('[data-count="bmet_done"]').classes()).toContain('text-slate-400')
    expect(rowEl(1).get('[data-count="in_process"]').classes()).toContain('text-amber-700')
    expect(rowEl(2).get('[data-count="in_process"]').classes()).toContain('text-slate-400')
  })

  it('sorts by a column header: largest first, then smallest first', async () => {
    await mountAs('data_entry')

    await wrapper.get('button[data-sort="total"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('-total')
    expect(fetchCompanyReport).toHaveBeenLastCalledWith(expect.objectContaining({ sort: '-total' }))
    expect(wrapper.get('th[aria-sort="descending"]').text()).toContain('Total')

    await wrapper.get('button[data-sort="total"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('total')
  })

  describe('country', () => {
    it('starts on the default company country, with no "All countries" option', async () => {
      vi.mocked(fetchDefaults).mockResolvedValueOnce({
        default_company_country_code: 'SA',
        default_passport_country_code: null,
      } as Awaited<ReturnType<typeof fetchDefaults>>)
      await mountAs('data_entry')

      // One request, already for the default country (never every country).
      expect(fetchCompanyReport).toHaveBeenCalledTimes(1)
      expect(fetchCompanyReport).toHaveBeenCalledWith(
        expect.objectContaining({ country_code: 'SA' }),
      )
      const select = wrapper.get<HTMLSelectElement>('select[data-country]')
      expect(select.element.value).toBe('SA')
      expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual(['MY', 'SA'])
      expect(router.currentRoute.value.query.country).toBeUndefined()
    })

    it('uses Malaysia for accounts (who cannot read the settings)', async () => {
      await mountAs('accounts')

      expect(fetchDefaults).not.toHaveBeenCalled()
      expect(fetchCompanyReport).toHaveBeenCalledWith(
        expect.objectContaining({ country_code: 'MY' }),
      )
    })

    it('keeps a chosen country in the URL; Clear filters goes back to the default', async () => {
      await mountAs('data_entry', '/reports/companies?country=SA&company_id=1')

      expect(fetchCompanyReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ country_code: 'SA' }),
      )
      await wrapper.get('button[data-clear-filters]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect(fetchCompanyReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ country_code: 'MY', company_id: undefined }),
      )
    })

    it('filters by country and exports the CSV with the same filters', async () => {
      await mountAs('data_entry')

      await wrapper.get('select[data-country]').setValue('SA')
      await flushPromises()
      expect(router.currentRoute.value.query.country).toBe('SA')
      expect(fetchCompanyReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ country_code: 'SA' }),
      )

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()
      expect(downloadCompanyReportCsv).toHaveBeenCalledWith({
        company_id: undefined,
        reference_id: undefined,
        country_code: 'SA',
        sort: undefined,
      })
    })
  })

  describe('company and reference filters', () => {
    const filter = (label: string) =>
      wrapper
        .findAllComponents(SearchSelect)
        .find((c) => (c.props() as Record<string, unknown>).label === label)!
    const fetchOf = (label: string) =>
      (filter(label).props() as { fetch: (q: string) => Promise<unknown> }).fetch

    it('are searchable dropdowns, like the passport pages', async () => {
      await mountAs('data_entry')

      const labels = wrapper
        .findAllComponents(SearchSelect)
        .map((c) => (c.props() as Record<string, unknown>).label)
      expect(labels).toEqual(['Filter by company', 'Filter by reference'])
      expect(filter('Filter by company').props()).toMatchObject({
        placeholder: 'Search company…',
        noneLabel: 'All companies',
        clearable: true,
      })
      expect(filter('Filter by reference').props()).toMatchObject({
        placeholder: 'Search reference…',
        noneLabel: 'All references',
        clearable: true,
      })
    })

    it('search the lookups for data entry', async () => {
      await mountAs('data_entry')

      await fetchOf('Filter by company')('alp')
      await fetchOf('Filter by reference')('sea')
      expect(searchCompanies).toHaveBeenCalledWith('alp')
      expect(searchReferences).toHaveBeenCalledWith({ q: 'sea' })
    })

    it('search the reports for accounts (who cannot use the lookups)', async () => {
      const SEA = { id: 8, type: 'agency', type_label: 'Agency', name: 'Sea Star' } as const
      vi.mocked(fetchReportReferences).mockResolvedValue([SEA])
      await mountAs('accounts')

      expect(await fetchOf('Filter by reference')('sea')).toEqual([SEA])
      expect(fetchReportReferences).toHaveBeenCalledWith({ q: 'sea', company_id: undefined })
      expect(searchReferences).not.toHaveBeenCalled()

      await fetchOf('Filter by company')('abc')
      expect(fetchCompanyReport).toHaveBeenLastCalledWith({ search: 'abc', per_page: 20 })
      expect(searchCompanies).not.toHaveBeenCalled()
    })

    it('with a company chosen, lists only the references of that company', async () => {
      await mountAs('data_entry', '/reports/companies?company_id=1')
      await fetchOf('Filter by reference')('')
      expect(searchReferences).toHaveBeenLastCalledWith({ q: '', company_id: 1 })

      wrapper.unmount()
      vi.mocked(fetchReportReferences).mockResolvedValue([])
      await mountAs('accounts', '/reports/companies?company_id=1')
      await fetchOf('Filter by reference')('sea')
      expect(fetchReportReferences).toHaveBeenLastCalledWith({ q: 'sea', company_id: 1 })
    })

    it('choosing a company and a reference filters the report and keeps both in the URL', async () => {
      await mountAs('data_entry')

      filter('Filter by company').vm.$emit('update:modelValue', {
        id: 1,
        name: 'ABC Sdn Bhd',
        country: { code: 'MY', name: 'Malaysia' },
      })
      await flushPromises()
      filter('Filter by reference').vm.$emit('update:modelValue', {
        id: 8,
        type: 'agency',
        type_label: 'Agency',
        name: 'Sea Star',
      })
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ company_id: '1', reference_id: '8' })
      expect(fetchCompanyReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ company_id: 1, reference_id: 8, country_code: 'MY' }),
      )

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()
      expect(downloadCompanyReportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ company_id: 1, reference_id: 8 }),
      )

      // "All references" (or the clear button) removes it again.
      filter('Filter by reference').vm.$emit('update:modelValue', null)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ company_id: '1' })
    })

    it('shows the chosen names after a reload, and Clear filters empties both', async () => {
      vi.mocked(fetchCompanyReport).mockResolvedValue({
        ...REPORT,
        filters: {
          company: { id: 1, name: 'ABC Sdn Bhd', country_code: 'MY' },
          reference: { id: 8, type: 'agency', type_label: 'Agency', name: 'Sea Star' },
        },
      })
      await mountAs('data_entry', '/reports/companies?company_id=1&reference_id=8')

      expect(
        (filter('Filter by company').props() as Record<string, unknown>).modelValue,
      ).toMatchObject({
        id: 1,
        name: 'ABC Sdn Bhd',
      })
      expect(
        (filter('Filter by reference').props() as Record<string, unknown>).modelValue,
      ).toMatchObject({
        id: 8,
        name: 'Sea Star',
      })

      vi.mocked(fetchCompanyReport).mockResolvedValue(REPORT)
      await wrapper.get('button[data-clear-filters]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({})
      expect((filter('Filter by company').props() as Record<string, unknown>).modelValue).toBeNull()
      expect(
        (filter('Filter by reference').props() as Record<string, unknown>).modelValue,
      ).toBeNull()
    })

    it('changing the country drops the chosen company', async () => {
      await mountAs('data_entry', '/reports/companies?company_id=1')

      await wrapper.get('select[data-country]').setValue('SA')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ country: 'SA' })
    })
  })

  it('opens the company page when a row is clicked', async () => {
    await mountAs('accounts')

    await rowEl(2).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('company-report')
    expect(router.currentRoute.value.params.id).toBe('2')
  })

  it('shows an empty state', async () => {
    vi.mocked(fetchCompanyReport).mockResolvedValue({
      ...REPORT,
      data: [],
      meta: { ...REPORT.meta, total: 0 },
    })
    await mountAs('data_entry', '/reports/companies?reference_id=8')

    expect(wrapper.get('[data-empty]').text()).toContain('No companies match these filters.')
  })

  it('shows an error with a retry button', async () => {
    vi.mocked(fetchCompanyReport).mockRejectedValueOnce(httpError(500))
    await mountAs('data_entry')

    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.get('[data-error] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-totals]').exists()).toBe(true)
  })
})
