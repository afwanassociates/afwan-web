import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AgentFormDialog from '../AgentFormDialog.vue'
import AgentFilterBar from '../AgentFilterBar.vue'
import { createAgent } from '@/api/agents'
import type { AgentTabCounts } from '@/types/agents'

vi.mock('@/api/agents', () => ({
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
}))

const COUNTS: AgentTabCounts = {
  none: 2,
  approved: 5,
  agents: [
    {
      id: 1,
      code: 'AG-001',
      name: 'Afwan',
      rl_number: 'RL-1',
      is_own: true,
      is_active: true,
      count: 3,
    },
    {
      id: 2,
      code: 'AG-002',
      name: 'Karim',
      rl_number: 'RL-2',
      is_own: false,
      is_active: true,
      count: 2,
    },
  ],
}

let wrapper: VueWrapper

afterEach(() => {
  wrapper?.unmount()
  vi.clearAllMocks()
})

describe('AgentFormDialog', () => {
  async function mountForm(ownExists: boolean) {
    wrapper = mount(AgentFormDialog, {
      props: { open: false, agent: null, ownExists },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
  }

  it('can add the Own agent (with its RL number) while there is none', async () => {
    vi.mocked(createAgent).mockResolvedValue({ id: 9, code: 'AG-009', name: 'Afwan' } as never)
    await mountForm(false)

    await wrapper.get('[data-field="name"] input').setValue('Afwan Associates')
    await wrapper.get('[data-field="rl_number"] input').setValue('rl-77')
    await wrapper.get('[data-input="is_own"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Afwan Associates', rl_number: 'RL-77', is_own: true }),
    )
  })

  it('has no Own option once the Own agent exists', async () => {
    await mountForm(true)
    expect(wrapper.find('[data-input="is_own"]').exists()).toBe(false)
  })
})

describe('AgentFilterBar', () => {
  it('shows All agents, Own first, each partner and No agent as cards, and picks one', async () => {
    wrapper = mount(AgentFilterBar, {
      props: {
        modelValue: null,
        counts: COUNTS,
        'onUpdate:modelValue': (v: number | 'none' | null) => wrapper.setProps({ modelValue: v }),
      },
    })

    const cards = wrapper.findAll('[data-agent]')
    expect(cards.map((c) => c.attributes('data-agent'))).toEqual(['all', '1', '2', 'none'])
    expect(cards[0]!.text()).toContain('(7)')
    expect(cards[1]!.text()).toContain('Own')
    expect(cards[1]!.text()).not.toContain('AG-001')
    expect(cards[3]!.text()).toContain('Blocked until an agent is approved')

    await cards[2]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2])
    expect(wrapper.get('[data-agent="2"]').attributes('aria-pressed')).toBe('true')
  })

  it('hides No agent when every passport has one', () => {
    wrapper = mount(AgentFilterBar, { props: { modelValue: null, counts: { ...COUNTS, none: 0 } } })
    expect(wrapper.find('[data-agent="none"]').exists()).toBe(false)
  })
})
