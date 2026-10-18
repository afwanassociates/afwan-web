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
async function openCompanyModal(extraProps: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  save = vi.fn(async (values: QuickAddValues) => ({ id: 9, name: values.name }))
  wrapper = mount(QuickAddModal, {
    props: {
      open: false,
      title: 'Add new company',
      nameLabel: 'Company name',
      initialName: 'ABC Sdn Bhd',
      save,
      withQuota: true,
      withCountry: true,
      defaultCountryCode: 'MY',
      ...extraProps,
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
const quota = () => wrapper.get<HTMLInputElement>('[data-field="quota"] input')
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

  it('has exactly three required fields: Company name, Quota and Country', async () => {
    await openCompanyModal()

    const labels = wrapper.findAll('form label').map((l) => l.text().replace(/\s+/g, ' ').trim())
    expect(labels).toEqual(['Company name *', 'Quota *', 'Country *'])
    expect(wrapper.find('[data-field="agent_name"], [data-field="agent_phone"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('input[type="tel"], input[type="email"]').exists()).toBe(false)
  })

  it('sends name, quota and country_code', async () => {
    await openCompanyModal()
    await quota().setValue('25')

    await submit()

    expect(save).toHaveBeenCalledWith({
      name: 'ABC Sdn Bhd',
      phone: null,
      country_code: 'MY',
      quota: 25,
      type: null,
    })
    expect(wrapper.emitted('saved')).toEqual([[{ id: 9, name: 'ABC Sdn Bhd' }]])
    expect(isOpen()).toBe(false)
  })

  it.each([
    ['', 'Enter the quota.'],
    ['0', 'The quota must be at least 1.'],
    ['2.5', 'The quota must be a whole number.'],
  ])('checks the quota %j: %s', async (value, message) => {
    await openCompanyModal()
    await quota().setValue(value)

    await submit()

    expect(save).not.toHaveBeenCalled()
    expect(wrapper.get('[data-field="quota"]').text()).toContain(message)
    expect(quota().attributes('aria-invalid')).toBe('true')
  })

  it('requires the company name', async () => {
    await openCompanyModal({ initialName: '' })
    await quota().setValue('5')

    await submit()

    expect(save).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter the company name.')
  })

  it('maps API 422 errors to the name and quota fields', async () => {
    await openCompanyModal()
    await quota().setValue('5')
    save.mockRejectedValueOnce(
      httpError(422, {
        message: 'Invalid.',
        errors: {
          name: ['A company with this name already exists.'],
          quota: ['The quota must be at least 1.'],
        },
      }),
    )

    await submit()

    expect(wrapper.text()).toContain('A company with this name already exists.')
    expect(wrapper.get('[data-field="quota"]').text()).toContain('The quota must be at least 1.')
    expect(isOpen()).toBe(true)
  })

  it('lets the user choose another country', async () => {
    await openCompanyModal()
    await quota().setValue('3')
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
    await quota().setValue('3')
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
