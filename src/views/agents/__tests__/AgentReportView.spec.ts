import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AgentReportView from '../AgentReportView.vue'
import { fetchAgentReport } from '@/api/agents'
import type { AgentReport } from '@/types/agents'

vi.mock('@/api/agents', () => ({
  fetchAgentReport: vi.fn(),
  fetchAgentReportPassports: vi.fn(async () => ({ data: [], agent: null })),
}))

const BUCKETS = {
  not_started: 1,
  medical_pending: 0,
  fit: 0,
  unfit: 0,
  calling: 2,
  visa: 0,
  bmet: 1,
  flight: 3,
  completed: 4,
  returned: 0,
}

const REPORT: AgentReport = {
  agents: [
    {
      id: 1,
      code: 'AG-001',
      name: 'Tania Treaders ltd',
      rl_number: 'RL-2201',
      is_own: false,
      is_active: true,
      current: 11,
      counted: 9,
      waiting_approval: 1,
      waiting_decision: 0,
      buckets: BUCKETS,
    },
  ],
  no_agent: { current: 0, waiting_approval: 0, buckets: { ...BUCKETS, completed: 0 } },
  buckets: Object.keys(BUCKETS) as AgentReport['buckets'],
}

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

describe('Agent report', () => {
  it('shows every step from entry to flight, without Counted or Waiting approval', async () => {
    vi.mocked(fetchAgentReport).mockResolvedValue(REPORT)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/staff/agents/report', component: AgentReportView },
        { path: '/p/:id', name: 'passport-detail', component: { template: '<div />' } },
      ],
    })
    await router.push('/staff/agents/report')
    wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual([
      'Agent',
      'RL No.',
      'Now',
      'No slip yet',
      'Medical pending',
      'Fit',
      'Unfit',
      'Calling',
      'Visa',
      'BMET',
      'Flight pending',
      'Flight done',
      'Returned',
    ])
    expect(wrapper.text()).not.toContain('Counted')
    expect(wrapper.text()).not.toContain('Waiting approval')
    expect(wrapper.get('[data-report-agent="1"]').text()).toContain('4')
  })
})
