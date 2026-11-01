import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import CashPaymentFormDialog from '../CashPaymentFormDialog.vue'
import { createCashPayment, getOwnerLoans, searchParties, updateCashPayment } from '@/api/accounts'
import { CASH_CONTEXT } from '@/lib/accounts'
import { httpError } from '@/test/helpers'
import type { CashPayment, OwnerLoan, Party } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  searchParties: vi.fn(),
  createCashPayment: vi.fn(),
  updateCashPayment: vi.fn(),
  getOwnerLoans: vi.fn(),
}))

function loan(overrides: Partial<OwnerLoan> = {}): OwnerLoan {
  return {
    id: 5,
    receipt_no: 'CR-2026-0005',
    date: '2026-10-01',
    owner: { id: 9, code: 'OW-001', name: 'Chairman' },
    amount: 100000,
    repaid: 40000,
    still_owed: 60000,
    pending_repaid: 0,
    status: 'open',
    note: null,
    ...overrides,
  }
}

function party(overrides: Partial<Party> = {}): Party {
  return {
    id: 7,
    code: 'PT-0007',
    type: 'client',
    type_label: 'Party / Client',
    rl_number: null,
    name: 'Karim Traders',
    mobile: '01711000000',
    address: 'Mirpur, Dhaka',
    nid_passport: 'N1',
    tin_bin: null,
    opening_balance: 0,
    opening_balance_type: 'receivable',
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const OWNER = party({ id: 9, code: 'OW-001', type: 'owner', name: 'Chairman' })

function payment(overrides: Partial<CashPayment> = {}): CashPayment {
  return {
    id: 4,
    payment_no: 'CP-2026-0004',
    date: '2026-10-08',
    payee_type: 'other',
    payee_type_label: 'Other',
    party: null,
    payee_name: 'Rahman Properties',
    payment_type: 'expense',
    payment_type_label: 'Expense',
    expense_category: 'office_rent',
    expense_category_label: 'Office rent',
    purpose: 'Office rent',
    bill_no: null,
    amount: 15000,
    payment_method: 'cash',
    payment_method_label: 'Cash in hand',
    status: 'pending',
    status_label: 'Pending approval',
    approved_at: null,
    returned_at: null,
    return_reason: null,
    can: { update: true, delete: true, approve: false, send_back: false },
    bank_name: null,
    bank_branch: null,
    bank_account_name: null,
    bank_account_number: null,
    mobile_provider: null,
    mobile_provider_label: null,
    mobile_number: null,
    note: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

let wrapper: VueWrapper

async function mountDialog(
  props: { payment?: CashPayment | null; presetParty?: Party | null } = {},
) {
  wrapper = mount(CashPaymentFormDialog, {
    props: { open: false, payment: null, ...props },
    attachTo: document.body,
    global: {
      provide: {
        [CASH_CONTEXT as symbol]: {
          settings: ref({
            opening_balance: 0,
            opening_date: null,
            today: '2026-10-20',
            cash_in_hand: 4200,
          }),
          refresh: async () => {},
        },
      },
    },
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

async function choosePayee(name: string) {
  await wrapper.find('input[role="combobox"]').trigger('focus')
  await flushPromises()
  const option = wrapper.findAll('[role="option"]').find((o) => o.text().includes(name))
  await option!.trigger('mousedown')
  await flushPromises()
}

const radioLabels = () => wrapper.findAll('[data-field="payment_type"] label').map((l) => l.text())

beforeEach(() => {
  vi.mocked(searchParties).mockImplementation(async (type) =>
    type === 'owner' ? [OWNER] : [party()],
  )
  vi.mocked(createCashPayment).mockResolvedValue(payment())
  vi.mocked(updateCashPayment).mockResolvedValue(payment())
  vi.mocked(getOwnerLoans).mockResolvedValue({
    summary: { total_capital: 0, loans_owed: 0, open_count: 0, settled_count: 0, owners: [] },
    data: [
      loan(),
      loan({
        id: 6,
        receipt_no: 'CR-2026-0006',
        amount: 20000,
        repaid: 0,
        still_owed: 20000,
        pending_repaid: 20000,
      }),
      loan({ id: 2, receipt_no: 'CR-2026-0002', repaid: 100000, still_owed: 0, status: 'settled' }),
    ],
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashPaymentFormDialog', () => {
  it('offers the payment types of each payee', async () => {
    await mountDialog()

    // Only owners lend money, so a party only gets refunds.
    expect(radioLabels()).toEqual(['Refund'])
    await wrapper.find('[data-payee-type="owner"]').trigger('click')
    expect(radioLabels()).toEqual(['Payment to owner', 'Loan repayment'])
    expect(searchParties).not.toHaveBeenCalledWith('client', expect.anything())
    await wrapper.find('[data-payee-type="other"]').trigger('click')
    expect(radioLabels()).toEqual(['Expense'])
    expect(wrapper.find('input[role="combobox"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="purpose"]').exists()).toBe(true)
  })

  it('keeps the Loan repayment option on an old party loan repayment being edited', async () => {
    const p = party()
    await mountDialog({
      payment: payment({
        payee_type: 'client',
        payee_type_label: 'Party / Client',
        party: {
          id: p.id,
          code: p.code,
          type: p.type,
          name: p.name,
          mobile: p.mobile,
          address: p.address,
        },
        payee_name: p.name,
        payment_type: 'loan_repayment',
        payment_type_label: 'Loan repayment',
        purpose: null,
      }),
    })

    expect(radioLabels()).toEqual(['Refund', 'Loan repayment'])
  })

  it('pays a party refund and shows the cash in hand', async () => {
    await mountDialog()

    await choosePayee('Karim Traders')
    expect(wrapper.find('[data-payee]').text()).toContain('PT-0007')
    await wrapper.find('[data-method="cash"]').trigger('click')
    expect(wrapper.find('[data-cash-hint]').text()).toContain('4,200.00')

    await wrapper.find('[data-field="amount"] input').setValue('1,000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'client',
        party_id: 7,
        payee_name: null,
        payment_type: 'refund',
        amount: 1000,
        payment_method: 'cash',
      }),
    )
    expect(wrapper.emitted('saved')?.[0]).toEqual([payment(), true])
  })

  it('pays an owner drawing', async () => {
    await mountDialog()

    await wrapper.find('[data-payee-type="owner"]').trigger('click')
    await choosePayee('Chairman')
    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'owner',
        party_id: 9,
        payment_type: 'drawing',
        expense_category: null,
        bill_no: null,
      }),
    )
  })

  it('requires the payee name and purpose for another payee', async () => {
    await mountDialog()

    await wrapper.find('[data-payee-type="other"]').trigger('click')
    expect(wrapper.find('[data-field="payee_name"] label').text()).toBe('Paid to (name) *')
    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('50')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="payee_name"]').text()).toContain(
      'Enter the name of who you paid.',
    )
    expect(wrapper.find('[data-field="purpose"]').text()).toContain('Enter the purpose')
    expect(wrapper.find('[data-field="expense_category"]').text()).toContain(
      'Choose what the money was spent on.',
    )

    await wrapper.find('[data-field="payee_name"] input').setValue(' Rahman  Properties ')
    await wrapper.find('[data-field="expense_category"] select').setValue('office_rent')
    await wrapper.find('[data-field="purpose"] input').setValue('Office rent')
    await wrapper.find('[data-field="bill_no"] input').setValue('  R-17 ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'other',
        party_id: null,
        payee_name: 'Rahman Properties',
        payment_type: 'expense',
        expense_category: 'office_rent',
        purpose: 'Office rent',
        bill_no: 'R-17',
      }),
    )
  })

  it('requires Paid via, shows Amount below it once chosen, and pays by mobile banking', async () => {
    await mountDialog({ presetParty: OWNER })

    expect(wrapper.find('[data-field="payment_method"] legend').text()).toContain('*')
    expect(wrapper.find('[data-field="amount"]').exists()).toBe(false)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="payment_method"]').text()).toContain(
      'Choose how the money was paid.',
    )

    await wrapper.find('[data-method="mobile_banking"]').trigger('click')
    const fields = wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
    expect(fields.indexOf('amount')).toBeGreaterThan(fields.indexOf('payment_method'))
    await wrapper.find('[data-field="amount"] input').setValue('700')
    expect(wrapper.find('[data-cash-hint]').exists()).toBe(false)
    await wrapper.find('[data-field="mobile_provider"] select').setValue('rocket')
    expect(wrapper.find('[data-field="mobile_number"] label').text()).toContain('Rocket number')
    await wrapper.find('[data-field="mobile_number"] input').setValue('01912 345678')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'owner',
        payment_method: 'mobile_banking',
        mobile_provider: 'rocket',
        mobile_number: '01912345678',
        bank_name: null,
      }),
    )
  })

  it('pays from a bank with the account name and number first, then the bank and branch', async () => {
    await mountDialog({ presetParty: OWNER })

    await wrapper.find('[data-method="bank"]').trigger('click')
    const fields = wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
    expect(fields.indexOf('bank_account_name')).toBeLessThan(fields.indexOf('bank_name'))
    expect(fields.indexOf('bank_account_number')).toBeLessThan(fields.indexOf('bank_name'))

    await wrapper.find('[data-field="amount"] input').setValue('700')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="bank_account_name"]').text()).toContain(
      'Enter the bank account name.',
    )
    expect(wrapper.find('[data-field="bank_account_number"]').text()).toContain(
      'Enter the bank account number.',
    )
    expect(wrapper.find('[data-field="bank_name"]').text()).toContain('Enter the bank name.')
    expect(wrapper.find('[data-field="bank_branch"]').text()).toContain('Enter the branch name.')

    await wrapper.find('[data-field="bank_account_name"] input').setValue('  Afwan  Associates ')
    await wrapper.find('[data-field="bank_account_number"] input').setValue('0123 4567 89')
    await wrapper.find('[data-field="bank_name"] input').setValue('DBBL')
    await wrapper.find('[data-field="bank_branch"] input').setValue('Uttara')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: 'bank',
        bank_account_name: 'Afwan Associates',
        bank_account_number: '0123456789',
        bank_name: 'DBBL',
        bank_branch: 'Uttara',
        mobile_provider: null,
      }),
    )
  })

  it("repays one of the owner's open loans, up to what is still owed", async () => {
    await mountDialog({ presetParty: OWNER })

    await wrapper.find('input[value="loan_repayment"]').setValue(true)
    await flushPromises()
    expect(getOwnerLoans).toHaveBeenLastCalledWith({ party_id: 9, for_payment: undefined })
    // Settled loans and loans fully covered by pending repayments are not offered,
    // so the only open one is chosen.
    const options = wrapper.findAll('[data-field="loan_receipt_id"] option').map((o) => o.text())
    expect(options).toHaveLength(2)
    expect(options[1]).toContain('CR-2026-0005')
    expect(options[1]).toContain('still owed ৳ 60,000.00')
    expect(wrapper.find('[data-loan-hint]').text()).toContain('up to ৳ 60,000.00')

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('60001')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="amount"]').text()).toContain(
      'Only ৳ 60,000.00 is still owed on loan CR-2026-0005.',
    )

    await wrapper.find('[data-field="amount"] input').setValue('60000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'owner',
        payment_type: 'loan_repayment',
        loan_receipt_id: 5,
        amount: 60000,
      }),
    )
  })

  it('says so when the owner has no open loans', async () => {
    vi.mocked(getOwnerLoans).mockResolvedValue({
      summary: { total_capital: 0, loans_owed: 0, open_count: 0, settled_count: 0, owners: [] },
      data: [],
    })
    await mountDialog({ presetParty: OWNER })

    await wrapper.find('input[value="loan_repayment"]').setValue(true)
    await flushPromises()
    expect(wrapper.find('[data-no-loans]').text()).toContain('Chairman has no open loans')

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('10')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="loan_receipt_id"]').text()).toContain(
      'Choose the loan being repaid.',
    )
  })

  it('shows the not-enough-cash message from the API', async () => {
    vi.mocked(createCashPayment).mockRejectedValue(
      httpError(422, {
        message: 'x',
        errors: {
          amount: ['Not enough cash in hand: the balance would be −৳800.00 on 20-10-2026.'],
        },
      }),
    )
    await mountDialog({ presetParty: party() })

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('5000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-amount-error]').text()).toContain('Not enough cash in hand')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('edits a payment with its saved values', async () => {
    await mountDialog({ payment: payment() })

    expect(
      (wrapper.find('[data-field="payee_name"] input').element as HTMLInputElement).value,
    ).toBe('Rahman Properties')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateCashPayment).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ date: '2026-10-08', amount: 15000, purpose: 'Office rent' }),
    )
  })
})
