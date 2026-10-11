import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import MedicalView from '../MedicalView.vue'
import { listPassports } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { PassportEntry, PassportFilters } from '@/types/passport'

vi.mock('@/api/passports', () => ({ listPassports: vi.fn(), getPassport: vi.fn() }))
vi.mock('@/api/medical', () => ({
  recordMedicalResult: vi.fn(),
  updateMedicalDate: vi.fn(),
  updateMedicalSlip: vi.fn(),
}))
vi.mock('@/api/medicalCenters', () => ({
  searchMedicalCenters: vi.fn(async () => []),
  createMedicalCenter: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [
      { key: 'passport', label: 'Passport', enabled: true, order: 1 },
      { key: 'medical', label: 'Medical', enabled: true, order: 2 },
      { key: 'flight', label: 'Flight', enabled: true, order: 6 },
    ],
    stages: { passport: { total: 1, not_started: 1 }, medical: { total: 3, pending: 2, unfit: 1 } },
    step1: { total_all: 5, total_active: 4, incomplete: 0 },
    step2: { not_started: 1, pending: 2, fit: 1, expiring_soon: 0, expired: 0, unfit: 1 },
    step3: { enabled: false, ready: 0 },
    completed: 3,
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

const CENTER = { id: 2, name: 'Gulf Medical Center' }
const PENDING = makePassport({
  id: 60,
  medical_slip: { date: '2026-10-01', medical_center: CENTER },
  medical_center: CENTER,
})
const NO_CENTER = makePassport({
  id: 61,
  medical_slip: { date: '2026-10-02', medical_center: null },
  medical_center: null,
})

const TABS = ['pending', 'fit', 'expiring_soon', 'expired', 'unfit'] as const

let wrapper: VueWrapper
let router: Router

async function mountMedical(path = '/medical') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'data_entry' })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/medical', name: 'medical', component: MedicalView },
      { path: '/passports', name: 'passports', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/process', name: 'process', component: Empty },
      { path: '/:step', name: 'step-page', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

const lastFilters = (): PassportFilters => {
  const calls = vi.mocked(listPassports).mock.calls
  return calls[calls.length - 1]![0]
}
const headers = () => wrapper.findAll('thead th').map((th) => th.text().trim())

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPassports).mockResolvedValue(page([PENDING, NO_CENTER]))
})
afterEach(() => wrapper.unmount())

describe('Medical page', () => {
  it('shows no scan copy UI (lists only ever get has_scan)', async () => {
    await mountMedical()

    expect(wrapper.find('[data-scan-card]').exists()).toBe(false)
    expect(wrapper.find('tbody img, tbody object').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/scan copy/i)
  })

  it('shows the config-driven step bar with counts, but no "Completed" and no per-row stepper', async () => {
    await mountMedical()

    const bar = wrapper.get('nav[aria-label="Workflow steps"]')
    expect(bar.find('[data-step="passport"]').exists()).toBe(true)
    expect(
      bar.find('[data-step="medical"] [aria-current="step"]').exists() ||
        bar.find('[aria-current="step"]').exists(),
    ).toBe(true)
    expect(bar.find('[data-step="completed"]').exists()).toBe(false)
    expect(bar.find('[data-completed]').exists()).toBe(false)
    expect(bar.text()).not.toContain('Completed')
    expect(wrapper.find('tbody [data-mode="compact"]').exists()).toBe(false)
    expect(wrapper.find('tbody [data-state]').exists()).toBe(false)
  })

  it('has no Company dropdown, Company country filter or Sort by, only the three searches', async () => {
    await mountMedical()

    const search = wrapper.get('[role="search"]')
    expect(search.findAll('label').map((l) => l.text().trim())).toEqual([
      'Search',
      'Search company',
      'Search reference',
    ])
    expect(search.find('select').exists()).toBe(false)
    expect(search.find('input[role="combobox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Company country|Sort by|Any company|All countries/)
  })

  it('keeps the five tabs', async () => {
    await mountMedical()

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(5)
  })

  it('asks for the tab in medical mode, with no sort (the API orders it)', async () => {
    await mountMedical('/medical?tab=unfit')

    const filters = lastFilters()
    expect(filters).toEqual(
      expect.objectContaining({ mode: 'medical', medical_status: 'unfit', page: 1 }),
    )
    expect(filters.sort).toBeUndefined()
    expect(filters.direction).toBeUndefined()
    expect(filters).not.toHaveProperty('company_id')
    expect(filters).not.toHaveProperty('company_country_code')
  })

  describe('company and reference searches', () => {
    it('send ?company= and ?reference= with the general search and the tab (debounced)', async () => {
      vi.useFakeTimers()
      try {
        await mountMedical('/medical?tab=fit&q=rahim')

        await wrapper.get('input[data-search-box="company"]').setValue('Desert')
        await wrapper.get('input[data-search-box="reference"]').setValue('green')
        await vi.advanceTimersByTimeAsync(200)
        expect(router.currentRoute.value.query).toEqual({ tab: 'fit', q: 'rahim' })

        await vi.advanceTimersByTimeAsync(150)
        await flushPromises()
        expect(router.currentRoute.value.query).toEqual({
          tab: 'fit',
          q: 'rahim',
          company: 'Desert',
          reference: 'green',
        })
        expect(lastFilters()).toEqual(
          expect.objectContaining({
            mode: 'medical',
            medical_status: 'fit',
            q: 'rahim',
            company: 'Desert',
            reference: 'green',
          }),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('are read from the URL and kept when switching tabs', async () => {
      await mountMedical('/medical?company=desert&reference=green')
      expect(wrapper.get<HTMLInputElement>('input[data-search-box="company"]').element.value).toBe(
        'desert',
      )

      await wrapper.get('#medical-tab-expired').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({
        tab: 'expired',
        company: 'desert',
        reference: 'green',
      })
      expect(lastFilters()).toEqual(
        expect.objectContaining({
          medical_status: 'expired',
          company: 'desert',
          reference: 'green',
        }),
      )
    })

    it.each(['company', 'reference'])('the %s (x) button clears only that search', async (key) => {
      await mountMedical('/medical?tab=unfit&company=desert&reference=green&q=rahim')

      await wrapper.get(`button[data-clear="${key}"]`).trigger('click')
      await flushPromises()

      const expected: Record<string, string> = {
        tab: 'unfit',
        q: 'rahim',
        company: 'desert',
        reference: 'green',
      }
      delete expected[key]
      expect(router.currentRoute.value.query).toEqual(expected)
    })

    it('drops the old sort and company dropdown parameters', async () => {
      await mountMedical('/medical?sort=valid_until:asc&company_id=3&company_country_code=MY&q=x')
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({ q: 'x' })
    })

    it('mentions company and reference in the empty state', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([]))
      await mountMedical('/medical?company=nobody')

      const empty = wrapper.get('[data-empty]').text()
      expect(empty).toContain('No passports match these searches.')
      expect(empty).toContain('company and reference searches')
    })
  })

  describe('columns', () => {
    it.each(TABS)(
      '%s: no Country or Waiting; Reference and Medical center present',
      async (tab) => {
        await mountMedical(tab === 'pending' ? '/medical' : `/medical?tab=${tab}`)

        expect(headers()).not.toContain('Country')
        expect(headers()).not.toContain('Waiting')
        expect(headers()).toContain('Reference')
        expect(headers()).toContain('Medical center')
      },
    )

    it('shows the medical center name, or "-" when there is none', async () => {
      await mountMedical()

      const rows = wrapper.findAll('tr[data-row]')
      expect(rows[0]!.text()).toContain('Gulf Medical Center')
      const cells = rows[1]!.findAll('td').map((td) => td.text())
      expect(cells[headers().indexOf('Medical center')]).toBe('-')
      expect(rows[0]!.text()).toContain('Star') // the reference
    })

    it('shows Passport name and Passport number as two columns, plus Medical date', async () => {
      await mountMedical()

      expect(headers().slice(0, 2)).toEqual(['Passport name', 'Passport number'])
      expect(headers()).toContain('Medical date')
      const row = wrapper.get('tr[data-row]')
      expect(row.get('[data-cell="passport_name"]').text()).toBe('MD RAHIM')
      expect(row.get('[data-cell="passport_number"]').text()).toBe('AB1234567')
    })

    it('Medical date shows DD-MM-YYYY on the result tabs, "-" when not entered', async () => {
      vi.mocked(listPassports).mockResolvedValue(
        page([
          makePassport({ id: 70, medical_status: 'fit', medical_date: '2026-09-15' }),
          makePassport({ id: 71, medical_status: 'fit', medical_date: null }),
        ]),
      )
      await mountMedical('/medical?tab=fit')

      const cells = wrapper.findAll('td[data-column="medical_date"]').map((td) => td.text())
      expect(cells).toEqual(['15-09-2026', '-'])
    })

    it.each(['fit', 'expiring_soon', 'expired', 'unfit'] as const)(
      '%s tab is read-only: no result or date actions',
      async (tab) => {
        await mountMedical(`/medical?tab=${tab}`)

        const row = wrapper.get('tr[data-row]')
        expect(row.find('button[data-result]').exists()).toBe(false)
        expect(row.find('[data-enter-medical-date]').exists()).toBe(false)
        expect(row.find('[data-edit-medical-date]').exists()).toBe(false)
        expect(row.find('[data-retest]').exists()).toBe(false)
      },
    )
  })

  it('keeps loading and error states', async () => {
    vi.mocked(listPassports).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 500, data: {} } }),
    )
    await mountMedical()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  describe('Pending: medical date, then Fit / Unfit', () => {
    const fitButton = () => wrapper.get<HTMLButtonElement>('tr[data-row] button[data-result="fit"]')
    const unfitButton = () =>
      wrapper.get<HTMLButtonElement>('tr[data-row] button[data-result="unfit"]')

    it('Fit and Unfit are disabled with a tooltip until the medical date exists', async () => {
      vi.mocked(listPassports).mockResolvedValue(page([PENDING]))
      await mountMedical()

      expect(fitButton().element.disabled).toBe(true)
      expect(unfitButton().element.disabled).toBe(true)
      expect(fitButton().element.parentElement!.getAttribute('title')).toBe(
        'Enter the medical date first',
      )
      expect(wrapper.get('tr[data-row]').text()).toContain('Enter medical date')
    })

    it('enters the date in an inline popover (not in the future), then enables Fit / Unfit', async () => {
      const { updateMedicalDate } = await import('@/api/medical')
      const today = (await import('@/lib/dates')).businessToday()
      const tomorrow = (await import('@/lib/dates')).addDays(today, 1)
      vi.mocked(listPassports).mockResolvedValue(page([PENDING]))
      vi.mocked(updateMedicalDate).mockResolvedValue({ ...PENDING, medical_date: '2026-10-05' })
      await mountMedical()

      await wrapper.get('button[data-enter-medical-date]').trigger('click')
      // Rendered at the end of <body>, so the scrolling table cannot clip it.
      const popoverEl = document.body.querySelector<HTMLFormElement>('[data-medical-date-popover]')
      expect(popoverEl).not.toBeNull()
      const popover = new DOMWrapper(popoverEl!)
      expect(popover.element.tagName).toBe('FORM') // inline, not a modal dialog
      expect(wrapper.find('dialog[open]').exists()).toBe(false)
      expect(popover.get('input[type="date"]').attributes('max')).toBe(today)

      // Required, and never in the future.
      await popover.trigger('submit')
      expect(popover.text()).toContain('Enter the medical date.')
      await popover.get('input').setValue(tomorrow)
      await popover.trigger('submit')
      expect(popover.text()).toContain('The medical date cannot be in the future.')
      expect(updateMedicalDate).not.toHaveBeenCalled()

      await popover.get('input').setValue('2026-10-05')
      await popover.trigger('submit')
      await flushPromises()

      expect(updateMedicalDate).toHaveBeenCalledWith(60, '2026-10-05')
      expect(document.body.querySelector('[data-medical-date-popover]')).toBeNull()
      const cell = wrapper.get('td[data-column="medical_date"]')
      expect(cell.get('[data-medical-date]').text()).toBe('05-10-2026')
      expect(cell.find('button[data-edit-medical-date]').exists()).toBe(true) // small edit icon
      expect(cell.find('button[data-enter-medical-date]').exists()).toBe(false)
      expect(fitButton().element.disabled).toBe(false)
      expect(unfitButton().element.disabled).toBe(false)
    })

    it.each([
      ['fit', 'FIT', 'Fit'],
      ['unfit', 'UNFIT', 'Unfit'],
    ] as const)(
      '%s: a tiny confirm dialog, then the row moves to the %s tab',
      async (result, word, tabLabel) => {
        const { recordMedicalResult } = await import('@/api/medical')
        const dated = { ...PENDING, medical_date: '2026-10-05' }
        const moved = { ...dated, medical_status: result }
        vi.mocked(listPassports).mockImplementation(async (f: PassportFilters) =>
          // Before: pending; after the result it is listed under its new tab only.
          vi.mocked(recordMedicalResult).mock.calls.length === 0
            ? f.medical_status === 'pending'
              ? page([dated])
              : page([])
            : f.medical_status === result
              ? page([moved])
              : page([]),
        )
        vi.mocked(recordMedicalResult).mockResolvedValue({} as never)
        await mountMedical()

        await wrapper.get(`tr[data-row] button[data-result="${result}"]`).trigger('click')
        const dialog = wrapper.get('dialog')
        expect(dialog.text()).toContain(`Mark MD RAHIM as ${word}?`)
        // Confirm and Cancel only, no other fields.
        expect(dialog.findAll('input, textarea, select')).toHaveLength(0)
        const buttons = dialog.findAll('button').map((b) => b.text())
        expect(buttons).toEqual(expect.arrayContaining(['Cancel', 'Confirm']))

        await dialog
          .findAll('button')
          .find((b) => b.text() === 'Confirm')!
          .trigger('click')
        await flushPromises()

        expect(recordMedicalResult).toHaveBeenCalledWith(60, result)
        // Gone from Pending…
        expect(wrapper.findAll('tr[data-row]')).toHaveLength(0)
        // …and listed in its new tab.
        await wrapper
          .findAll('[role="tab"]')
          .find((t) => t.text().startsWith(tabLabel))!
          .trigger('click')
        await flushPromises()
        expect(wrapper.findAll('tr[data-row]')).toHaveLength(1)
      },
    )

    it('Cancel closes the confirm dialog without saving', async () => {
      const { recordMedicalResult } = await import('@/api/medical')
      vi.mocked(listPassports).mockResolvedValue(page([{ ...PENDING, medical_date: '2026-10-05' }]))
      await mountMedical()

      await fitButton().trigger('click')
      await wrapper
        .get('dialog')
        .findAll('button')
        .find((b) => b.text() === 'Cancel')!
        .trigger('click')
      await flushPromises()

      expect(recordMedicalResult).not.toHaveBeenCalled()
      expect(wrapper.findAll('tr[data-row]')).toHaveLength(1)
    })

    it('keeps "Edit slip" on pending rows', async () => {
      await mountMedical()

      expect(wrapper.get('tr[data-row] button[data-edit-slip]').text()).toContain('Edit slip')
    })

    it('accounts is read-only: no action buttons', async () => {
      await mountMedical()
      useAuthStore().user = makeUser({ role: 'accounts' })
      await flushPromises()

      const row = wrapper.get('tr[data-row]')
      expect(row.findAll('button, a[href$="/edit"]')).toHaveLength(0)
    })
  })

  it('the old Record Medical Result modal no longer exists', () => {
    const components = import.meta.glob('../../components/*.vue')
    expect(Object.keys(components).some((path) => path.includes('RecordMedicalModal'))).toBe(false)
    expect(Object.keys(components).some((path) => path.includes('MedicalDateCell'))).toBe(true)
  })
})
