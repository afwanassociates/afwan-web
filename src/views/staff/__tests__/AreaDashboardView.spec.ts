import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AreaDashboardView from '../AreaDashboardView.vue'
import { fetchFinanceSummary } from '@/api/accounts'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/auth'
import type { CompanyCounts } from '@/types/report'
import { makeUser } from '@/test/helpers'

const SUMMARY: CompanyCounts = {
  total: 3,
  not_started: 0,
  medical_pending: 0,
  medical_fit: 3,
  medical_unfit: 0,
  calling_done: 3,
  visa_done: 3,
  bmet_done: 3,
  flight_done: 3,
  in_process: 0,
  returned: 0,
}

vi.mock('@/api/reports', () => ({ fetchReportSummary: vi.fn(async () => SUMMARY) }))
vi.mock('@/api/accounts', () => ({
  fetchFinanceSummary: vi.fn(async () => ({
    opening_balance: 100000,
    opening_date: '2026-10-01',
    today: '2026-11-01',
    opening_today: 1100,
    total_received: 1900000,
    total_paid: 260000,
    cash_in_hand: 1000000,
    bank_balance: 450000,
    mobile_banking_balance: 190000,
  })),
}))

let wrapper: VueWrapper

afterEach(() => {
  wrapper?.unmount()
  vi.clearAllMocks()
})

async function mountDashboard(role?: Role) {
  setActivePinia(createPinia())
  if (role) useAuthStore().user = makeUser({ role })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/staff/accounts', component: AreaDashboardView, meta: { area: 'accounts' } }],
  })
  await router.push('/staff/accounts')
  wrapper = mount(AreaDashboardView, { global: { plugins: [router] } })
  await flushPromises()
}

describe('AreaDashboardView', () => {
  it.each(['admin', 'super_admin', 'accounts_head'] as const)(
    'shows the accounts summary first, then the passport summary, to %s',
    async (role) => {
      await mountDashboard(role)

      expect(fetchFinanceSummary).toHaveBeenCalledOnce()
      const headings = wrapper.findAll('h1, h2').map((h) => h.text())
      expect(headings).toEqual(['Accounts summary', 'Passport summary'])
      const cards = wrapper.findAll('[data-finance] [data-closing]').map((c) => c.text())
      expect(cards).toEqual([
        expect.stringMatching(/Total Received Amount\s*৳ 19,00,000.00/),
        expect.stringMatching(/Total Paid Amount\s*৳ 2,60,000.00/),
        expect.stringMatching(/Closing Cash on Hand\s*৳ 10,00,000.00/),
        expect.stringMatching(/Closing Bank Balance\s*৳ 4,50,000.00/),
        expect.stringMatching(/Closing Mobile Banking Balance\s*৳ 1,90,000.00/),
        expect.stringMatching(/Grand Total Closing Balance\s*৳ 16,40,000.00/),
      ])
      // Read only on the dashboard: no Change button.
      expect(wrapper.find('[data-set-opening]').exists()).toBe(false)
    },
  )

  it.each(['accounts', 'data_entry', 'operation_head'] as const)(
    'shows no accounts summary to %s',
    async (role) => {
      await mountDashboard(role)
      expect(fetchFinanceSummary).not.toHaveBeenCalled()
      expect(wrapper.find('[data-finance]').exists()).toBe(false)
      expect(wrapper.find('[data-summary]').exists()).toBe(true)
    },
  )

  it('shows the passport summary as coloured cards, in the company report order', async () => {
    await mountDashboard()

    // No welcome / role area box: the cards are the whole page.
    expect(wrapper.text()).not.toContain('Welcome')
    expect(wrapper.find('.glass-card').exists()).toBe(false)

    const cards = wrapper.findAll('[data-summary] > div')
    expect(cards.map((c) => [c.get('dt').text(), c.get('dd').text()])).toEqual([
      ['Total', '3'],
      ['Not started', '0'],
      ['Medical pending', '0'],
      ['Medical fit', '3'],
      ['Unfit', '0'],
      ['Calling', '3'],
      ['Visa', '3'],
      ['BMET', '3'],
      ['Flight done', '3'],
      ['In process', '0'],
      ['Returned', '0'],
    ])
    expect(wrapper.get('[data-card="medical_fit"]').classes()).toContain('bg-green-50')
    expect(wrapper.get('[data-card="medical_unfit"]').classes()).toContain('bg-red-50')
  })

  it('shows an error with a retry when the summary cannot load', async () => {
    const { fetchReportSummary } = await import('@/api/reports')
    vi.mocked(fetchReportSummary).mockRejectedValueOnce(new Error('boom'))
    await mountDashboard()

    expect(wrapper.text()).toContain('Try again')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Try again')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-card="total"] dd').text()).toBe('3')
  })
})
