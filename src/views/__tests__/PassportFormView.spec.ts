import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportFormView from '../PassportFormView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createPassport, getPassport, updatePassport } from '@/api/passports'
import { createCompany } from '@/api/companies'
import { fetchDefaults } from '@/api/countries'
import { addDays, addMonthsNoOverflow, todayApiDate } from '@/lib/dates'
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
    // Saved entries have a scan (required on create); edits may leave it as it is.
    has_scan: true,
    scan_original_name: 'passport.jpg',
    scan_mime: 'image/jpeg',
    scan_size: 200_000,
    scan_uploaded_at: '2026-10-01T08:00:00Z',
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

const SCAN = new File(['\xFF\xD8\xFF'], 'scan.jpg', { type: 'image/jpeg' })

/** Picks `file` in the "Passport scan copy" field (as the browser file dialog would). */
async function chooseScan(file: File) {
  const input = wrapper.get<HTMLInputElement>('input[data-scan-file]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

async function fillValidForm(reference: ReferenceSummary = PERSON) {
  await field('Passport name').setValue('md rahim')
  await field('Passport number').setValue('ab 123 4567')
  await field('Date of birth').setValue('1990-05-17')
  await field('Passport expiry date').setValue('2031-10-04')
  select('Reference').choose(reference)
  select('Company name').choose(COMPANY)
  await flushPromises()
  if (
    wrapper.find('input[data-scan-file]').exists() &&
    !wrapper.find('[data-scan-current]').exists()
  )
    await chooseScan(SCAN)
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no object URLs (the scan thumbnail uses one).
  URL.createObjectURL = vi.fn(() => 'blob:thumb') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
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
    // At least 18 years old.
    expect(field('Date of birth').attributes('max')).toBe(addDays(TODAY, -(18 * 365 + 4)))
    // Valid for at least 18 months after the received date.
    expect(field('Passport expiry date').attributes('min')).toBe(addMonthsNoOverflow(TODAY, 18))
    expect(wrapper.text()).toContain('valid 18+ months after the received date')
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
    expect(errorFor(field('Date of birth'))).toBe('Enter the date of birth.')
    expect(errorFor(field('Passport expiry date'))).toBe('Enter the passport expiry date.')
    expect(select('Reference').error()).toBe('Reference is required.')
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

    expect(createPassport).toHaveBeenCalledWith(
      {
        passport_name: 'MD RAHIM',
        passport_number: 'AB1234567',
        country_code: 'NP',
        date_of_birth: '1990-05-17',
        reference_id: PERSON.id,
        company_id: COMPANY.id,
        passport_received_date: TODAY,
        passport_expiry_date: '2031-10-04',
      },
      SCAN,
      expect.any(Function),
    )
    expect(router.currentRoute.value.name).toBe('passports')
  })

  it('"Save and add another" clears the form but keeps the received date', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
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
    expect(select('Reference').value()).toBeNull()
    expect(select('Company name').value()).toBeNull()
    expect(field('Passport received date').element.value).toBe('2026-09-01')
    expect(document.activeElement).toBe(field('Passport name').element)
  })

  it('has one reference search (no person/agency toggle) that searches every reference', async () => {
    const { searchReferences } = await import('@/api/references')
    await mountForm()

    expect(wrapper.get('[data-fields]').find('button[aria-pressed]').exists()).toBe(false)
    const referenceSelect = wrapper
      .findAllComponents(SearchSelect)
      .find((c) => (c.props() as Record<string, unknown>).label === 'Reference')!
    await (referenceSelect.props() as { fetch: (q: string) => Promise<unknown> }).fetch('ka')
    expect(searchReferences).toHaveBeenCalledWith({ q: 'ka' })
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
        'Date of birth',
        'Reference',
        'Passport received date',
        'Country',
        'Company name',
        'Passport scan copy',
      ])
    })

    it('marks every field, Reference included, with a red asterisk', async () => {
      await mountForm()

      const labels = fieldLabels()
      const required = labels.filter((t) => /\*$/.test(t))
      expect(required).toHaveLength(9) // every field, the scan copy included
      expect(labels[4]).toMatch(/^Reference\s*\*$/)
      const markers = wrapper
        .get('[data-fields]')
        .findAll('label span[aria-hidden="true"]')
        .filter((m) => m.text() === '*')
      expect(markers).toHaveLength(9)
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
        .findAll('input:not([type="hidden"])')
        .filter((el) => el.attributes('tabindex') !== '-1')
        .map((el) => el.attributes('id') ?? el.text())
      const order = [
        field('Passport name'),
        field('Passport number'),
        field('Passport expiry date'),
        field('Date of birth'),
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

      expect(createPassport).toHaveBeenCalledWith(
        expect.objectContaining({ country_code: 'BD' }),
        SCAN,
        expect.any(Function),
      )
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

      expect(createPassport).toHaveBeenCalledWith(
        expect.objectContaining({ country_code: 'NP' }),
        SCAN,
        expect.any(Function),
      )
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
      select('Reference').choose(null)
      await flushPromises()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(createPassport).not.toHaveBeenCalled()
      expect(select('Reference').error()).toBe('Reference is required.')
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
      select('Reference').choose(null)
      await flushPromises()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(select('Reference').error()).toBe('Reference is required.')

      select('Reference').choose(PERSON)
      await flushPromises()
      expect(select('Reference').error()).toBeUndefined()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()
      expect(createPassport).toHaveBeenCalledWith(
        expect.objectContaining({ reference_id: PERSON.id }),
        SCAN,
        expect.any(Function),
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
      select('Reference').choose(null)
      await flushPromises()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(select('Reference').error()).toBe('Reference is required.')

      // "Add new reference" from the reference search opens the quick add dialog.
      const referenceSelect = wrapper
        .findAllComponents(SearchSelect)
        .find((c) => (c.props() as Record<string, unknown>).label === 'Reference')!
      referenceSelect.vm.$emit('add', 'New Agent')
      await flushPromises()
      const dialogForm = wrapper.findAll('form').find((f) => f.text().includes('Reference name'))!
      // The dialog asks whether the reference is a person or an agency (Person by default).
      const typeButtons = dialogForm.findAll('button[aria-pressed]')
      expect(typeButtons.map((b) => b.text())).toEqual(['Person', 'Agency'])
      expect(typeButtons[0]!.attributes('aria-pressed')).toBe('true')
      await typeButtons[1]!.trigger('click')
      await dialogForm.trigger('submit')
      await flushPromises()

      expect(createReference).toHaveBeenCalledWith({
        type: 'agency',
        name: 'New Agent',
        phone: null,
      })
      expect(select('Reference').value()).toEqual(added)
      expect(select('Reference').error()).toBeUndefined()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()
      expect(createPassport).toHaveBeenCalledWith(
        expect.objectContaining({ reference_id: 99 }),
        SCAN,
        expect.any(Function),
      )
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

    it('saves name, quota and country, then selects the new company and clears its error', async () => {
      const added = {
        ...COMPANY,
        id: 99,
        name: 'New Co',
        country: { code: 'BD', name: 'Bangladesh' },
      }
      vi.mocked(createCompany).mockResolvedValue(added as never)
      await mountForm()
      // Submitting first shows "Select a company."
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(select('Company name').error()).toBe('Select a company.')

      const companySelect = wrapper
        .findAllComponents(SearchSelect)
        .find((c) => (c.props() as Record<string, unknown>).label === 'Company name')!
      companySelect.vm.$emit('add', 'New Co')
      await flushPromises()
      const dialog = wrapper.get('[data-field="quota"]').element.closest('form')!
      await wrapper.get('[data-field="quota"] input').setValue('12')
      dialog.dispatchEvent(new Event('submit'))
      await flushPromises()

      expect(createCompany).toHaveBeenCalledWith({ name: 'New Co', quota: 12, country_code: 'BD' })
      expect(select('Company name').value()).toEqual(added)
      expect(select('Company name').error()).toBeUndefined()
    })
  })

  describe('passport scan copy', () => {
    const scanError = () => wrapper.find('[data-field="scan"] [data-scan-error]')

    it('is the last field and required on create', async () => {
      await mountForm()
      await field('Passport name').setValue('md rahim')
      await field('Passport number').setValue('ab1234567')
      await field('Date of birth').setValue('1990-05-17')
      await field('Passport expiry date').setValue('2031-10-04')
      select('Reference').choose(PERSON)
      select('Company name').choose(COMPANY)
      await flushPromises()

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(createPassport).not.toHaveBeenCalled()
      expect(scanError().text()).toBe('Please upload the passport scan copy.')
      const fields = wrapper.get('[data-fields]').findAll(':scope > *')
      expect(fields[fields.length - 1]!.attributes('data-field')).toBe('scan')
    })

    it('shows the chosen file name, size, an image thumbnail and Remove', async () => {
      await mountForm()
      await chooseScan(new File([new Uint8Array(2048)], 'passport.png', { type: 'image/png' }))

      const chosen = wrapper.get('[data-scan-chosen]')
      expect(chosen.get('[data-scan-name]').text()).toBe('passport.png')
      expect(chosen.get('[data-scan-size]').text()).toBe('2 KB')
      expect(chosen.get('img[data-scan-thumbnail]').attributes('src')).toBe('blob:thumb')

      await chosen.get('button[data-scan-remove]').trigger('click')
      expect(wrapper.find('[data-scan-chosen]').exists()).toBe(false)
    })

    it.each([
      [
        'a file over 5 MB',
        new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' }),
        'The scan may not be larger than 5 MB.',
      ],
      [
        'a GIF',
        new File(['GIF89a'], 'scan.gif', { type: 'image/gif' }),
        'The scan must be a JPG, PNG or PDF file.',
      ],
      [
        'an .exe',
        new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }),
        'The scan must be a JPG, PNG or PDF file.',
      ],
    ])('rejects %s before uploading', async (_name, file, message) => {
      await mountForm()
      await chooseScan(file)

      expect(scanError().text()).toBe(message)
      expect(wrapper.find('[data-scan-chosen]').exists()).toBe(false)
    })

    it("shows the server's 422 message for the scan (e.g. a renamed file)", async () => {
      vi.mocked(createPassport).mockRejectedValue(
        httpError(422, {
          message: 'The scan must be a JPG, PNG or PDF file.',
          errors: { scan: ['The scan must be a JPG, PNG or PDF file.'] },
        }),
      )
      await mountForm()
      await fillValidForm()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(scanError().text()).toBe('The scan must be a JPG, PNG or PDF file.')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('explains a 413 (the web server refused the file size) under the scan field', async () => {
      vi.mocked(createPassport).mockRejectedValue(httpError(413))
      await mountForm()
      await fillValidForm()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(scanError().text()).toContain('The server refused the file because it is too large.')
    })

    it('shows upload progress and disables the submit buttons while uploading', async () => {
      let finish: (value: PassportEntry) => void = () => {}
      vi.mocked(createPassport).mockImplementation((_payload, _file, onProgress) => {
        onProgress?.(40)
        return new Promise((resolve) => (finish = resolve))
      })
      await mountForm()
      await fillValidForm()

      await wrapper.get('button[data-action="save"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-scan-progress]').attributes('aria-valuenow')).toBe('40')
      expect(
        wrapper
          .findAll('button[data-action="save"], button[data-action="another"]')
          .every((b) => b.attributes('disabled') !== undefined),
      ).toBe(true)

      finish(makeEntry())
      await flushPromises()
      expect(wrapper.find('[data-scan-progress]').exists()).toBe(false)
    })

    it('edit: shows the current file with Replace; optional, and sends JSON PATCH without a file', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      vi.mocked(updatePassport).mockResolvedValue(makeEntry())
      await mountForm('/data-entry/passports/42/edit')

      const current = wrapper.get('[data-scan-current]')
      expect(current.text()).toContain('passport.jpg')
      expect(current.find('button[data-scan-replace]').exists()).toBe(true)
      expect(wrapper.get('[data-field="scan"] label').text()).toContain('(optional)')

      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(updatePassport).toHaveBeenCalledWith(
        42,
        expect.any(Object),
        null,
        expect.any(Function),
      )
    })

    it('edit: a chosen file is sent with the update (POST + _method=PATCH in the API layer)', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      vi.mocked(updatePassport).mockResolvedValue(makeEntry())
      await mountForm('/data-entry/passports/42/edit')

      const pdf = new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' })
      await chooseScan(pdf)
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updatePassport).toHaveBeenCalledWith(42, expect.any(Object), pdf, expect.any(Function))
    })

    it('edit: the scan is required while the passport has none', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({
          country: { code: 'BD', name: 'Bangladesh' },
          has_scan: false,
          scan_original_name: null,
        }),
      )
      await mountForm('/data-entry/passports/42/edit')

      expect(wrapper.find('[data-scan-current]').exists()).toBe(false)
      expect(wrapper.get('[data-field="scan"] label').text()).toContain('*')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updatePassport).not.toHaveBeenCalled()
      expect(scanError().text()).toBe('Please upload the passport scan copy.')
    })
  })

  describe('edit mode', () => {
    it('prefills the entry, including the reference, and saves with PATCH', async () => {
      vi.mocked(getPassport).mockResolvedValue(
        makeEntry({ country: { code: 'BD', name: 'Bangladesh' } }),
      )
      vi.mocked(updatePassport).mockResolvedValue(makeEntry())
      await mountForm('/data-entry/passports/42/edit')

      expect(getPassport).toHaveBeenCalledWith(42)
      expect(field('Passport name').element.value).toBe('MD RAHIM')
      expect(field('Date of birth').element.value).toBe('1990-05-17')
      expect(field('Passport expiry date').element.value).toBe('2031-09-29')
      expect(select('Reference').value()).toEqual(AGENCY)
      expect(select('Company name').value()).toEqual(COMPANY)
      expect(select('Country').value()).toEqual({ code: 'BD', name: 'Bangladesh' })

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      // No new file: a normal JSON PATCH (no scan argument).
      expect(updatePassport).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ country_code: 'BD', reference_id: AGENCY.id }),
        null,
        expect.any(Function),
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
