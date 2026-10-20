import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import CashPaymentFormDialog from '../CashPaymentFormDialog.vue'
import { createCashPayment, searchParties, updateCashPayment } from '@/api/accounts'
import { CASH_CONTEXT } from '@/lib/accounts'
import { httpError } from '@/test/helpers'
import type { CashPayment, Party } from '@/types/accounts'

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
    purpose: 'Office rent',
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
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashPaymentFormDialog', () => {
  it('offers the payment types of each payee', async () => {
    await mountDialog()

    expect(radioLabels()).toEqual(['Refund', 'Loan repayment'])
    await wrapper.find('[data-payee-type="owner"]').trigger('click')
    expect(radioLabels()).toEqual(['Owner drawing', 'Loan repayment'])
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
    await wrapper.find('[data-field="amount"] input').setValue('500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({ payee_type: 'owner', party_id: 9, payment_type: 'drawing' }),
    )
  })

  it('requires the payee name and purpose for another payee', async () => {
    await mountDialog()

    await wrapper.find('[data-payee-type="other"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('50')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashPayment).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="payee_name"]').text()).toContain('Enter the payee name.')
    expect(wrapper.find('[data-field="purpose"]').text()).toContain('Enter the purpose')

    await wrapper.find('[data-field="payee_name"] input').setValue(' Rahman  Properties ')
    await wrapper.find('[data-field="purpose"] input').setValue('Office rent')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payee_type: 'other',
        party_id: null,
        payee_name: 'Rahman Properties',
        payment_type: 'expense',
        purpose: 'Office rent',
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
