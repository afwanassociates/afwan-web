import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OwnerLoansView from '../OwnerLoansView.vue'
import { getOwnerLoans } from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type { OwnerLoanReport } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({ getOwnerLoans: vi.fn() }))

const REPORT: OwnerLoanReport = {
  summary: {
    total_capital: 680000,
    loans_owed: 60000,
    open_count: 1,
    settled_count: 1,
    owners: [
      { id: 1, code: 'OW-001', name: 'Chairman', capital: 500000, loan_owed: 60000 },
      { id: 2, code: 'OW-002', name: 'MD', capital: 180000, loan_owed: 0 },
    ],
  },
  data: [
    {
      id: 5,
      receipt_no: 'CR-2026-0005',
      date: '2026-10-01',
      owner: { id: 1, code: 'OW-001', name: 'Chairman' },
      amount: 100000,
      repaid: 40000,
      still_owed: 60000,
      pending_repaid: 10000,
      status: 'open',
      note: null,
    },
    {
      id: 2,
      receipt_no: 'CR-2026-0002',
      date: '2026-09-05',
      owner: { id: 2, code: 'OW-002', name: 'MD' },
      amount: 50000,
      repaid: 50000,
      still_owed: 0,
      pending_repaid: 0,
      status: 'settled',
      note: 'Office setup',
    },
  ],
}

let wrapper: VueWrapper

async function mountView() {
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: OwnerLoansView },
      { path: '/payments', name: 'accounts-cash-payments', component: Empty },
      { path: '/parties/:id', name: 'accounts-party-ledger', component: Empty },
    ],
  })
  await router.push('/')
  wrapper = mount(OwnerLoansView, { global: { plugins: [router] } })
  await flushPromises()
}

const rows = () => wrapper.findAll('[data-loan]').map((r) => r.attributes('data-loan'))

beforeEach(() => {
  vi.mocked(getOwnerLoans).mockResolvedValue(REPORT)
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('OwnerLoansView', () => {
  it("shows the capital and loan totals, with each owner's capital", async () => {
    await mountView()

    expect(wrapper.find('[data-total-capital]').text()).toContain('6,80,000.00')
    expect(wrapper.find('[data-owner-capital="1"]').text()).toContain('5,00,000.00')
    expect(wrapper.find('[data-owner-capital="2"]').text()).toContain('MD')
    expect(wrapper.find('[data-loans-owed]').text()).toContain('60,000.00')
    expect(wrapper.find('[data-open-count]').text()).toContain('1')
    expect(wrapper.find('[data-settled-count]').text()).toContain('1')
  })

  it('lists each loan with what is repaid and still owed, open or settled', async () => {
    await mountView()

    const open = wrapper.find('[data-loan="5"]')
    expect(open.text()).toContain('CR-2026-0005')
    expect(open.text()).toContain('Chairman')
    expect(open.text()).toContain('01-10-2026')
    expect(open.find('[data-still-owed]').text()).toBe('60,000.00')
    expect(open.find('[data-pending-repaid]').text()).toContain('10,000.00 waiting approval')
    expect(open.find('[data-status]').text()).toBe('Open')
    expect(wrapper.find('[data-loan="2"] [data-status]').text()).toBe('Settled')
  })

  it('filters by owner and status', async () => {
    await mountView()

    await wrapper.find('[data-status-filter]').setValue('settled')
    expect(rows()).toEqual(['2'])
    await wrapper.find('[data-status-filter]').setValue('')
    await wrapper.find('[data-owner-filter]').setValue(1)
    expect(rows()).toEqual(['5'])
    await wrapper.find('[data-owner-filter]').setValue(2)
    await wrapper.find('[data-status-filter]').setValue('open')
    expect(wrapper.find('[data-empty]').text()).toContain('No loans match these filters.')
  })

  it('shows an error with a retry', async () => {
    vi.mocked(getOwnerLoans).mockRejectedValueOnce(httpError(500, { message: 'Server error' }))
    await mountView()

    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.find('[data-error] button').trigger('click')
    await flushPromises()
    expect(rows()).toEqual(['5', '2'])
  })
})
