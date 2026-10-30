import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AreaDashboardView from '../AreaDashboardView.vue'
import type { CompanyCounts } from '@/types/report'

const SUMMARY: CompanyCounts = {
  total: 3,
  not_started: 0,
  medical_pending: 0,
  medical_fit: 3,
  medical_unfit: 0,
  calling_done: 3,
  visa_done: 3,
  bmet_done: 3,
  flight_done: 3,
  in_process: 0,
  returned: 0,
}

vi.mock('@/api/reports', () => ({ fetchReportSummary: vi.fn(async () => SUMMARY) }))

let wrapper: VueWrapper

afterEach(() => {
  wrapper?.unmount()
  vi.clearAllMocks()
})

async function mountDashboard() {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/staff/accounts', component: AreaDashboardView, meta: { area: 'accounts' } }],
  })
  await router.push('/staff/accounts')
  wrapper = mount(AreaDashboardView, { global: { plugins: [router] } })
  await flushPromises()
}

describe('AreaDashboardView', () => {
  it('shows the passport summary as coloured cards, in the company report order', async () => {
    await mountDashboard()

    // No welcome / role area box: the cards are the whole page.
    expect(wrapper.text()).not.toContain('Welcome')
    expect(wrapper.find('.glass-card').exists()).toBe(false)

    const cards = wrapper.findAll('[data-summary] > div')
    expect(cards.map((c) => [c.get('dt').text(), c.get('dd').text()])).toEqual([
      ['Total', '3'],
      ['Not started', '0'],
      ['Medical pending', '0'],
      ['Medical fit', '3'],
      ['Unfit', '0'],
      ['Calling', '3'],
      ['Visa', '3'],
      ['BMET', '3'],
      ['Flight done', '3'],
      ['In process', '0'],
      ['Returned', '0'],
    ])
    expect(wrapper.get('[data-card="medical_fit"]').classes()).toContain('bg-green-50')
    expect(wrapper.get('[data-card="medical_unfit"]').classes()).toContain('bg-red-50')
  })

  it('shows an error with a retry when the summary cannot load', async () => {
    const { fetchReportSummary } = await import('@/api/reports')
    vi.mocked(fetchReportSummary).mockRejectedValueOnce(new Error('boom'))
    await mountDashboard()

    expect(wrapper.text()).toContain('Try again')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Try again')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-card="total"] dd').text()).toBe('3')
  })
})
