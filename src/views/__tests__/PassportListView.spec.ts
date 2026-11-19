import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportListView from '../PassportListView.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { listPassports } from '@/api/passports'
import { searchReferences } from '@/api/references'
import { fetchAgentTabCounts } from '@/api/agents'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser, notStartedPassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { PassportEntry, PassportFilters } from '@/types/passport'
import type { Role } from '@/types/auth'

vi.mock('@/api/passports', () => ({ listPassports: vi.fn(), returnPassport: vi.fn() }))
vi.mock('@/api/agents', () => ({
  assignAgent: vi.fn(),
  bulkAssignAgent: vi.fn(),
  searchAgents: vi.fn(async () => []),
  fetchAgentTabCounts: vi.fn(async () => ({
    none: 4,
    approved: 3,
    agents: [
      {
        id: 5,
        code: 'AG-005',
        name: 'Karim Overseas',
        rl_number: 'RL-1',
        is_active: true,
        count: 0,
      },
      { id: 6, code: 'AG-006', name: 'Uttara Link', rl_number: 'RL-2', is_active: true, count: 3 },
    ],
  })),
}))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))
vi.mock('@/api/medical', () => ({ updateMedicalSlip: vi.fn() }))
vi.mock('@/api/medicalCenters', () => ({
  searchMedicalCenters: vi.fn(async () => []),
  createMedicalCenter: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [],
    step1: { total_all: 4, total_active: 3, incomplete: 0 },
    step2: { not_started: 2, pending: 1, fit: 0, expiring_soon: 0, expired: 0, unfit: 1 },
    step3: { enabled: false, ready: 0 },
  })),
}))

const page = (data: PassportEntry[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: data.length,
    from: 1,
    to: data.length,
  },
})

const ENTERED = makePassport({
  id: 50,
  passport_name: 'KARIM UDDIN',
  passport_number: 'NW5000001',
  ...notStartedPassport(),
  can: { update: true, record_medical: true, return: true, undo_return: false },
})

let wrapper: VueWrapper
let router: Router

async function mountList(path = '/passports', role: Role = 'admin') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports', name: 'passports', component: PassportListView },
      { path: '/passports/new', name: 'passport-new', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/all-passports', name: 'all-passports', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

/** Filters of the latest list request. */
const lastFilters = (): PassportFilters => {
  const calls = vi.mocked(listPassports).mock.calls
  return calls[calls.length - 1]![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPassports).mockResolvedValue(page([ENTERED]))
})
afterEach(() => wrapper.unmount())

describe('Passport List ("Passport entered" only)', () => {
  it('asks only for passports at the "Passport entered" stage', async () => {
    await mountList()

    expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'passport', page: 1 }))
  })

  describe('filters', () => {
    it('has the search, reference and company lookups and the received date range; no reference type, country or stage filters', async () => {
      await mountList()

      const labels = wrapper
        .get('[role="search"]')
        .findAll('label')
        .map((l) => l.text().trim())
      expect(labels).toEqual([
        'Search',
        'Filter by reference',
        'Filter by company',
        'Received from',
        'Received to',
      ])
      const search = wrapper.get('[role="search"]')
      expect(search.find('select').exists()).toBe(false)
      expect(search.findAll('input[type="date"]')).toHaveLength(2)
      expect(wrapper.text()).not.toMatch(/Reference type|Company country|All stages/)
    })

    describe('Filter by reference', () => {
      const SEA = { id: 8, type: 'agency', type_label: 'Agency', name: 'Sea Star' } as const
      const referenceFilter = () =>
        wrapper
          .findAllComponents(SearchSelect)
          .find((c) => (c.props() as Record<string, unknown>).label === 'Filter by reference')!

      it('is a searchable dropdown with "All references" (no reference text search)', async () => {
        await mountList()

        expect(wrapper.find('input[data-search-box="reference"]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Search reference')
        expect(referenceFilter().props()).toMatchObject({
          placeholder: 'Search reference…',
          noneLabel: 'All references',
          clearable: true,
        })
      })

      it('sends ?reference_id= with the general search; clearing removes it', async () => {
        await mountList('/passports?q=karim&page=2')

        referenceFilter().vm.$emit('update:modelValue', SEA)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({ q: 'karim', reference_id: '8' })
        expect(lastFilters()).toEqual(
          expect.objectContaining({ q: 'karim', reference_id: 8, stage: 'passport', page: 1 }),
        )

        referenceFilter().vm.$emit('update:modelValue', null)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({ q: 'karim' })
      })

      it('reads ?reference_id= from the URL and drops the old ?reference= text search', async () => {
        await mountList('/passports?reference_id=8&reference=green')
        await flushPromises()

        expect(router.currentRoute.value.query).toEqual({ reference_id: '8' })
        expect(lastFilters()).toEqual(expect.objectContaining({ reference_id: 8 }))
      })

      it('lists the references of the chosen company only', async () => {
        await mountList('/passports?company_id=3')

        await (referenceFilter().props() as { fetch: (q: string) => Promise<unknown> }).fetch('se')
        expect(searchReferences).toHaveBeenCalledWith({ q: 'se', company_id: 3 })
      })
    })

    it('drops the old filter and stage parameters from the URL, keeping the current ones', async () => {
      await mountList(
        '/passports?stage=bmet&reference_type=agency&company=desert&company_id=3&company_country_code=MY&received_from=2026-01-01&q=karim',
      )
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({
        q: 'karim',
        company_id: '3',
        received_from: '2026-01-01',
      })
      expect(lastFilters()).toEqual(
        expect.objectContaining({ stage: 'passport', q: 'karim', company_id: 3 }),
      )
      expect(lastFilters()).not.toHaveProperty('company')
    })

    it('mentions the reference, company and received date searches when nothing matches', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([]))
      await mountList('/passports?company_id=99')

      const empty = wrapper.get('[data-empty]').text()
      expect(empty).toContain('No passports match these searches.')
      expect(empty).toContain('reference, company and received date searches')
    })
  })

  describe('columns', () => {
    it('shows No. first, Passport name and Passport number as two columns, and no Medical column', async () => {
      await mountList()

      const headers = wrapper.findAll('thead th').map((th) => th.text().trim())
      expect(headers).toEqual([
        'No.',
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Received',
        'Recruitment Agent',
        'Entered by',
        'Actions',
      ])
      expect(headers).not.toContain('Medical')
      expect(headers).not.toContain('Stage')
      expect(wrapper.find('[data-stage-badge]').exists()).toBe(false)
      const row = wrapper.get('tr[data-row]')
      expect(row.get('[data-cell="passport_name"]').text()).toBe('KARIM UDDIN')
      expect(row.get('[data-cell="passport_number"]').text()).toBe('NW5000001')
      expect(row.find('[data-status]').exists()).toBe(false) // no medical status badge
      // No scan UI in the list (only has_scan exists on list items).
      expect(wrapper.find('[data-scan-card], img, object').exists()).toBe(false)
      expect(wrapper.text()).not.toMatch(/scan/i)
    })

    it('has the row actions Add medical slip, Edit and Return to owner (no Delete)', async () => {
      await mountList()

      const actions = wrapper
        .get('tr[data-row]')
        .findAll('a, button')
        .map((el) =>
          el
            .text()
            .replace(/\s+(for )?passport.*$/, '')
            .trim(),
        )
      expect(actions).toEqual(
        expect.arrayContaining(['Add medical slip', 'Edit', 'Return to owner']),
      )
      expect(actions).not.toContain('Delete')
    })
  })

  it('keeps the Add passport button and has no top step bar', async () => {
    await mountList()

    expect(wrapper.find('a[href="/passports/new"]').text()).toContain('Add passport')
    expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(false)
  })

  describe('Recruitment Agent', () => {
    const withAgent = (status: 'none' | 'pending' | 'returned' | 'approved') =>
      makePassport({
        ...ENTERED,
        agent_status: status,
        recruitment_agent:
          status === 'approved'
            ? {
                id: 5,
                code: 'AG-005',
                name: 'Karim Overseas',
                rl_number: 'RL-1',
                assigned_date: '2026-04-01',
              }
            : null,
        agent_pending:
          status === 'pending'
            ? {
                id: 8,
                agent: { id: 5, code: 'AG-005', name: 'Karim Overseas', rl_number: 'RL-1' },
                assigned_date: '2026-04-01',
                remark: null,
              }
            : null,
        can: { ...ENTERED.can, assign_agent: true },
      })

    it('offers "Assign agent" instead of the medical slip until the agent is approved', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([withAgent('none')]))
      await mountList('/passports', 'data_entry')

      expect(wrapper.find('[data-slip-action="50"]').exists()).toBe(false)
      expect(wrapper.get('[data-agent-action="50"]').text()).toContain('Assign agent')
      expect(wrapper.find('[data-bulk-agent]').exists()).toBe(true)
    })

    it('shows the waiting agent and no action while it waits for approval', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([withAgent('pending')]))
      await mountList('/passports', 'data_entry')

      expect(wrapper.find('[data-slip-action="50"]').exists()).toBe(false)
      expect(wrapper.find('[data-agent-action="50"]').exists()).toBe(false)
      expect(wrapper.get('[data-agent-cell]').text()).toContain('Waiting for approval')
    })

    it('offers the medical slip once the agent is approved', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([withAgent('approved')]))
      await mountList('/passports?tab=approved&agent=5', 'data_entry')

      expect(wrapper.get('[data-slip-action="50"]').text()).toContain('Add medical slip')
      expect(wrapper.find('[data-agent-action="50"]').exists()).toBe(false)
      // The agent is the tab: no agent column there.
      expect(wrapper.find('[data-agent-cell]').exists()).toBe(false)
    })

    it('hides the bulk assign button from the operations head', async () => {
      await mountList('/passports', 'operation_head')

      expect(wrapper.find('[data-bulk-agent]').exists()).toBe(false)
    })
  })

  describe('tabs: Waiting for Agent / Ready for Medical', () => {
    it('opens on Waiting for Agent with both counts, listing passports without an approved agent', async () => {
      await mountList('/passports', 'data_entry')

      expect(fetchAgentTabCounts).toHaveBeenCalledWith('passport')
      expect(wrapper.get('[data-tab="none"]').attributes('aria-selected')).toBe('true')
      expect(wrapper.get('[data-tab="none"] [data-tab-count]').text()).toBe('(4)')
      expect(wrapper.get('[data-tab="approved"] [data-tab-count]').text()).toBe('(3)')
      expect(lastFilters()).toEqual(
        expect.objectContaining({ stage: 'passport', recruitment_agent_id: 'none' }),
      )
      expect(wrapper.find('[data-agent-picker]').exists()).toBe(false)
    })

    it('Ready for Medical: the All agents dropdown, all approved passports first, then one agent', async () => {
      await mountList('/passports', 'data_entry')
      await wrapper.get('[data-tab="approved"]').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ tab: 'approved' })
      expect(lastFilters()).toEqual(
        expect.objectContaining({ stage: 'passport', agent_status: 'approved' }),
      )
      const select = wrapper.get('select[data-agent-filter]')
      expect(select.findAll('option').map((o) => o.text())).toContain('Uttara Link (3)')
      // No "No agent" option on this tab.
      expect(select.find('option[value="none"]').exists()).toBe(false)
      // Bulk assigning is for the Waiting for Agent tab.
      expect(wrapper.find('[data-bulk-agent]').exists()).toBe(false)

      await select.setValue('5')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ tab: 'approved', agent: '5' })
      expect(lastFilters()).toEqual(expect.objectContaining({ recruitment_agent_id: 5 }))
    })

    it('keeps the tab and agent when the searches are cleared', async () => {
      await mountList('/passports?tab=approved&agent=6&q=karim', 'data_entry')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Clear searches')!
        .trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ tab: 'approved', agent: '6' })
    })
  })
})
