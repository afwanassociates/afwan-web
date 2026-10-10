import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import RecordStepModal from '../RecordStepModal.vue'
import { recordStep } from '@/api/steps'
import { addDays, businessToday } from '@/lib/dates'
import { httpError, makePassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'

vi.mock('@/api/steps', () => ({ recordStep: vi.fn(), updateStepRecord: vi.fn() }))
vi.mock('@/api/passports', () => ({ getPassport: vi.fn(), listPassports: vi.fn() }))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => null),
}))

const TODAY = businessToday()
const saved = { data: {}, passport: {}, warnings: [] }

let wrapper: VueWrapper

async function openFor(stepKey: string, props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports/:id', name: 'passport-detail', component: { template: '<div />' } },
    ],
  })
  wrapper = mount(RecordStepModal, {
    props: {
      open: false,
      passport: makePassport(),
      stepKey,
      'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }),
      ...props,
    },
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  }) as unknown as VueWrapper
  await wrapper.setProps({ open: true })
  await flushPromises()
}

const fieldNames = () => wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
const input = (name: string) => wrapper.get<HTMLInputElement>(`[data-field="${name}"] input`)
const errorOf = (name: string) => wrapper.find(`[data-field="${name}"] p[id$="-error"]`)
const chooseStatus = (value: string) =>
  wrapper.get(`button[data-status="${value}"]`).trigger('click')
const save = async () => {
  await wrapper.get('button[data-action="save"]').trigger('click')
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('RecordStepModal', () => {
  it.each([
    ['calling', ['reference_no', 'step_date', 'valid_until'], ['Applied', 'Approved', 'Rejected']],
    [
      'bmet',
      ['reference_no', 'step_date', 'training_certificate_date', 'finger_date'],
      ['Submitted', 'Cleared', 'Rejected'],
    ],
    [
      'flight',
      ['step_date', 'airline', 'flight_no', 'departure_date', 'ticket_pnr'],
      ['Ticket booked', 'Departed', 'Cancelled'],
    ],
  ])('builds the %s form from the config', async (stepKey, fields, statuses) => {
    await openFor(stepKey)

    expect(fieldNames()).toEqual(fields)
    const buttons = wrapper.findAll('button[data-status]')
    expect(buttons.map((b) => b.text())).toEqual(statuses)
    // No status is chosen by default.
    expect(buttons.every((b) => b.attributes('aria-pressed') === 'false')).toBe(true)
  })

  it('sends the BMET training certificate and finger dates inside details', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('bmet')

    expect(wrapper.get('[data-field="training_certificate_date"] label').text()).toContain(
      'Training certificate date',
    )
    expect(input('finger_date').attributes('type')).toBe('date')

    await chooseStatus('in_process')
    await input('training_certificate_date').setValue('2026-09-20')
    await input('finger_date').setValue('2026-09-22')
    await save()

    expect(recordStep).toHaveBeenCalledWith(
      42,
      'bmet',
      expect.objectContaining({
        details: { training_certificate_date: '2026-09-20', finger_date: '2026-09-22' },
      }),
    )
  })

  it('rejects a future finger date for a submitted BMET', async () => {
    await openFor('bmet')

    await chooseStatus('in_process')
    await input('finger_date').setValue(addDays(TODAY, 3))
    await save()

    expect(recordStep).not.toHaveBeenCalled()
    expect(errorOf('finger_date').exists()).toBe(true)
  })

  it('requires a status', async () => {
    await openFor('calling')

    await save()

    expect(recordStep).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choose a status.')
  })

  it('requires fields by status: the permit number only when approved', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('calling')

    await chooseStatus('completed')
    await save()
    expect(errorOf('reference_no').text()).toBe('Enter the permit / calling number.')
    expect(recordStep).not.toHaveBeenCalled()

    await chooseStatus('in_process')
    await save()
    expect(recordStep).toHaveBeenCalledWith(42, 'calling', {
      status: 'in_process',
      remarks: null,
      reference_no: null,
      step_date: TODAY,
      valid_until: null,
    })
  })

  it('rejects a departed flight with a future departure date', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('flight')
    await input('airline').setValue('Biman')
    await input('flight_no').setValue('BG084')
    await input('departure_date').setValue(addDays(TODAY, 3))

    await chooseStatus('completed')
    await save()
    expect(errorOf('departure_date').text()).toBe(
      'A flight can only be marked departed on or after its departure date.',
    )
    expect(recordStep).not.toHaveBeenCalled()

    // Booking a ticket for a future flight is fine; the flight fields go in `details`.
    await chooseStatus('in_process')
    await save()
    expect(recordStep).toHaveBeenCalledWith(
      42,
      'flight',
      expect.objectContaining({
        status: 'in_process',
        step_date: TODAY,
        details: {
          airline: 'Biman',
          flight_no: 'BG084',
          departure_date: addDays(TODAY, 3),
          ticket_pnr: null,
        },
      }),
    )
  })

  it('checks the flight number format', async () => {
    await openFor('flight')
    await input('flight_no').setValue('BG-084')
    await chooseStatus('in_process')

    await save()

    expect(errorOf('flight_no').text()).toBe(
      'The flight number may only contain letters and digits.',
    )
  })

  it('asks before saving a rejected (or cancelled) status', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('calling')
    await chooseStatus('rejected')

    await save()
    expect(recordStep).not.toHaveBeenCalled()
    expect(wrapper.find('[data-confirm-rejected]').exists()).toBe(true)

    await wrapper.get('button[data-confirm]').trigger('click')
    await flushPromises()
    expect(recordStep).toHaveBeenCalledWith(
      42,
      'calling',
      expect.objectContaining({ status: 'rejected' }),
    )
  })

  it('shows the medical_not_valid error as a banner with a link to the medical', async () => {
    vi.mocked(recordStep).mockRejectedValue(
      httpError(422, {
        message: 'Calling can only be recorded while the medical is fit and still valid today.',
        code: 'medical_not_valid',
      }),
    )
    await openFor('calling')
    await chooseStatus('in_process')

    await save()

    const banner = wrapper.get('[data-code="medical_not_valid"]')
    expect(banner.text()).toContain('Medical expired. Repeat the medical first.')
    expect(banner.get('a').attributes('href')).toBe('/passports/42')
  })

  it('puts server errors for details fields under those fields', async () => {
    vi.mocked(recordStep).mockRejectedValue(
      httpError(422, {
        message: 'Invalid.',
        errors: { 'details.airline': ['The airline field is required when status is in_process.'] },
      }),
    )
    await openFor('flight')
    await input('airline').setValue('X')
    await input('flight_no').setValue('BG1')
    await input('departure_date').setValue(addDays(TODAY, 1))
    await chooseStatus('in_process')

    await save()

    expect(errorOf('airline').text()).toBe(
      'The airline field is required when status is in_process.',
    )
  })

  it('warns before saving when the passport expires soon after the flight', async () => {
    await openFor('flight', {
      passport: makePassport({ passport_expiry_date: addDays(TODAY, 60) }),
    })

    await input('departure_date').setValue(addDays(TODAY, 10))

    expect(wrapper.get('[data-warnings]').text()).toContain(
      'The passport expires less than 6 months after the flight departure date.',
    )
  })
})
