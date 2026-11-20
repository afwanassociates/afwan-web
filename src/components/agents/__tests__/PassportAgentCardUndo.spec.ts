import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PassportAgentCard from '../PassportAgentCard.vue'
import { undoAgentApproval } from '@/api/agents'
import { makePassport } from '@/test/helpers'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/agents', () => ({
  listAgentAssignments: vi.fn(async () => []),
  undoAgentApproval: vi.fn(),
  assignAgent: vi.fn(),
  searchAgents: vi.fn(async () => []),
}))

const AGENT = {
  id: 5,
  code: 'AG-005',
  name: 'Karim Overseas',
  rl_number: 'RL-1001',
  is_own: false,
  assigned_date: '2026-04-01',
}

let wrapper: VueWrapper

function mountCard(canUndo: boolean) {
  const passport = makePassport({
    agent_status: 'approved',
    recruitment_agent: AGENT,
    can: { undo_agent_approval: canUndo },
  } as Partial<PassportEntry>)
  wrapper = mount(PassportAgentCard, { props: { passport }, attachTo: document.body })
  return passport
}

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('PassportAgentCard: Undo approval (Operations Head)', () => {
  it('asks first, then undoes the approval and reloads the passport', async () => {
    vi.mocked(undoAgentApproval).mockResolvedValue({} as never)
    const passport = mountCard(true)
    await flushPromises()

    await wrapper.get('[data-undo-agent-approval]').trigger('click')
    await flushPromises()
    const confirm = [...document.body.querySelectorAll('button')].find(
      (b) =>
        b.textContent?.trim() === 'Undo approval' && !b.hasAttribute('data-undo-agent-approval'),
    )!
    confirm.click()
    await flushPromises()

    expect(undoAgentApproval).toHaveBeenCalledWith(passport.id)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('has no Undo approval button without the right', async () => {
    mountCard(false)
    await flushPromises()
    expect(wrapper.find('[data-undo-agent-approval]').exists()).toBe(false)
  })
})
