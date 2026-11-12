import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PriceDialog from '../PriceDialog.vue'
import { rateSaveMessage } from '@/lib/accounts'

let wrapper: VueWrapper

async function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(PriceDialog, {
    props: { open: false, title: 'Standard rate: Top Glove', value: null, ...props },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

const input = () => document.body.querySelector<HTMLInputElement>('[data-price-input]')!
const button = (action: string) =>
  document.body.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)

afterEach(() => wrapper.unmount())

describe('PriceDialog', () => {
  it('saves the typed price, with "also change existing passports" when ticked', async () => {
    await mountDialog({ showUpdateExisting: true })
    input().value = '45,000'
    input().dispatchEvent(new Event('input'))
    const box = document.body.querySelector<HTMLInputElement>('[data-update-existing]')!
    box.checked = true
    box.dispatchEvent(new Event('change'))
    button('save')!.click()
    await flushPromises()

    expect(wrapper.emitted('save')).toEqual([[45000, true]])
  })

  it('needs a price, and offers Remove only for an existing one', async () => {
    await mountDialog()
    expect(button('remove')).toBeNull()
    expect(document.body.querySelector('[data-update-existing]')).toBeNull()
    button('save')!.click()
    await flushPromises()
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(document.body.textContent).toContain('Enter the price.')
    wrapper.unmount()

    await mountDialog({ value: 40000, removable: true })
    expect(input().value).toBe('40000')
    button('remove')!.click()
    expect(wrapper.emitted('save')).toEqual([[null, false]])
  })
})

describe('rateSaveMessage', () => {
  it('says what the rate did to the passports', () => {
    expect(rateSaveMessage({ filled: 3, updated: 0, kept: 0 })).toBe(
      'Rate saved. Priced 3 passports that had no price.',
    )
    expect(rateSaveMessage({ filled: 0, updated: 1, kept: 2 })).toBe(
      'Rate saved. Changed 1 passport. 2 passports kept the old price (tick "Also change existing passports" to change them).',
    )
  })
})
