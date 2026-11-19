import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AssignAgentDialog from '../AssignAgentDialog.vue'
import { assignAgent } from '@/api/agents'
import { businessToday } from '@/lib/dates'
import { makePassport } from '@/test/helpers'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/agents', () => ({ assignAgent: vi.fn(), searchAgents: vi.fn(async () => []) }))

const AGENT = { id: 5, code: 'AG-005', name: 'Karim Overseas', rl_number: 'RL-1001' }

/** Stand-in for the search dropdown: one button that picks AGENT. */
const SearchSelectStub = {
  props: ['modelValue', 'error'],
  emits: ['update:modelValue'],
  template:
    '<div><button type="button" data-pick @click="$emit(\'update:modelValue\', agent)">pick</button><p v-if="error" data-error>{{ error }}</p></div>',
  data: () => ({ agent: AGENT }),
}

let wrapper: VueWrapper

async function mountDialog(passport: PassportEntry) {
  wrapper = mount(AssignAgentDialog, {
    props: { open: false, passport },
    attachTo: document.body,
    global: { stubs: { SearchSelect: SearchSelectStub } },
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('AssignAgentDialog', () => {
  it('needs an agent, then sends the assignment for approval with today as the date', async () => {
    vi.mocked(assignAgent).mockResolvedValue({} as never)
    await mountDialog(makePassport({ id: 9, recruitment_agent: null, agent_status: 'none' }))

    expect(wrapper.text()).toContain('Assign recruitment agent')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(assignAgent).not.toHaveBeenCalled()
    expect(wrapper.get('[data-error]').text()).toContain('Choose the recruitment agent')

    await wrapper.get('[data-pick]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(assignAgent).toHaveBeenCalledWith(9, {
      recruitment_agent_id: 5,
      assigned_date: businessToday(),
      remark: null,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('asks for a reason when changing the agent', async () => {
    await mountDialog(
      makePassport({
        recruitment_agent: { ...AGENT, id: 1, name: 'Old Agent', assigned_date: '2026-01-01' },
        agent_status: 'approved',
      }),
    )

    expect(wrapper.text()).toContain('Change recruitment agent')
    expect(wrapper.text()).toContain('Old Agent')
    await wrapper.get('[data-pick]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(assignAgent).not.toHaveBeenCalled()
    expect(wrapper.get('[data-field="remark"]').text()).toContain('reason for changing')
  })

  it('opens a returned assignment pre-filled, with the reason it was returned', async () => {
    await mountDialog(
      makePassport({
        agent_status: 'returned',
        agent_return: {
          id: 3,
          recruitment_agent_id: 5,
          assigned_date: '2026-04-01',
          remark: 'first try',
          reason: 'Wrong date',
        },
      }),
    )

    expect(wrapper.get('[data-return-reason]').text()).toContain('Wrong date')
    expect(wrapper.get<HTMLInputElement>('[data-field="assigned_date"] input').element.value).toBe(
      '2026-04-01',
    )
  })
})
