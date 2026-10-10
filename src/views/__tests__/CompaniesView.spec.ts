import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import CompaniesView from '../CompaniesView.vue'
import { downloadCompanyReportCsv, fetchCompanyReport } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { CompanyReport, CompanyReportRow } from '@/types/report'

vi.mock('@/api/reports', () => ({
  fetchCompanyReport: vi.fn(),
  downloadCompanyReportCsv: vi.fn(async () => 'company-report-10-10-2026.csv'),
  fetchCompanyPassports: vi.fn(),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => [{ code: 'MY', name: 'Malaysia', is_pinned: true }]),
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
    agent_name: 'Rahim',
    bd_agency_name: 'Dhaka Overseas',
    quota: 10,
    total: 4,
    medical_fit: 3,
    medical_unfit: 1,
    medical_pending: 0,
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
      'Agent',
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
    expect(rowEl(1).text()).toContain('Rahim')
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

  it('filters by country and exports the CSV with the same filters', async () => {
    await mountAs('data_entry')

    await wrapper.get('select[data-country]').setValue('MY')
    await flushPromises()
    expect(fetchCompanyReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ country_code: 'MY' }),
    )

    await wrapper.get('button[data-export]').trigger('click')
    await flushPromises()
    expect(downloadCompanyReportCsv).toHaveBeenCalledWith({
      search: undefined,
      country_code: 'MY',
      sort: undefined,
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
    await mountAs('data_entry', '/reports/companies?search=zzz')

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
