import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import StaffLayout from '@/layouts/StaffLayout.vue'
import StepListPage from '../StepListPage.vue'
import {
  listStepPassports,
  markStepAction,
  recordStepResult,
  bookFlight,
  confirmFlight,
  undoFlightConfirm,
  updateCalling,
} from '@/api/steps'
import { useToast } from '@/composables/useToast'
import { fetchWorkflowSummary } from '@/api/workflow'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG, WORKFLOW_SUMMARY } from '@/test/workflowFixtures'
import type { StepListParams, StepListRow } from '@/types/workflow'

/**
 * Each step's Pending number in three places: the tab, the step bar and the sidebar badge
 * (Calling, Visa, BMET, Flight).
 * All three come from the API (the list's `tab_counts`, the summary's `step_tabs`), so they
 * agree, also after a save.
 */
vi.mock('@/api/accounts', () => ({
  fetchApprovalSummary: vi.fn(async () => ({ pending: 2, returned_mine: 1, is_approver: true })),
}))
vi.mock('@/api/steps', () => ({
  listStepPassports: vi.fn(),
  startStep: vi.fn(),
  recordStepResult: vi.fn(),
  updateCalling: vi.fn(),
  bookFlight: vi.fn(),
  clearFlightBooking: vi.fn(),
  confirmFlight: vi.fn(),
  undoFlightConfirm: vi.fn(),
  deleteStepRecord: vi.fn(),
  markStepAction: vi.fn(),
  undoStepAction: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(),
}))

/** What the API holds: the Pending and Permitted passports of Calling … */
let pending: StepListRow[] = []
let permitted: StepListRow[] = []
/** … Visa's and BMET's tabs … */
let visa: Record<'pending' | 'issued' | 'rejected', StepListRow[]> = {
  pending: [],
  issued: [],
  rejected: [],
}
let bmet: Record<'pending' | 'cleared', StepListRow[]> = { pending: [], cleared: [] }
/** … and Flight's three tabs. */
let flight: Record<'pending' | 'confirmed', StepListRow[]> = {
  pending: [],
  confirmed: [],
}

const row = (id: number): StepListRow => ({
  id,
  passport_name: `PASSPORT ${id}`,
  passport_number: `CL00000${id}`,
  reference: { id: 7, name: 'Green Field' },
  company: { id: 3, name: 'Desert Rose' },
  record: null,
  previous_step_completed_on: '2026-09-20',
})

let wrapper: VueWrapper

beforeEach(async () => {
  vi.clearAllMocks()
  pending = [row(11), row(12), row(13)]
  permitted = [row(14)]
  // Flight Pending: 41 is ready (BMET cleared and booked), 42 has neither.
  flight = {
    pending: [
      {
        ...row(41),
        bmet_cleared: true,
        clearance_date: '2026-10-11',
        booking_date: '2026-12-01',
        can_confirm: true,
        missing: [],
      },
      { ...row(42), bmet_cleared: false, can_confirm: false, missing: ['bmet', 'booking_date'] },
    ],
    confirmed: [row(51)],
  }
  // Visa Pending: submitted, waiting for the result.
  const submitted = (id: number): StepListRow => ({
    ...row(id),
    record: {
      id: id + 100,
      status: 'in_process',
      status_label: 'Submitted',
      step_date: '2026-10-02',
      reference_no: null,
      valid_until: null,
      details: null,
    },
  })
  visa = {
    pending: [submitted(61), submitted(62), submitted(63), submitted(64)],
    issued: [row(65)],
    rejected: [],
  }
  bmet = {
    pending: [
      { ...row(71), training_date: '2026-10-01', finger_date: '2026-10-02' },
      row(72),
      row(73),
    ],
    cleared: [row(74), row(75)],
  }
  const callingTabs = () => ({ pending: pending.length, permitted: permitted.length })
  const counts = <T extends Record<string, StepListRow[]>>(tabs: T) =>
    Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, v.length]))
  const lists: Record<string, Record<string, StepListRow[]>> = {}
  const flightTabs = () => ({
    pending: flight.pending.length,
    confirmed: flight.confirmed.length,
  })
  // Both endpoints count the same scope (the stage counts are deliberately different).
  vi.mocked(listStepPassports).mockImplementation(async (step, params: StepListParams) => {
    Object.assign(lists, { visa, bmet, flight, calling: { pending, permitted } })
    const data = lists[step]![params.tab] ?? []
    return {
      data,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 15, total: data.length, from: 1, to: 1 },
      tab_counts: step === 'calling' ? callingTabs() : counts(lists[step]!),
    }
  })
  vi.mocked(fetchWorkflowSummary).mockImplementation(async () => ({
    ...WORKFLOW_SUMMARY,
    stages: {
      ...WORKFLOW_SUMMARY.stages,
      calling: { total: 99, waiting: 42 },
      visa: { total: 88, waiting: 33 },
      bmet: { total: 55, waiting: 44 },
      flight: { total: 77, waiting: 66 },
    },
    step_tabs: {
      ...WORKFLOW_SUMMARY.step_tabs,
      calling: callingTabs(),
      visa: counts(visa),
      bmet: counts(bmet),
      flight: flightTabs(),
    },
  }))
  vi.mocked(updateCalling).mockImplementation(async (id) => {
    const moved = pending.find((r) => r.id === id)!
    pending = pending.filter((r) => r.id !== id)
    permitted = [...permitted, moved]
    return { data: { status: 'completed' }, passport: {}, warnings: [] } as never
  })
  vi.mocked(confirmFlight).mockImplementation(async (id) => {
    const moved = flight.pending.find((r) => r.id === id)!
    flight.pending = flight.pending.filter((r) => r.id !== id)
    flight.confirmed = [...flight.confirmed, moved]
    return { data: { status: 'completed' }, passport: {}, warnings: [] } as never
  })
  // The booking keeps the passport in Flight Pending (the counts do not change).
  vi.mocked(bookFlight).mockImplementation(async (id, date) => {
    flight.pending = flight.pending.map((r) => (r.id === id ? { ...r, booking_date: date } : r))
    return { data: {}, passport: {}, warnings: [] } as never
  })
  vi.mocked(undoFlightConfirm).mockImplementation(async (id) => {
    const moved = flight.confirmed.find((r) => r.id === id)!
    flight.confirmed = flight.confirmed.filter((r) => r.id !== id)
    flight.pending = [...flight.pending, moved]
    return { data: {}, passport: {}, warnings: [] } as never
  })
  // Visa issued moves the row to Visa issued, BMET Pending and Flight Pending.
  vi.mocked(recordStepResult).mockImplementation(async (id) => {
    const moved = visa.pending.find((r) => r.id === id)!
    visa = {
      ...visa,
      pending: visa.pending.filter((r) => r.id !== id),
      issued: [...visa.issued, moved],
    }
    bmet = { ...bmet, pending: [...bmet.pending, moved] }
    flight = { ...flight, pending: [...flight.pending, moved] }
    return { data: { status: 'completed' }, passport: {}, warnings: [] } as never
  })
  // BMET clearance moves the row to BMET cleared (it is already in Flight Pending).
  vi.mocked(markStepAction).mockImplementation(async (id, _step, action) => {
    if (action === 'clearance') {
      const moved = bmet.pending.find((r) => r.id === id)!
      bmet = { pending: bmet.pending.filter((r) => r.id !== id), cleared: [...bmet.cleared, moved] }
    }
    return { data: {}, passport: {}, warnings: [] } as never
  })
})
afterEach(() => wrapper.unmount())

async function mountAt(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = makeUser({ role: 'data_entry' })
  auth.isReady = true
  const Empty = { template: '<div />' }
  const names = [
    'home',
    'login',
    'staff-data-entry',
    'all-passports',
    'passport-new',
    'passports',
    'medical',
    'companies',
    // The admin's sidebar links (the Flight test switches to an admin to Undo).
    'staff-admin',
    'staff-users',
    'admin-companies',
    'accounts-parties',
    'accounts-cash-book',
    'accounts-approvals',
    'settings',
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...names.map((name) => ({ path: `/${name}`, name, component: Empty })),
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/:step', name: 'step-page', component: StepListPage },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { components: { StaffLayout }, template: '<StaffLayout><RouterView /></StaffLayout>' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

/** The three numbers: Pending tab, step bar and sidebar badge of the step. */
function threeCounts(step = 'calling') {
  const tab = wrapper.get('[role="tab"][data-tab="pending"] [data-tab-count]').text()
  const bar = wrapper.get(`nav[aria-label="Workflow steps"] [data-step="${step}"] [data-count]`)
  const link = wrapper
    .findAll('nav[aria-label="Staff portal"] a')
    .find((a) => a.attributes('href') === `/${step}`)!
  const badge = link
    .get('[data-badge]')
    .text()
    .replace(/\s*pending$/, '')
  return [tab, bar.text(), badge]
}

describe('Calling counts', () => {
  beforeEach(() => mountAt('/calling'))

  it('the tab, the step bar and the sidebar badge show the same number', () => {
    expect(threeCounts()).toEqual(['3', '3', '3'])
  })

  it('stay equal after "Update calling" moves a row to Permitted', async () => {
    const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length
    await wrapper.get('tr[data-row="12"] button[data-step-update]').trigger('click')
    await flushPromises()
    const form = new DOMWrapper(document.body.querySelector('[data-step-start-popover]')!)
    for (const [name, value] of Object.entries({
      receive_date: '2026-10-07',
      issue_date: '2026-10-06',
      valid_until: '2027-10-06',
    }))
      await form.get(`[data-step-field="${name}"] input`).setValue(value)
    await form.trigger('submit')
    await flushPromises()

    expect(updateCalling).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)
    expect(threeCounts()).toEqual(['2', '2', '2'])
    expect(wrapper.get('[role="tab"][data-tab="permitted"] [data-tab-count]').text()).toBe('2')
  })
})

describe('Flight counts', () => {
  beforeEach(() => mountAt('/flight'))

  it('the step bar and the sidebar show the Flight Pending tab count', () => {
    expect(threeCounts('flight')).toEqual(['2', '2', '2'])
  })

  it('stay equal after a booking and Mark flight confirm', async () => {
    await wrapper.get('tr[data-row="42"] button[data-booking]').trigger('click')
    await flushPromises()
    const form = new DOMWrapper(document.body.querySelector('[data-date-popover]')!)
    await form.get('input').setValue('2026-12-03')
    await form.trigger('submit')
    await flushPromises()
    expect(bookFlight).toHaveBeenCalledWith(42, '2026-12-03')
    expect(threeCounts('flight')).toEqual(['2', '2', '2'])

    await wrapper.get('tr[data-row="41"] button[data-confirm]').trigger('click')
    await flushPromises()
    expect(threeCounts('flight')).toEqual(['1', '1', '1'])
    expect(wrapper.get('[role="tab"][data-tab="confirmed"] [data-tab-count]').text()).toBe('2')
    // Nobody can undo a confirmed flight.
    expect(useToast().toasts.value.some((t) => t.action?.label === 'Undo')).toBe(false)
  })
})

describe('Visa and BMET counts', () => {
  it.each([
    ['visa', '4'],
    ['bmet', '3'],
  ])('%s: the step bar and the sidebar show the Pending tab count (%s)', async (step, n) => {
    await mountAt(`/${step}`)
    expect(threeCounts(step)).toEqual([n, n, n])
  })

  it('stay equal after Visa issued (Visa down, BMET and Flight up)', async () => {
    await mountAt('/visa')
    await wrapper.get('tr[data-row="61"] button[data-step-result="completed"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body.querySelector('[data-step-result-dialog]')!)
    await dialog.get('[data-step-field="issue_date"] input').setValue('2026-10-08')
    await dialog.get('[data-step-field="valid_until"] input').setValue('2027-01-08')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(threeCounts('visa')).toEqual(['3', '3', '3'])
    const bar = (k: string) =>
      wrapper.get(`nav[aria-label="Workflow steps"] [data-step="${k}"] [data-count]`).text()
    expect(bar('bmet')).toBe('4')
    expect(bar('flight')).toBe('3')
  })

  it('stay equal after BMET clearance (BMET down; Flight unchanged, the passport is already there)', async () => {
    await mountAt('/bmet')
    await wrapper.get('tr[data-row="71"] button[data-action="clearance"]').trigger('click')
    await flushPromises()

    expect(threeCounts('bmet')).toEqual(['2', '2', '2'])
    const bar = (k: string) =>
      wrapper.get(`nav[aria-label="Workflow steps"] [data-step="${k}"] [data-count]`).text()
    expect(bar('flight')).toBe('2')
  })
})
