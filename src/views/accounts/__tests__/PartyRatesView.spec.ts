import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PartyRatesView from '../PartyRatesView.vue'
import { fetchPassportRates, saveCompanyRate, saveReferenceRate } from '@/api/accounts'
import { fetchCompanyReport, fetchReportReferences } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import type { PassportRates } from '@/types/accounts'
import type { CompanyReport } from '@/types/report'

vi.mock('@/api/accounts', () => ({
  fetchPassportRates: vi.fn(),
  saveCompanyRate: vi.fn(),
  saveReferenceRate: vi.fn(),
}))
vi.mock('@/api/reports', () => ({ fetchCompanyReport: vi.fn(), fetchReportReferences: vi.fn() }))

const company = (id: number, name: string, rate: number | null, noPrice = 0) => ({
  id,
  name,
  country_code: 'MY',
  is_active: true,
  rate,
  passports: 3,
  no_price: noPrice,
})

const RATES: PassportRates = {
  companies: [company(2, 'Top Glove', 45000), company(1, 'IOI Corporation', null, 3)],
  references: [
    {
      reference: { id: 7, code: 'PT-0003', name: 'Abdul Malek' },
      company: { id: 2, name: 'Top Glove', country_code: 'MY' },
      rate: 40000,
      company_rate: 45000,
    },
  ],
}

let wrapper: VueWrapper
let router: Router
const body = () => document.body

async function mountView(path = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'accounts_head' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: PartyRatesView }],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

/** Types into a dropdown of the open dialog and picks the option containing `text`. */
async function choose(field: string, query: string, text: string) {
  const input = body().querySelector<HTMLInputElement>(`dialog[open] [${field}] input`)!
  input.value = query
  input.dispatchEvent(new Event('input'))
  await new Promise((resolve) => setTimeout(resolve, 350))
  await flushPromises()
  ;[...body().querySelectorAll<HTMLElement>('[role="option"]')]
    .find((o) => o.textContent?.includes(text))!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await flushPromises()
}

function typePrice(value: string) {
  const price = body().querySelector<HTMLInputElement>('dialog[open] [data-price-input]')!
  price.value = value
  price.dispatchEvent(new Event('input'))
}
const clickDialog = (action: string) =>
  body().querySelector<HTMLButtonElement>(`dialog[open] [data-action="${action}"]`)!.click()

beforeEach(() => {
  vi.mocked(fetchPassportRates).mockResolvedValue(RATES)
  vi.mocked(saveCompanyRate).mockResolvedValue({ filled: 3, updated: 0, kept: 0 })
  vi.mocked(saveReferenceRate).mockResolvedValue({ filled: 0, updated: 0, kept: 0 })
  vi.mocked(fetchReportReferences).mockResolvedValue([
    { id: 8, name: 'Karim Travels', type: 'agency', type_label: 'Agency' },
  ])
  vi.mocked(fetchCompanyReport).mockResolvedValue({
    data: [{ id: 1, name: 'IOI Corporation', country_code: 'MY' }],
  } as unknown as CompanyReport)
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('PartyRatesView', () => {
  it('opens on the party rates tab and switches tabs in the URL', async () => {
    await mountView()
    expect(wrapper.get('[data-tab="party"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-tab="party"]').text()).toContain('1')
    expect(wrapper.find('[data-panel="standard"]').exists()).toBe(false)
    expect(wrapper.get('[data-unpriced]').text()).toContain('3 passports have no price yet')

    const row = wrapper.get('[data-party-rate="7-2"]')
    expect(row.text()).toContain('Abdul Malek')
    expect(row.text()).toContain('40,000.00')
    expect(row.get('[data-difference]').text()).toBe('5,000.00 less')

    await wrapper.get('[data-tab="standard"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'standard' })
    expect(wrapper.find('[data-panel="party"]').exists()).toBe(false)
    expect(wrapper.get('[data-standard-summary]').text()).toBe(
      '1 of 2 companies have a standard rate.',
    )
  })

  it('adds a party rate: choose the party and the company, type the rate', async () => {
    await mountView()
    await wrapper.get('[data-add-party-rate]').trigger('click')
    await flushPromises()

    typePrice('38000')
    clickDialog('save')
    await flushPromises()
    expect(body().textContent).toContain('Choose the party.')

    await choose('data-new-party', 'kar', 'Karim Travels')
    await choose('data-new-company', 'ioi', 'IOI Corporation')
    clickDialog('save')
    await flushPromises()
    expect(saveReferenceRate).toHaveBeenCalledWith(8, 1, 38000, false)
    expect(fetchPassportRates).toHaveBeenCalledTimes(2)
  })

  it('edits or removes a party rate from its row', async () => {
    await mountView()
    await wrapper.get('[data-party-rate="7-2"] [data-edit-party-rate]').trigger('click')
    await flushPromises()
    expect(body().querySelector('dialog[open] [data-new-party]')).toBeNull()
    clickDialog('remove')
    await flushPromises()
    expect(saveReferenceRate).toHaveBeenCalledWith(7, 2, null, false)
  })

  it('adds a standard rate and edits one on the standard rates tab', async () => {
    await mountView('/?tab=standard')
    expect(wrapper.get('[data-company="1"] [data-standard-rate]').text()).toBe('Not set')

    await wrapper.get('[data-add-standard-rate]').trigger('click')
    await flushPromises()
    await choose('data-new-company', 'ioi', 'IOI Corporation')
    typePrice('45000')
    clickDialog('save')
    await flushPromises()
    expect(saveCompanyRate).toHaveBeenCalledWith(1, 45000, false)

    await wrapper.get('[data-company="2"] [data-edit-standard-rate]').trigger('click')
    await flushPromises()
    expect(body().querySelector<HTMLInputElement>('dialog[open] [data-price-input]')!.value).toBe(
      '45000',
    )
    clickDialog('remove')
    await flushPromises()
    expect(saveCompanyRate).toHaveBeenCalledWith(2, null, false)
  })
})
