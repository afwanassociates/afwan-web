import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PassportDetailView from '../PassportDetailView.vue'
import { getPassport, undoPassportReturn, updateEntryMode } from '@/api/passports'
import { listStepRecords } from '@/api/steps'
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
}))
vi.mock('@/api/steps', () => ({
  listStepRecords: vi.fn(async () => ({})),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
}))

const FIT_MEDICAL = {
  id: 55,
  medical_date: '2026-09-20',
  result: 'fit',
  valid_until: '2026-12-20',
  days_left: 60,
  remarks: null,
  recorded_by: null,
  created_at: '2026-09-20T06:00:00Z',
} as PassportEntry['current_medical']

let wrapper: VueWrapper

async function mountDetail(passport: Partial<PassportEntry>, role: Role = 'operation_head') {
  vi.mocked(getPassport).mockResolvedValue(makePassport({ id: 20, ...passport }))
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

/** Clicks the confirm button (`label`) in the dialog with this title. */
async function confirmDialog(title: string, label = 'Undo') {
  const dialog = [...wrapper.findAll('dialog')].find((d) => d.get('h2').text() === title)!
  await dialog
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listStepRecords).mockResolvedValue({})
})
afterEach(() => wrapper?.unmount())

describe('Passport page: undo in the Steps section (operations head only)', () => {
  it('offers no "Undo latest step": step records are never deleted', async () => {
    vi.mocked(listStepRecords).mockResolvedValue({
      calling: [
        {
          id: 9,
          step_key: 'calling',
          step_label: 'Calling',
          status: 'completed',
          status_label: 'Permitted',
          step_date: '2026-10-01',
          details: {},
          can: { update: true, delete: true },
        } as unknown as StepRecord,
      ],
    } as Record<string, StepRecord[]>)
    await mountDetail({
      current_medical: FIT_MEDICAL,
      medical_status: 'fit',
      entry_mode: { value: 'online', label: 'Online' },
      workflow: {
        steps: ['passport', 'medical', 'calling', 'visa', 'bmet', 'flight'].map((key) => ({
          key,
          label: key,
          enabled: true,
          state: key === 'calling' ? 'done' : 'locked',
        })),
      } as PassportEntry['workflow'],
    })

    expect(wrapper.find('button[data-undo]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Undo latest step')
    // Calling has a record, so there is no Online mark undo either.
    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)
  })

  it('offers "Undo Online mark" in the first recorded step (by its Online badge)', async () => {
    vi.mocked(updateEntryMode).mockResolvedValue(makePassport({ id: 20 }))
    await mountDetail({
      current_medical: FIT_MEDICAL,
      medical_status: 'fit',
      entry_mode: { value: 'online', label: 'Online' },
    })

    // The test passport's third step stands for Calling / Work Permit.
    const button = wrapper.get('[data-timeline-step="step3"] button[data-early-undo]')
    expect(button.text()).toBe('Undo Online mark')
    expect(wrapper.findAll('button[data-early-undo]')).toHaveLength(1)
    await button.trigger('click')
    await flushPromises()
    await confirmDialog('Undo Online mark')

    expect(updateEntryMode).toHaveBeenCalledWith(20, null)
  })

  it('offers no "Undo medical result": medical records are never deleted', async () => {
    await mountDetail({ current_medical: FIT_MEDICAL, medical_status: 'fit', entry_mode: null })

    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Undo medical result')
  })

  it('has no slip undo: a slip without a result shows no undo (Edit slip changes it)', async () => {
    await mountDetail({
      current_medical: null,
      medical_status: 'pending',
      entry_mode: null,
      medical_slip: { date: '2026-10-05', medical_center: null },
    })

    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Undo medical slip')
  })

  it('shows nothing when there is nothing to undo (no slip yet)', async () => {
    await mountDetail({
      current_medical: null,
      medical_status: 'not_started',
      entry_mode: null,
      medical_slip: { date: null, medical_center: null },
      medical_slip_date: null,
    })

    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)
    expect(wrapper.find('button[data-undo]').exists()).toBe(false)
  })

  it.each(['data_entry', 'accounts'] as const)('shows no undo to %s', async (role) => {
    await mountDetail(
      {
        current_medical: FIT_MEDICAL,
        medical_status: 'fit',
        entry_mode: { value: 'online', label: 'Online' },
      },
      role,
    )

    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)
    expect(wrapper.find('button[data-undo]').exists()).toBe(false)
  })
})

const RETURNED = {
  id: 3,
  return_date: '2026-10-28',
  receiver_name: 'Rahim',
  receiver_phone: '01711000000',
  receiver_id_no: null,
  remarks: null,
  stage: 'visa',
  stage_label: 'Visa',
  returned_by: { id: 1, name: 'Head One' },
  returned_at: '2026-10-28T06:00:00Z',
}

describe('Passport page: return to the owner', () => {
  it('offers "Return passport" when the API allows it', async () => {
    await mountDetail({
      can: { update: true, record_medical: false, return: true, undo_return: false },
    })

    expect(wrapper.get('button[data-return-passport]').text()).toBe('Return passport')
    expect(wrapper.find('button[data-undo-return]').exists()).toBe(false)
    expect(wrapper.find('[data-returned]').exists()).toBe(false)
  })

  it('shows who collected a returned passport and undoes the return', async () => {
    vi.mocked(undoPassportReturn).mockResolvedValue(makePassport({ id: 20 }))
    await mountDetail({
      returned: RETURNED,
      can: { update: true, record_medical: false, return: false, undo_return: true },
    })

    expect(wrapper.get('[data-returned]').text()).toContain(
      'Returned on 28-10-2026 to Rahim (01711000000)',
    )
    expect(wrapper.get('[data-returned]').text()).toContain('Visa')
    expect(wrapper.find('button[data-return-passport]').exists()).toBe(false)

    await wrapper.get('button[data-undo-return]').trigger('click')
    await flushPromises()
    await confirmDialog('Undo return', 'Undo return')

    expect(undoPassportReturn).toHaveBeenCalledWith(20)
  })

  it('shows the return but no buttons to data entry', async () => {
    await mountDetail({ returned: RETURNED }, 'data_entry')

    expect(wrapper.find('[data-returned]').exists()).toBe(true)
    expect(wrapper.find('button[data-undo-return]').exists()).toBe(false)
    expect(wrapper.find('button[data-return-passport]').exists()).toBe(false)
  })
})
