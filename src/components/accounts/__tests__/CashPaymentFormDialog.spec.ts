import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import CashPaymentFormDialog from '../CashPaymentFormDialog.vue'
import { createCashPayment, searchParties, updateCashPayment } from '@/api/accounts'
import { CASH_CONTEXT } from '@/lib/accounts'
import { httpError } from '@/test/helpers'
import type { CashPayment, Party, PayeeType } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  searchParties: vi.fn(),
  createCashPayment: vi.fn(),
  updateCashPayment: vi.fn(),
}))

function party(overrides: Partial<Party> = {}): Party {
  return {
    id: 7,
    code: 'PT-0007',
    type: 'client',
    type_label: 'Party / Client',
    rl_number: null,
    name: 'Karim Traders',
    agency_owner_name: null,
    designation: null,
    designation_label: null,
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
  props: {
    payment?: CashPayment | null
    presetParty?: Party | null
    presetPayeeType?: PayeeType
  } = {},
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
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashPaymentFormDialog', () => {
  it('offers the payment types of each payee', async () => {
    await mountDialog()

    // A party gets refunds; an owner gets a loan from the company (never a drawing).
    expect(radioLabels()).toEqual(['Refund'])
    await wrapper.find('[data-payee-type="owner"]').trigger('click')
    expect(radioLabels()).toEqual(['Owner loan'])
    expect(wrapper.find('[data-type-hint]').text()).toMatch(/Owner loans page/)
    expect(searchParties).not.toHaveBeenCalledWith('client', expect.anything())
    await wrapper.find('[data-payee-type="other"]').trigger('click')
    expect(radioLabels()).toEqual(['Expense'])
    expect(wrapper.find('input[role="combobox"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="purpose"]').exists()).toBe(true)
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

  it('gives an owner a loan by mobile banking, starting on the owner from the Owner loans page', async () => {
    await mountDialog({ presetPayeeType: 'owner' })

    expect(wrapper.find('[data-payee-type="owner"]').attributes('aria-pressed')).toBe('true')
    await choosePayee('Chairman')
    await wrapper.find('[data-method="mobile_banking"]').trigger('click')
    await wrapper.find('[data-field="mobile_provider"] select').setValue('bkash')
    await wrapper.find('[data-field="mobile_number"] input').setValue('01712345678')
    await wrapper.find('[data-field="amount"] input').setValue('50000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'owner',
        party_id: 9,
        payment_type: 'owner_loan',
        amount: 50000,
        payment_method: 'mobile_banking',
        mobile_provider: 'bkash',
      }),
    )
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.not.objectContaining({ loan_receipt_id: expect.anything() }),
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
