import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ReceiptPassportPicker, { type PassportSelection } from '../ReceiptPassportPicker.vue'
import { fetchPartyPassports } from '@/api/accounts'
import type { PartyPassport } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({ fetchPartyPassports: vi.fn() }))

const passport = (id: number, state: Partial<PartyPassport>): PartyPassport => ({
  id,
  entry_no: id,
  passport_name: `PERSON ${id}`,
  passport_number: `A${id}`,
  country_code: 'BD',
  stage: null,
  is_deleted: false,
  status: 'unpaid',
  receipts: [],
  on_this_receipt: false,
  can_tick: true,
  price: 45000,
  price_source: 'company',
  paid: 0,
  due: 45000,
  ...state,
})

let wrapper: VueWrapper

async function mountPicker() {
  vi.mocked(fetchPartyPassports).mockResolvedValue({
    data: [
      {
        company: { id: 1, name: 'Top Glove', country_code: 'MY' },
        counts: { total: 3, paid: 0, pending: 0, part_paid: 1, unpaid: 2 },
        passports: [
          passport(21, {}),
          // Party rate 40,000, 10,000 paid on a part payment.
          passport(22, {
            status: 'part_paid',
            price: 40000,
            price_source: 'reference',
            paid: 10000,
            due: 30000,
          }),
          // No standard or party rate yet.
          passport(23, { can_tick: false, price: null, price_source: null, due: null }),
        ],
      },
    ],
    meta: { counts: { total: 3, paid: 0, pending: 0, part_paid: 1, unpaid: 2 } },
  })
  let selection: PassportSelection = {}
  wrapper = mount(ReceiptPassportPicker, {
    props: {
      modelValue: selection,
      'onUpdate:modelValue': (value: PassportSelection) => {
        selection = value
        void wrapper.setProps({ modelValue: value })
      },
      partyId: 7,
      countryCode: 'MY',
      receiptId: null,
      errors: {},
    },
  })
  await flushPromises()
  return () => selection
}

const box = (id: number) => wrapper.get(`[data-passport="${id}"] input[type="checkbox"]`)

afterEach(() => wrapper.unmount())

describe('ReceiptPassportPicker', () => {
  it('shows each price and due, and blocks a passport without a price', async () => {
    await mountPicker()

    expect(wrapper.get('[data-passport="21"] [data-price]').text()).toContain('45,000.00')
    expect(wrapper.get('[data-passport="21"] [data-price]').text()).toContain('standard rate')
    expect(wrapper.get('[data-passport="22"] [data-price]').text()).toContain('party rate')
    expect(wrapper.get('[data-passport="22"] [data-due]').text()).toBe('Due 30,000.00')
    expect(wrapper.get('[data-passport="23"] [data-status]').text()).toBe('No price')
    expect(box(23).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-no-price]').text()).toContain('1 passport has no price')
  })

  it('suggests the ticked dues as the amount until one is typed', async () => {
    const selection = await mountPicker()

    await box(21).setValue(true)
    await box(22).setValue(true)
    expect(selection()[1]!.amount).toBe('75000.00')
    expect(wrapper.get('[data-ticked-due]').text()).toContain('75,000.00')

    // A typed amount stays when more passports are ticked or unticked.
    await wrapper.get('[data-company-amount] input[inputmode="decimal"]').setValue('50000')
    await box(22).setValue(false)
    expect(selection()[1]!.amount).toBe('50000')
  })
})
