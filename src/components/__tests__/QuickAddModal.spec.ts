import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QuickAddModal, { type QuickAddValues } from '../QuickAddModal.vue'
import SearchSelect from '../SearchSelect.vue'
import { httpError } from '@/test/helpers'
import type { CountryOption } from '@/types/country'

const COUNTRIES: CountryOption[] = [
  { code: 'BD', name: 'Bangladesh', is_pinned: true },
  { code: 'MY', name: 'Malaysia', is_pinned: true },
  { code: 'NP', name: 'Nepal', is_pinned: false },
]

vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => COUNTRIES),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))

let wrapper: VueWrapper
let save: ReturnType<typeof vi.fn<(values: QuickAddValues) => Promise<unknown>>>

/** Mounts the company variant of the modal, closed, then opens it (as the form does). */
async function openCompanyModal() {
  setActivePinia(createPinia())
  save = vi.fn(async (values: QuickAddValues) => ({ id: 9, name: values.name }))
  wrapper = mount(QuickAddModal, {
    props: {
      open: false,
      title: 'Add new company',
      nameLabel: 'Company name',
      initialName: 'ABC Sdn Bhd',
      save,
      withCountry: true,
      defaultCountryCode: 'MY',
      'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }),
    },
    attachTo: document.body,
  }) as unknown as VueWrapper
  await wrapper.setProps({ open: true })
  await flushPromises()
}

/** The modal is generic, so test-utils cannot type its props; read them untyped. */
const isOpen = () => (wrapper.props() as Record<string, unknown>).open
const countrySelect = () => wrapper.findComponent(SearchSelect)
const countryValue = () => (countrySelect().props() as Record<string, unknown>).modelValue
const submit = async () => {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('QuickAddModal (company)', () => {
  it('preselects the default company country', async () => {
    await openCompanyModal()

    expect(countryValue()).toEqual(COUNTRIES[1])
    expect(wrapper.get<HTMLInputElement>('input[role="combobox"]').element.value).toBe('Malaysia')
  })

  it('sends name and country_code', async () => {
    await openCompanyModal()

    await submit()

    expect(save).toHaveBeenCalledWith({ name: 'ABC Sdn Bhd', phone: null, country_code: 'MY' })
    expect(wrapper.emitted('saved')).toEqual([[{ id: 9, name: 'ABC Sdn Bhd' }]])
    expect(isOpen()).toBe(false)
  })

  it('lets the user choose another country', async () => {
    await openCompanyModal()
    countrySelect().vm.$emit('update:modelValue', COUNTRIES[2])
    await flushPromises()

    await submit()

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'NP' }))
  })

  it('requires a country', async () => {
    await openCompanyModal()
    countrySelect().vm.$emit('update:modelValue', null)
    await flushPromises()

    await submit()

    expect(save).not.toHaveBeenCalled()
    expect((countrySelect().props() as Record<string, unknown>).error).toBe('Select a country.')
  })

  it('shows a 422 for the country under the field and stays open', async () => {
    await openCompanyModal()
    save.mockRejectedValueOnce(
      httpError(422, {
        message: 'The selected country does not exist or is inactive.',
        errors: { country_code: ['The selected country does not exist or is inactive.'] },
      }),
    )

    await submit()

    expect((countrySelect().props() as Record<string, unknown>).error).toBe(
      'The selected country does not exist or is inactive.',
    )
    expect(isOpen()).toBe(true)
  })
})
