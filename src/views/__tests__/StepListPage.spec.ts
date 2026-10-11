import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import StepListPage from '../StepListPage.vue'
import { listStepPassports, recordStepResult, startStep } from '@/api/steps'
import { useToast } from '@/composables/useToast'
import { addDays, businessToday } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { StepListParams, StepListRow, StepListTab } from '@/types/workflow'

vi.mock('@/api/steps', () => ({
  listStepPassports: vi.fn(),
  startStep: vi.fn(),
  recordStepResult: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: WORKFLOW_CONFIG.steps.map(({ key, label, short_label, order, enabled }) => ({
      key,
      label,
      short_label,
      order,
      enabled,
    })),
    step1: { total_all: 9, total_active: 8, incomplete: 0 },
    step2: { not_started: 1, pending: 1, fit: 3, expiring_soon: 0, expired: 0, unfit: 1 },
    step3: { enabled: true, ready: 2 },
    stages: { calling: { total: 4, waiting: 2, in_process: 1, rejected: 1 } },
    completed: 5,
  })),
}))

const TODAY = businessToday()

function row(overrides: Partial<StepListRow> = {}): StepListRow {
  return {
    id: 50,
    passport_name: 'KARIM UDDIN',
    passport_number: 'NW5000001',
    reference: { id: 7, name: 'Green Field' },
    company: { id: 3, name: 'Desert Rose' },
    record: null,
    previous_step_completed_on: '2026-09-20',
    ...overrides,
  }
}

const IN_PROCESS = row({
  id: 51,
  record: {
    id: 9,
    status: 'in_process',
    status_label: 'Applied',
    step_date: '2026-10-01',
    reference_no: null,
    valid_until: null,
    details: null,
  },
})
const REJECTED = row({
  id: 52,
  record: { ...IN_PROCESS.record!, status: 'rejected', status_label: 'Rejected' },
})

const page = (data: StepListRow[], total = data.length) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, last_page: 1, per_page: 15, total, from: 1, to: data.length },
})

/** The list per tab; counts per tab (per_page=1 requests). */
const ROWS: Record<StepListTab, StepListRow[]> = {
  pending: [row()],
  in_process: [IN_PROCESS],
  completed: [],
  rejected: [REJECTED],
}
const COUNTS: Record<StepListTab, number> = { pending: 2, in_process: 1, completed: 4, rejected: 1 }

const saved = { data: {}, passport: {}, warnings: [] }

let wrapper: VueWrapper
let router: Router

async function mountStep(path = '/calling', role: Role = 'data_entry') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:step', name: 'step-page', component: StepListPage },
      { path: '/passports', name: 'passports', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    },
  )
  await flushPromises()
}

/** The last list request (not a per_page=1 count request). */
const lastListCall = () => {
  const calls = vi.mocked(listStepPassports).mock.calls.filter(([, p]) => p.per_page !== 1)
  return calls[calls.length - 1]!
}
const headers = () => wrapper.findAll('thead th').map((th) => th.text().trim())
const popover = () => {
  const el = document.body.querySelector<HTMLElement>('[data-step-start-popover]')
  return el ? new DOMWrapper(el) : null
}

beforeEach(() => {
  vi.clearAllMocks()
  useToast().toasts.value = []
  vi.mocked(listStepPassports).mockImplementation(async (_step: string, params: StepListParams) =>
    params.per_page === 1 ? page([], COUNTS[params.tab]) : page(ROWS[params.tab]),
  )
  vi.mocked(startStep).mockResolvedValue(saved as never)
  vi.mocked(recordStepResult).mockResolvedValue(saved as never)
})
afterEach(() => wrapper.unmount())

describe('Step pages (one per step)', () => {
  it.each([
    ['calling', 'Calling / Work Permit'],
    ['visa', 'Visa'],
    ['bmet', 'BMET Clearance'],
    ['flight', 'Flight'],
  ])('/%s renders the shared page for that step', async (key, label) => {
    await mountStep(`/${key}`)

    expect(wrapper.findComponent(StepListPage).exists()).toBe(true)
    expect(wrapper.get('[data-step-title]').text()).toBe(label)
    expect(lastListCall()[0]).toBe(key)
  })

  it('says so for a step that is not in the config', async () => {
    await mountStep('/nope')

    expect(wrapper.find('[data-unknown-step]').exists()).toBe(true)
    expect(listStepPassports).not.toHaveBeenCalled()
  })

  describe('step bar', () => {
    it('is shown without "Completed", with the current step highlighted', async () => {
      await mountStep('/visa')

      const bar = wrapper.get('nav[aria-label="Workflow steps"]')
      expect(bar.find('[data-step="completed"]').exists()).toBe(false)
      expect(bar.text()).not.toContain('Completed')
      expect(bar.find('[data-step="visa"] [aria-current="step"]').exists()).toBe(true)
      expect(bar.find('[data-step="calling"] [aria-current="step"]').exists()).toBe(false)
    })

    it('links each step to its page (Passport → list, Medical → Medical page)', async () => {
      await mountStep('/visa')

      const href = (key: string) => wrapper.get(`[data-step="${key}"] a`).attributes('href')
      expect(href('passport')).toBe('/passports')
      expect(href('medical')).toBe('/medical')
      expect(href('calling')).toBe('/calling')
      expect(href('flight')).toBe('/flight')
    })
  })

  describe('tabs and columns from the config', () => {
    it.each([
      ['calling', ['Pending', 'Applied', 'Approved', 'Rejected']],
      ['visa', ['Pending', 'Submitted', 'Visa issued', 'Rejected']],
      ['bmet', ['Pending', 'Submitted', 'Cleared', 'Rejected']],
      ['flight', ['Pending', 'Ticket booked', 'Departed', 'Cancelled']],
    ])('%s tabs: %j, each with its count', async (key, labels) => {
      await mountStep(`/${key}`)

      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs.map((t) => t.text().replace(/\s*\S+$/, ''))).toEqual(labels)
      expect(tabs.map((t) => t.get('[data-tab-count]').text())).toEqual(['2', '1', '4', '1'])
    })

    it('Pending lists passports whose previous step is done (the API tab), oldest first', async () => {
      await mountStep()

      expect(lastListCall()[1]).toEqual(expect.objectContaining({ tab: 'pending', page: 1 }))
      expect(lastListCall()[1]).not.toHaveProperty('sort')
      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Medical done',
        'Actions',
      ])
      expect(wrapper.get('[data-cell="previous_done"]').text()).toBe('20-09-2026')
    })

    it('status tabs show the step fields as columns; name and number are separate', async () => {
      await mountStep('/calling?tab=in_process')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Date',
        'Permit / calling number',
        'Valid until',
        'Actions',
      ])
      expect(headers()).not.toContain('Country')
      expect(headers()).not.toContain('Waiting')
      const r = wrapper.get('tr[data-row="51"]')
      expect(r.get('[data-cell="passport_name"]').text()).toBe('KARIM UDDIN')
      expect(r.get('[data-cell="passport_number"]').text()).toBe('NW5000001')
      expect(r.get('[data-cell="step_date"]').text()).toBe('01-10-2026')
      expect(wrapper.find('tbody [data-state]').exists()).toBe(false) // no row stepper
    })

    it('flight shows its own detail fields as columns', async () => {
      await mountStep('/flight?tab=in_process')

      expect(headers()).toEqual(
        expect.arrayContaining(['Airline', 'Flight number', 'Departure date', 'Ticket PNR']),
      )
    })
  })

  describe('searches', () => {
    it('sends search, company and reference with the tab (no company dropdown, sort or stage filter)', async () => {
      vi.useFakeTimers()
      try {
        await mountStep('/visa?tab=rejected&q=karim')
        await wrapper.get('input[data-search-box="company"]').setValue('Desert')
        await wrapper.get('input[data-search-box="reference"]').setValue('green')
        await vi.advanceTimersByTimeAsync(350)
        await flushPromises()

        expect(router.currentRoute.value.query).toEqual({
          tab: 'rejected',
          q: 'karim',
          company: 'Desert',
          reference: 'green',
        })
        expect(lastListCall()).toEqual([
          'visa',
          expect.objectContaining({
            tab: 'rejected',
            search: 'karim',
            company: 'Desert',
            reference: 'green',
          }),
        ])
      } finally {
        vi.useRealTimers()
      }
      const search = wrapper.get('[role="search"]')
      expect(search.findAll('label').map((l) => l.text().trim())).toEqual([
        'Search',
        'Search company',
        'Search reference',
      ])
      expect(search.find('select').exists()).toBe(false)
      expect(search.find('input[role="combobox"]').exists()).toBe(false)
    })

    it('mentions company and reference when nothing matches', async () => {
      vi.mocked(listStepPassports).mockResolvedValue(page([]))
      await mountStep('/calling?company=nobody')

      expect(wrapper.get('[data-empty]').text()).toContain('company and reference searches')
    })
  })

  describe('Action 1: Enter <step> date', () => {
    it('opens a small popover with the step date (required, not in the future)', async () => {
      await mountStep()

      const button = wrapper.get('tr[data-row="50"] button[data-step-start]')
      expect(button.text()).toContain('Enter calling date')
      await button.trigger('click')
      await flushPromises()

      const p = popover()!
      expect(p.element.tagName).toBe('FORM')
      expect(document.body.querySelector('dialog[open]')).toBeNull() // not a modal
      // Calling's only start field is its date; the permit number comes with the result.
      expect(p.findAll('[data-step-field]').map((f) => f.attributes('data-step-field'))).toEqual([
        'step_date',
      ])
      expect(p.get('input[type="date"]').attributes('max')).toBe(TODAY)

      await p.trigger('submit')
      expect(p.text()).toContain('Enter the date.')
      await p.get('input').setValue(addDays(TODAY, 1))
      await p.trigger('submit')
      expect(p.text()).toContain('The date cannot be in the future.')
      expect(startStep).not.toHaveBeenCalled()
    })

    it('saves: creates the in-process record, refreshes the list and counts, toasts', async () => {
      await mountStep()
      await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
      await flushPromises()
      const callsBefore = vi.mocked(listStepPassports).mock.calls.length

      await popover()!.get('input').setValue('2026-10-02')
      await popover()!.trigger('submit')
      await flushPromises()

      expect(startStep).toHaveBeenCalledWith(
        50,
        'calling',
        expect.objectContaining({ status: 'in_process', step_date: '2026-10-02' }),
      )
      expect(popover()).toBeNull()
      // The list and all four counts were loaded again.
      expect(vi.mocked(listStepPassports).mock.calls.length - callsBefore).toBe(5)
      expect(useToast().toasts.value.map((t) => t.message)).toContain('NW5000001: Calling applied.')
    })

    it('BMET: the popover also has the training certificate and finger dates (start fields)', async () => {
      await mountStep('/bmet')
      await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
      await flushPromises()

      const p = popover()!
      expect(p.findAll('[data-step-field]').map((f) => f.attributes('data-step-field'))).toEqual([
        'step_date',
        'training_certificate_date',
        'finger_date',
      ])
      const inputs = p.findAll('input')
      await inputs[0]!.setValue('2026-10-03')
      await inputs[1]!.setValue('2026-09-28')
      await inputs[2]!.setValue('2026-09-29')
      await p.trigger('submit')
      await flushPromises()

      expect(startStep).toHaveBeenCalledWith(
        50,
        'bmet',
        expect.objectContaining({
          step_date: '2026-10-03',
          details: { training_certificate_date: '2026-09-28', finger_date: '2026-09-29' },
        }),
      )
    })

    it('shows API warnings without blocking: saved, then OK closes', async () => {
      vi.mocked(startStep).mockResolvedValue({
        ...saved,
        warnings: [
          { code: 'medical_expires', message: 'The medical expires before the visa date.' },
        ],
      } as never)
      await mountStep()
      await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
      await flushPromises()
      await popover()!.get('input').setValue('2026-10-02')
      await popover()!.trigger('submit')
      await flushPromises()

      const p = popover()!
      expect(p.get('[data-step-warnings]').text()).toContain(
        'The medical expires before the visa date.',
      )
      expect(p.text()).toContain('Saved. You can continue.')
      await p.get('button[data-warnings-ok]').trigger('click')
      expect(popover()).toBeNull()
    })
  })

  describe('Action 2: the result', () => {
    it('offers one button per final status from the config', async () => {
      await mountStep('/visa?tab=in_process')

      const buttons = wrapper.findAll('tr[data-row="51"] button[data-step-result]')
      expect(buttons.map((b) => b.text().replace(/\s+NW\d+$/, ''))).toEqual([
        'Visa issued',
        'Rejected',
      ])
    })

    it('Approved: result date (today by default) plus the result fields; the permit number is required', async () => {
      await mountStep('/calling?tab=in_process')
      await wrapper.get('tr[data-row="51"] button[data-step-result="completed"]').trigger('click')
      await flushPromises()

      const dialog = wrapper.get('[data-step-result-dialog]')
      expect(wrapper.get('dialog').text()).toContain('Mark KARIM UDDIN as Approved?')
      expect(
        dialog.findAll('[data-step-field]').map((f) => f.attributes('data-step-field')),
      ).toEqual(['result_date', 'reference_no', 'valid_until'])
      expect(
        dialog.get<HTMLInputElement>('[data-step-field="result_date"] input').element.value,
      ).toBe(TODAY)

      await dialog.get('form').trigger('submit')
      expect(dialog.text()).toContain('Enter the permit / calling number.')
      expect(recordStepResult).not.toHaveBeenCalled()

      await dialog.get('[data-step-field="reference_no"] input').setValue('WP-123')
      await dialog.get('form').trigger('submit')
      await flushPromises()

      expect(recordStepResult).toHaveBeenCalledWith(51, 'calling', {
        result: 'completed',
        result_date: TODAY,
        reference_no: 'WP-123',
      })
      expect(useToast().toasts.value.map((t) => t.message)).toContain(
        'NW5000001: Calling: Approved.',
      )
    })

    it('Rejected: only the result date; it may not be in the future', async () => {
      await mountStep('/calling?tab=in_process')
      await wrapper.get('tr[data-row="51"] button[data-step-result="rejected"]').trigger('click')
      await flushPromises()

      const dialog = wrapper.get('[data-step-result-dialog]')
      expect(
        dialog.findAll('[data-step-field]').map((f) => f.attributes('data-step-field')),
      ).toEqual(['result_date'])
      await dialog.get('[data-step-field="result_date"] input').setValue(addDays(TODAY, 1))
      await dialog.get('form').trigger('submit')
      expect(dialog.text()).toContain('The result date cannot be in the future.')

      await dialog.get('[data-step-field="result_date"] input').setValue('2026-10-05')
      await dialog.get('form').trigger('submit')
      await flushPromises()
      expect(recordStepResult).toHaveBeenCalledWith(51, 'calling', {
        result: 'rejected',
        result_date: '2026-10-05',
      })
    })
  })

  it('Rejected tab: "Apply again" opens the start popover and starts a new record', async () => {
    await mountStep('/calling?tab=rejected')

    await wrapper.get('tr[data-row="52"] button[data-step-again]').trigger('click')
    await flushPromises()
    const p = popover()!
    expect(p.text()).toContain('Apply again')
    await p.get('input').setValue('2026-10-06')
    await p.trigger('submit')
    await flushPromises()

    expect(startStep).toHaveBeenCalledWith(
      52,
      'calling',
      expect.objectContaining({ status: 'in_process', step_date: '2026-10-06' }),
    )
  })

  it('accounts is read-only: no action buttons', async () => {
    await mountStep('/calling', 'accounts')

    expect(wrapper.findAll('tbody button')).toHaveLength(0)
    await router.push('/calling?tab=in_process')
    await flushPromises()
    expect(wrapper.findAll('tbody button')).toHaveLength(0)
  })

  it('never shows the word "Process" (title, tabs, empty state, toasts)', async () => {
    await mountStep('/visa')
    expect(wrapper.text()).not.toMatch(/process\b/i)
    expect(document.title).toBe('Visa | Staff portal | Afwan Associates Ltd')

    vi.mocked(listStepPassports).mockResolvedValue(page([]))
    await router.push('/visa?company=nobody')
    await flushPromises()
    expect(wrapper.text()).not.toMatch(/process\b/i)
  })

  it('has the Medical page structure: step bar, title, subtitle, then the card with tabs, filters and list', async () => {
    await mountStep('/visa')

    const root = wrapper.get('.mx-auto.max-w-7xl')
    const order = [...root.element.children].map((el) =>
      el.matches('nav[aria-label="Workflow steps"]')
        ? 'step bar'
        : el.tagName === 'H1'
          ? 'title'
          : el.tagName === 'P'
            ? 'subtitle'
            : el.tagName === 'SECTION'
              ? 'card'
              : el.tagName,
    )
    expect(order.slice(0, 4)).toEqual(['step bar', 'title', 'subtitle', 'card'])
    const title = wrapper.get('h1')
    expect(title.text()).toBe('Visa')
    // Same classes as the Medical page's title and card.
    expect(title.classes()).toEqual(
      expect.arrayContaining(['mt-6', 'text-2xl', 'font-bold', 'text-primary-900', 'sm:text-3xl']),
    )
    const card = wrapper.get('section.glass-card')
    const inCard = [
      ...card.element.querySelectorAll('[role="tablist"], [role="search"], [aria-busy]'),
    ]
    expect(inCard.map((el) => el.getAttribute('role') ?? 'list')).toEqual([
      'tablist',
      'search',
      'list',
    ])
  })

  it('the old tabbed Process view no longer exists', () => {
    const views = import.meta.glob('../*.vue')
    const components = import.meta.glob('../../components/*.vue')
    expect(Object.keys(views).some((p) => p.includes('ProcessView'))).toBe(false)
    expect(Object.keys(components).some((p) => p.includes('ProcessTable'))).toBe(false)
  })
})
