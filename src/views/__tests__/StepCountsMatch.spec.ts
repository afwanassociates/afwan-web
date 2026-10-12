import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import StaffLayout from '@/layouts/StaffLayout.vue'
import StepListPage from '../StepListPage.vue'
import { listStepPassports, updateCalling } from '@/api/steps'
import { fetchWorkflowSummary } from '@/api/workflow'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG, WORKFLOW_SUMMARY } from '@/test/workflowFixtures'
import type { StepListParams, StepListRow } from '@/types/workflow'

/**
 * The Calling Pending number in three places: the tab, the step bar and the sidebar badge.
 * All three come from the API (the list's `tab_counts`, the summary's `step_tabs`), so they
 * agree, also after a save.
 */
vi.mock('@/api/steps', () => ({
  listStepPassports: vi.fn(),
  startStep: vi.fn(),
  recordStepResult: vi.fn(),
  updateCalling: vi.fn(),
  deleteStepRecord: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(),
}))

/** What the API holds: the Pending and Permitted passports of Calling. */
let pending: StepListRow[] = []
let permitted: StepListRow[] = []

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
  // Both endpoints count the same scope (the stage counts are deliberately different).
  vi.mocked(listStepPassports).mockImplementation(async (_step, params: StepListParams) => {
    const data = params.tab === 'permitted' ? permitted : pending
    return {
      data,
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 15, total: data.length, from: 1, to: 1 },
      tab_counts: { pending: pending.length, permitted: permitted.length },
    }
  })
  vi.mocked(fetchWorkflowSummary).mockImplementation(async () => ({
    ...WORKFLOW_SUMMARY,
    stages: { ...WORKFLOW_SUMMARY.stages, calling: { total: 99, waiting: 42 } },
    step_tabs: {
      ...WORKFLOW_SUMMARY.step_tabs,
      calling: { pending: pending.length, permitted: permitted.length },
    },
  }))
  vi.mocked(updateCalling).mockImplementation(async (id) => {
    const moved = pending.find((r) => r.id === id)!
    pending = pending.filter((r) => r.id !== id)
    permitted = [...permitted, moved]
    return { data: { status: 'completed' }, passport: {}, warnings: [] } as never
  })

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
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...names.map((name) => ({ path: `/${name}`, name, component: Empty })),
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/:step', name: 'step-page', component: StepListPage },
    ],
  })
  await router.push('/calling')
  wrapper = mount(
    { components: { StaffLayout }, template: '<StaffLayout><RouterView /></StaffLayout>' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
})
afterEach(() => wrapper.unmount())

/** The three numbers: Pending tab, step bar (Calling), sidebar badge (Calling). */
function threeCounts() {
  const tab = wrapper.get('[role="tab"][data-tab="pending"] [data-tab-count]').text()
  const bar = wrapper.get('nav[aria-label="Workflow steps"] [data-step="calling"] [data-count]')
  const link = wrapper
    .findAll('nav[aria-label="Staff portal"] a')
    .find((a) => a.attributes('href') === '/calling')!
  const badge = link
    .get('[data-badge]')
    .text()
    .replace(/\s*pending$/, '')
  return [tab, bar.text(), badge]
}

describe('Calling counts', () => {
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
