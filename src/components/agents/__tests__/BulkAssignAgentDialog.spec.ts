import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BulkAssignAgentDialog from '../BulkAssignAgentDialog.vue'
import { bulkAssignAgent } from '@/api/agents'
import { listPassports } from '@/api/passports'
import { makePassport } from '@/test/helpers'
import type { Paginated } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/agents', () => ({
  bulkAssignAgent: vi.fn(async () => ({ updated: [], skipped: [] })),
  searchAgents: vi.fn(async () => []),
}))
vi.mock('@/api/passports', () => ({ listPassports: vi.fn() }))
vi.mock('@/api/references', () => ({
  searchReferences: vi.fn(async () => [{ id: 4, code: 'PT-0004', name: 'Shamim Ahmed' }]),
}))

const page = (ids: number[]): Paginated<PassportEntry> => ({
  data: ids.map((id) => makePassport({ id, passport_number: `P${id}` })),
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: 100,
    total: ids.length,
    from: 1,
    to: ids.length,
  },
})

let wrapper: VueWrapper
afterEach(() => {
  wrapper?.unmount()
  vi.clearAllMocks()
})

describe('BulkAssignAgentDialog: reference-wise', () => {
  it('choosing a reference lists and ticks all of its passports without an agent', async () => {
    vi.mocked(listPassports)
      .mockResolvedValueOnce(page([1, 2, 3]))
      .mockResolvedValue(page([1, 2]))
    wrapper = mount(BulkAssignAgentDialog, { props: { open: false }, attachTo: document.body })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(document.body.textContent).toContain('0 ticked')

    const input = document.body.querySelector<HTMLInputElement>('[data-field="reference"] input')!
    input.dispatchEvent(new Event('click'))
    input.dispatchEvent(new Event('focus'))
    await flushPromises()
    const option = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent?.includes('Shamim Ahmed'),
    )!
    option.dispatchEvent(new Event('mousedown'))
    await flushPromises()

    expect(listPassports).toHaveBeenLastCalledWith(
      expect.objectContaining({ reference_id: 4, agent_status: 'none', per_page: 300 }),
    )
    expect(document.body.textContent).toContain('2 ticked')
    expect(bulkAssignAgent).not.toHaveBeenCalled()
  })
})
