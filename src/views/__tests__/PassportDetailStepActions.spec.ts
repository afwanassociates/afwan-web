import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PassportDetailView from '../PassportDetailView.vue'
import RecordStepModal from '@/components/RecordStepModal.vue'
import { getPassport } from '@/api/passports'
import { recordMedicalResult, updateMedicalDate } from '@/api/medical'
import { clearFlightBooking, listStepRecords, undoFlightConfirm, undoStepAction } from '@/api/steps'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'
import type { StepRecord } from '@/types/workflow'

vi.mock('@/api/passports', () => ({
  getPassport: vi.fn(),
  getPassportHistory: vi.fn(async () => []),
  listPassports: vi.fn(),
  updateEntryMode: vi.fn(),
  returnPassport: vi.fn(),
  undoPassportReturn: vi.fn(),
}))
vi.mock('@/api/medical', () => ({
  listMedicals: vi.fn(async () => []),
  updateMedicalSlip: vi.fn(),
  updateMedicalDate: vi.fn(),
  recordMedicalResult: vi.fn(),
}))
vi.mock('@/api/steps', () => ({
  listStepRecords: vi.fn(async () => ({})),
  undoStepAction: vi.fn(),
  undoStep: vi.fn(),
  undoFlightConfirm: vi.fn(),
  clearFlightBooking: vi.fn(),
  recordStep: vi.fn(),
  updateStepRecord: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
}))

const STEPS = ['passport', 'medical', 'calling', 'visa', 'bmet', 'flight']
const workflowAt = (current: string) =>
  ({
    steps: STEPS.map((key) => ({
      key,
      label: key,
      enabled: true,
      state: STEPS.indexOf(key) < STEPS.indexOf(current) ? 'done' : 'pending',
    })),
    current_step: current,
  }) as PassportEntry['workflow']

const FIT = {
  id: 55,
  medical_date: '2026-09-20',
  result: 'fit',
  valid_until: '2026-12-20',
  days_left: 40,
  remarks: null,
  recorded_by: null,
  created_at: '2026-09-20T06:00:00Z',
} as PassportEntry['current_medical']

let nextId = 100
function record(
  step: string,
  status: string,
  details: Record<string, string> = {},
  canUpdate = true,
) {
  return {
    id: nextId++,
    step_key: step,
    step_label: step,
    status,
    status_label: status,
    reference_no: null,
    step_date: '2026-10-20',
    valid_until: null,
    validity_status: null,
    days_left: null,
    details,
    remarks: null,
    recorded_by: null,
    can: { update: canUpdate, delete: false },
  } as unknown as StepRecord
}

const done = (step: string) => record(step, 'completed')

let wrapper: VueWrapper

async function mountDetail(
  passport: Partial<PassportEntry>,
  steps: Record<string, StepRecord[]>,
  role: Role = 'operation_head',
) {
  vi.mocked(getPassport).mockResolvedValue(makePassport({ id: 20, ...passport }))
  vi.mocked(listStepRecords).mockResolvedValue(steps)
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-entry/passports/:id', name: 'passport-detail', component: PassportDetailView },
      { path: '/data-entry/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/data-entry/passports', name: 'passports', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
      { path: '/returned', name: 'returned-passports', component: Empty },
      { path: '/:step', name: 'step-page', component: Empty },
    ],
  })
  await router.push('/data-entry/passports/20')
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

const actionsOf = (step: string) =>
  wrapper.findAll(`[data-step-actions="${step}"] button`).map((b) => b.text())

async function clickAndConfirm(step: string, action: string) {
  await wrapper
    .get(`[data-step-actions="${step}"] button[data-step-action="${action}"]`)
    .trigger('click')
  await flushPromises()
  const opened = wrapper.findAll('dialog[open]')
  const dialog = opened[opened.length - 1]!
  await dialog
    .findAll('button')
    .find((b) => b.text() === 'Undo')!
    .trigger('click')
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper?.unmount())

const onlineFit = {
  current_medical: FIT,
  medical_status: 'fit' as const,
  entry_mode: { value: 'online' as const, label: 'Online' },
}

describe('Passport page: correct and undo steps (operations head)', () => {
  it('BMET in progress: Edit, Undo Training and Undo Finger', async () => {
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('bmet') },
      {
        calling: [done('calling')],
        visa: [done('visa')],
        bmet: [
          record('bmet', 'in_process', {
            training_certificate_date: '2026-10-20',
            finger_date: '2026-10-21',
          }),
        ],
      },
    )

    expect(actionsOf('bmet')).toEqual(['Edit BMET', 'Undo Training', 'Undo Finger'])
    await clickAndConfirm('bmet', 'training')
    expect(undoStepAction).toHaveBeenCalledWith(20, 'bmet', 'training')
  })

  it('BMET cleared: Undo BMET clearance, but not once the flight is confirmed', async () => {
    const steps = {
      calling: [done('calling')],
      visa: [done('visa')],
      bmet: [done('bmet')],
    }
    await mountDetail({ ...onlineFit, workflow: workflowAt('flight') }, steps)
    expect(actionsOf('bmet')).toContain('Undo BMET clearance')
    await clickAndConfirm('bmet', 'clearance')
    expect(undoStepAction).toHaveBeenCalledWith(20, 'bmet', 'clearance')
    wrapper.unmount()

    await mountDetail(
      { ...onlineFit, workflow: workflowAt('flight') },
      { ...steps, flight: [record('flight', 'completed', { booking_date: '2026-11-15' })] },
    )
    expect(actionsOf('bmet')).toEqual(['Edit BMET'])
    expect(actionsOf('flight')).toEqual(['Edit Flight', 'Undo flight'])
    await clickAndConfirm('flight', 'confirm')
    expect(undoFlightConfirm).toHaveBeenCalledWith(20)
  })

  it('Visa issued: Undo visa issued (Calling has none while the visa has a record)', async () => {
    const { undoStep } = await import('@/api/steps')
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('bmet') },
      { calling: [done('calling')], visa: [done('visa')] },
    )

    expect(actionsOf('visa')).toContain('Undo visa issued')
    expect(actionsOf('calling')).not.toContain('Undo calling')
    await clickAndConfirm('visa', 'undo-step')
    expect(undoStep).toHaveBeenCalledWith(20, 'visa')
  })

  it('Calling only: Undo calling; nothing once a later step has a record', async () => {
    const { undoStep } = await import('@/api/steps')
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('visa') },
      { calling: [done('calling')] },
    )

    expect(actionsOf('calling')).toContain('Undo calling')
    await clickAndConfirm('calling', 'undo-step')
    expect(undoStep).toHaveBeenCalledWith(20, 'calling')
    wrapper.unmount()

    await mountDetail(
      { ...onlineFit, workflow: workflowAt('bmet') },
      { calling: [done('calling')], visa: [done('visa')], bmet: [record('bmet', 'in_process')] },
    )
    expect(actionsOf('visa')).not.toContain('Undo visa issued')
  })

  it('flight booked, not confirmed: Clear booking date', async () => {
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('flight') },
      {
        calling: [done('calling')],
        visa: [done('visa')],
        flight: [record('flight', 'in_process', { booking_date: '2026-11-15' })],
      },
    )

    expect(actionsOf('flight')).toContain('Clear booking date')
    await clickAndConfirm('flight', 'booking')
    expect(clearFlightBooking).toHaveBeenCalledWith(20)
  })

  it('Edit opens the record form on the latest record', async () => {
    const visa = record('visa', 'completed', { issue_date: '2026-10-15' })
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('bmet') },
      { calling: [done('calling')], visa: [visa] },
    )

    await wrapper.get('[data-step-actions="visa"] button[data-step-action="edit"]').trigger('click')
    await flushPromises()

    const modal = wrapper.findComponent(RecordStepModal)
    expect(modal.props('open')).toBe(true)
    expect(modal.props('stepKey')).toBe('visa')
    expect(modal.props('record')).toMatchObject({ id: visa.id })
  })

  it('data entry: Edit only where the API allows it, and no undo', async () => {
    await mountDetail(
      { ...onlineFit, workflow: workflowAt('bmet') },
      {
        calling: [record('calling', 'completed', {}, false)],
        bmet: [record('bmet', 'in_process', { training_certificate_date: '2026-10-20' }, true)],
      },
      'data_entry',
    )

    expect(wrapper.find('[data-step-actions="calling"]').exists()).toBe(false)
    expect(actionsOf('bmet')).toEqual(['Edit BMET'])
  })

  it('a returned passport offers nothing', async () => {
    await mountDetail(
      {
        ...onlineFit,
        workflow: workflowAt('bmet'),
        returned: { id: 1 } as PassportEntry['returned'],
      },
      { calling: [done('calling')] },
    )

    expect(wrapper.find('[data-step-actions]').exists()).toBe(false)
  })
})

describe('Passport page: medical re-test (operations head)', () => {
  const UNFIT = {
    ...FIT,
    result: 'unfit',
    valid_until: null,
    days_left: null,
  } as PassportEntry['current_medical']

  async function openRetest() {
    await wrapper.get('button[data-retest]').trigger('click')
    await flushPromises()
    return wrapper.get('form[data-retest-dialog]')
  }

  it('records a new medical date and an Unfit result; the old one stays in the history', async () => {
    vi.mocked(updateMedicalDate).mockResolvedValue(makePassport({ id: 20 }))
    vi.mocked(recordMedicalResult).mockResolvedValue({} as never)
    await mountDetail(
      { current_medical: UNFIT, medical_status: 'unfit', medical_date: '2026-09-20' },
      {},
    )

    const form = await openRetest()
    expect(form.text()).toContain('(Unfit, 20-09-2026)')
    await form.get('[data-retest-field="medical_date"] input').setValue('2026-10-01')
    await form.get('button[data-retest-result="unfit"]').trigger('click')
    await form.trigger('submit')
    await flushPromises()

    expect(updateMedicalDate).toHaveBeenCalledWith(20, '2026-10-01')
    expect(recordMedicalResult).toHaveBeenCalledWith(20, 'unfit', undefined)
  })

  it('a Fit re-test sends its issue and expiry dates', async () => {
    vi.mocked(updateMedicalDate).mockResolvedValue(makePassport({ id: 20 }))
    vi.mocked(recordMedicalResult).mockResolvedValue({} as never)
    await mountDetail(
      { current_medical: UNFIT, medical_status: 'unfit', medical_date: '2026-09-20' },
      {},
    )

    const form = await openRetest()
    await form.get('[data-retest-field="medical_date"] input').setValue('2026-10-01')
    await form.get('button[data-retest-result="fit"]').trigger('click')
    await flushPromises()
    // The Fit dates appear once the result is chosen: wait for them (slow under a full run).
    await vi.waitFor(() => form.get('[data-retest-field="expiry_date"] input'))
    await form.get('[data-retest-field="expiry_date"] input').setValue('2026-12-30')
    await form.trigger('submit')
    await flushPromises()

    expect(recordMedicalResult).toHaveBeenCalledWith(20, 'fit', {
      issue_date: '2026-10-01',
      expiry_date: '2026-12-30',
    })
  })

  it('needs a date after the last medical and a result', async () => {
    await mountDetail(
      { current_medical: UNFIT, medical_status: 'unfit', medical_date: '2026-09-20' },
      {},
    )

    const form = await openRetest()
    await form.get('[data-retest-field="medical_date"] input').setValue('2026-09-20')
    await form.trigger('submit')
    await flushPromises()

    expect(form.text()).toContain('The re-test must be after the last medical (20-09-2026).')
    expect(form.text()).toContain('Choose the result of the re-test.')
    expect(updateMedicalDate).not.toHaveBeenCalled()
  })

  it('is not offered to data entry, before a result, or once Calling has a record', async () => {
    await mountDetail({ current_medical: UNFIT, medical_status: 'unfit' }, {}, 'data_entry')
    expect(wrapper.find('button[data-retest]').exists()).toBe(false)
    wrapper.unmount()

    await mountDetail({ current_medical: null, medical_status: 'pending' }, {})
    expect(wrapper.find('button[data-retest]').exists()).toBe(false)
    wrapper.unmount()

    await mountDetail(
      { ...onlineFit, workflow: workflowAt('visa') },
      { calling: [done('calling')] },
    )
    expect(wrapper.find('button[data-retest]').exists()).toBe(false)
  })
})
