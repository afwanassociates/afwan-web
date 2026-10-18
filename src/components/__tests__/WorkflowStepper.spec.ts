import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import WorkflowStepper from '../WorkflowStepper.vue'
import stepperSource from '../WorkflowStepper.vue?raw'
import type { WorkflowStep } from '@/types/medical'

/** Made-up step names prove the bar is built from the API data, not from code. */
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [
      { key: 'alpha', label: 'Alpha step', short_label: 'Alpha', order: 1, enabled: true },
      { key: 'beta', label: 'Beta step', short_label: 'Beta', order: 2, enabled: true },
      { key: 'gamma', label: 'Gamma step', short_label: 'Gamma', order: 3, enabled: true },
      { key: 'delta', label: 'Delta step', short_label: 'Delta', order: 4, enabled: true },
      { key: 'epsilon', label: 'Epsilon step', short_label: 'Eps', order: 5, enabled: true },
      { key: 'zeta', label: 'Zeta step', short_label: 'Zeta', order: 6, enabled: true },
    ],
    step1: { total_all: 30, total_active: 28, incomplete: 3 },
    step2: { pending: 7, fit: 5, expiring_soon: 1, expired: 2, unfit: 4 },
    step3: { enabled: true, ready: 3 },
    stages: {
      beta: { total: 14, pending: 7, unfit: 4, fit: 3 },
      gamma: { total: 6, waiting: 3, in_process: 2, rejected: 1 },
      delta: { total: 4, waiting: 1, in_process: 3, rejected: 0 },
      epsilon: { total: 2, waiting: 2, in_process: 0, rejected: 0 },
      zeta: { total: 1, waiting: 0, in_process: 1, rejected: 0 },
    },
    completed: 9,
    // Step pages' tab counts: their chips show these instead of the stage's.
    step_tabs: {
      epsilon: { pending: 2, approved: 5 },
      zeta: { done_tab: 4, pending: 1, rejected: 0 },
    },
  })),
  fetchWorkflowConfig: vi.fn(async () => ({
    steps: [
      {
        key: 'epsilon',
        tabs: [
          { key: 'pending', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
        ],
      },
      {
        key: 'zeta',
        tabs: [
          { key: 'pending', label: 'Pending' },
          { key: 'done_tab', label: 'Zeta Done' },
          { key: 'rejected', label: 'Rejected' },
        ],
      },
    ],
  })),
}))

let wrapper: VueWrapper

async function mountStepper(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports', name: 'passports', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
      { path: '/process', name: 'process', component: Empty },
      { path: '/:step', name: 'step-page', component: { template: '<div />' } },
    ],
  })
  wrapper = mount(WorkflowStepper, { props, global: { plugins: [pinia, router] } })
  await flushPromises()
}

const step = (key: string) => wrapper.get(`[data-step="${key}"]`)

afterEach(() => wrapper.unmount())

describe('WorkflowStepper (summary bar)', () => {
  it('renders the six steps from the summary, in order, with counts', async () => {
    await mountStepper()

    const keys = wrapper.findAll('[data-step]').map((s) => s.attributes('data-step'))
    expect(keys).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'completed'])
    expect(step('alpha').get('[data-count]').text()).toBe('28')
    expect(step('gamma').get('[data-count]').text()).toBe('6')
    expect(step('gamma').text()).toContain('Gamma step')
  })

  it('shows waiting, in process and rejected chips per stage', async () => {
    await mountStepper()

    expect(step('gamma').get('[data-chip="waiting"]').text()).toBe('3 waiting')
    expect(step('gamma').get('[data-chip="in_process"]').text()).toBe('2 in process')
    expect(step('gamma').get('[data-chip="rejected"]').text()).toBe('1 rejected')
  })

  it('shows the medical chips with a plain "fit" (no "not marked")', async () => {
    await mountStepper()

    expect(
      step('beta')
        .findAll('[data-chip]')
        .map((c) => c.text()),
    ).toEqual(['7 pending', '3 fit', '4 unfit'])
    expect(step('beta').get('[data-chip="fit"]').classes()).toContain('bg-green-50')
    expect(step('beta').text()).not.toContain('not marked')
  })

  it('shows a step page\'s tabs as chips ("2 pending", "5 approved"), in the tab order', async () => {
    await mountStepper()

    const chips = (key: string) =>
      step(key)
        .findAll('[data-chip]')
        .map((c) => [c.attributes('data-chip'), c.text()])
    expect(chips('epsilon')).toEqual([
      ['pending', '2 pending'],
      ['approved', '5 approved'],
    ])
    expect(chips('zeta')).toEqual([
      ['pending', '1 pending'],
      ['done_tab', '4 zeta done'],
      ['rejected', '0 rejected'],
    ])
    expect(step('epsilon').find('[data-chip="waiting"]').exists()).toBe(false)
    expect(step('epsilon').get('[data-chip="pending"]').classes()).toContain('bg-amber-50')
    expect(step('epsilon').get('[data-chip="approved"]').classes()).toContain('bg-green-50')
    expect(step('zeta').get('[data-chip="rejected"]').classes()).toContain('bg-red-50')
  })

  it('marks only the last step as Final and shows the completed count at the end', async () => {
    await mountStepper()

    expect(wrapper.findAll('[data-final]')).toHaveLength(1)
    expect(step('zeta').find('[data-final]').exists()).toBe(true)
    expect(step('completed').text()).toContain('Completed')
    expect(step('completed').get('[data-completed]').text()).toBe('(9)')
  })

  it('keeps the Completed card by default; hide-completed (All Passports) leaves it out', async () => {
    await mountStepper()
    expect(wrapper.find('[data-step="completed"]').exists()).toBe(true)
    wrapper.unmount()

    await mountStepper({ hideCompleted: true })
    expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Completed')
    expect(wrapper.findAll('[data-step]')).toHaveLength(6)
  })

  it('links step 1 to the Passport List, step 2 to Medical and later steps to their own pages', async () => {
    await mountStepper()

    expect(step('alpha').get('a').attributes('href')).toBe('/passports')
    expect(step('beta').get('a').attributes('href')).toBe('/medical')
    expect(step('delta').get('a').attributes('href')).toBe('/delta')
    // "Completed" (where it is shown) opens the final step's completed tab.
    expect(step('completed').get('a').attributes('href')).toBe('/zeta?tab=completed')
  })

  it('overview mode highlights no step; activeStep highlights one', async () => {
    await mountStepper()
    expect(wrapper.find('[aria-current]').exists()).toBe(false)
    wrapper.unmount()

    await mountStepper({ activeStep: 'delta' })
    expect(step('delta').get('a').attributes('aria-current')).toBe('step')
    expect(step('gamma').text()).toContain('(completed)')
  })

  it('has no step names written into the component', () => {
    for (const name of ['Calling', 'Visa', 'BMET', 'Flight', 'Work Permit'])
      expect(stepperSource).not.toContain(name)
  })
})

describe('WorkflowStepper (one passport)', () => {
  const steps: WorkflowStep[] = [
    { key: 'a', label: 'One', enabled: true, state: 'done' },
    { key: 'b', label: 'Two', enabled: true, state: 'passed' },
    { key: 'c', label: 'Three', enabled: true, state: 'completed' },
    { key: 'd', label: 'Four', enabled: true, state: 'in_process' },
    { key: 'e', label: 'Five', enabled: true, state: 'rejected' },
    { key: 'f', label: 'Six', enabled: true, state: 'locked' },
  ]

  it('compact mode shows six states with icons and text alternatives', async () => {
    await mountStepper({ steps, compact: true })

    const dots = wrapper.findAll('[data-state]')
    expect(dots.map((d) => d.attributes('data-state'))).toEqual([
      'done',
      'passed',
      'completed',
      'in_process',
      'rejected',
      'locked',
    ])
    dots.forEach((dot) => expect(dot.find('svg').exists()).toBe(true))
    expect(wrapper.get('.sr-only').text()).toBe(
      'Progress: One: Done, Two: Passed, Three: Completed, Four: In process, Five: Rejected, Six: Locked',
    )
  })

  it('full size shows each step with its state in words', async () => {
    await mountStepper({ steps })

    const text = wrapper.text()
    expect(text).toContain('4 Four')
    expect(text).toContain('In process')
    expect(text).toContain('Rejected')
  })
})
