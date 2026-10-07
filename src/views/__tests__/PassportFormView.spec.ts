import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportFormView from '../PassportFormView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createPassport, getPassport, updatePassport } from '@/api/passports'
import { addDays, todayApiDate } from '@/lib/dates'
import { httpError } from '@/test/helpers'
import type { AppDefaults, CountryOption } from '@/types/country'
import type { CompanySummary, PassportEntry, ReferenceSummary } from '@/types/passport'

vi.mock('@/api/passports', () => ({
  createPassport: vi.fn(),
  getPassport: vi.fn(),
  updatePassport: vi.fn(),
}))
vi.mock('@/api/references', () => ({
  searchReferences: vi.fn(async () => []),
  createReference: vi.fn(),
}))
vi.mock('@/api/companies', () => ({
  searchCompanies: vi.fn(async () => []),
  createCompany: vi.fn(),
}))

const COUNTRIES: CountryOption[] = [
  { code: 'BD', name: 'Bangladesh', is_pinned: true },
  { code: 'MY', name: 'Malaysia', is_pinned: true },
  { code: 'NP', name: 'Nepal', is_pinned: false },
]
let defaults: AppDefaults
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => COUNTRIES),
  fetchDefaults: vi.fn(async () => defaults),
}))

const PERSON: ReferenceSummary = { id: 7, type: 'person', type_label: 'Person', name: 'Karim' }
const AGENCY: ReferenceSummary = { id: 8, type: 'agency', type_label: 'Agency', name: 'Star' }
const COMPANY: CompanySummary = {
  id: 3,
  name: 'Gulf Builders',
  country: { code: 'MY', name: 'Malaysia' },
}
const TODAY = todayApiDate()

function makeEntry(overrides: Partial<PassportEntry> = {}): PassportEntry {
  return {
    id: 42,
    passport_name: 'MD RAHIM',
    passport_number: 'AB1234567',
    country: null,
    date_of_birth: '1990-05-17',
    passport_received_date: '2026-09-30',
    passport_expiry_date: '2031-09-29',
    reference: AGENCY,
    company: COMPANY,
    created_by: 5,
    updated_by: 5,
    created_at: '',
    updated_at: '',
    can: { update: true, delete: false },
    ...overrides,
  }
}

let wrapper: VueWrapper
let router: Router

async function mountForm(path = '/data-entry/passports/new') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-entry/passports', name: 'passports', component: { template: '<p>list</p>' } },
      { path: '/data-entry/passports/new', name: 'passport-new', component: PassportFormView },
      {
        path: '/data-entry/passports/:id(\\d+)/edit',
        name: 'passport-edit',
        component: PassportFormView,
      },
    ],
  })
  await router.push(path)
  wrapper = mount(PassportFormView, {
    global: { plugins: [createPinia(), router] },
    attachTo: document.body,
  })
  await flushPromises()
}

/** What `wrapper.get` returns for an input. */
type Field = Omit<DOMWrapper<HTMLInputElement>, 'exists'>

/** The input labelled `text` (labels may end with " *"). */
function field(text: string): Field {
  const label = wrapper.findAll('label').find((l) => l.text().replace(/\s*\*$/, '') === text)
  if (!label) throw new Error(`No label "${text}"`)
  return wrapper.get<HTMLInputElement>(`[id="${label.attributes('for')}"]`)
}

/** The SearchSelect whose label is `text`. */
function select(text: string) {
  const found = wrapper
    .findAllComponents(SearchSelect)
    .find((s) => (s.props() as Record<string, unknown>).label === text)
  if (!found) throw new Error(`No select "${text}"`)
  return {
    choose: (value: unknown) => found.vm.$emit('update:modelValue', value),
    value: () => (found.props() as Record<string, unknown>).modelValue,
    error: () => (found.props() as Record<string, unknown>).error,
  }
}

const errorFor = (input: Field) => {
  const ids = (input.attributes('aria-describedby') ?? '').split(' ')
  const errorId = ids.find((id) => id.endsWith('-error'))
  return errorId ? wrapper.find(`[id="${errorId}"]`).text() : undefined
}

async function fillValidForm(reference: ReferenceSummary = PERSON) {
  await field('Passport name').setValue('md rahim')
  await field('Passport number').setValue('ab 123 4567')
  await field('Date of birth').setValue('1990-05-17')
  await field('Passport expiry date').setValue('2031-10-04')
  select(`Reference ${reference.type}`).choose(reference)
  select('Company name').choose(COMPANY)
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  defaults = { default_company_country_code: 'MY', default_passport_country_code: null }
})
afterEach(() => wrapper.unmount())

describe('PassportFormView', () => {
  it('focuses the passport name and sets sensible date limits', async () => {
    await mountForm()

    expect(document.activeElement).toBe(field('Passport name').element)
    expect(field('Passport received date').element.value).toBe(TODAY)
    expect(field('Passport received date').attributes('max')).toBe(TODAY)
    expect(field('Date of birth').attributes('max')).toBe(addDays(TODAY, -1))
    expect(field('Passport expiry date').attributes('min')).toBe(addDays(TODAY, 1))
  })

  it('uppercases the name and strips spaces from the number as you type', async () => {
    await mountForm()

    await field('Passport name').setValue('md rahim')
    await field('Passport number').setValue('ab 12 345 67')

    expect(field('Passport name').element.value).toBe('MD RAHIM')
    expect(field('Passport number').element.value).toBe('AB1234567')
  })

  it('shows client-side errors and does not call the API', async () => {
    await mountForm()
    await field('Passport number').setValue('ab-12')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createPassport).not.toHaveBeenCalled()
    expect(errorFor(field('Passport name'))).toBe('Enter the passport name.')
    expect(errorFor(field('Passport number'))).toBe(
      'The passport number must be 6 to 20 letters and digits.',
    )
    expect(errorFor(field('Date of birth'))).toBe('Enter the date of birth.')
    expect(errorFor(field('Passport expiry date'))).toBe('Enter the passport expiry date.')
    expect(select('Reference person').error()).toBe('Select a reference.')
    expect(select('Company name').error()).toBe('Select a company.')
    expect(select('Passport country').error()).toBeUndefined()
    expect(document.activeElement).toBe(field('Passport name').element)
  })

  it('sends normalized values and goes to the list on Save', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
    await fillValidForm()
    await field('Passport name').setValue('  md   rahim ')
    select('Passport country').choose({ code: 'NP', name: 'Nepal' })
    await flushPromises()

    await wrapper.get('button[data-action="save"]').trigger('click')
    await flushPromises()

    expect(createPassport).toHaveBeenCalledWith({
      passport_name: 'MD RAHIM',
      passport_number: 'AB1234567',
      country_code: 'NP',
      date_of_birth: '1990-05-17',
      reference_id: PERSON.id,
      company_id: COMPANY.id,
      passport_received_date: TODAY,
      passport_expiry_date: '2031-10-04',
    })
    expect(router.currentRoute.value.name).toBe('passports')
  })

  it('"Save and add another" clears the form but keeps the received date and reference type', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
    await wrapper.findAll('button[aria-pressed]')[1]!.trigger('click') // Agency
    await fillValidForm(AGENCY)
    await field('Passport received date').setValue('2026-09-01')

    await wrapper.get('button[data-action="another"]').trigger('click')
    await flushPromises()

    expect(createPassport).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('passport-new')
    expect(field('Passport name').element.value).toBe('')
    expect(field('Passport number').element.value).toBe('')
    expect(field('Date of birth').element.value).toBe('')
    expect(field('Passport expiry date').element.value).toBe('')
    expect(select('Reference agency').value()).toBeNull()
    expect(select('Company name').value()).toBeNull()
    expect(field('Passport received date').element.value).toBe('2026-09-01')
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Agency')
    expect(document.activeElement).toBe(field('Passport name').element)
  })

  it('switching the reference type clears the selected reference', async () => {
    await mountForm()
    select('Reference person').choose(PERSON)
    await flushPromises()

    await wrapper.findAll('button[aria-pressed]')[1]!.trigger('click')

    expect(select('Reference agency').value()).toBeNull()
  })

  it('puts the server message for a duplicate passport number under that field', async () => {
    vi.mocked(createPassport).mockRejectedValue(
      httpError(422, {
        message: 'This passport number is already entered.',
        errors: { passport_number: ['This passport number is already entered.'] },
      }),
    )
    await mountForm()
    await fillValidForm()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(errorFor(field('Passport number'))).toBe('This passport number is already entered.')
    expect(document.activeElement).toBe(field('Passport number').element)
  })

  it('keeps the typed data and shows a banner on a network error', async () => {
    const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true })
    vi.mocked(createPassport).mockRejectedValue(networkError)
    await mountForm()
    await fillValidForm()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server')
    expect(field('Passport name').element.value).toBe('MD RAHIM')
  })

  describe('default passport country', () => {
    it('is preselected on a new entry when the setting is set', async () => {
      defaults.default_passport_country_code = 'BD'
      await mountForm()

      expect(select('Passport country').value()).toEqual(COUNTRIES[0])
    })

    it('stays empty on a new entry when the setting is null', async () => {
      await mountForm()

      expect(select('Passport country').value()).toBeNull()
    })

    it('is preselected again after "Save and add another"', async () => {
      defaults.default_passport_country_code = 'BD'
      vi.mocked(createPassport).mockResolvedValue(makeEntry())
      await mountForm()
      await fillValidForm()
      select('Passport country').choose({ code: 'NP', name: 'Nepal' })

      await wrapper.get('button[data-action="another"]').trigger('click')
      await flushPromises()

      expect(select('Passport country').value()).toEqual(COUNTRIES[0])
    })

    it('is never preselected when editing', async () => {
      defaults.default_passport_country_code = 'BD'
      vi.mocked(getPassport).mockResolvedValue(makeEntry({ country: null }))
      await mountForm('/data-entry/passports/42/edit')

      expect(select('Passport country').value()).toBeNull()
    })
  })

  describe('edit mode', () => {
    it('prefills the entry, including the reference type, and saves with PATCH', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      vi.mocked(updatePassport).mockResolvedValue(makeEntry())
      await mountForm('/data-entry/passports/42/edit')

      expect(getPassport).toHaveBeenCalledWith(42)
      expect(field('Passport name').element.value).toBe('MD RAHIM')
      expect(field('Date of birth').element.value).toBe('1990-05-17')
      expect(field('Passport expiry date').element.value).toBe('2031-09-29')
      expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Agency')
      expect(select('Reference agency').value()).toEqual(AGENCY)
      expect(select('Company name').value()).toEqual(COMPANY)
      expect(select('Passport country').value()).toEqual({ code: 'BD', name: 'Bangladesh' })

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updatePassport).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ country_code: 'BD', reference_id: AGENCY.id }),
      )
    })

    it('shows an inactive saved country and keeps it selectable', async () => {
      const inactive = { code: 'XK', name: 'Kosovo' }
      vi.mocked(getPassport).mockResolvedValue(makeEntry({ country: inactive }))
      await mountForm('/data-entry/passports/42/edit')

      const countryInput = field('Passport country')
      expect(countryInput.element.value).toBe('Kosovo')

      await countryInput.trigger('click')
      await flushPromises()
      const options = wrapper.findAll('[role="option"]').map((o) => o.text())
      expect(options).toContain('Kosovo')
      expect(options).toContain('Bangladesh')
    })

    it('shows "You can only edit entries you created" on 403', async () => {
      vi.mocked(getPassport).mockResolvedValue(makeEntry())
      vi.mocked(updatePassport).mockRejectedValue(httpError(403, { message: 'Forbidden.' }))
      await mountForm('/data-entry/passports/42/edit')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toBe('You can only edit entries you created.')
    })
  })
})
