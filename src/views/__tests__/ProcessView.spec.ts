import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ProcessView from '../ProcessView.vue'
import { listPassports } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG, WORKFLOW_SUMMARY } from '@/test/workflowFixtures'
import type { PassportEntry, PassportFilters } from '@/types/passport'

vi.mock('@/api/passports', () => ({ listPassports: vi.fn(), getPassport: vi.fn() }))
vi.mock('@/api/steps', () => ({ recordStep: vi.fn(), updateStepRecord: vi.fn() }))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => WORKFLOW_SUMMARY),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))

const atCalling = (id: number, stage_status: string, name: string): PassportEntry =>
  makePassport({ id, passport_name: name, current_stage: 'calling', stage_status })

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

let wrapper: VueWrapper
let router: Router

async function mountProcess(path = '/process') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'data_entry' })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/process', name: 'process', component: ProcessView },
      { path: '/passports', name: 'passports', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

const lastFilters = (): PassportFilters | undefined => {
  const calls = vi.mocked(listPassports).mock.calls
  return calls[calls.length - 1]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPassports).mockResolvedValue(
    page([
      atCalling(1, 'waiting', 'WAITING ONE'),
      atCalling(2, 'in_process', 'APPLIED TWO'),
      atCalling(3, 'rejected', 'REJECTED THREE'),
    ]),
  )
})
afterEach(() => wrapper.unmount())

describe('Process page', () => {
  it('shows the step bar and one tab per step from the config, plus Completed', async () => {
    await mountProcess()

    expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(true)
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text().replace(/\s*\d+$/, ''))).toEqual([
      'Calling / Work Permit',
      'Visa',
      'BMET Clearance',
      'Flight',
      'Completed',
    ])
    expect(tabs.map((t) => t.get('[data-tab-count]').text())).toEqual(['6', '4', '2', '1', '9'])
  })

  it('lists the first step by default with all its statuses', async () => {
    await mountProcess()

    expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'calling', page: 1 }))
    expect(lastFilters()?.stage_status).toBeUndefined()
  })

  it('a sub-filter chip sends its stage_status and goes into the URL', async () => {
    await mountProcess()

    await wrapper.get('[data-sub="in_process"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ status: 'in_process' })
    expect(lastFilters()).toEqual(
      expect.objectContaining({ stage: 'calling', stage_status: 'in_process' }),
    )
    expect(wrapper.get('[data-sub="in_process"]').attributes('aria-pressed')).toBe('true')
  })

  it('switching tab sends the new stage and clears the sub-filter', async () => {
    await mountProcess('/process?status=rejected')

    await wrapper.get('#process-tab-visa').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ tab: 'visa' })
    expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'visa' }))
    expect(lastFilters()?.stage_status).toBeUndefined()
  })

  it('the Completed tab asks for completed passports, without sub-filters or actions', async () => {
    await mountProcess('/process?tab=completed')

    expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'completed' }))
    expect(wrapper.find('[data-sub]').exists()).toBe(false)
    expect(wrapper.find('[data-action]').exists()).toBe(false)
  })

  it('labels the row button by the status at the step', async () => {
    await mountProcess()

    const action = (name: string) =>
      wrapper
        .findAll('tr[data-row]')
        .find((r) => r.text().includes(name))!
        .get('[data-action]')
        .attributes('data-action')
    expect(action('WAITING ONE')).toBe('Record')
    expect(action('APPLIED TWO')).toBe('Update status')
    expect(action('REJECTED THREE')).toBe('Record again')
  })
})
