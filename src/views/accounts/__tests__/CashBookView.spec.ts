import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import CashLayout from '../CashLayout.vue'
import CashBookView from '../CashBookView.vue'
import { fetchCashBook, fetchCashSettings } from '@/api/accounts'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { CashBook } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  fetchCashBook: vi.fn(),
  fetchCashSettings: vi.fn(),
}))
vi.mock('@/lib/dates', async (original) => ({
  ...(await original<typeof import('@/lib/dates')>()),
  businessToday: () => '2026-10-20',
}))

const BOOK: CashBook = {
  from: '2026-10-01',
  to: '2026-10-20',
  opening_balance: 1000,
  days: [
    {
      date: '2026-10-02',
      opening: 1000,
      in: 500,
      out: 300,
      closing: 1200,
      lines: [
        {
          date: '2026-10-02',
          kind: 'receipt',
          id: 1,
          reference: 'CR-2026-0001',
          particulars: 'Received from Karim (PT-0001)',
          detail: 'Cash',
          party_id: 3,
          in: 500,
          out: 0,
          balance: 1500,
        },
        {
          date: '2026-10-02',
          kind: 'payment',
          id: 2,
          reference: 'CP-2026-0001',
          particulars: 'Paid to Landlord',
          detail: 'Expense · Office rent',
          party_id: null,
          in: 0,
          out: 300,
          balance: 1200,
        },
      ],
    },
  ],
  totals: { in: 500, out: 300 },
  closing_balance: 1200,
}

let wrapper: VueWrapper
let router: Router

async function mountView(role: Role = 'accounts', path = '/accounts/cash/book') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/accounts/cash',
        component: CashLayout,
        children: [
          { path: 'book', name: 'accounts-cash-book', component: CashBookView },
          { path: 'receive', name: 'accounts-cash-receipts', component: Empty },
          { path: 'payment', name: 'accounts-cash-payments', component: Empty },
          { path: 'transfer', name: 'accounts-cash-transfers', component: Empty },
        ],
      },
      { path: '/accounts/parties/:id', name: 'accounts-party-ledger', component: Empty },
      { path: '/accounts/approvals', name: 'accounts-approvals', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(fetchCashBook).mockResolvedValue(BOOK)
  vi.mocked(fetchCashSettings).mockResolvedValue({
    opening_balance: 1000,
    opening_date: '2026-10-01',
    today: '2026-10-20',
    opening_today: 1100,
    total_received: 60000,
    total_paid: 8800,
    cash_in_hand: 1200,
    bank_balance: 50000,
    mobile_banking_balance: -300,
    pending: { count: 2, in: 500, out: 0 },
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('Cash section', () => {
  it('shows the money summary and the opening balance to the accounts head only', async () => {
    await mountView('accounts_head')

    const cards = wrapper
      .findAll('[data-cash-header] [data-closing]')
      .map((c) => c.attributes('data-closing'))
    expect(cards).toEqual(['received', 'paid', 'cash', 'bank', 'mobile', 'total'])
    expect(wrapper.find('[data-closing="received"]').text()).toMatch(
      /Total Received Amount\s*৳ 60,000.00/,
    )
    expect(wrapper.find('[data-closing="paid"]').text()).toMatch(/Total Paid Amount\s*৳ 8,800.00/)
    expect(wrapper.find('[data-closing="cash"]').text()).toMatch(
      /Closing Cash on Hand\s*৳ 1,200.00/,
    )
    expect(wrapper.find('[data-closing="bank"]').text()).toMatch(
      /Closing Bank Balance\s*৳ 50,000.00/,
    )
    expect(wrapper.find('[data-closing="mobile"]').text()).toMatch(
      /Closing Mobile Banking Balance\s*−৳ 300.00/,
    )
    // Cash + bank + mobile banking.
    expect(wrapper.find('[data-closing="total"]').text()).toMatch(
      /Grand Total Closing Balance\s*৳ 50,900.00/,
    )
    // Waiting approval is not shown at the top.
    expect(wrapper.find('[data-cash-pending]').exists()).toBe(false)
    // Today's opening cash is worked out; the starting balance sits under it.
    expect(wrapper.find('[data-cash-header] [data-opening-today]').text()).toBe('৳ 1,100.00')
    expect(wrapper.find('[data-cash-header] [data-opening]').text()).toMatch(
      /Starting ৳ 1,000.00 on 01-10-2026/,
    )
    // The opening is worked out: nobody sets or changes it.
    expect(wrapper.find('[data-set-opening]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Set opening balance|Change/)

    // Accounts users see the tabs but no summary cards (the API doesn't send them the money).
    wrapper.unmount()
    vi.mocked(fetchCashSettings).mockResolvedValue({
      opening_date: '2026-10-01',
      today: '2026-10-20',
    })
    await mountView('accounts')
    expect(wrapper.find('[data-cash-header]').exists()).toBe(false)
    expect(wrapper.find('[data-set-opening]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Closing Cash on Hand')
    expect(wrapper.findAll('[data-cash-tab]').map((t) => t.text())).toEqual([
      'Cash Book',
      'Cash Receive',
      'Cash Payment',
      'Deposit / Withdrawal',
    ])
  })

  it('loads this month by default and shows each day with its closing', async () => {
    await mountView()

    expect(fetchCashBook).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-20' })
    expect(wrapper.find('[data-opening-row]').text()).toContain('Balance brought forward')
    expect(wrapper.find('[data-line="receipt-1"]').text()).toContain('02-10-2026')
    expect(wrapper.find('[data-line="receipt-1"]').text()).toContain('1,500.00')
    expect(wrapper.find('[data-line="payment-2"]').text()).toContain('Office rent')
    expect(wrapper.find('[data-line="payment-2"] a').attributes('href')).toBe(
      '/accounts/cash/payment?q=CP-2026-0001',
    )
    expect(wrapper.find('[data-day-closing]').text()).toBe('1,200.00')
    expect(wrapper.find('[data-total-in]').text()).toBe('500.00')
    expect(wrapper.find('tfoot [data-closing]').text()).toBe('1,200.00')
  })

  it('switches to today and to all dates', async () => {
    await mountView()

    await wrapper.find('[data-today]').trigger('click')
    await flushPromises()
    expect(fetchCashBook).toHaveBeenLastCalledWith({ from: '2026-10-20', to: '2026-10-20' })

    await wrapper.find('[data-all]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ all: '1' })
    expect(fetchCashBook).toHaveBeenLastCalledWith({ from: '', to: '' })
    expect(wrapper.find('[data-opening-row]').text()).toContain('Opening cash in hand')
  })
})
