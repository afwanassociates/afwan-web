import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ReferenceReportView from '../ReferenceReportView.vue'
import ReferenceView from '../ReferenceView.vue'
import { searchReferences } from '@/api/references'
import {
  downloadReferenceReportCsv,
  fetchReferencePassports,
  fetchReferenceReport,
  fetchReportReferences,
} from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { CompanyCounts, ReferenceReport, ReferenceReportRow } from '@/types/report'

vi.mock('@/api/reports', () => ({
  fetchReferenceReport: vi.fn(),
  downloadReferenceReportCsv: vi.fn(async () => 'reference-report-27-10-2026.csv'),
  fetchReferencePassports: vi.fn(),
  downloadReferencePassportsCsv: vi.fn(async () => 'reference-abdul-karim-passports.csv'),
  fetchCompanyReport: vi.fn(async () => ({ data: [] })),
  fetchReportReferences: vi.fn(async () => []),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))

const COUNTS: CompanyCounts = {
  total: 4,
  medical_fit: 2,
  medical_unfit: 1,
  medical_pending: 0,
  not_started: 1,
  calling_done: 2,
  visa_done: 1,
  bmet_done: 1,
  flight_done: 1,
  in_process: 2,
}

function row(overrides: Partial<ReferenceReportRow>): ReferenceReportRow {
  return {
    id: 1,
    name: 'Abdul Karim',
    type: 'person',
    type_label: 'Person',
    phone: '01711-000000',
    is_active: true,
    ...COUNTS,
    ...overrides,
  }
}

const REPORT: ReferenceReport = {
  data: [
    row({ id: 1 }),
    row({ id: 2, name: 'Sea Star Overseas', type: 'agency', type_label: 'Agency', phone: null }),
  ],
  totals: { ...COUNTS, total: 8, in_process: 4 },
  filters: { reference: null, company: null },
  meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
}

let wrapper: VueWrapper
let router: Router

async function mountAs(role: Role, path = '/reports/references', component = ReferenceReportView) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role })
  auth.isReady = true
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reports/references', name: 'reference-report', component: ReferenceReportView },
      {
        path: '/reports/references/:id',
        name: 'reference-report-detail',
        component: ReferenceView,
      },
    ],
  })
  await router.push(path)
  wrapper = mount(component, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchReferenceReport).mockResolvedValue(REPORT)
})
afterEach(() => wrapper.unmount())

describe('Reference report', () => {
  it('shows the company report counts per reference, without quota or balance', async () => {
    await mountAs('accounts')

    const headers = wrapper.findAll('thead th').map((th) => th.text().replace(/[↑↓]/g, '').trim())
    expect(headers).toEqual([
      'Reference',
      'Type',
      'Total',
      'Medical fit',
      'Unfit',
      'Calling',
      'Visa',
      'BMET',
      'Flight done',
      'In process',
    ])
    expect(wrapper.text()).not.toContain('Balance')
    expect(wrapper.text()).not.toContain('Quota')
    const first = wrapper.get('[data-reference-row="1"]')
    expect(first.text()).toContain('Abdul Karim')
    expect(first.text()).toContain('01711-000000')
    expect(first.text()).toContain('Person')
    expect(first.get('[data-count="total"]').text()).toBe('4')
    expect(wrapper.get('[data-totals] [data-total="total"]').text()).toBe('8')
    expect(wrapper.get('[data-totals]').text()).toContain('All 2 references')
  })

  it('reads the type, sort and page from the URL and sorts by a column', async () => {
    await mountAs('admin', '/reports/references?type=agency&sort=-total&page=2')

    expect(fetchReferenceReport).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agency', sort: '-total', page: 2 }),
    )
    await wrapper.get('button[data-sort="in_process"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ type: 'agency', sort: '-in_process' })
  })

  it('filters by type and clears the filters', async () => {
    await mountAs('data_entry')

    await wrapper.get('select[data-type-filter]').setValue('person')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ type: 'person' })
    expect(fetchReferenceReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'person' }),
    )

    await wrapper.get('[data-clear-filters]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('uses the data-entry lookup for the passport team and the report options for others', async () => {
    await mountAs('operation_head')
    await wrapper.get('[data-reference-filter] input').setValue('kar')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()
    expect(searchReferences).toHaveBeenCalled()
    wrapper.unmount()

    await mountAs('accounts_head')
    await wrapper.get('[data-reference-filter] input').setValue('kar')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()
    expect(fetchReportReferences).toHaveBeenCalled()
  })

  it('opens a reference from its row', async () => {
    vi.mocked(fetchReferencePassports).mockResolvedValue({
      data: [],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 0, from: null, to: null },
    })
    await mountAs('super_admin')

    await wrapper.get('[data-reference-row="2"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('reference-report-detail')
    expect(router.currentRoute.value.params.id).toBe('2')
  })

  it('exports the report with the same filters', async () => {
    await mountAs('accounts', '/reports/references?type=person&sort=name')

    await wrapper.get('button[data-export]').trigger('click')
    await flushPromises()
    expect(downloadReferenceReportCsv).toHaveBeenCalledWith({
      reference_id: undefined,
      company_id: undefined,
      type: 'person',
      sort: 'name',
    })
  })

  it('shows an error with a retry button', async () => {
    vi.mocked(fetchReferenceReport).mockRejectedValueOnce(httpError(500))
    await mountAs('accounts')

    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.get('[data-error] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-reference-row="1"]').exists()).toBe(true)
  })
})

describe('Reference page', () => {
  beforeEach(() => {
    vi.mocked(fetchReferencePassports).mockResolvedValue({
      data: [],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 0, from: null, to: null },
    })
  })

  it('shows the reference, its counts and its passports, with an export', async () => {
    vi.mocked(fetchReferenceReport).mockResolvedValue({ ...REPORT, data: [row({ id: 9 })] })
    await mountAs('accounts', '/reports/references/9', ReferenceView)

    expect(fetchReferencePassports).toHaveBeenCalledWith(9, { page: 1, per_page: 15 })
    expect(wrapper.get('h1').text()).toBe('Abdul Karim')
    expect(wrapper.get('[data-header]').text()).toContain('Person · 01711-000000')
    expect(wrapper.get('[data-mini="total"]').text()).toContain('4')
    expect(wrapper.find('[data-balance]').exists()).toBe(false)
  })

  it('says when the reference does not exist', async () => {
    vi.mocked(fetchReferencePassports).mockRejectedValue(httpError(404))
    await mountAs('admin', '/reports/references/404', ReferenceView)

    expect(wrapper.find('[data-not-found]').exists()).toBe(true)
  })
})
