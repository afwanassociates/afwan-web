import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import OwnerLoanBillDialog from '../OwnerLoanBillDialog.vue'
import { createOwnerLoanBill, updateOwnerLoanBill } from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type { OwnerLoan, OwnerLoanBill } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  createOwnerLoanBill: vi.fn(),
  updateOwnerLoanBill: vi.fn(),
}))

/** A 50,000 loan: 20,000 returned, 10,000 more waiting, so 20,000 can still be billed. */
const LOAN: OwnerLoan = {
  id: 5,
  payment_no: 'CP-2026-0005',
  date: '2026-10-05',
  owner: { id: 1, code: 'OW-001', name: 'Chairman', mobile: '01900000000', address: 'Dhaka' },
  payment_method: 'cash',
  payment_method_label: 'Cash in hand',
  amount: 50000,
  returned: 20000,
  billed: 0,
  outstanding: 30000,
  pending_returned: 10000,
  pending_billed: 0,
  status: 'open',
  note: null,
  returns: [],
  bills: [],
}

const SAVED = {
  id: 3,
  owner_loan_id: 5,
  purpose: 'October office rent',
  amount: 20000,
} as OwnerLoanBill

let wrapper: VueWrapper

async function mountDialog(bill: OwnerLoanBill | null = null) {
  wrapper = mount(OwnerLoanBillDialog, {
    props: { open: false, loan: LOAN, bill },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

async function chooseFile(name = 'rent.pdf', type = 'application/pdf') {
  const file = new File(['%PDF-1.4'], name, { type })
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return file
}

beforeEach(() => {
  vi.mocked(createOwnerLoanBill).mockResolvedValue(SAVED)
  vi.mocked(updateOwnerLoanBill).mockResolvedValue(SAVED)
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('OwnerLoanBillDialog', () => {
  it('records a bill with its copy, up to what the loan can still settle', async () => {
    await mountDialog()
    expect(wrapper.find('[data-loan]').text()).toContain('CP-2026-0005')
    expect(wrapper.find('[data-loan]').text()).toContain('up to ৳ 20,000.00')
    expect(wrapper.find('[data-field="bill_copy"]').text()).toContain('Bill copy')

    await wrapper.find('[data-field="expense_category"] select').setValue('office_rent')
    await wrapper.find('[data-field="purpose"] input').setValue('  October   office rent ')
    await wrapper.find('[data-field="bill_no"] input').setValue('R-10')
    await wrapper.find('[data-field="amount"] input').setValue('20001')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createOwnerLoanBill).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="amount"]').text()).toContain(
      'Only ৳ 20,000.00 is outstanding on loan CP-2026-0005.',
    )
    expect(wrapper.find('[data-field="bill_copy"]').text()).toContain('Attach a copy of the bill')

    await wrapper.find('[data-field="amount"] input').setValue('20000')
    const file = await chooseFile()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createOwnerLoanBill).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        expense_category: 'office_rent',
        purpose: 'October office rent',
        bill_no: 'R-10',
        amount: 20000,
      }),
      file,
    )
    expect(wrapper.emitted('saved')).toEqual([[SAVED, true]])
  })

  it('edits a bill without a new copy, and shows server errors', async () => {
    await mountDialog({
      ...SAVED,
      date: '2026-10-15',
      expense_category: 'office_rent',
      expense_category_label: 'Office rent',
      bill_no: null,
      note: null,
      has_copy: true,
      copy_name: 'rent.pdf',
      status: 'rejected',
      status_label: 'Returned',
      returned_by: 'Admin',
      return_reason: 'Wrong amount',
      can: { update: true, delete: true },
    })
    expect(wrapper.find('[data-field="purpose"] input').element).toHaveProperty(
      'value',
      'October office rent',
    )
    expect(wrapper.find('[data-field="bill_copy"]').text()).toContain('rent.pdf')

    vi.mocked(updateOwnerLoanBill).mockRejectedValueOnce(
      httpError(422, { message: 'Invalid.', errors: { amount: ['Too much.'] } }),
    )
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateOwnerLoanBill).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ amount: 20000 }),
      null,
    )
    expect(wrapper.find('[data-field="amount"]').text()).toContain('Too much.')
  })
})
