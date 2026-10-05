import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportFormView from '../PassportFormView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createPassport, getPassport, updatePassport } from '@/api/passports'
import { todayApiDate } from '@/lib/dates'
import { httpError } from '@/test/helpers'
import type { PassportEntry, ReferenceSummary } from '@/types/passport'

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

const PERSON: ReferenceSummary = { id: 7, type: 'person', type_label: 'Person', name: 'Karim' }
const AGENCY: ReferenceSummary = {
  id: 8,
  type: 'agency',
  type_label: 'Agency',
  name: 'Star Agency',
}
const COMPANY = { id: 3, name: 'Gulf Builders' }

function makeEntry(overrides: Partial<PassportEntry> = {}): PassportEntry {
  return {
    id: 42,
    passport_name: 'MD RAHIM',
    passport_number: 'AB1234567',
    passport_received_date: '2026-09-30',
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

const nameInput = () => wrapper.get<HTMLInputElement>('input[autocapitalize]:not(.font-mono)')
const numberInput = () => wrapper.get<HTMLInputElement>('input.font-mono')
const dateInput = () => wrapper.get<HTMLInputElement>('input[type="date"]')
const selects = () => wrapper.findAllComponents(SearchSelect)
/** SearchSelect is generic, so test-utils cannot type its props; read them untyped. */
const selectProp = (index: number, name: string) =>
  (selects()[index]!.props() as Record<string, unknown>)[name]
const errorFor = (input: { attributes: (name: string) => string | undefined }) => {
  const ids = (input.attributes('aria-describedby') ?? '').split(' ')
  const errorId = ids.find((id) => id.endsWith('-error'))
  return errorId ? wrapper.find(`[id="${errorId}"]`).text() : undefined
}

async function fillValidForm() {
  await nameInput().setValue('md rahim')
  await numberInput().setValue('ab 123 4567')
  selects()[0]!.vm.$emit('update:modelValue', PERSON)
  selects()[1]!.vm.$emit('update:modelValue', COMPANY)
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('PassportFormView', () => {
  it('focuses the passport name and defaults the date to today', async () => {
    await mountForm()

    expect(document.activeElement).toBe(nameInput().element)
    expect(dateInput().element.value).toBe(todayApiDate())
    expect(dateInput().attributes('max')).toBe(todayApiDate())
  })

  it('uppercases the name and strips spaces from the number as you type', async () => {
    await mountForm()

    await nameInput().setValue('md rahim')
    await numberInput().setValue('ab 12 345 67')

    expect(nameInput().element.value).toBe('MD RAHIM')
    expect(numberInput().element.value).toBe('AB1234567')
  })

  it('shows client-side errors and does not call the API', async () => {
    await mountForm()
    await numberInput().setValue('ab-12')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createPassport).not.toHaveBeenCalled()
    expect(errorFor(nameInput())).toBe('Enter the passport name.')
    expect(errorFor(numberInput())).toBe('The passport number must be 6 to 20 letters and digits.')
    expect(selectProp(0, 'error')).toBe('Select a reference.')
    expect(selectProp(1, 'error')).toBe('Select a company.')
    expect(nameInput().attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(nameInput().element)
  })

  it('sends normalized values and goes to the list on Save', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
    await fillValidForm()
    await nameInput().setValue('  md   rahim ')

    await wrapper.get('button[data-action="save"]').trigger('click')
    await flushPromises()

    expect(createPassport).toHaveBeenCalledWith({
      passport_name: 'MD RAHIM',
      passport_number: 'AB1234567',
      reference_id: PERSON.id,
      company_id: COMPANY.id,
      passport_received_date: todayApiDate(),
    })
    expect(router.currentRoute.value.name).toBe('passports')
  })

  it('"Save and add another" clears the form but keeps the date and reference type', async () => {
    vi.mocked(createPassport).mockResolvedValue(makeEntry())
    await mountForm()
    // Choose "Agency", an agency reference and an earlier date.
    await wrapper.findAll('button[aria-pressed]')[1]!.trigger('click')
    await fillValidForm()
    selects()[0]!.vm.$emit('update:modelValue', AGENCY)
    await dateInput().setValue('2026-09-01')

    await wrapper.get('button[data-action="another"]').trigger('click')
    await flushPromises()

    expect(createPassport).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('passport-new')
    expect(nameInput().element.value).toBe('')
    expect(numberInput().element.value).toBe('')
    expect(selectProp(0, 'modelValue')).toBeNull()
    expect(selectProp(1, 'modelValue')).toBeNull()
    expect(dateInput().element.value).toBe('2026-09-01')
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Agency')
    expect(document.activeElement).toBe(nameInput().element)
  })

  it('switching the reference type clears the selected reference', async () => {
    await mountForm()
    selects()[0]!.vm.$emit('update:modelValue', PERSON)
    await flushPromises()

    await wrapper.findAll('button[aria-pressed]')[1]!.trigger('click')

    expect(selectProp(0, 'modelValue')).toBeNull()
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

    expect(errorFor(numberInput())).toBe('This passport number is already entered.')
    expect(document.activeElement).toBe(numberInput().element)
    expect(numberInput().element.value).toBe('AB1234567')
  })

  it('keeps the typed data and shows a banner on a network error', async () => {
    const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true })
    vi.mocked(createPassport).mockRejectedValue(networkError)
    await mountForm()
    await fillValidForm()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server')
    expect(nameInput().element.value).toBe('MD RAHIM')
  })

  describe('edit mode', () => {
    it('prefills the entry, including the reference type, and saves with PATCH', async () => {
      vi.mocked(getPassport).mockResolvedValue(makeEntry())
      vi.mocked(updatePassport).mockResolvedValue(makeEntry())
      await mountForm('/data-entry/passports/42/edit')

      expect(getPassport).toHaveBeenCalledWith(42)
      expect(nameInput().element.value).toBe('MD RAHIM')
      expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Agency')
      expect(selectProp(0, 'modelValue')).toEqual(AGENCY)
      expect(selectProp(1, 'modelValue')).toEqual(COMPANY)
      expect(dateInput().element.value).toBe('2026-09-30')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updatePassport).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ passport_number: 'AB1234567', reference_id: AGENCY.id }),
      )
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
