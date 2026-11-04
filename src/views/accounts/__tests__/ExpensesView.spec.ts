import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ExpensesView from '../ExpensesView.vue'
import { downloadExpensesCsv, fetchOwnerLoanBillCopy, listExpenses } from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type { Expense, ExpenseTotals } from '@/types/accounts'
import type { Paginated } from '@/types/auth'

vi.mock('@/api/accounts', () => ({
  listExpenses: vi.fn(),
  downloadExpensesCsv: vi.fn(),
  fetchOwnerLoanBillCopy: vi.fn(),
}))

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    key: 'direct-1',
    id: 1,
    source: 'direct',
    source_label: 'Paid directly',
    date: '2026-11-01',
    expense_category: 'office_rent',
    expense_category_label: 'Office rent',
    purpose: 'November office rent',
    bill_no: 'RENT-11',
    paid_to: 'Rahman Properties',
    reference: 'CP-2026-0005',
    payment_method_label: 'Cash in hand',
    has_copy: false,
    amount: 40000,
    ...overrides,
  }
}

const TOTALS: ExpenseTotals = {
  count: 2,
  amount: 70000,
  direct: 40000,
  owner_loan: 30000,
  by_category: [{ category: 'office_rent', label: 'Office rent', count: 2, amount: 70000 }],
}

const PAGE: Paginated<Expense> & { meta: { totals: ExpenseTotals } } = {
  data: [
    expense({
      key: 'owner_loan-3',
      id: 3,
      source: 'owner_loan',
      source_label: 'Owner loan CP-2026-0009',
      date: '2026-11-02',
      purpose: 'Furniture shop rent',
      bill_no: 'FR-221',
      paid_to: 'Asad Rahman',
      reference: 'CP-2026-0009',
      payment_method_label: 'Paid by the owner',
      has_copy: true,
      amount: 30000,
    }),
    expense(),
  ],
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 1, per_page: 20, total: 2, from: 1, to: 2, totals: TOTALS },
}

let wrapper: VueWrapper
let router: Router

async function mountView(path = '/') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'accounts-expenses', component: ExpensesView }],
  })
  await router.push(path)
  wrapper = mount(ExpensesView, { global: { plugins: [router] } })
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(listExpenses).mockResolvedValue(PAGE)
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('ExpensesView', () => {
  it('lists expenses paid directly and owner loan bills, with the totals', async () => {
    await mountView()

    expect(listExpenses).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 20 }))
    expect(wrapper.find('[data-total]').text()).toBe('৳ 70,000.00')
    expect(wrapper.find('[data-total-direct]').text()).toBe('৳ 40,000.00')
    expect(wrapper.find('[data-total-owner-loan]').text()).toBe('৳ 30,000.00')
    expect(wrapper.find('[data-category="office_rent"]').text()).toMatch(
      /Office rent\s*৳ 70,000.00/,
    )

    const bill = wrapper.find('[data-expense="owner_loan-3"]')
    expect(bill.text()).toContain('Furniture shop rent')
    expect(bill.text()).toContain('Paid by Asad Rahman')
    expect(bill.find('[data-source]').text()).toBe('Owner loan CP-2026-0009')
    expect(bill.find('[data-view-copy]').exists()).toBe(true)
    const paid = wrapper.find('[data-expense="direct-1"]')
    expect(paid.find('[data-source]').text()).toBe('Paid directly')
    expect(paid.text()).toContain('CP-2026-0005 · Cash in hand')
    expect(paid.text()).toContain('Paid to Rahman Properties')
    expect(paid.find('[data-view-copy]').exists()).toBe(false)
  })

  it('keeps the filters in the URL and sends them', async () => {
    await mountView('/?category=office_rent&source=owner_loan&from=2026-11-01&to=2026-11-30')

    expect(listExpenses).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: 'office_rent',
        source: 'owner_loan',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    )
    await wrapper.find('[data-source-filter]').setValue('direct')
    await flushPromises()
    expect(router.currentRoute.value.query.source).toBe('direct')
    expect(listExpenses).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'direct' }))
  })

  it('shows one category when its total is clicked, and all again on a second click', async () => {
    await mountView()

    await wrapper.find('[data-category="office_rent"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.category).toBe('office_rent')
    await wrapper.find('[data-category="office_rent"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.category).toBeUndefined()
  })

  it('downloads the matching expenses as CSV', async () => {
    vi.mocked(downloadExpensesCsv).mockResolvedValue('expenses-04-11-2026.csv')
    await mountView('/?category=salary')

    await wrapper.find('[data-export]').trigger('click')
    await flushPromises()
    expect(downloadExpensesCsv).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'salary' }),
    )
  })

  it('opens a bill copy', async () => {
    vi.mocked(fetchOwnerLoanBillCopy).mockResolvedValue(new Blob(['%PDF']))
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    URL.createObjectURL = vi.fn(() => 'blob:copy')
    URL.revokeObjectURL = vi.fn()
    await mountView()

    await wrapper.find('[data-expense="owner_loan-3"] [data-view-copy]').trigger('click')
    await flushPromises()
    expect(fetchOwnerLoanBillCopy).toHaveBeenCalledWith(3)
    expect(tab.location.href).toBe('blob:copy')
  })

  it('says when nothing matches, and shows errors with a retry', async () => {
    vi.mocked(listExpenses).mockResolvedValueOnce({
      ...PAGE,
      data: [],
      meta: { ...PAGE.meta, total: 0, totals: { ...TOTALS, count: 0, amount: 0, by_category: [] } },
    })
    await mountView('/?category=salary')
    expect(wrapper.find('[data-empty]').text()).toContain('No expenses match these filters.')
    expect(wrapper.find('[data-export]').attributes('disabled')).toBeDefined()

    wrapper.unmount()
    vi.mocked(listExpenses).mockRejectedValueOnce(httpError(500, { message: 'Server error' }))
    await mountView()
    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.find('[data-error] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-expense]')).toHaveLength(2)
  })
})
