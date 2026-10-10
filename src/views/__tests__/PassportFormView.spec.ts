import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportFormView from '../PassportFormView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createPassport, getPassport, updatePassport } from '@/api/passports'
import { fetchDefaults } from '@/api/countries'
import { addDays, todayApiDate } from '@/lib/dates'
import { httpError, makePassport } from '@/test/helpers'
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
vi.mock('@/api/workflow', () => ({ fetchWorkflowSummary: vi.fn(async () => null) }))
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
  return makePassport({
    country: null,
    reference: AGENCY,
    company: COMPANY,
    can: { update: true, delete: false, record_medical: true },
    ...overrides,
  })
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
  await field('Passport date of birth').setValue('1990-05-17')
  await field('Passport expiry date').setValue('2031-10-04')
  select(`Reference ${reference.type}`).choose(reference)
  select('Company name').choose(COMPANY)
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  // Not Malaysia, to prove nothing is hardcoded.
  defaults = { default_company_country_code: 'BD', default_passport_country_code: 'NP' }
  // Some tests make the settings request slow or fail; start every test from a normal one.
  vi.mocked(fetchDefaults).mockImplementation(async () => defaults)
})
afterEach(() => wrapper.unmount())

describe('PassportFormView', () => {
  it('focuses the passport name and sets sensible date limits', async () => {
    await mountForm()

    expect(document.activeElement).toBe(field('Passport name').element)
    expect(field('Passport received date').element.value).toBe(TODAY)
    expect(field('Passport received date').attributes('max')).toBe(TODAY)
    expect(field('Passport date of birth').attributes('max')).toBe(addDays(TODAY, -1))
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
    // The country is preselected; clear it to see its required error too.
    select('Country').choose(null)
    await flushPromises()
    await field('Passport number').setValue('ab-12')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createPassport).not.toHaveBeenCalled()
    expect(errorFor(field('Passport name'))).toBe('Enter the passport name.')
    expect(errorFor(field('Passport number'))).toBe(
      'The passport number must be 6 to 20 letters and digits.',
    )
    expect(errorFor(field('Passport date of birth'))).toBe('Enter the date of birth.')
    expect(errorFor(field('Passport expiry date'))).toBe('Enter the passport expiry date.')
    expect(select('Reference person').error()).toBe('Reference is required.')
    expect(select('Company name').error()).toBe('Select a company.')
    expect(select('Country').error()).toBe('Select the passport country.')
    expect(document.activeElement).toBe(field('Passport name').element)
  })

  it('sends normalized values and goes to the list on Save', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
    await fillValidForm()
    await field('Passport name').setValue('  md   rahim ')
    select('Country').choose({ code: 'NP', name: 'Nepal' })
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
    expect(field('Passport date of birth').element.value).toBe('')
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

  describe('layout (field order and required markers)', () => {
    /** Each field's label, in DOM order (= Tab order = visual reading order). */
    function fieldLabels(): string[] {
      return wrapper
        .get('[data-fields]')
        .findAll(':scope > *')
        .map((el) => (el.find('legend').exists() ? el.get('legend') : el.get('label')).text())
    }

    it('lists the fields in the agreed order', async () => {
      await mountForm()

      expect(fieldLabels().map((t) => t.replace(/\s*\*$|\s*\(optional\)$/, ''))).toEqual([
        'Passport name',
        'Passport number',
        'Passport expiry date',
        'Passport date of birth',
        'Reference',
        'Passport received date',
        'Country',
        'Company name',
      ])
    })

    it('marks every field, Reference included, with a red asterisk', async () => {
      await mountForm()

      const labels = fieldLabels()
      const required = labels.filter((t) => /\*$/.test(t))
      expect(required).toHaveLength(8)
      expect(labels[4]).toMatch(/^Reference\s*\*$/)
      const legendMarker = wrapper.get('[data-field="reference"] legend span[aria-hidden="true"]')
      expect(legendMarker.text()).toBe('*')
      expect(legendMarker.classes()).toContain('text-red-700')
      const markers = wrapper
        .get('[data-fields]')
        .findAll('label span[aria-hidden="true"]')
        .filter((m) => m.text() === '*')
      // 7 field labels plus the reference search's own label ("Reference person *").
      expect(markers).toHaveLength(8)
      expect(markers.every((m) => m.classes().includes('text-red-700'))).toBe(true)
    })

    it('labels the country "Country" (required)', async () => {
      await mountForm()

      const label = wrapper.get('[data-field="country"] label')
      expect(label.text()).toBe('Country *')
      expect(wrapper.text()).not.toContain('Passport country')
    })

    it('keeps the Tab order the same as the visual order', async () => {
      await mountForm()

      const focusable = wrapper
        .get('[data-fields]')
        .findAll('input:not([type="hidden"]), button[aria-pressed]')
        .filter((el) => el.attributes('tabindex') !== '-1')
        .map((el) => el.attributes('id') ?? el.text())
      const order = [
        field('Passport name'),
        field('Passport number'),
        field('Passport expiry date'),
        field('Passport date of birth'),
      ].map((f) => f.attributes('id'))
      expect(focusable.slice(0, 4)).toEqual(order)
      // No positive tabindex anywhere (it would break the natural order).
      expect(
        wrapper.findAll('[tabindex]').every((el) => Number(el.attributes('tabindex')) <= 0),
      ).toBe(true)
    })
  })

  describe('default country (settings, else Malaysia)', () => {
    const MALAYSIA = { code: 'MY', name: 'Malaysia', is_pinned: true }

    it('preselects Malaysia when the setting is MY', async () => {
      defaults.default_passport_country_code = 'MY'
      await mountForm()

      expect(select('Country').value()).toEqual(MALAYSIA)
    })

    it('follows the setting when it is another country (matched by code)', async () => {
      defaults.default_passport_country_code = 'NP'
      await mountForm()

      expect(select('Country').value()).toEqual(COUNTRIES[2])
    })

    it.each([
      ['missing', null],
      ['empty', ''],
      ['inactive', 'ZZ'],
    ])('falls back to Malaysia when the setting is %s', async (_case, code) => {
      defaults.default_passport_country_code = code
      await mountForm()

      expect(select('Country').value()).toEqual(MALAYSIA)
    })

    it('falls back to Malaysia when the settings request fails', async () => {
      vi.mocked(fetchDefaults).mockRejectedValue(new Error('Network Error'))
      await mountForm()

      expect(select('Country').value()).toEqual(MALAYSIA)
      // The country list still loaded, so the user can pick another one.
      select('Country').choose(COUNTRIES[0])
      await flushPromises()
      expect(select('Country').value()).toEqual(COUNTRIES[0])
    })

    it('waits for both the list and the settings, with a disabled loading state', async () => {
      // Every settings request (the store's first load and the form's refresh) waits.
      const pending: ((value: AppDefaults) => void)[] = []
      const resolveDefaults = (value: AppDefaults) => pending.forEach((resolve) => resolve(value))
      vi.mocked(fetchDefaults).mockImplementation(
        () => new Promise((resolve) => pending.push(resolve)),
      )
      await mountForm()

      const countryProps = () =>
        wrapper
          .findAllComponents(SearchSelect)
          .find((c) => (c.props() as Record<string, unknown>).label === 'Country')!
          .props() as Record<string, unknown>
      expect(countryProps().disabled).toBe(true)
      expect(countryProps().placeholder).toBe('Loading countries…')
      expect(countryProps().modelValue).toBeNull()

      resolveDefaults({ default_company_country_code: 'BD', default_passport_country_code: 'NP' })
      await flushPromises()

      expect(countryProps().disabled).toBe(false)
      expect(countryProps().modelValue).toEqual(COUNTRIES[2])
    })

    it('never overwrites a country the user picked before the settings arrived', async () => {
      // Every settings request (the store's first load and the form's refresh) waits.
      const pending: ((value: AppDefaults) => void)[] = []
      const resolveDefaults = (value: AppDefaults) => pending.forEach((resolve) => resolve(value))
      vi.mocked(fetchDefaults).mockImplementation(
        () => new Promise((resolve) => pending.push(resolve)),
      )
      await mountForm()

      select('Country').choose(COUNTRIES[0]) // Bangladesh
      await flushPromises()
      resolveDefaults({ default_company_country_code: 'BD', default_passport_country_code: 'MY' })
      await flushPromises()

      expect(select('Country').value()).toEqual(COUNTRIES[0])
    })

    it('can be changed by the user and is sent as chosen', async () => {
      vi.mocked(createPassport).mockResolvedValue(makeEntry())
      defaults.default_passport_country_code = 'MY'
      await mountForm()
      await fillValidForm()
      select('Country').choose(COUNTRIES[0])
      await flushPromises()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(createPassport).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'BD' }))
    })

    it('is preselected again after "Save and add another"', async () => {
      vi.mocked(createPassport).mockResolvedValue(makeEntry())
      defaults.default_passport_country_code = 'MY'
      await mountForm()
      await fillValidForm()
      select('Country').choose(COUNTRIES[2]) // the user picks Nepal for this one
      await flushPromises()

      await wrapper.get('button[data-action="another"]').trigger('click')
      await flushPromises()

      expect(createPassport).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'NP' }))
      expect(select('Country').value()).toEqual(MALAYSIA)
    })

    it('editing shows the saved country and never the default', async () => {
      defaults.default_passport_country_code = 'MY'
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      await mountForm('/data-entry/passports/42/edit')
      await flushPromises()

      expect(select('Country').value()).toEqual({ code: 'BD', name: 'Bangladesh' })
    })

    it('editing an entry without a country leaves it empty (no default)', async () => {
      defaults.default_passport_country_code = 'MY'
      vi.mocked(getPassport).mockResolvedValue(makeEntry({ country: null }))
      await mountForm('/data-entry/passports/42/edit')
      await flushPromises()

      expect(select('Country').value()).toBeNull()
    })
  })

  describe('reference (required)', () => {
    it('shows "Reference is required" on an empty reference and does not save', async () => {
      await mountForm()
      await fillValidForm()
      select('Reference person').choose(null)
      await flushPromises()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(createPassport).not.toHaveBeenCalled()
      expect(select('Reference person').error()).toBe('Reference is required.')
      // Shown under the field, in red, and announced with it.
      const input = wrapper.get('[data-field="reference"] input[role="combobox"]')
      expect(input.attributes('aria-required')).toBe('true')
      expect(input.attributes('aria-invalid')).toBe('true')
      expect(wrapper.get('[data-field="reference"]').text()).toContain('Reference is required.')
    })

    it('saves once a reference is chosen (and the error goes away)', async () => {
      vi.mocked(createPassport).mockResolvedValue(makeEntry())
      await mountForm()
      await fillValidForm()
      select('Reference person').choose(null)
      await flushPromises()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(select('Reference person').error()).toBe('Reference is required.')

      select('Reference person').choose(PERSON)
      await flushPromises()
      expect(select('Reference person').error()).toBeUndefined()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()
      expect(createPassport).toHaveBeenCalledWith(
        expect.objectContaining({ reference_id: PERSON.id }),
      )
    })

    it('auto-selects a quick-added reference, clears the error and saves', async () => {
      const added = {
        ...PERSON,
        id: 99,
        name: 'New Agent',
        phone: null,
        notes: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      }
      const { createReference } = await import('@/api/references')
      vi.mocked(createReference).mockResolvedValue(added)
      vi.mocked(createPassport).mockResolvedValue(makeEntry())
      await mountForm()
      await fillValidForm()
      select('Reference person').choose(null)
      await flushPromises()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(select('Reference person').error()).toBe('Reference is required.')

      // "Add new person" from the reference search opens the quick add dialog.
      const referenceSelect = wrapper
        .findAllComponents(SearchSelect)
        .find((c) => (c.props() as Record<string, unknown>).label === 'Reference person')!
      referenceSelect.vm.$emit('add', 'New Agent')
      await flushPromises()
      const dialogForm = wrapper.findAll('form').find((f) => f.text().includes('Person name'))!
      await dialogForm.trigger('submit')
      await flushPromises()

      expect(createReference).toHaveBeenCalledWith({
        type: 'person',
        name: 'New Agent',
        phone: null,
      })
      expect(select('Reference person').value()).toEqual(added)
      expect(select('Reference person').error()).toBeUndefined()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()
      expect(createPassport).toHaveBeenCalledWith(expect.objectContaining({ reference_id: 99 }))
    })
  })

  describe('company quick add', () => {
    it('preselects the company country from the default company country setting', async () => {
      await mountForm()

      const companySelect = wrapper
        .findAllComponents(SearchSelect)
        .find((c) => (c.props() as Record<string, unknown>).label === 'Company name')!
      companySelect.vm.$emit('add', 'New Co')
      await flushPromises()

      // The modal's own country select (inside the "Add new company" dialog).
      // The form's own Country select comes first; the dialog's is the last one.
      const countrySelects = wrapper
        .findAllComponents(SearchSelect)
        .filter((c) => (c.props() as Record<string, unknown>).label === 'Country')
      expect(countrySelects).toHaveLength(2)
      const modalCountry = countrySelects[countrySelects.length - 1]!
      expect((modalCountry.props() as Record<string, unknown>).modelValue).toEqual(COUNTRIES[0])
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
      expect(field('Passport date of birth').element.value).toBe('1990-05-17')
      expect(field('Passport expiry date').element.value).toBe('2031-09-29')
      expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Agency')
      expect(select('Reference agency').value()).toEqual(AGENCY)
      expect(select('Company name').value()).toEqual(COMPANY)
      expect(select('Country').value()).toEqual({ code: 'BD', name: 'Bangladesh' })

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

      const countryInput = field('Country')
      expect(countryInput.element.value).toBe('Kosovo')

      await countryInput.trigger('click')
      await flushPromises()
      const options = wrapper.findAll('[role="option"]').map((o) => o.text())
      expect(options).toContain('Kosovo')
      expect(options).toContain('Bangladesh')
    })

    it('shows "You can only edit entries you created" on 403', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      vi.mocked(updatePassport).mockRejectedValue(httpError(403, { message: 'Forbidden.' }))
      await mountForm('/data-entry/passports/42/edit')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toBe('You can only edit entries you created.')
    })
  })
})
