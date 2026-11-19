import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AgentFormDialog from '../AgentFormDialog.vue'
import AgentSelect from '../AgentSelect.vue'
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

describe('AgentSelect', () => {
  it('lists All agents, Own, the partners and No agent with counts, and picks one', async () => {
    wrapper = mount(AgentSelect, { props: { modelValue: null, counts: COUNTS } })

    const options = wrapper.findAll('option').map((o) => o.text())
    expect(options).toEqual([
      'All agents (7)',
      'Afwan (3)',
      'Karim (2)',
      '⚠ No agent (2)',
    ])

    await wrapper.get('select').setValue('2')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2])
    await wrapper.get('select').setValue('none')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['none'])
    await wrapper.get('select').setValue('')
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([null])
  })
})
