import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PassportDetailView from '../PassportDetailView.vue'
import { deleteMedical } from '@/api/medical'
import { getPassport, updateEntryMode } from '@/api/passports'
import { deleteStepRecord, listStepRecords } from '@/api/steps'
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
}))
vi.mock('@/api/medical', () => ({
  listMedicals: vi.fn(async () => []),
  deleteMedical: vi.fn(),
  updateMedicalSlip: vi.fn(),
}))
vi.mock('@/api/steps', () => ({
  listStepRecords: vi.fn(async () => ({})),
  deleteStepRecord: vi.fn(),
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

async function mountDetail(passport: Partial<PassportEntry>, role: Role = 'admin') {
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

/** Clicks "Undo" in the dialog with this title (both undo dialogs are in the page). */
async function confirmDialog(title: string) {
  const dialog = [...wrapper.findAll('dialog')].find((d) => d.get('h2').text() === title)!
  await dialog
    .findAll('button')
    .find((b) => b.text() === 'Undo')!
    .trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listStepRecords).mockResolvedValue({})
})
afterEach(() => wrapper?.unmount())

describe('Passport page: undo in the Steps section (admins only)', () => {
  it('offers "Undo latest step" under the latest step record, not in the header', async () => {
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

    const steps = wrapper.get('section[aria-labelledby="timeline-heading"]')
    expect(steps.get('button[data-undo]').text()).toBe('Undo latest step')
    expect(wrapper.find('button[data-undo-latest]').exists()).toBe(false)
    // Calling has a record, so there is no Online mark / medical undo.
    expect(wrapper.find('button[data-early-undo]').exists()).toBe(false)

    await steps.get('button[data-undo]').trigger('click')
    await flushPromises()
    await confirmDialog('Undo latest step')
    expect(deleteStepRecord).toHaveBeenCalledWith(9)
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
    expect(deleteMedical).not.toHaveBeenCalled()
  })

  it('offers "Undo medical result" when there is no mark and no step record', async () => {
    vi.mocked(deleteMedical).mockResolvedValue()
    await mountDetail({ current_medical: FIT_MEDICAL, medical_status: 'fit', entry_mode: null })

    // Inside step 2, Medical (not below the timeline).
    const button = wrapper.get('[data-timeline-step="medical"] button[data-early-undo]')
    expect(button.text()).toBe('Undo medical result')
    expect(wrapper.findAll('button[data-early-undo]')).toHaveLength(1)
    await button.trigger('click')
    await flushPromises()
    await confirmDialog('Undo medical result')

    expect(deleteMedical).toHaveBeenCalledWith(55)
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
