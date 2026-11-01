import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CashTransferFormDialog from '../CashTransferFormDialog.vue'
import { createCashTransfer } from '@/api/accounts'
import type { CashTransfer } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  createCashTransfer: vi.fn(),
  updateCashTransfer: vi.fn(),
}))
vi.mock('@/lib/dates', async (original) => ({
  ...(await original<typeof import('@/lib/dates')>()),
  businessToday: () => '2026-10-31',
}))

let wrapper: VueWrapper

async function mountDialog() {
  wrapper = mount(CashTransferFormDialog, {
    props: { open: false, transfer: null },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashTransferFormDialog', () => {
  it('requires the bank and amount, then saves a withdrawal', async () => {
    vi.mocked(createCashTransfer).mockResolvedValue({ transfer_no: 'CT-2026-0001' } as CashTransfer)
    await mountDialog()

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="bank_name"]').text()).toContain('Enter the bank name.')
    expect(wrapper.find('[data-field="amount"]').text()).toContain('Enter the amount.')

    await wrapper.find('[data-direction="withdrawal"]').trigger('click')
    expect(wrapper.find('[data-direction-hint]').text()).toContain('cash in hand goes up')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="cheque_no"]').text()).toContain('Enter the cheque number.')
    expect(wrapper.find('[data-field="reference_name"]').text()).toContain(
      "Enter the withdrawer's name.",
    )
    await wrapper.find('[data-field="cheque_no"] input').setValue(' CHQ-500 ')
    await wrapper.find('[data-field="reference_name"] input').setValue(' Rahim  Uddin ')
    await wrapper.find('[data-field="reference_mobile"] input').setValue('01811000000')
    await wrapper.find('[data-field="reference_nid_passport"] input').setValue(' b765 4321 ')
    await wrapper.find('[data-field="bank_name"] input').setValue(' Dutch  Bangla ')
    await wrapper.find('[data-field="bank_branch"] input').setValue('Uttara')
    await wrapper.find('[data-field="amount"] input').setValue('2500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'withdrawal',
        bank_name: 'Dutch Bangla',
        bank_branch: 'Uttara',
        amount: 2500,
        cheque_no: 'CHQ-500',
        deposit_slip_no: null,
        reference_name: 'Rahim Uddin',
        reference_mobile: '01811000000',
        reference_nid_passport: 'B7654321',
      }),
    )
  })

  it('cashes in to a mobile banking wallet with the service and number, no bank details', async () => {
    vi.mocked(createCashTransfer).mockResolvedValue({ transfer_no: 'CT-2026-0003' } as CashTransfer)
    await mountDialog()

    expect(wrapper.find('[data-channel="bank"]').attributes('aria-pressed')).toBe('true')
    await wrapper.find('[data-channel="mobile_banking"]').trigger('click')
    expect(wrapper.find('[data-direction="deposit"]').text()).toBe('Cash in to mobile banking')
    expect(wrapper.find('[data-direction="withdrawal"]').text()).toBe(
      'Cash out from mobile banking',
    )
    expect(wrapper.find('[data-direction-hint]').text()).toContain('mobile banking balance goes up')
    for (const field of ['bank_name', 'bank_branch', 'deposit_slip_no']) {
      expect(wrapper.find(`[data-field="${field}"]`).exists()).toBe(false)
    }

    await wrapper.find('[data-field="amount"] input').setValue('3000')
    await wrapper.find('[data-field="reference_name"] input').setValue('Abdul Karim')
    await wrapper.find('[data-field="reference_mobile"] input').setValue('01711000000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="mobile_provider"]').text()).toContain(
      'Choose the mobile banking service.',
    )
    // NID / passport is optional for mobile banking.
    expect(wrapper.find('[data-field="reference_nid_passport"]').text()).not.toContain('Enter')

    await wrapper.find('[data-field="mobile_provider"] select').setValue('bkash')
    await wrapper.find('[data-field="mobile_number"] input').setValue('+880 1712-345678')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'mobile_banking',
        direction: 'deposit',
        amount: 3000,
        mobile_provider: 'bkash',
        mobile_number: '01712345678',
        bank_name: null,
        bank_branch: null,
        deposit_slip_no: null,
        cheque_no: null,
        reference_nid_passport: null,
      }),
    )
  })

  it('requires the deposit slip and the depositor for a deposit, with no transaction type', async () => {
    vi.mocked(createCashTransfer).mockResolvedValue({ transfer_no: 'CT-2026-0002' } as CashTransfer)
    await mountDialog()

    await wrapper.find('[data-field="bank_name"] input').setValue('DBBL')
    await wrapper.find('[data-field="bank_branch"] input').setValue('Uttara')
    await wrapper.find('[data-field="amount"] input').setValue('1000')
    await wrapper.find('[data-field="reference_mobile"] input').setValue('abc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="deposit_slip_no"]').text()).toContain(
      'Enter the deposit slip number.',
    )
    expect(wrapper.find('[data-field="transaction_type"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="reference_mobile"]').text()).toContain('valid mobile number')
    expect(wrapper.find('[data-field="reference_name"]').text()).toContain(
      "Enter the depositor's name.",
    )
    expect(wrapper.find('[data-field="reference_nid_passport"]').text()).toContain(
      "Enter the depositor's NID or passport number.",
    )

    await wrapper.find('[data-field="deposit_slip_no"] input').setValue(' DS-2231 ')
    await wrapper.find('[data-field="reference_name"] input').setValue(' Abdul  Karim ')
    await wrapper.find('[data-field="reference_mobile"] input').setValue('01711000000')
    await wrapper.find('[data-field="reference_nid_passport"] input').setValue(' a123 4567 ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'deposit',
        deposit_slip_no: 'DS-2231',
        reference_name: 'Abdul Karim',
        reference_mobile: '01711000000',
        reference_nid_passport: 'A1234567',
      }),
    )
  })

  it('shows the slip number first, and the depositor above the description', async () => {
    await mountDialog()

    const fields = wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
    expect(fields.indexOf('deposit_slip_no')).toBeLessThan(fields.indexOf('bank_name'))
    // Deposited by comes right above the description, after the amount and date.
    expect(fields.indexOf('reference_name')).toBeGreaterThan(fields.indexOf('date'))
    expect(fields.indexOf('note') - fields.indexOf('reference_nid_passport')).toBe(1)
    expect(wrapper.find('[data-depositor] legend').text()).toBe('Deposited by')
    const labels = wrapper.findAll('[data-depositor] label').map((l) => l.text())
    expect(labels).toEqual(['Name *', 'Mobile *', 'NID / Passport *'])
  })

  it("always uses today's date, which cannot be changed", async () => {
    vi.mocked(createCashTransfer).mockResolvedValue({ transfer_no: 'CT-2026-0003' } as CashTransfer)
    await mountDialog()

    const input = wrapper.find('[data-field="date"] input')
    expect(input.attributes('type')).toBe('date')
    expect((input.element as HTMLInputElement).value).toBe('2026-10-31')

    await wrapper.find('[data-direction="withdrawal"]').trigger('click')
    await wrapper.find('[data-field="bank_name"] input').setValue('DBBL')
    await wrapper.find('[data-field="bank_branch"] input').setValue('Uttara')
    await wrapper.find('[data-field="cheque_no"] input').setValue('CHQ-1')
    await wrapper.find('[data-field="reference_name"] input').setValue(' Rahim  Uddin ')
    await wrapper.find('[data-field="reference_mobile"] input').setValue('01811000000')
    await wrapper.find('[data-field="reference_nid_passport"] input').setValue(' b765 4321 ')
    await wrapper.find('[data-field="amount"] input').setValue('100')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashTransfer).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-31' }))
  })

  it('shows the cheque number instead of the deposit slip, and "Withdrawn by" for a withdrawal', async () => {
    await mountDialog()
    expect(wrapper.find('[data-field="deposit_slip_no"]').exists()).toBe(true)
    await wrapper.find('[data-direction="withdrawal"]').trigger('click')
    expect(wrapper.find('[data-field="deposit_slip_no"]').exists()).toBe(false)
    expect(wrapper.find('[data-depositor] legend').text()).toBe('Withdrawn by')
    expect(wrapper.find('[data-field="reference_name"]').exists()).toBe(true)
    // The cheque number comes first, before the bank.
    const fields = wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
    expect(fields.indexOf('cheque_no')).toBeLessThan(fields.indexOf('bank_name'))
    await wrapper.find('[data-direction="deposit"]').trigger('click')
    expect(wrapper.find('[data-field="cheque_no"]').exists()).toBe(false)
  })
})
