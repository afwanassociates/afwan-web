import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CashTransferFormDialog from '../CashTransferFormDialog.vue'
import { createCashTransfer } from '@/api/accounts'
import type { CashTransfer } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  createCashTransfer: vi.fn(),
  updateCashTransfer: vi.fn(),
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
      }),
    )
  })
})
