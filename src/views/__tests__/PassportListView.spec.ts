import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PassportListView from '../PassportListView.vue'
import { listPassports } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser, notStartedPassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { PassportEntry, PassportFilters } from '@/types/passport'

vi.mock('@/api/passports', () => ({ listPassports: vi.fn(), deletePassport: vi.fn() }))
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
  can: { update: true, delete: true, record_medical: true },
})

let wrapper: VueWrapper
let router: Router

async function mountList(path = '/passports') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'admin' })
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
    it('has only the three searches: no reference type, company, country, stage or date filters', async () => {
      await mountList()

      const labels = wrapper
        .get('[role="search"]')
        .findAll('label')
        .map((l) => l.text().trim())
      expect(labels).toEqual(['Search', 'Search reference', 'Search company'])
      const search = wrapper.get('[role="search"]')
      expect(search.find('select').exists()).toBe(false)
      expect(search.find('input[role="combobox"]').exists()).toBe(false)
      expect(search.find('input[type="date"]').exists()).toBe(false)
      expect(wrapper.text()).not.toMatch(/Reference type|Company country|Received date|All stages/)
    })

    it('sends ?reference= and ?company= together with the general search (debounced 300 ms)', async () => {
      vi.useFakeTimers()
      try {
        await mountList('/passports?q=karim')

        await wrapper.get('input[data-search-box="reference"]').setValue('green')
        await wrapper.get('input[data-search-box="company"]').setValue('Desert')
        await vi.advanceTimersByTimeAsync(200)
        expect(router.currentRoute.value.query).toEqual({ q: 'karim' })

        await vi.advanceTimersByTimeAsync(150)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({
          q: 'karim',
          reference: 'green',
          company: 'Desert',
        })
        expect(lastFilters()).toEqual(
          expect.objectContaining({
            q: 'karim',
            reference: 'green',
            company: 'Desert',
            stage: 'passport',
            page: 1,
          }),
        )
        // The removed filters' params are never sent.
        for (const key of [
          'reference_id',
          'reference_type',
          'company_id',
          'company_country_code',
          'received_from',
          'received_to',
        ])
          expect(lastFilters()).not.toHaveProperty(key)
      } finally {
        vi.useRealTimers()
      }
    })

    it('reads the searches from the URL, so refresh and shared links keep them', async () => {
      await mountList('/passports?reference=green&company=desert&q=NW50')

      expect(
        wrapper.get<HTMLInputElement>('input[data-search-box="reference"]').element.value,
      ).toBe('green')
      expect(wrapper.get<HTMLInputElement>('input[data-search-box="company"]').element.value).toBe(
        'desert',
      )
      expect(wrapper.get<HTMLInputElement>('input[data-search]').element.value).toBe('NW50')
      expect(lastFilters()).toEqual(
        expect.objectContaining({ reference: 'green', company: 'desert', q: 'NW50' }),
      )
    })

    it.each(['reference', 'company'])(
      'clears the %s search with its (x) button only',
      async (key) => {
        await mountList('/passports?reference=green&company=desert&q=karim&page=2')

        const clear = wrapper.get(`button[data-clear="${key}"]`)
        expect(clear.text()).toBe(`Clear search ${key}`)
        await clear.trigger('click')
        await flushPromises()

        const expected: Record<string, string> = {
          q: 'karim',
          reference: 'green',
          company: 'desert',
        }
        delete expected[key]
        expect(router.currentRoute.value.query).toEqual(expected)
      },
    )

    it('drops the old filter and stage parameters from the URL', async () => {
      await mountList(
        '/passports?stage=bmet&reference_type=agency&company_id=3&company_country_code=MY&received_from=2026-01-01&q=karim',
      )
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ q: 'karim' })
      expect(lastFilters()).toEqual(expect.objectContaining({ stage: 'passport', q: 'karim' }))
    })

    it('mentions the reference and company searches when nothing matches', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([]))
      await mountList('/passports?company=nobody')

      const empty = wrapper.get('[data-empty]').text()
      expect(empty).toContain('No passports match these searches.')
      expect(empty).toContain('reference and company searches')
    })
  })

  describe('columns', () => {
    it('shows Passport name and Passport number as two columns, and no Medical column', async () => {
      await mountList()

      const headers = wrapper.findAll('thead th').map((th) => th.text().trim())
      expect(headers).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Received',
        'Stage',
        'Entered by',
        'Actions',
      ])
      expect(headers).not.toContain('Medical')
      const row = wrapper.get('tr[data-row]')
      expect(row.get('[data-cell="passport_name"]').text()).toBe('KARIM UDDIN')
      expect(row.get('[data-cell="passport_number"]').text()).toBe('NW5000001')
      expect(row.find('[data-status]').exists()).toBe(false) // no medical status badge
    })

    it('the Stage column always shows "Passport entered"', async () => {
      vi.mocked(listPassports).mockResolvedValue(
        page([
          ENTERED,
          // Even an unexpected row shows the same fixed badge: there are no other stage values here.
          makePassport({ id: 51, current_stage: 'visa', stage_status: 'in_process' }),
        ]),
      )
      await mountList()

      const badges = wrapper.findAll('tr[data-row] [data-stage-badge]').map((b) => b.text())
      expect(badges).toEqual(['Passport entered', 'Passport entered'])
    })

    it('keeps the row actions: Add medical slip, Edit and Delete', async () => {
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
      expect(actions).toEqual(expect.arrayContaining(['Add medical slip', 'Edit', 'Delete']))
    })
  })

  it('keeps the Add passport button and has no top step bar', async () => {
    await mountList()

    expect(wrapper.find('a[href="/passports/new"]').text()).toContain('Add passport')
    expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(false)
  })
})
