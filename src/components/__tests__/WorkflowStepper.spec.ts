import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import WorkflowStepper from '../WorkflowStepper.vue'
import type { WorkflowStep } from '@/types/medical'

vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [
      { key: 'passport', label: 'Passport', enabled: true },
      { key: 'medical', label: 'Medical', enabled: true },
      { key: 'step3', label: 'Step 3', enabled: false },
    ],
    step1: { total_active: 20, incomplete: 3 },
    step2: { pending: 7, fit: 5, expiring_soon: 1, expired: 2, unfit: 4 },
    step3: { enabled: false, ready: 0 },
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
    ],
  })
  wrapper = mount(WorkflowStepper, { props, global: { plugins: [pinia, router] } })
  await flushPromises()
}

const step = (key: string) => wrapper.get(`[data-step="${key}"]`)

afterEach(() => wrapper.unmount())

describe('WorkflowStepper (summary bar)', () => {
  it('renders the three steps with their counts', async () => {
    await mountStepper({ current: 'medical' })

    expect(step('passport').text()).toContain('1 Passport')
    expect(step('passport').find('[data-count]').text()).toBe('20')
    expect(step('medical').text()).toContain('2 Medical')
    expect(step('medical').find('[data-count]').text()).toBe('7')
    expect(step('medical').text()).toContain('5 fit')
    expect(step('medical').text()).toContain('2 expired')
    expect(step('medical').text()).toContain('4 unfit')
    expect(step('step3').text()).toContain('3 Step 3')
  })

  it('links Step 1 and Step 2 to their lists', async () => {
    await mountStepper()

    expect(step('passport').get('a').attributes('href')).toBe('/passports')
    expect(step('medical').get('a').attributes('href')).toBe('/medical')
  })

  it('shows Step 3 as disabled: no link, "Coming soon" and a tooltip', async () => {
    await mountStepper()

    const step3 = step('step3')
    expect(step3.find('a').exists()).toBe(false)
    const box = step3.get('[aria-disabled="true"]')
    expect(box.attributes('title')).toBe('Not available yet')
    expect(step3.text()).toContain('Coming soon')
  })

  it('highlights the current step and marks earlier steps as completed (in text too)', async () => {
    await mountStepper({ current: 'medical' })

    expect(step('medical').get('a').attributes('aria-current')).toBe('step')
    expect(step('medical').text()).toContain('(current step)')
    expect(step('passport').text()).toContain('(completed)')
    expect(step('passport').find('svg').exists()).toBe(true) // check mark
  })
})

describe('WorkflowStepper (one passport)', () => {
  const steps: WorkflowStep[] = [
    { key: 'passport', label: 'Passport', enabled: true, state: 'done' },
    { key: 'medical', label: 'Medical', enabled: true, state: 'failed' },
    { key: 'step3', label: 'Step 3', enabled: false, state: 'locked' },
  ]

  it('compact mode shows each state from the API with icons and hidden text', async () => {
    await mountStepper({ steps, compact: true })

    const dots = wrapper.findAll('[data-state]')
    expect(dots.map((d) => d.attributes('data-state'))).toEqual(['done', 'failed', 'locked'])
    dots.forEach((dot) => expect(dot.find('svg').exists()).toBe(true))
    expect(wrapper.get('.sr-only').text()).toBe(
      'Progress: Passport: Done, Medical: Unfit, Step 3: Locked',
    )
  })

  it('full size shows labels and state words', async () => {
    await mountStepper({
      steps: [
        { key: 'passport', label: 'Passport', enabled: true, state: 'needs_attention' },
        { key: 'medical', label: 'Medical', enabled: true, state: 'passed' },
        { key: 'step3', label: 'Step 3', enabled: false, state: 'locked' },
      ],
    })

    const text = wrapper.text()
    expect(text).toContain('1 Passport')
    expect(text).toContain('Needs attention')
    expect(text).toContain('2 Medical')
    expect(text).toContain('Passed')
    expect(text).toContain('Locked')
  })
})
