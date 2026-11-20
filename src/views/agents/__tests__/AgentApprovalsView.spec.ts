import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AgentApprovalsView from '../AgentApprovalsView.vue'
import {
  approveReference,
  downloadAgentApprovalsCsv,
  listAgentApprovals,
  listPendingReferences,
} from '@/api/agents'

vi.mock('@/api/agents', () => ({
  listAgentApprovals: vi.fn(),
  approveAgentAssignment: vi.fn(),
  bulkApproveAgentAssignments: vi.fn(),
  returnAgentAssignment: vi.fn(),
  downloadAgentApprovalsCsv: vi.fn(async () => 'agent-approvals.csv'),
  listPendingReferences: vi.fn(async () => []),
  approveReference: vi.fn(async () => ({ updated: [{ id: 7 }], skipped: [] })),
  fetchAgentApprovalCount: vi.fn(async () => 0),
  fetchAgentChangeCount: vi.fn(async () => 0),
}))

const ROW = {
  id: 7,
  passport_entry_id: 3,
  agent: { id: 1, code: 'AG-001', name: 'Tania Treaders ltd', rl_number: 'RL-2201' },
  assigned_date: '2026-11-19',
  ended_date: null,
  remark: null,
  status: 'returned',
  status_label: 'Returned for correction',
  is_current: false,
  approved_at: null,
  returned_at: null,
  return_reason: 'Wrong agent',
  count_decision: null,
  decision_note: null,
  passport: {
    id: 3,
    entry_no: 3,
    passport_name: 'HELLO',
    passport_number: 'A1',
    bucket: 'not_started',
  },
  can: { approve: false },
}

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

describe('Agent Approvals: Export CSV', () => {
  it('exports the tab that is open (Waiting for approval, then Returned)', async () => {
    vi.mocked(listAgentApprovals).mockResolvedValue({
      data: [ROW],
      meta: { current_page: 1, last_page: 1, per_page: 200, total: 1, from: 1, to: 1 },
    } as never)
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: AgentApprovalsView },
        { path: '/p/:id', name: 'passport-detail', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[data-export]').trigger('click')
    await flushPromises()
    expect(downloadAgentApprovalsCsv).toHaveBeenLastCalledWith('pending', undefined)

    await wrapper.get('[data-tab="returned"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-export]').trigger('click')
    await flushPromises()
    expect(downloadAgentApprovalsCsv).toHaveBeenLastCalledWith('returned', undefined)
  })

  it('pages the list like the other lists: Showing, Rows per page, Previous / Next', async () => {
    vi.mocked(listAgentApprovals).mockResolvedValue({
      data: [ROW],
      meta: { current_page: 1, last_page: 3, per_page: 15, total: 31, from: 1, to: 15 },
    } as never)
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: AgentApprovalsView },
        { path: '/p/:id', name: 'passport-detail', component: { template: '<div />' } },
      ],
    })
    await router.push('/?tab=returned')
    wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    expect(listAgentApprovals).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'returned', page: 1, per_page: 15 }),
    )
    const pager = wrapper.get('[data-pager]')
    expect(pager.text()).toContain('Showing 1–15 of 31')
    expect(pager.text()).toContain('Page 1 of 3')
    expect(pager.find('select').exists()).toBe(true)

    await pager
      .findAll('a')
      .find((a) => a.text() === 'Next')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'returned', page: '2' })
    expect(listAgentApprovals).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'returned', page: 2 }),
    )
  })

  it('approves reference-wise: pick a reference, then Approve all of it', async () => {
    vi.mocked(listAgentApprovals).mockResolvedValue({
      data: [{ ...ROW, status: 'pending', can: { approve: true } }],
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 1, from: 1, to: 1 },
    } as never)
    vi.mocked(listPendingReferences).mockResolvedValue([
      { id: 4, name: 'Shamim Ahmed', code: 'PT-0004', pending: 3 },
      { id: 5, name: 'Abdul Halim', code: 'PT-0005', pending: 1 },
    ])
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: AgentApprovalsView },
        { path: '/p/:id', name: 'passport-detail', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    const select = wrapper.get('[data-reference-filter] select')
    expect(select.findAll('option').map((o) => o.text())).toContain('Shamim Ahmed (3)')
    expect(wrapper.find('[data-approve-reference]').exists()).toBe(false)

    await select.setValue('4')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ reference: '4' })
    expect(listAgentApprovals).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'pending', reference_id: 4 }),
    )

    const approveAll = wrapper.get('[data-approve-reference]')
    expect(approveAll.text()).toBe('Approve all of Shamim Ahmed (3)')
    await approveAll.trigger('click')
    await flushPromises()
    expect(approveReference).toHaveBeenCalledWith(4)
  })
})
