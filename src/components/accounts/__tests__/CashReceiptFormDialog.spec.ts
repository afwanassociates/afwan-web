import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CashReceiptFormDialog from '../CashReceiptFormDialog.vue'
import { createCashReceipt, searchParties, updateCashReceipt } from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type { CashReceipt, Party } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  searchParties: vi.fn(),
  createCashReceipt: vi.fn(),
  updateCashReceipt: vi.fn(),
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

const OWNER = party({
  id: 9,
  code: 'OW-001',
  type: 'owner',
  name: 'Chairman',
  mobile: '01900000000',
})

function receipt(overrides: Partial<CashReceipt> = {}): CashReceipt {
  const p = party()
  return {
    id: 3,
    receipt_no: 'CR-2026-0003',
    date: '2026-10-05',
    party: {
      id: p.id,
      code: p.code,
      type: p.type,
      name: p.name,
      mobile: p.mobile,
      address: p.address,
    },
    receipt_type: 'cash',
    receipt_type_label: 'Cash',
    amount: 2500,
    payment_method: 'bank',
    payment_method_label: 'Bank',
    status: 'pending',
    status_label: 'Pending approval',
    approved_at: null,
    returned_at: null,
    return_reason: null,
    can: { update: true, delete: true, approve: false, send_back: false },
    bank_name: 'Sonali Bank',
    bank_branch: 'Motijheel',
    note: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

let wrapper: VueWrapper

async function mountDialog(
  props: { receipt?: CashReceipt | null; presetParty?: Party | null } = {},
) {
  wrapper = mount(CashReceiptFormDialog, {
    props: { open: false, receipt: null, ...props },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

async function choosePayer(name: string) {
  const input = wrapper.find('input[role="combobox"]')
  await input.trigger('focus')
  await flushPromises()
  const option = wrapper.findAll('[role="option"]').find((o) => o.text().includes(name))
  await option!.trigger('mousedown')
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(searchParties).mockImplementation(async (type) =>
    type === 'owner' ? [OWNER] : [party()],
  )
  vi.mocked(createCashReceipt).mockResolvedValue(receipt())
  vi.mocked(updateCashReceipt).mockResolvedValue(receipt())
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashReceiptFormDialog', () => {
  it('fills the payer details from the chosen party and saves a cash receipt', async () => {
    await mountDialog()

    await choosePayer('Karim Traders')
    const payer = wrapper.find('[data-payer]').text()
    expect(payer).toContain('PT-0007')
    expect(payer).toContain('01711000000')
    expect(payer).toContain('Mirpur, Dhaka')
    expect(wrapper.find('[data-effect]').text()).toMatch(/payment against what the party owes/)

    await wrapper.find('[data-field="amount"] input').setValue('2,500')
    await wrapper.find('[data-field="note"] input').setValue('  first  instalment ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        party_type: 'client',
        party_id: 7,
        receipt_type: 'cash',
        amount: 2500,
        payment_method: 'cash',
        bank_name: null,
        bank_branch: null,
        note: 'first instalment',
      }),
    )
    expect(wrapper.emitted('saved')?.[0]).toEqual([receipt(), true])
    expect(wrapper.emitted('update:open')?.slice(-1)[0]).toEqual([false])
  })

  it('switches to owners, and explains an owner loan', async () => {
    await mountDialog()

    await wrapper.find('[data-party-type="owner"]').trigger('click')
    await choosePayer('Chairman')
    await wrapper.find('input[value="loan"]').setValue(true)

    expect(searchParties).toHaveBeenLastCalledWith('owner', '')
    expect(wrapper.find('[data-effect]').text()).toMatch(/loan from the owner/)

    await wrapper.find('[data-field="amount"] input').setValue('100')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ party_type: 'owner', party_id: 9, receipt_type: 'loan' }),
    )
  })

  it('requires a payer and an amount, and the bank name and branch for a bank deposit', async () => {
    await mountDialog()

    await wrapper.find('[data-method="bank"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="party_id"]').text()).toContain('Choose the party.')
    expect(wrapper.find('[data-field="amount"]').text()).toContain('Enter the amount.')
    expect(wrapper.find('[data-field="bank_name"]').text()).toContain('Enter the bank name.')
    expect(wrapper.find('[data-field="bank_branch"]').text()).toContain('Enter the branch name.')
  })

  it('shows the API validation errors', async () => {
    vi.mocked(createCashReceipt).mockRejectedValue(
      httpError(422, { message: 'x', errors: { party_id: ['Choose an active party.'] } }),
    )
    await mountDialog({ presetParty: party() })

    await wrapper.find('[data-field="amount"] input').setValue('10')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-field="party_id"]').text()).toContain('Choose an active party.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('edits a receipt with its saved values', async () => {
    await mountDialog({ receipt: receipt() })

    expect(wrapper.find('[data-payer]').text()).toContain('Karim Traders')
    expect((wrapper.find('[data-field="amount"] input').element as HTMLInputElement).value).toBe(
      '2500.00',
    )
    expect((wrapper.find('[data-field="bank_name"] input').element as HTMLInputElement).value).toBe(
      'Sonali Bank',
    )

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateCashReceipt).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ payment_method: 'cash', bank_name: null, date: '2026-10-05' }),
    )
  })
})
