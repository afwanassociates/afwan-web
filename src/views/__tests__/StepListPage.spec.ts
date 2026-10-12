import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import StepListPage from '../StepListPage.vue'
import {
  deleteStepRecord,
  listStepPassports,
  recordStepResult,
  startStep,
  updateCalling,
} from '@/api/steps'
import { useToast } from '@/composables/useToast'
import { addDays, businessToday } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import { fetchWorkflowSummary } from '@/api/workflow'
import type { Role } from '@/types/auth'
import type { StepListParams, StepListRow, StepListTab } from '@/types/workflow'

vi.mock('@/api/steps', () => ({
  listStepPassports: vi.fn(),
  startStep: vi.fn(),
  recordStepResult: vi.fn(),
  updateCalling: vi.fn(),
  deleteStepRecord: vi.fn(),
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

/** Calling: the calling date entered, the permit not yet (still in Pending). */
const CALLING_STARTED = row({
  id: 53,
  passport_number: 'CL0000053',
  entry_mode: { value: 'online', label: 'Online' },
  record: {
    id: 19,
    status: 'in_process',
    status_label: 'Calling date entered',
    step_date: '2026-10-05',
    reference_no: null,
    valid_until: null,
    details: null,
  },
})

/** Calling: permitted, with the permit's dates (expiry relative to today, Dhaka). */
const permitted = (id: number, validUntil: string | null) =>
  row({
    id,
    entry_mode: { value: 'online', label: 'Online' },
    record: {
      id: id + 100,
      status: 'completed',
      status_label: 'Permitted',
      step_date: '2026-09-01',
      reference_no: null,
      valid_until: validUntil,
      details: validUntil ? { receive_date: '2026-09-03', issue_date: '2026-09-02' } : null,
    },
  })

/** Visa Pending: submitted from the Calling Permitted tab, waiting for the result. */
const visaPending = (id: number, permitExpiry: string | null) =>
  row({
    id,
    passport_number: `VS00000${id}`,
    entry_mode: { value: 'online', label: 'Online' },
    previous_record: {
      id: id + 200,
      status: 'completed',
      status_label: 'Permitted',
      step_date: '2026-09-01',
      reference_no: null,
      valid_until: permitExpiry,
      details: null,
    },
    record: {
      id: id + 300,
      status: 'in_process',
      status_label: 'Submitted',
      step_date: '2026-10-02',
      reference_no: null,
      valid_until: null,
      details: null,
    },
  })
const VISA_PENDING = visaPending(51, addDays(TODAY, 200))

/** One list response: the rows plus every tab's count of that step (as the API sends). */
const page = (data: StepListRow[], step = 'calling') => ({
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
  tab_counts: Object.fromEntries(
    (WORKFLOW_CONFIG.steps.find((st) => st.key === step)?.tabs ?? []).map((t) => [
      t.key,
      COUNTS[t.key] ?? 0,
    ]),
  ),
})

/** The list per tab; the API's count per tab. */
const ROWS: Record<StepListTab, StepListRow[]> = {
  pending: [row()],
  in_process: [IN_PROCESS],
  completed: [],
  rejected: [REJECTED],
  permitted: [],
  issued: [],
}
const COUNTS: Record<StepListTab, number> = {
  pending: 2,
  in_process: 1,
  completed: 4,
  rejected: 1,
  permitted: 3,
  issued: 4,
}
/** Visa Pending (the API only lists submitted passports there). */
let visaPendingRows: StepListRow[] = [VISA_PENDING]

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

const lastListCall = () => {
  const calls = vi.mocked(listStepPassports).mock.calls
  return calls[calls.length - 1]!
}
const toDisplay = (iso: string) => iso.split('-').reverse().join('-')
const headers = () => wrapper.findAll('thead th').map((th) => th.text().trim())
const toastMessages = () => useToast().toasts.value.map((t) => t.message)
const modal = () => {
  const el = document.body.querySelector<HTMLElement>('[data-top-modal]')
  return el ? new DOMWrapper(el) : null
}
const popover = () => {
  const el = document.body.querySelector<HTMLElement>('[data-step-start-popover]')
  return el ? new DOMWrapper(el) : null
}

beforeEach(() => {
  vi.clearAllMocks()
  useToast().toasts.value = []
  visaPendingRows = [VISA_PENDING]
  vi.mocked(listStepPassports).mockImplementation(async (step: string, params: StepListParams) =>
    page(
      step === 'visa' && params.tab === 'pending' ? visaPendingRows : (ROWS[params.tab] ?? []),
      step,
    ),
  )
  vi.mocked(startStep).mockResolvedValue(saved as never)
  vi.mocked(recordStepResult).mockResolvedValue(saved as never)
  vi.mocked(updateCalling).mockResolvedValue(saved as never)
  vi.mocked(deleteStepRecord).mockResolvedValue(undefined as never)
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
      ['calling', ['Pending', 'Permitted']],
      ['visa', ['Pending', 'Visa issued', 'Rejected']],
      ['bmet', ['Pending', 'Submitted', 'Cleared', 'Rejected']],
      ['flight', ['Pending', 'Ticket booked', 'Departed', 'Cancelled']],
    ])('%s tabs: %j, each with the count from the list response', async (key, labels) => {
      await mountStep(`/${key}`)

      // One request: the rows and the tab counts together (nothing counted in the browser).
      expect(listStepPassports).toHaveBeenCalledTimes(1)
      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs.map((t) => t.text().replace(/\s*\S+$/, ''))).toEqual(labels)
      expect(tabs.map((t) => t.get('[data-tab-count]').text())).toEqual(
        key === 'calling' ? ['2', '3'] : key === 'visa' ? ['2', '4', '1'] : ['2', '1', '4', '1'],
      )
    })

    it('Pending lists passports whose previous step is done (the API tab), oldest first', async () => {
      await mountStep('/bmet')

      expect(lastListCall()[1]).toEqual(expect.objectContaining({ tab: 'pending', page: 1 }))
      expect(lastListCall()[1]).not.toHaveProperty('sort')
      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Visa done',
        'Actions',
      ])
      expect(wrapper.get('[data-cell="previous_done"]').text()).toBe('20-09-2026')
    })

    it('status tabs show the step fields as columns; name and number are separate', async () => {
      await mountStep('/bmet?tab=in_process')

      expect(headers()).toEqual(
        expect.arrayContaining([
          'Passport name',
          'Passport number',
          'Reference',
          'Company',
          'Clearance number',
          'Actions',
        ]),
      )
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

  describe('the Online mode', () => {
    it.each(['pending', 'permitted'])('Calling has no Mode column on %s', async (tab) => {
      ROWS[tab as StepListTab] = [row({ id: 60, entry_mode: { value: 'online', label: 'Online' } })]
      try {
        await mountStep(`/calling${tab === 'pending' ? '' : `?tab=${tab}`}`)

        expect(headers()).not.toContain('Mode')
        expect(wrapper.find('[data-cell="mode"], [data-entry-mode]').exists()).toBe(false)
      } finally {
        ROWS[tab as StepListTab] = tab === 'pending' ? [row()] : []
      }
    })

    it('BMET and Flight have no Mode column', async () => {
      await mountStep('/bmet')

      expect(headers()).not.toContain('Mode')
    })

    it('Pending empty text points to the Medical Fit tab', async () => {
      vi.mocked(listStepPassports).mockResolvedValue(page([]))
      await mountStep('/calling')

      expect(wrapper.get('[data-empty]').text()).toContain(
        'Mark passports Online on the Medical Fit tab to see them here.',
      )
    })
  })

  describe('Calling: Pending and Permitted', () => {
    const CALLING_DATE = /calling date/i
    beforeEach(() => {
      ROWS.pending = [row({ entry_mode: { value: 'online', label: 'Online' } }), CALLING_STARTED]
    })
    afterEach(() => {
      ROWS.pending = [row()]
      ROWS.permitted = []
    })

    it('has only two tabs; the other step pages keep theirs', async () => {
      await mountStep('/calling')
      expect(wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))).toEqual([
        'pending',
        'permitted',
      ])
      expect(wrapper.text()).not.toMatch(/Applied|Approved|Rejected|Apply again/)
      wrapper.unmount()

      await mountStep('/bmet')
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(4)
      wrapper.unmount()
      await mountStep('/flight')
      expect(wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))).toEqual([
        'pending',
        'in_process',
        'completed',
        'rejected',
      ])
    })

    it('Pending columns: name, number, reference, company, actions (no Mode, no Calling date)', async () => {
      await mountStep('/calling')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Actions',
      ])
      expect(wrapper.find('[data-cell="step_date"]').exists()).toBe(false)
      expect(wrapper.find('table').text()).not.toMatch(CALLING_DATE)
    })

    it('every Pending row has one button, "Update calling" (no "Permit details", no edit icon)', async () => {
      await mountStep('/calling')

      for (const id of [50, 53]) {
        const buttons = wrapper.findAll(`tr[data-row="${id}"] button`)
        expect(buttons).toHaveLength(1)
        expect(buttons[0]!.attributes()).toHaveProperty('data-step-update')
        expect(buttons[0]!.text()).toContain('Update calling')
      }
      expect(wrapper.text()).not.toContain('Permit details')
      expect(wrapper.find('[data-step-edit-date], [data-step-details]').exists()).toBe(false)
    })

    describe('Update calling', () => {
      async function openUpdate(id = 53) {
        await mountStep('/calling')
        await wrapper.get(`tr[data-row="${id}"] button[data-step-update]`).trigger('click')
        await flushPromises()
        return popover()!
      }
      const field = (p: DOMWrapper<Element>, name: string) =>
        p.get<HTMLInputElement>(`[data-step-field="${name}"] input`)
      const fill = async (p: DOMWrapper<Element>, values: Record<string, string>) => {
        for (const [name, value] of Object.entries(values)) await field(p, name).setValue(value)
      }
      const PERMIT = {
        receive_date: '2026-10-07',
        issue_date: '2026-10-06',
        valid_until: '2027-10-06',
      }

      it('has exactly three required fields (no Calling date) and a single Save', async () => {
        const p = await openUpdate()

        expect(modal()!.text()).toContain('Update calling')
        expect(p.findAll('[data-step-field]').map((f) => f.attributes('data-step-field'))).toEqual([
          'receive_date',
          'issue_date',
          'valid_until',
        ])
        // Each label carries the required asterisk.
        expect(p.findAll('label').map((l) => l.text())).toEqual([
          'Calling receive date *',
          'Issued date *',
          'Expiry date *',
        ])
        expect(p.text()).not.toMatch(CALLING_DATE)
        expect(p.findAll('button[type="submit"]').map((b) => b.text())).toEqual(['Save'])
        expect(field(p, 'receive_date').attributes('max')).toBe(TODAY)
        expect(field(p, 'issue_date').attributes('max')).toBe(TODAY)
      })

      it('all three are required, each with its own inline error', async () => {
        const p = await openUpdate()
        await p.trigger('submit')

        expect(p.get('[data-step-field="receive_date"]').text()).toContain(
          'Enter the calling receive date.',
        )
        expect(p.get('[data-step-field="issue_date"]').text()).toContain('Enter the issued date.')
        expect(p.get('[data-step-field="valid_until"]').text()).toContain('Enter the expiry date.')
        expect(updateCalling).not.toHaveBeenCalled()

        // No partial save any more.
        await fill(p, { receive_date: '2026-10-07' })
        await p.trigger('submit')
        expect(p.text()).not.toContain('together')
        expect(p.get('[data-step-field="issue_date"]').text()).toContain('Enter the issued date.')
        expect(updateCalling).not.toHaveBeenCalled()
      })

      it('checks the dates: receive and issued not in the future; expiry after issued', async () => {
        const p = await openUpdate()

        await fill(p, {
          receive_date: addDays(TODAY, 1),
          issue_date: addDays(TODAY, 1),
          valid_until: addDays(TODAY, 400),
        })
        await p.trigger('submit')
        expect(p.get('[data-step-field="receive_date"]').text()).toContain(
          'The calling receive date cannot be in the future.',
        )
        expect(p.get('[data-step-field="issue_date"]').text()).toContain(
          'The issued date cannot be in the future.',
        )

        await fill(p, {
          receive_date: '2026-10-01',
          issue_date: '2026-10-02',
          valid_until: '2026-10-02',
        })
        await p.trigger('submit')
        expect(p.get('[data-step-field="valid_until"]').text()).toContain(
          'The expiry date must be after the issued date.',
        )
        expect(p.text()).not.toContain('cannot be in the future')
        expect(updateCalling).not.toHaveBeenCalled()
      })

      it('one Save sends the three dates in one request; the row moves to Permitted and the counts refresh', async () => {
        vi.mocked(updateCalling).mockResolvedValue({
          ...saved,
          data: { status: 'completed' },
        } as never)
        const p = await openUpdate()
        const listBefore = vi.mocked(listStepPassports).mock.calls.length
        const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length
        // After the save the API lists it under Permitted, with the new counts.
        ROWS.pending = [row()]
        COUNTS.pending = 1
        COUNTS.permitted = 4
        try {
          await fill(p, PERMIT)
          await p.get('button[data-step-start-save]').trigger('click')
          await flushPromises()

          expect(updateCalling).toHaveBeenCalledTimes(1)
          expect(updateCalling).toHaveBeenCalledWith(53, 'calling', PERMIT)
          expect(startStep).not.toHaveBeenCalled()
          expect(modal()).toBeNull()
          expect(toastMessages()).toContain('CL0000053: Moved to Permitted')
          expect(wrapper.find('tr[data-row="53"]').exists()).toBe(false)
          // The list (with its tab counts) and the summary (step bar, sidebar) again.
          expect(vi.mocked(listStepPassports).mock.calls.length - listBefore).toBe(1)
          expect(vi.mocked(fetchWorkflowSummary).mock.calls.length - summaryBefore).toBe(1)
          expect(wrapper.findAll('[data-tab-count]').map((c) => c.text())).toEqual(['1', '4'])
        } finally {
          COUNTS.pending = 2
          COUNTS.permitted = 3
        }
      })

      it('shows API warnings without blocking', async () => {
        vi.mocked(updateCalling).mockResolvedValue({
          ...saved,
          warnings: [{ code: 'permit_expires', message: 'The permit expires soon.' }],
        } as never)
        const p = await openUpdate()
        await fill(p, PERMIT)
        await p.trigger('submit')
        await flushPromises()

        expect(popover()!.get('[data-step-warnings]').text()).toContain('The permit expires soon.')
      })
    })

    describe('the dialogs are top-aligned modals', () => {
      const TOP_CLASSES = [
        'fixed',
        'top-[8vh]',
        'left-1/2',
        '-translate-x-1/2',
        'w-[calc(100%-2rem)]',
        'max-w-[480px]',
        'max-h-[84vh]',
        'overflow-y-auto',
      ]

      async function open(which: 'update' | 'next') {
        if (which === 'next') ROWS.permitted = [permitted(60, addDays(TODAY, 100))]
        await mountStep(which === 'next' ? '/calling?tab=permitted' : '/calling')
        const button = wrapper.get(
          which === 'next'
            ? 'tr[data-row="60"] button[data-step-next]'
            : 'tr[data-row="53"] button[data-step-update]',
        )
        // Not focused by the click (as in Safari): the modal still returns the focus to it.
        await button.trigger('click')
        await flushPromises()
        return button
      }

      it.each(['update', 'next'] as const)(
        '%s: fixed near the top, centred, max 480px, scrolls inside, dim backdrop; focus on the first field',
        async (which) => {
          await open(which)

          const m = modal()!
          const panel = m.get('[data-modal-panel]')
          expect(panel.classes()).toEqual(expect.arrayContaining(TOP_CLASSES))
          expect(panel.attributes('role')).toBe('dialog')
          expect(panel.attributes('aria-modal')).toBe('true')
          expect(panel.get('h2').text()).toBe(
            which === 'update' ? 'Update calling' : 'Enter visa submitted date',
          )
          expect(m.get('[data-modal-backdrop]').classes()).toEqual(
            expect.arrayContaining(['fixed', 'inset-0']),
          )
          // Not placed under its button any more (no inline position).
          expect(m.get('[data-step-start-popover]').attributes('style')).toBeUndefined()
          expect(document.activeElement).toBe(m.get('[data-step-field] input').element)
        },
      )

      it('closes on Esc and gives the focus back to the button', async () => {
        const button = await open('update')
        modal()!
          .get('input')
          .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()

        expect(modal()).toBeNull()
        expect(document.activeElement).toBe(button.element)
      })

      it.each(['[data-modal-backdrop]', '[data-modal-close]'])('closes on %s', async (target) => {
        await open('next')
        ;(modal()!.get(target).element as HTMLElement).click()
        await flushPromises()

        expect(modal()).toBeNull()
        expect(startStep).not.toHaveBeenCalled()
      })

      it('BMET and Flight keep the small popover under the button', async () => {
        await mountStep('/bmet')
        await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
        await flushPromises()

        expect(modal()).toBeNull()
        expect(popover()!.attributes('style')).toContain('top:')
      })
    })

    describe('Permitted', () => {
      it('columns with the permit dates; "-" for missing; expiry in amber or red', async () => {
        ROWS.permitted = [
          permitted(60, addDays(TODAY, 100)),
          permitted(61, addDays(TODAY, 10)), // within 30 days
          permitted(62, addDays(TODAY, -1)), // expired
          permitted(63, null), // an old record without the permit dates
        ]
        await mountStep('/calling?tab=permitted')

        expect(headers()).toEqual([
          'Passport name',
          'Passport number',
          'Reference',
          'Company',
          'Calling receive date',
          'Issued date',
          'Expiry date',
          'Actions',
        ])
        const cell = (id: number, name: string) =>
          wrapper.get(`tr[data-row="${id}"] [data-cell="${name}"]`)
        expect(cell(60, 'receive_date').text()).toBe('03-09-2026')
        expect(cell(60, 'issue_date').text()).toBe('02-09-2026')
        expect(cell(60, 'valid_until').classes()).not.toContain('text-amber-700')
        expect(cell(61, 'valid_until').classes()).toContain('text-amber-700')
        expect(cell(62, 'valid_until').classes()).toContain('text-red-700')
        expect(cell(63, 'receive_date').text()).toBe('-')
        expect(cell(63, 'valid_until').text()).toBe('-')
      })

      async function openVisa(role: Role = 'data_entry') {
        ROWS.permitted = [permitted(60, addDays(TODAY, 100)), permitted(61, addDays(TODAY, 10))]
        await mountStep('/calling?tab=permitted', role)
        const buttons = wrapper.findAll('tr[data-row="60"] button')
        expect(buttons.map((b) => b.text().replace(/\s+for \S+$/, ''))).toEqual([
          'Enter visa submitted date',
        ])
        await buttons[0]!.trigger('click')
        await flushPromises()
        return popover()!
      }

      it('"Enter visa submitted date": one required date, not in the future', async () => {
        const p = await openVisa()

        expect(modal()!.get('h2').text()).toBe('Enter visa submitted date')
        expect(p.findAll('[data-step-field]').map((f) => f.attributes('data-step-field'))).toEqual([
          'step_date',
        ])
        expect(p.get('label').text()).toContain('Visa submitted date')
        expect(p.get('input[type="date"]').attributes('max')).toBe(TODAY)
        await p.trigger('submit')
        expect(p.text()).toContain('Enter the visa submitted date.')
        await p.get('input').setValue(addDays(TODAY, 1))
        await p.trigger('submit')
        expect(p.text()).toContain('The date cannot be in the future.')
        expect(startStep).not.toHaveBeenCalled()
      })

      it('saving removes the row at once, starts the visa and toasts "Moved to Visa (Pending)"', async () => {
        let resolve!: (value: unknown) => void
        vi.mocked(startStep).mockReturnValue(new Promise((r) => (resolve = r)) as never)
        const p = await openVisa()
        await p.get('input').setValue('2026-10-08')
        await p.trigger('submit')
        await flushPromises()

        // Optimistic: gone before the API answers.
        expect(popover()).toBeNull()
        expect(wrapper.find('tr[data-row="60"]').exists()).toBe(false)
        expect(wrapper.find('tr[data-row="61"]').exists()).toBe(true)
        expect(startStep).toHaveBeenCalledWith(
          60,
          'visa',
          expect.objectContaining({ status: 'in_process', step_date: '2026-10-08' }),
        )

        ROWS.permitted = [permitted(61, addDays(TODAY, 10))] // the API no longer lists it
        const callsBefore = vi.mocked(listStepPassports).mock.calls.length
        resolve({ ...saved, data: { id: 900, status: 'in_process' } })
        await flushPromises()

        const toast = useToast().toasts.value.find((t) => t.message.includes('Moved to Visa'))!
        expect(toast.message).toBe('NW5000001: Moved to Visa (Pending)')
        expect(toast.action).toBeUndefined() // data entry cannot clear a record
        expect(wrapper.find('tr[data-row="60"]').exists()).toBe(false)
        // The list again, its tab counts included.
        expect(vi.mocked(listStepPassports).mock.calls.length - callsBefore).toBe(1)
      })

      it('admins get Undo, which deletes the new visa record', async () => {
        vi.mocked(startStep).mockResolvedValue({
          ...saved,
          data: { id: 900, status: 'in_process' },
        } as never)
        const p = await openVisa('admin')
        await p.get('input').setValue('2026-10-08')
        await p.trigger('submit')
        await flushPromises()

        const toast = useToast().toasts.value.find((t) => t.message.includes('Moved to Visa'))!
        expect(toast.action?.label).toBe('Undo')
        toast.action!.run()
        await flushPromises()
        expect(deleteStepRecord).toHaveBeenCalledWith(900)
      })

      it('puts the row back and shows the error when saving fails', async () => {
        vi.mocked(startStep).mockRejectedValue(new Error('Network down'))
        const p = await openVisa()
        await p.get('input').setValue('2026-10-08')
        await p.trigger('submit')
        await flushPromises()

        expect(wrapper.find('tr[data-row="60"]').exists()).toBe(true)
        expect(useToast().toasts.value.some((t) => t.type === 'error')).toBe(true)
        expect(toastMessages().some((m) => m.includes('Moved to Visa'))).toBe(false)
      })

      it('shows API warnings (non-blocking) as toasts', async () => {
        vi.mocked(startStep).mockResolvedValue({
          ...saved,
          data: { id: 900, status: 'in_process' },
          warnings: [
            {
              code: 'before_receive',
              message: 'The visa date is before the calling receive date.',
            },
            { code: 'permit_expired', message: 'The calling permit has expired.' },
          ],
        } as never)
        const p = await openVisa()
        await p.get('input').setValue('2026-10-08')
        await p.trigger('submit')
        await flushPromises()

        const warnings = useToast()
          .toasts.value.filter((t) => t.type === 'warning')
          .map((t) => t.message)
        expect(warnings).toEqual([
          'The visa date is before the calling receive date.',
          'The calling permit has expired.',
        ])
        expect(toastMessages()).toContain('NW5000001: Moved to Visa (Pending)')
      })
    })
  })

  describe('Visa', () => {
    it('has exactly three tabs: Pending, Visa issued, Rejected', async () => {
      await mountStep('/visa')

      expect(wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))).toEqual([
        'pending',
        'issued',
        'rejected',
      ])
      expect(wrapper.text()).not.toMatch(/not started/i)
    })

    it('Pending: the submitted passports with the calling permit expiry and the visa submitted date', async () => {
      visaPendingRows = [
        VISA_PENDING,
        visaPending(54, addDays(TODAY, 10)), // within 30 days
        visaPending(55, addDays(TODAY, -2)), // expired
      ]
      await mountStep('/visa')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Mode',
        'Calling permit expiry',
        'Visa submitted date',
        'Actions',
      ])
      const cell = (id: number, name: string) =>
        wrapper.get(`tr[data-row="${id}"] [data-cell="${name}"]`)
      expect(cell(51, 'mode').text()).toBe('Online')
      expect(cell(51, 'previous_expiry').text()).toBe(toDisplay(addDays(TODAY, 200)))
      expect(cell(51, 'previous_expiry').classes()).not.toContain('text-amber-700')
      expect(cell(54, 'previous_expiry').classes()).toContain('text-amber-700')
      expect(cell(55, 'previous_expiry').classes()).toContain('text-red-700')
      expect(cell(51, 'step_date').text()).toBe('02-10-2026')
    })

    it('Pending has no action to enter the submitted date; the empty text points to Calling', async () => {
      await mountStep('/visa')
      expect(wrapper.find('button[data-step-start], button[data-step-update]').exists()).toBe(false)
      wrapper.unmount()

      visaPendingRows = []
      await mountStep('/visa')
      expect(wrapper.get('[data-empty]').text()).toContain(
        'Enter the visa submitted date on the Calling / Work Permit page (Permitted tab) to see passports here.',
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

  describe('Action 1: Enter <step> date (BMET, Flight)', () => {
    it('opens a small popover with the step date (required, not in the future)', async () => {
      await mountStep('/flight')

      const button = wrapper.get('tr[data-row="50"] button[data-step-start]')
      expect(button.text()).toContain('Enter flight date')
      await button.trigger('click')
      await flushPromises()

      const p = popover()!
      expect(p.element.tagName).toBe('FORM')
      expect(document.body.querySelector('dialog[open]')).toBeNull() // not a modal
      const date = p.get('[data-step-field="step_date"] input')
      expect(date.attributes('max')).toBe(TODAY)

      await p.trigger('submit')
      expect(p.text()).toContain('Enter the booking date.')
      await date.setValue(addDays(TODAY, 1))
      await p.trigger('submit')
      expect(p.text()).toContain('The date cannot be in the future.')
      expect(startStep).not.toHaveBeenCalled()
    })

    it('saves: creates the in-process record, refreshes the list and counts, toasts', async () => {
      await mountStep('/bmet')
      await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
      await flushPromises()
      const callsBefore = vi.mocked(listStepPassports).mock.calls.length

      await popover()!.get('[data-step-field="step_date"] input').setValue('2026-10-02')
      await popover()!.trigger('submit')
      await flushPromises()

      expect(startStep).toHaveBeenCalledWith(
        50,
        'bmet',
        expect.objectContaining({ status: 'in_process', step_date: '2026-10-02' }),
      )
      expect(popover()).toBeNull()
      // The list again, its tab counts included.
      expect(vi.mocked(listStepPassports).mock.calls.length - callsBefore).toBe(1)
      expect(toastMessages()).toContain('NW5000001: BMET submitted.')
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
          { code: 'medical_expires', message: 'The medical expires before the BMET date.' },
        ],
      } as never)
      await mountStep('/bmet')
      await wrapper.get('tr[data-row="50"] button[data-step-start]').trigger('click')
      await flushPromises()
      await popover()!.get('[data-step-field="step_date"] input').setValue('2026-10-02')
      await popover()!.trigger('submit')
      await flushPromises()

      const p = popover()!
      expect(p.get('[data-step-warnings]').text()).toContain(
        'The medical expires before the BMET date.',
      )
      expect(p.text()).toContain('Saved. You can continue.')
      await p.get('button[data-warnings-ok]').trigger('click')
      expect(popover()).toBeNull()
    })
  })

  describe('Action 2: the result', () => {
    it('Visa Pending: one button per final status from the config', async () => {
      await mountStep('/visa')

      const buttons = wrapper.findAll('tr[data-row="51"] button[data-step-result]')
      expect(buttons.map((b) => b.text().replace(/\s+[A-Z]{2}\d+$/, ''))).toEqual([
        'Visa issued',
        'Rejected',
      ])
    })

    it('BMET in process: the result buttons from the config', async () => {
      await mountStep('/bmet?tab=in_process')
      expect(
        wrapper
          .findAll('tr[data-row="51"] button[data-step-result]')
          .map((b) => b.attributes('data-step-result')),
      ).toEqual(['completed', 'rejected'])
    })

    it('Visa issued: result date (today by default) plus the result fields; the visa number is required', async () => {
      await mountStep('/visa')
      await wrapper.get('tr[data-row="51"] button[data-step-result="completed"]').trigger('click')
      await flushPromises()

      const dialog = wrapper.get('[data-step-result-dialog]')
      expect(wrapper.get('dialog').text()).toContain('Mark KARIM UDDIN as Visa issued?')
      expect(
        dialog.findAll('[data-step-field]').map((f) => f.attributes('data-step-field')),
      ).toEqual(['result_date', 'reference_no', 'valid_until'])
      expect(
        dialog.get<HTMLInputElement>('[data-step-field="result_date"] input').element.value,
      ).toBe(TODAY)

      await dialog.get('form').trigger('submit')
      expect(dialog.text()).toContain('Enter the visa number.')
      expect(recordStepResult).not.toHaveBeenCalled()

      await dialog.get('[data-step-field="reference_no"] input').setValue('WP-123')
      await dialog.get('form').trigger('submit')
      await flushPromises()

      expect(recordStepResult).toHaveBeenCalledWith(51, 'visa', {
        result: 'completed',
        result_date: TODAY,
        reference_no: 'WP-123',
      })
      expect(toastMessages()).toContain('VS0000051: Visa: Visa issued.')
    })

    it('Rejected: only the result date; it may not be in the future', async () => {
      await mountStep('/visa')
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
      expect(recordStepResult).toHaveBeenCalledWith(51, 'visa', {
        result: 'rejected',
        result_date: '2026-10-05',
      })
    })
  })

  it('Rejected tab: "Apply again" opens the start popover and starts a new record', async () => {
    await mountStep('/visa?tab=rejected')

    await wrapper.get('tr[data-row="52"] button[data-step-again]').trigger('click')
    await flushPromises()
    const p = popover()!
    expect(p.text()).toContain('Apply again')
    await p.get('input').setValue('2026-10-06')
    await p.trigger('submit')
    await flushPromises()

    expect(startStep).toHaveBeenCalledWith(
      52,
      'visa',
      expect.objectContaining({ status: 'in_process', step_date: '2026-10-06' }),
    )
  })

  it('accounts is read-only: no action buttons', async () => {
    ROWS.pending = [row(), CALLING_STARTED]
    try {
      await mountStep('/calling', 'accounts')
      expect(wrapper.findAll('tbody button')).toHaveLength(0)
      expect(headers()).not.toContain('Actions')
    } finally {
      ROWS.pending = [row()]
    }
    wrapper.unmount()
    ROWS.permitted = [permitted(60, addDays(TODAY, 100))]
    try {
      await mountStep('/calling?tab=permitted', 'accounts')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.findAll('tbody button')).toHaveLength(0)
    } finally {
      ROWS.permitted = []
    }
    wrapper.unmount()
    await mountStep('/visa', 'accounts')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('tbody button')).toHaveLength(0)
    await router.push('/visa?tab=rejected')
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
