import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MedicalSlipModal from '@/components/MedicalSlipModal.vue'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser, notStartedPassport } from '@/test/helpers'
import type { AgentStatus } from '@/types/agents'

vi.mock('@/api/medical', () => ({ updateMedicalSlip: vi.fn() }))
vi.mock('@/api/medicalCenters', () => ({
  searchMedicalCenters: vi.fn(async () => []),
  createMedicalCenter: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => null),
}))

let wrapper: VueWrapper

async function mountModal(status: AgentStatus, slipDate: string | null = null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'data_entry' })
  const passport = makePassport({
    ...notStartedPassport(),
    agent_status: status,
    medical_slip: { date: slipDate, medical_center: null },
  })
  wrapper = mount(MedicalSlipModal, {
    props: { open: false, passport },
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

afterEach(() => wrapper.unmount())

describe('Medical slip needs an approved recruitment agent', () => {
  it.each([
    ['none', 'Assign a recruitment agent first'],
    ['returned', 'Assign a recruitment agent first'],
    ['pending', 'Recruitment agent not approved yet'],
  ] as const)('blocks a new slip while the agent is %s', async (status, text) => {
    await mountModal(status)

    expect(wrapper.get('[data-agent-block]').text()).toContain(text)
    expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeDefined()
  })

  it('allows the slip once the agent is approved', async () => {
    await mountModal('approved')

    expect(wrapper.find('[data-agent-block]').exists()).toBe(false)
    expect(wrapper.get('[data-action="save"]').attributes('disabled')).toBeUndefined()
  })

  it('still allows editing a slip saved before agents existed', async () => {
    await mountModal('none', '2026-04-15')

    expect(wrapper.find('[data-agent-block]').exists()).toBe(false)
  })
})
