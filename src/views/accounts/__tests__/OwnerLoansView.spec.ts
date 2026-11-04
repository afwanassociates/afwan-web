import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OwnerLoansView from '../OwnerLoansView.vue'
import { deleteOwnerLoanBill, getOwnerLoans } from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type { OwnerLoan, OwnerLoanBill, OwnerLoanReport } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  getOwnerLoans: vi.fn(),
  deleteOwnerLoanBill: vi.fn(),
  createOwnerLoanBill: vi.fn(),
  updateOwnerLoanBill: vi.fn(),
  fetchOwnerLoanBillCopy: vi.fn(),
  searchParties: vi.fn(async () => []),
  createCashPayment: vi.fn(),
  updateCashPayment: vi.fn(),
  createCashReceipt: vi.fn(),
  updateCashReceipt: vi.fn(),
  fetchReceiptOptions: vi.fn(async () => ({
    business_types: [],
    default_business_type: 'recruitment',
    countries: [],
    default_country: { code: 'MY', name: 'Malaysia' },
  })),
}))

const CHAIRMAN = {
  id: 1,
  code: 'OW-001',
  name: 'Chairman',
  mobile: '01900000000',
  address: 'Dhaka',
}

const BILL: OwnerLoanBill = {
  id: 3,
  owner_loan_id: 5,
  date: '2026-10-15',
  expense_category: 'office_rent',
  expense_category_label: 'Office rent',
  purpose: 'October office rent',
  bill_no: 'R-10',
  amount: 30000,
  note: null,
  has_copy: true,
  copy_name: 'rent.pdf',
  status: 'approved',
  status_label: 'Approved',
  returned_by: null,
  return_reason: null,
  can: { update: false, delete: false },
}

function loan(overrides: Partial<OwnerLoan> = {}): OwnerLoan {
  return {
    id: 5,
    payment_no: 'CP-2026-0005',
    date: '2026-10-05',
    owner: CHAIRMAN,
    payment_method: 'cash',
    payment_method_label: 'Cash in hand',
    amount: 50000,
    returned: 0,
    billed: 30000,
    outstanding: 20000,
    pending_returned: 5000,
    pending_billed: 0,
    status: 'open',
    note: 'Office setup',
    returns: [
      {
        id: 8,
        receipt_no: 'CR-2026-0008',
        date: '2026-10-20',
        amount: 5000,
        payment_method_label: 'Cash in hand',
        status: 'pending',
        status_label: 'Pending',
      },
    ],
    bills: [BILL],
    ...overrides,
  }
}

const REPORT: OwnerLoanReport = {
  summary: {
    total_capital: 600000,
    loans_outstanding: 20000,
    open_count: 1,
    settled_count: 1,
    owners: [
      { id: 1, code: 'OW-001', name: 'Chairman', capital: 500000, loan_outstanding: 20000 },
      { id: 2, code: 'OW-002', name: 'MD', capital: 100000, loan_outstanding: 0 },
    ],
  },
  data: [
    loan(),
    loan({
      id: 2,
      payment_no: 'CP-2026-0002',
      owner: { ...CHAIRMAN, id: 2, code: 'OW-002', name: 'MD' },
      payment_method: 'bank',
      payment_method_label: 'Bank',
      amount: 10000,
      billed: 0,
      returned: 10000,
      outstanding: 0,
      pending_returned: 0,
      status: 'settled',
      note: null,
      returns: [],
      bills: [],
    }),
  ],
}

let wrapper: VueWrapper

async function mountView() {
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: OwnerLoansView },
      { path: '/parties/:id', name: 'accounts-party-ledger', component: Empty },
    ],
  })
  await router.push('/')
  wrapper = mount(OwnerLoansView, { global: { plugins: [router] }, attachTo: document.body })
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
  it('shows the capital and what owners owe the company', async () => {
    await mountView()

    expect(wrapper.find('[data-total-capital]').text()).toContain('6,00,000.00')
    expect(wrapper.find('[data-owner-capital="1"]').text()).toContain('5,00,000.00')
    expect(wrapper.find('[data-loans-outstanding]').text()).toContain('Owners owe the company')
    expect(wrapper.find('[data-loans-outstanding]').text()).toContain('20,000.00')
    expect(wrapper.find('[data-open-count]').text()).toContain('1')
    expect(wrapper.find('[data-settled-count]').text()).toContain('1')
  })

  it('lists each loan with its bills, returns and what is outstanding', async () => {
    await mountView()

    const open = wrapper.find('[data-loan="5"]')
    expect(open.text()).toContain('CP-2026-0005')
    expect(open.text()).toContain('Cash in hand')
    expect(open.text()).toContain('Chairman')
    expect(open.find('[data-billed]').text()).toBe('30,000.00')
    expect(open.find('[data-returned]').text()).toContain('+ 5,000.00 waiting')
    expect(open.find('[data-outstanding]').text()).toBe('20,000.00')
    expect(open.find('[data-status]').text()).toBe('Open')
    // A settled loan has nothing left to settle.
    const settled = wrapper.find('[data-loan="2"]')
    expect(settled.find('[data-status]').text()).toBe('Settled')
    expect(settled.find('[data-add-bill]').exists()).toBe(false)
    expect(settled.find('[data-return-money]').exists()).toBe(false)
  })

  it('shows the bills (with their copy) and returns of a loan', async () => {
    await mountView()

    await wrapper.find('[data-loan="5"] [data-toggle]').trigger('click')
    const details = wrapper.find('[data-details="5"]')
    expect(details.find('[data-bill="3"]').text()).toContain('October office rent')
    expect(details.find('[data-bill="3"]').text()).toContain('Bill R-10')
    expect(details.find('[data-bill="3"] [data-view-copy]').exists()).toBe(true)
    // Approved: locked.
    expect(details.find('[data-bill="3"] [data-edit-bill]').exists()).toBe(false)
    expect(details.find('[data-return="8"]').text()).toContain('CR-2026-0008')
    expect(details.find('[data-return="8"]').text()).toContain('Pending')
  })

  it('opens the bill form, the loan return form and the give-loan form', async () => {
    await mountView()

    await wrapper.find('[data-loan="5"] [data-add-bill]').trigger('click')
    await flushPromises()
    const billDialog = wrapper.findComponent({ name: 'OwnerLoanBillDialog' })
    expect(billDialog.props('open')).toBe(true)
    expect(billDialog.props('loan')).toMatchObject({ id: 5 })
    expect(billDialog.props('bill')).toBeNull()
    await billDialog.setValue(false, 'open')

    await wrapper.find('[data-loan="5"] [data-return-money]').trigger('click')
    await flushPromises()
    const receipt = wrapper.findComponent({ name: 'CashReceiptFormDialog' })
    expect(receipt.props('open')).toBe(true)
    expect(receipt.props('presetLoanId')).toBe(5)
    expect(receipt.props('presetParty')).toMatchObject({ id: 1, type: 'owner' })
    await receipt.setValue(false, 'open')

    await wrapper.find('[data-give-loan]').trigger('click')
    await flushPromises()
    const payment = wrapper.findComponent({ name: 'CashPaymentFormDialog' })
    expect(payment.props('open')).toBe(true)
    expect(payment.props('presetPayeeType')).toBe('owner')
  })

  it('edits and deletes a bill that waits for approval', async () => {
    const waiting = {
      ...BILL,
      status: 'pending' as const,
      status_label: 'Pending',
      can: { update: true, delete: true },
    }
    vi.mocked(getOwnerLoans).mockResolvedValue({ ...REPORT, data: [loan({ bills: [waiting] })] })
    vi.mocked(deleteOwnerLoanBill).mockResolvedValue()
    await mountView()
    await wrapper.find('[data-loan="5"] [data-toggle]').trigger('click')

    await wrapper.find('[data-bill="3"] [data-edit-bill]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'OwnerLoanBillDialog' }).props('bill')).toMatchObject({
      id: 3,
    })
    await wrapper.findComponent({ name: 'OwnerLoanBillDialog' }).setValue(false, 'open')

    await wrapper.find('[data-bill="3"] [data-delete-bill]').trigger('click')
    await flushPromises()
    const confirm = wrapper.findComponent({ name: 'ConfirmDialog' })
    expect(confirm.text()).toContain('October office rent')
    confirm.vm.$emit('confirm')
    await flushPromises()
    expect(deleteOwnerLoanBill).toHaveBeenCalledWith(3)
    expect(getOwnerLoans).toHaveBeenCalledTimes(2)
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
