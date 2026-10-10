import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import CompanyView from '../CompanyView.vue'
import { searchCompanies } from '@/api/companies'
import { fetchCompanyPassports, fetchCompanyReport } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { httpError, makePassport, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { Company } from '@/types/passport'
import type { CompanyPassport, CompanyReportRow } from '@/types/report'

vi.mock('@/api/reports', () => ({
  fetchCompanyReport: vi.fn(),
  fetchCompanyPassports: vi.fn(),
  downloadCompanyReportCsv: vi.fn(),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn() }))

const ROW: CompanyReportRow = {
  id: 7,
  name: 'ABC Sdn Bhd',
  country_code: 'MY',
  agent_name: 'Rahim',
  bd_agency_name: 'Dhaka Overseas',
  quota: 2,
  total: 3,
  medical_fit: 2,
  medical_unfit: 1,
  medical_pending: 0,
  calling_done: 1,
  visa_done: 0,
  bmet_done: 0,
  flight_done: 0,
  in_process: 2,
  balance: -1,
}

const STEPS = [
  { key: 'passport', label: 'Passport', enabled: true, state: 'done' as const },
  { key: 'medical', label: 'Medical', enabled: true, state: 'passed' as const },
  { key: 'calling', label: 'Calling', enabled: true, state: 'in_process' as const },
  { key: 'visa', label: 'Visa', enabled: true, state: 'locked' as const },
  { key: 'bmet', label: 'BMET', enabled: true, state: 'locked' as const },
  { key: 'flight', label: 'Flight', enabled: true, state: 'locked' as const },
]

function passport(id: number, name: string): CompanyPassport {
  const base = makePassport({ id, passport_name: name })
  return {
    ...base,
    company: { id: 7, name: 'ABC Sdn Bhd', country: { code: 'MY', name: 'Malaysia' } },
    workflow: { current_step: 'calling', steps: STEPS },
    latest_status: {
      stage: 'calling',
      stage_label: 'Calling',
      status: 'in_process',
      status_label: 'Applied',
      text: 'Calling: Applied',
      tone: 'amber',
      date: '2026-09-15',
    },
  }
}

const PAGE_1 = {
  data: [passport(11, 'KARIM UDDIN'), passport(12, 'SALMA BEGUM')],
  links: { first: null, last: null, prev: null, next: '?page=2' },
  meta: { current_page: 1, last_page: 2, per_page: 15, total: 17, from: 1, to: 15 },
}

let wrapper: VueWrapper
let router: Router

async function mountAs(role: Role, path = '/reports/companies/7') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role })
  auth.isReady = true
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reports/companies', name: 'companies', component: { template: '<div />' } },
      { path: '/reports/companies/:id', name: 'company-report', component: CompanyView },
      { path: '/passports/:id', name: 'passport-detail', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  wrapper = mount(CompanyView, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchCompanyPassports).mockResolvedValue(PAGE_1)
  vi.mocked(fetchCompanyReport).mockResolvedValue({
    data: [ROW],
    totals: { ...ROW },
    meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 },
  })
  vi.mocked(searchCompanies).mockResolvedValue([
    { id: 7, name: 'ABC Sdn Bhd', agent_phone: '+60 12 345', agent_email: 'rahim@abc.my' },
  ] as Company[])
})
afterEach(() => wrapper.unmount())

describe('CompanyView', () => {
  it('shows the header card with the company, agent and mini counts', async () => {
    await mountAs('data_entry')

    const header = wrapper.get('[data-header]')
    expect(header.get('h1').text()).toBe('ABC Sdn Bhd')
    expect(header.text()).toContain('Malaysia')
    expect(header.get('[data-agent]').text()).toContain('Rahim')
    expect(header.get('[data-agent]').text()).toContain('Dhaka Overseas')
    expect(header.get('[data-agent]').text()).toContain('+60 12 345')
    expect(header.get('[data-agent]').text()).toContain('rahim@abc.my')
    expect(wrapper.get('[data-mini="total"]').text()).toContain('3')
    expect(wrapper.get('[data-mini="in_process"] .text-amber-700').text()).toBe('2')
    expect(wrapper.get('[data-mini="visa_done"] .text-slate-400').text()).toBe('0')
    // Over quota: red balance.
    const balance = header.get('[data-balance]')
    expect(balance.text()).toContain('-1')
    expect(balance.find('.text-red-700').exists()).toBe(true)
    // The report row is found by the company's name, taken from its passports.
    expect(fetchCompanyReport).toHaveBeenCalledWith({ search: 'ABC Sdn Bhd', per_page: 100 })
  })

  it("lists the company's passports with a compact 6-step bar and the latest status", async () => {
    await mountAs('data_entry')

    expect(fetchCompanyPassports).toHaveBeenCalledWith(7, { page: 1, per_page: 15 })
    const headers = wrapper.findAll('[data-passports] thead th').map((th) => th.text())
    expect(headers).toEqual(['Name', 'Passport no', 'Reference', 'Progress', 'Latest status'])

    const first = wrapper.get('[data-passport-row="11"]')
    expect(first.text()).toContain('KARIM UDDIN')
    expect(first.text()).toContain('Calling: Applied')
    expect(first.text()).toContain('15-09-2026')
    expect(first.findAll('[data-state]')).toHaveLength(6)
    expect(wrapper.text()).toContain('Showing 1–15 of 17')
  })

  it('links rows to the passport page for data entry', async () => {
    await mountAs('data_entry')

    const link = wrapper.get('[data-passport-row="12"] a')
    expect(link.attributes('href')).toBe('/passports/12')
    await wrapper.get('[data-passport-row="12"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('passport-detail')
  })

  it('accounts: read-only, no passport links and no agent contact lookup', async () => {
    await mountAs('accounts')

    expect(wrapper.find('[data-passport-row="11"] a').exists()).toBe(false)
    expect(searchCompanies).not.toHaveBeenCalled()
    await wrapper.get('[data-passport-row="11"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('company-report')
  })

  it('shows an empty state when the company has no passports', async () => {
    vi.mocked(fetchCompanyPassports).mockResolvedValue({
      ...PAGE_1,
      data: [],
      meta: { ...PAGE_1.meta, total: 0, last_page: 1, from: null, to: null },
    })
    await mountAs('data_entry')

    expect(wrapper.text()).toContain('This company has no passports yet.')
    // Still finds the header by scanning the report.
    expect(wrapper.get('[data-header] h1').text()).toBe('ABC Sdn Bhd')
  })

  it('shows "not found" for an unknown company', async () => {
    vi.mocked(fetchCompanyPassports).mockRejectedValue(httpError(404))
    await mountAs('data_entry', '/reports/companies/999')

    expect(wrapper.get('[data-not-found]').text()).toContain('This company does not exist.')
  })
})
