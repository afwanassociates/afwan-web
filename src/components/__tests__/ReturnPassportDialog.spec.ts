import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ReturnPassportDialog from '../ReturnPassportDialog.vue'
import { returnPassport } from '@/api/passports'
import { businessToday } from '@/lib/dates'
import { makePassport } from '@/test/helpers'

vi.mock('@/api/passports', () => ({ returnPassport: vi.fn() }))

const TARGET = {
  id: 7,
  passport_name: 'KARIM MIAH',
  passport_number: 'NW1234567',
  reference: { name: 'Abdul Agency' },
}

let wrapper: VueWrapper

async function mountDialog() {
  wrapper = mount(ReturnPassportDialog, {
    props: { open: false, passport: TARGET },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('ReturnPassportDialog', () => {
  it('shows the reference read-only and requires the receiver and phone', async () => {
    await mountDialog()

    const reference = wrapper.get('[data-field="reference"]')
    expect(reference.text()).toContain('Abdul Agency')
    expect(reference.find('input').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('[data-field="return_date"] input').element.value).toBe(
      businessToday(),
    )

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(returnPassport).not.toHaveBeenCalled()
    expect(wrapper.get('[data-field="receiver_name"]').text()).toContain('Enter the name')
    expect(wrapper.get('[data-field="receiver_phone"]').text()).toContain('phone number')
  })

  it('refuses a future return date', async () => {
    await mountDialog()
    await wrapper.get('[data-field="receiver_name"] input').setValue('Rahim')
    await wrapper.get('[data-field="receiver_phone"] input').setValue('01711000000')
    await wrapper.get('[data-field="return_date"] input').setValue('2999-01-01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(returnPassport).not.toHaveBeenCalled()
    expect(wrapper.get('[data-field="return_date"]').text()).toContain('cannot be in the future')
  })

  it('saves the return with empty optional fields as null and emits the passport', async () => {
    const updated = makePassport({ id: 7 })
    vi.mocked(returnPassport).mockResolvedValue(updated)
    await mountDialog()

    await wrapper.get('[data-field="receiver_name"] input').setValue('  Rahim  ')
    await wrapper.get('[data-field="receiver_phone"] input').setValue('01711000000')
    await wrapper.get('[data-field="return_date"] input').setValue('2026-10-28')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(returnPassport).toHaveBeenCalledWith(7, {
      return_date: '2026-10-28',
      receiver_name: 'Rahim',
      receiver_phone: '01711000000',
      receiver_id_no: null,
      remarks: null,
    })
    expect(wrapper.emitted('returned')?.[0]).toEqual([updated])
    const opens = wrapper.emitted('update:open') ?? []
    expect(opens[opens.length - 1]).toEqual([false])
  })
})
