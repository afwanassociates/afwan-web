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
  updateCashSettings: vi.fn(),
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
    cash_in_hand: 1200,
    pending: { count: 0, in: 0, out: 0 },
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('Cash section', () => {
  it("shows today's cash in hand and the opening balance, settable by admins only", async () => {
    await mountView()

    expect(wrapper.find('[data-cash-in-hand]').text()).toBe('৳ 1,200.00')
    expect(wrapper.find('[data-opening]').text()).toContain('01-10-2026')
    expect(wrapper.find('[data-set-opening]').exists()).toBe(false)
    expect(wrapper.findAll('[data-cash-tab]').map((t) => t.text())).toEqual([
      'Cash Book',
      'Cash Receive',
      'Cash Payment',
      'Cash Transfer',
    ])

    wrapper.unmount()
    await mountView('admin')
    expect(wrapper.find('[data-set-opening]').text()).toBe('Change')
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
