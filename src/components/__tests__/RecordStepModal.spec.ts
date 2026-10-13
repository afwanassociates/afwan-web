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
    // Calling: the permit dates only (no calling date, no rejected path).
    [
      'calling',
      ['receive_date', 'issue_date', 'valid_until'],
      ['Calling date entered', 'Permitted'],
    ],
    [
      'visa',
      ['step_date', 'issue_date', 'valid_until', 'reference_no'],
      ['Submitted', 'Visa issued', 'Rejected'],
    ],
    [
      'bmet',
      ['training_certificate_date', 'finger_date', 'step_date'],
      ['In progress', 'BMET cleared'],
    ],
    ['flight', ['booking_date', 'confirmed_date'], ['Booked', 'Flight confirmed']],
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
      'Training date',
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

  it('requires a status', async () => {
    await openFor('calling')

    await save()

    expect(recordStep).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choose a status.')
  })

  it('requires fields by status: issue and expired dates when issued; the visa number is optional', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('visa')

    await chooseStatus('completed')
    await save()
    expect(errorOf('issue_date').text()).toBe('Enter the issue date.')
    expect(errorOf('valid_until').text()).toBe('Enter the expired date.')
    expect(errorOf('reference_no').exists()).toBe(false)
    expect(recordStep).not.toHaveBeenCalled()

    await chooseStatus('in_process')
    await save()
    expect(recordStep).toHaveBeenCalledWith(
      42,
      'visa',
      expect.objectContaining({ status: 'in_process', step_date: TODAY }),
    )
  })

  it('accepts a future flight booking date', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('flight')
    await input('booking_date').setValue(addDays(TODAY, 30))

    await chooseStatus('in_process')
    await save()

    expect(errorOf('booking_date').exists()).toBe(false)
    expect(recordStep).toHaveBeenCalledWith(
      42,
      'flight',
      expect.objectContaining({
        status: 'in_process',
        details: expect.objectContaining({ booking_date: addDays(TODAY, 30) }),
      }),
    )
  })

  it('asks before saving a rejected (or cancelled) status', async () => {
    vi.mocked(recordStep).mockResolvedValue(saved as never)
    await openFor('visa')
    await chooseStatus('rejected')

    await save()
    expect(recordStep).not.toHaveBeenCalled()
    expect(wrapper.find('[data-confirm-rejected]').exists()).toBe(true)

    await wrapper.get('button[data-confirm]').trigger('click')
    await flushPromises()
    expect(recordStep).toHaveBeenCalledWith(
      42,
      'visa',
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
        errors: { 'details.finger_date': ['The finger date cannot be in the future.'] },
      }),
    )
    await openFor('bmet')
    await input('finger_date').setValue(TODAY)
    await chooseStatus('in_process')

    await save()

    expect(errorOf('finger_date').text()).toBe('The finger date cannot be in the future.')
  })
})
