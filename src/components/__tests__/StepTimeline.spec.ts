import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StepTimeline from '../StepTimeline.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { makePassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { StepRecord } from '@/types/workflow'

vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => null),
}))

const DATA_ENTRY_ID = 5
const OTHER_ID = 9

function record(overrides: Partial<StepRecord>): StepRecord {
  return {
    id: 1,
    passport_entry_id: 42,
    step_key: 'calling',
    step_label: 'Calling / Work Permit',
    status: 'completed',
    status_label: 'Approved',
    reference_no: 'WP-1',
    step_date: '2026-09-01',
    valid_until: '2027-09-01',
    validity_status: 'valid',
    days_left: 330,
    details: null,
    remarks: null,
    recorded_by: { id: OTHER_ID, name: 'Someone else' },
    updated_by: null,
    created_at: '',
    updated_at: '',
    // The API decides; these tests check the role rules on top.
    can: { update: true, delete: true },
    ...overrides,
  }
}

const HISTORY: Record<string, StepRecord[]> = {
  calling: [
    record({ id: 1 }),
    record({ id: 0, status: 'rejected', status_label: 'Rejected', reference_no: null }),
  ],
  visa: [
    record({
      id: 2,
      step_key: 'visa',
      step_label: 'Visa',
      status: 'in_process',
      status_label: 'Submitted',
      reference_no: null,
      valid_until: null,
      validity_status: null,
      recorded_by: { id: DATA_ENTRY_ID, name: 'Data Entry' },
    }),
  ],
}

const passport = makePassport({
  current_medical: {
    id: 7,
    medical_date: '2026-08-01',
    result: 'fit',
    valid_until: '2026-11-01',
    days_left: 22,
    remarks: null,
    medical_center: { id: 2, name: 'Gulf Medical Center' },
    slip_no: 'SLIP-77',
    slip_date: '2026-07-28',
    recorded_by: null,
    created_at: '',
  },
  current_stage: 'visa',
  stage_status: 'in_process',
  workflow: {
    current_step: 'visa',
    steps: [
      { key: 'passport', label: 'Passport', enabled: true, state: 'done' },
      { key: 'medical', label: 'Medical', enabled: true, state: 'passed' },
      { key: 'calling', label: 'Calling / Work Permit', enabled: true, state: 'completed' },
      { key: 'visa', label: 'Visa', enabled: true, state: 'in_process' },
      { key: 'bmet', label: 'BMET Clearance', enabled: true, state: 'locked' },
      { key: 'flight', label: 'Flight', enabled: true, state: 'locked' },
    ],
  },
})

async function mountTimeline(role: Role, userId: number, history = HISTORY) {
  setActivePinia(createPinia())
  const wrapper = mount(StepTimeline, {
    props: { passport, history, role, userId },
  })
  await flushPromises()
  return wrapper
}

const stepEl = (wrapper: Awaited<ReturnType<typeof mountTimeline>>, key: string) =>
  wrapper.get(`[data-timeline-step="${key}"]`)

describe('StepTimeline', () => {
  it('lists all six steps with their state in words', async () => {
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID)

    expect(wrapper.findAll('[data-timeline-step]')).toHaveLength(6)
    expect(stepEl(wrapper, 'visa').text()).toContain('In process')
    expect(stepEl(wrapper, 'calling').text()).toContain('Approved')
    expect(stepEl(wrapper, 'calling').text()).toContain('WP-1')
    expect(stepEl(wrapper, 'calling').find('[data-validity]').text()).toBe('Valid')
  })

  it('shows the medical center and slip on the medical step', async () => {
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID)

    const details = stepEl(wrapper, 'medical').get('[data-medical-details]').text()
    expect(details).toContain('Gulf Medical Center')
    expect(details).toContain('SLIP-77')
    expect(details).toContain('Medical slip date')
    expect(details).toContain('28-07-2026')
  })

  it('shows the BMET training certificate and finger dates as DD-MM-YYYY', async () => {
    const bmet = [
      record({
        id: 3,
        step_key: 'bmet',
        step_label: 'BMET Clearance',
        status: 'in_process',
        status_label: 'Submitted',
        reference_no: null,
        valid_until: null,
        validity_status: null,
        details: { training_certificate_date: '2026-09-20', finger_date: '2026-09-22' },
      }),
    ]
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID, { ...HISTORY, bmet })
    // Labels come from the step config (the detail page loads it).
    await useWorkflowStore().loadConfig()
    await flushPromises()

    const text = stepEl(wrapper, 'bmet').get('[data-latest-record]').text()
    expect(text).toContain('Training certificate date')
    expect(text).toContain('20-09-2026')
    expect(text).toContain('Finger date')
    expect(text).toContain('22-09-2026')
  })

  it('collapses older records', async () => {
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID)

    const older = stepEl(wrapper, 'calling').get('[data-older-records]')
    expect(older.element.tagName).toBe('DETAILS')
    expect(older.attributes('open')).toBeUndefined()
    expect(older.text()).toContain('Earlier records (1)')
  })

  it('offers "Update status" on the current step', async () => {
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID)

    expect(stepEl(wrapper, 'visa').get('[data-step-action]').text()).toBe('Update status')
    expect(stepEl(wrapper, 'calling').find('[data-step-action]').exists()).toBe(false)
  })

  it('data_entry: no Undo, and Edit only on their own records', async () => {
    const wrapper = await mountTimeline('data_entry', DATA_ENTRY_ID)

    expect(wrapper.find('[data-undo]').exists()).toBe(false)
    expect(stepEl(wrapper, 'visa').find('[data-edit-record]').exists()).toBe(true)
    expect(stepEl(wrapper, 'calling').find('[data-edit-record]').exists()).toBe(false)
  })

  it.each(['admin', 'super_admin'] as const)(
    '%s: Edit any record, and Undo on the latest step only',
    async (role) => {
      const wrapper = await mountTimeline(role, 1)

      expect(stepEl(wrapper, 'calling').find('[data-edit-record]').exists()).toBe(true)
      expect(wrapper.findAll('[data-undo]')).toHaveLength(1)
      expect(stepEl(wrapper, 'visa').find('[data-undo]').exists()).toBe(true)
    },
  )
})
