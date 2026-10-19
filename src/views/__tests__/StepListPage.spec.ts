import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import StepListPage from '../StepListPage.vue'
import {
  deleteStepRecord,
  listStepPassports,
  markStepAction,
  recordStepResult,
  startStep,
  bookFlight,
  clearFlightBooking,
  confirmFlight,
  undoFlightConfirm,
  updateCalling,
  undoStepAction,
} from '@/api/steps'
import { useToast } from '@/composables/useToast'
import { addDays, businessToday } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import { fetchWorkflowSummary } from '@/api/workflow'
import type { Role } from '@/types/auth'
import type { StepListParams, StepListRow, StepListTab } from '@/types/workflow'

vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))
vi.mock('@/api/steps', () => ({
  listStepPassports: vi.fn(),
  bulkStep: vi.fn(),
  downloadStepListCsv: vi.fn(async () => 'visa-issued-01-05-2026.csv'),
  startStep: vi.fn(),
  recordStepResult: vi.fn(),
  updateCalling: vi.fn(),
  bookFlight: vi.fn(),
  clearFlightBooking: vi.fn(),
  confirmFlight: vi.fn(),
  undoFlightConfirm: vi.fn(),
  deleteStepRecord: vi.fn(),
  markStepAction: vi.fn(),
  undoStepAction: vi.fn(),
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
const visaPending = (
  id: number,
  permitExpiry: string | null,
  record: Partial<NonNullable<StepListRow['record']>> = {},
) =>
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
      ...record,
    },
  })
const VISA_PENDING = visaPending(51, addDays(TODAY, 200))

/** One list response: the rows plus every tab's count of that step (as the API sends). */
/** A Flight row: the visa expiry, BMET status and booking (can_confirm as the API works it out). */
const flightRow = (
  id: number,
  o: {
    visa?: string | null
    clearance?: string | null
    booking?: string | null
    confirmed?: string | null
  } = {},
) => {
  const missing = [
    ...(o.clearance ? [] : (['bmet'] as const)),
    ...(o.booking ? [] : (['booking_date'] as const)),
  ]
  return row({
    id,
    passport_number: `FL00000${id}`,
    visa_valid_until: o.visa === undefined ? addDays(TODAY, 200) : o.visa,
    bmet_cleared: !!o.clearance,
    clearance_date: o.clearance ?? null,
    booking_date: o.booking ?? null,
    confirmed_date: o.confirmed ?? null,
    can_confirm: !o.confirmed && missing.length === 0,
    missing: o.confirmed ? [] : missing,
  })
}

/** A BMET row: the visa's dates and the actions done so far. */
const bmetRow = (
  id: number,
  o: { training?: string; finger?: string; clearance?: string; visa?: string } = {},
) =>
  row({
    id,
    passport_number: `BM00000${id}`,
    visa_issue_date: '2026-10-01',
    visa_valid_until: o.visa ?? addDays(TODAY, 200),
    training_date: o.training ?? null,
    finger_date: o.finger ?? null,
    clearance_date: o.clearance ?? null,
  })

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
  confirmed: [],
  cleared: [],
}
const COUNTS: Record<StepListTab, number> = {
  pending: 2,
  in_process: 1,
  completed: 4,
  rejected: 1,
  permitted: 3,
  issued: 4,
  confirmed: 6,
  cleared: 3,
}
/** BMET Pending (visa issued). */
let bmetPendingRows: StepListRow[] = []
/** Flight Pending (BMET cleared). */
let flightPendingRows: StepListRow[] = []
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
// The bulk checkbox column has no title: left out.
const headers = () =>
  wrapper
    .findAll('thead th')
    .filter((th) => !th.find('[data-select-all]').exists())
    .map((th) => th.text().trim())
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
  flightPendingRows = [
    flightRow(70), // neither
    flightRow(71, { booking: '2026-12-01' }), // booked, BMET pending
    flightRow(72, { clearance: '2026-10-11' }), // cleared, no booking
    flightRow(73, { clearance: '2026-10-11', booking: '2026-12-01' }), // ready
  ]
  vi.mocked(bookFlight).mockResolvedValue(saved as never)
  vi.mocked(clearFlightBooking).mockResolvedValue(undefined)
  vi.mocked(confirmFlight).mockResolvedValue(saved as never)
  vi.mocked(undoFlightConfirm).mockResolvedValue(saved as never)
  bmetPendingRows = [
    bmetRow(60),
    bmetRow(61, { training: '2026-10-05' }),
    bmetRow(62, { training: '2026-10-05', finger: '2026-10-06' }),
  ]
  vi.mocked(markStepAction).mockResolvedValue(saved as never)
  vi.mocked(undoStepAction).mockResolvedValue(undefined)
  vi.mocked(listStepPassports).mockImplementation(async (step: string, params: StepListParams) =>
    page(
      step === 'visa' && params.tab === 'pending'
        ? visaPendingRows
        : step === 'flight' && params.tab === 'pending'
          ? flightPendingRows
          : step === 'bmet' && params.tab === 'pending'
            ? bmetPendingRows
            : (ROWS[params.tab] ?? []),
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
      ['bmet', ['Pending', 'BMET cleared']],
      ['flight', ['Pending', 'Flight confirmed']],
    ])('%s tabs: %j, each with the count from the list response', async (key, labels) => {
      await mountStep(`/${key}`)

      // One request: the rows and the tab counts together (nothing counted in the browser).
      expect(listStepPassports).toHaveBeenCalledTimes(1)
      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs.map((t) => t.text().replace(/\s*\S+$/, ''))).toEqual(labels)
      expect(tabs.map((t) => t.get('[data-tab-count]').text())).toEqual(
        {
          calling: ['2', '3'],
          visa: ['2', '4', '1'],
          bmet: ['2', '3'],
          flight: ['2', '6'],
        }[key],
      )
    })

    it('lists the Pending tab first with the searches (the API decides the order)', async () => {
      await mountStep('/bmet')

      expect(lastListCall()).toEqual([
        'bmet',
        expect.objectContaining({ tab: 'pending', page: 1, per_page: 15 }),
      ])
      expect(lastListCall()[1]).not.toHaveProperty('sort')
      expect(wrapper.find('tbody [data-state]').exists()).toBe(false) // no row stepper
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

    it.each(['visa', 'visa?tab=issued', 'visa?tab=rejected', 'bmet', 'flight'])(
      '/%s has no Mode column',
      async (path) => {
        await mountStep(`/${path}`)

        expect(headers()).not.toContain('Mode')
        expect(wrapper.find('[data-cell="mode"], [data-entry-mode]').exists()).toBe(false)
      },
    )

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
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
      wrapper.unmount()
      await mountStep('/flight')
      expect(wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))).toEqual([
        'pending',
        'confirmed',
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

      it('"Apply again" (Visa Rejected) keeps the small popover under the button', async () => {
        await mountStep('/visa?tab=rejected')
        await wrapper.get('tr[data-row="52"] button[data-step-again]').trigger('click')
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

    it('Pending: the submitted passports with the calling expiry and the visa submitted date', async () => {
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
        'Calling expiry',
        'Visa submitted date',
        'Actions',
      ])
      expect(wrapper.text()).not.toContain('Calling permit expiry')
      const cell = (id: number, name: string) =>
        wrapper.get(`tr[data-row="${id}"] [data-cell="${name}"]`)
      expect(cell(51, 'previous_expiry').text()).toBe(toDisplay(addDays(TODAY, 200)))
      expect(cell(51, 'previous_expiry').classes()).not.toContain('text-amber-700')
      expect(cell(54, 'previous_expiry').classes()).toContain('text-amber-700')
      expect(cell(55, 'previous_expiry').classes()).toContain('text-red-700')
      expect(cell(51, 'step_date').text()).toBe('02-10-2026')
    })

    it('Visa issued: calling expiry, submitted, issue and expired dates (amber/red) and the visa number', async () => {
      const issued = (id: number, expiry: string, number: string | null) =>
        visaPending(id, addDays(TODAY, 300), {
          status: 'completed',
          status_label: 'Visa issued',
          step_date: '2026-10-08',
          submitted_date: '2026-10-02',
          reference_no: number,
          valid_until: expiry,
          details: { issue_date: '2026-10-08', start_date: '2026-10-02' },
        })
      ROWS.issued = [
        issued(56, addDays(TODAY, 200), 'V-56'),
        issued(57, addDays(TODAY, 20), null), // within 30 days
        issued(58, addDays(TODAY, -1), null), // expired
      ]
      try {
        await mountStep('/visa?tab=issued')

        expect(headers()).toEqual([
          'Passport name',
          'Passport number',
          'Reference',
          'Company',
          'Calling expiry',
          'Visa submitted date',
          'Issue date',
          'Expired date',
          'Visa number',
        ])
        const cell = (id: number, name: string) =>
          wrapper.get(`tr[data-row="${id}"] [data-cell="${name}"]`)
        expect(cell(56, 'previous_expiry').text()).toBe(toDisplay(addDays(TODAY, 300)))
        expect(cell(56, 'step_date').text()).toBe('02-10-2026')
        expect(cell(56, 'issue_date').text()).toBe('08-10-2026')
        expect(cell(56, 'reference_no').text()).toBe('V-56')
        expect(cell(57, 'reference_no').text()).toBe('-')
        expect(cell(56, 'valid_until').classes()).not.toContain('text-amber-700')
        expect(cell(57, 'valid_until').classes()).toContain('text-amber-700')
        expect(cell(58, 'valid_until').classes()).toContain('text-red-700')
        expect(wrapper.findAll('tbody button')).toHaveLength(0)
      } finally {
        ROWS.issued = []
      }
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

  describe('Bulk update', () => {
    const tick = async (...ids: number[]) => {
      for (const id of ids)
        await wrapper.get(`tr[data-row="${id}"] input[data-select-row]`).trigger('change')
    }
    const bar = () => wrapper.get('[data-bulk-bar]')
    const actionOptions = () =>
      bar()
        .findAll('select[data-bulk-action] option')
        .map((o) => o.text())
    /** Apply in the bar, then confirm in the dialog. */
    const applyAndConfirm = async () => {
      await bar().get('button[data-bulk-apply]').trigger('click')
      await flushPromises()
      const dialog = [...wrapper.findAll('dialog')].find(
        (d) => d.get('h2').text() === 'Bulk update',
      )!
      await dialog
        .findAll('button')
        .find((b) => b.text().startsWith('Apply to'))!
        .trigger('click')
      await flushPromises()
    }
    const ok = (ids: number[], extra: Record<string, unknown> = {}) => ({
      updated: ids.map((id) => ({
        id,
        passport_number: `NW${id}`,
        passport_name: `P ${id}`,
        warnings: [],
        ...extra,
      })),
      skipped: [],
    })

    it('Calling Permitted: ticks rows, shows the bar and starts the visa for all of them', async () => {
      const { bulkStep } = await import('@/api/steps')
      vi.mocked(bulkStep).mockResolvedValue(ok([60, 61], { record_id: 900 }))
      ROWS.permitted = [permitted(60, addDays(TODAY, 100)), permitted(61, addDays(TODAY, 100))]
      await mountStep('/calling?tab=permitted')

      expect(wrapper.find('[data-bulk-bar]').exists()).toBe(false)
      expect(wrapper.get('[data-bulk-hint]').text()).toBe('Tick passports to update them together.')
      await tick(60, 61)

      expect(bar().get('[data-bulk-count]').text()).toBe('2 selected')
      expect(actionOptions()).toEqual(['Visa submitted'])
      expect(bar().get<HTMLInputElement>('input[data-bulk-field="step_date"]').element.value).toBe(
        TODAY,
      )
      await applyAndConfirm()

      expect(bulkStep).toHaveBeenCalledWith('visa', 'start', [60, 61], {
        status: 'in_process',
        remarks: null,
        step_date: TODAY,
      })
      expect(toastMessages()).toContain('Visa submitted: 2 updated.')
      // Data entry gets no Undo all.
      const toast = useToast().toasts.value.find((t) => t.message === 'Visa submitted: 2 updated.')!
      expect(toast.action).toBeUndefined()
      ROWS.permitted = []
    })

    it('"Select all on this page" ticks every row', async () => {
      ROWS.permitted = [permitted(60, addDays(TODAY, 100)), permitted(61, addDays(TODAY, 100))]
      await mountStep('/calling?tab=permitted')

      await wrapper.get('input[data-select-all]').trigger('change')
      expect(bar().get('[data-bulk-count]').text()).toBe('2 selected')
      await wrapper.get('input[data-select-all]').trigger('change')
      expect(wrapper.find('[data-bulk-bar]').exists()).toBe(false)
      ROWS.permitted = []
    })

    it('Visa Pending: Visa issued with one issue and expired date, or Rejected', async () => {
      const { bulkStep } = await import('@/api/steps')
      vi.mocked(bulkStep).mockResolvedValue(ok([51]))
      await mountStep('/visa')
      await tick(51)

      expect(actionOptions()).toEqual(['Visa issued', 'Rejected'])
      const fields = bar()
        .findAll('input[data-bulk-field]')
        .map((i) => i.attributes('data-bulk-field'))
      expect(fields).toEqual(['issue_date', 'valid_until'])

      // The expired date must be after the issue date.
      await bar().get('input[data-bulk-field="valid_until"]').setValue(TODAY)
      await bar().get('button[data-bulk-apply]').trigger('click')
      expect(bar().text()).toContain('Must be after the issue date')
      expect(bulkStep).not.toHaveBeenCalled()

      await bar().get('input[data-bulk-field="valid_until"]').setValue(addDays(TODAY, 180))
      await applyAndConfirm()
      expect(bulkStep).toHaveBeenCalledWith('visa', 'result', [51], {
        result: 'completed',
        result_date: TODAY,
        details: { issue_date: TODAY },
        valid_until: addDays(TODAY, 180),
      })
    })

    it('BMET Pending: each action and All done; skipped passports are listed and stay selected', async () => {
      const { bulkStep } = await import('@/api/steps')
      vi.mocked(bulkStep).mockResolvedValue({
        ...ok([60], { marked: ['training'] }),
        skipped: [
          {
            id: 61,
            passport_number: 'NW61',
            passport_name: 'P 61',
            reason: 'Training done already on 05-10-2026.',
          },
        ],
      })
      await mountStep('/bmet')
      await tick(60, 61)

      expect(actionOptions()).toEqual([
        'Training done',
        'Finger done',
        'BMET clearance done',
        'All done (Training + Finger + BMET clearance)',
      ])
      await applyAndConfirm()

      expect(bulkStep).toHaveBeenCalledWith('bmet', 'training', [60, 61], { date: TODAY })
      expect(toastMessages()).toContain('Training done: 1 updated, 1 skipped.')
      expect(toastMessages()).toContain('Skipped: NW61 (Training done already on 05-10-2026.)')
      expect(bar().get('[data-bulk-count]').text()).toBe('1 selected')
      expect(
        wrapper.get<HTMLInputElement>('tr[data-row="61"] input[data-select-row]').element.checked,
      ).toBe(true)
    })

    it('Flight Pending: set the flight date (may be in the future) or confirm', async () => {
      const { bulkStep } = await import('@/api/steps')
      vi.mocked(bulkStep).mockResolvedValue(ok([70, 71], { previous_booking_date: null }))
      await mountStep('/flight')
      await tick(70, 71)

      // The fixture's field label is "Flight booking date" (the app's config: "Flight date").
      expect(actionOptions()).toEqual(['Set flight booking date', 'Flight confirm'])
      await bar().get('input[data-bulk-field="booking_date"]').setValue('2026-12-20')
      await applyAndConfirm()
      expect(bulkStep).toHaveBeenCalledWith('flight', 'booking', [70, 71], {
        booking_date: '2026-12-20',
      })
    })

    it('admins get "Undo all", which reverses exactly that batch', async () => {
      const { bulkStep } = await import('@/api/steps')
      vi.mocked(bulkStep).mockResolvedValue({
        updated: [
          {
            id: 60,
            passport_number: 'NW60',
            passport_name: 'P 60',
            marked: ['training', 'finger', 'clearance'],
            warnings: [],
          },
          {
            id: 61,
            passport_number: 'NW61',
            passport_name: 'P 61',
            marked: ['finger', 'clearance'],
            warnings: [],
          },
        ],
        skipped: [],
      })
      vi.mocked(undoStepAction).mockResolvedValue(saved as never)
      await mountStep('/bmet', 'admin')
      await tick(60, 61)
      await bar().get('select[data-bulk-action]').setValue('all')
      await applyAndConfirm()

      const toast = useToast().toasts.value.find((t) => t.message.includes('2 updated'))!
      expect(toast.action?.label).toBe('Undo all')
      toast.action!.run()
      await flushPromises()

      expect(vi.mocked(undoStepAction).mock.calls).toEqual([
        [60, 'bmet', 'clearance'],
        [60, 'bmet', 'finger'],
        [60, 'bmet', 'training'],
        [61, 'bmet', 'clearance'],
        [61, 'bmet', 'finger'],
      ])
      expect(toastMessages().some((m) => m.endsWith('2 undone.'))).toBe(true)
    })

    it('accounts see no checkboxes or bar', async () => {
      await mountStep('/bmet', 'accounts')

      expect(wrapper.find('input[data-select-row]').exists()).toBe(false)
      expect(wrapper.find('[data-bulk-hint]').exists()).toBe(false)
    })
  })

  describe('Export CSV', () => {
    it('downloads the current tab with the same searches and confirms with a toast', async () => {
      const { downloadStepListCsv } = await import('@/api/steps')
      await mountStep('/visa?tab=issued&q=rahim')

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()

      expect(downloadStepListCsv).toHaveBeenCalledWith(
        'visa',
        expect.objectContaining({ tab: 'issued', search: 'rahim' }),
      )
      expect(toastMessages()).toContain('Downloaded visa-issued-01-05-2026.csv.')
    })

    it('shows an error toast when the download fails', async () => {
      const { downloadStepListCsv } = await import('@/api/steps')
      vi.mocked(downloadStepListCsv).mockRejectedValueOnce(new Error('boom'))
      await mountStep('/bmet?tab=cleared')

      await wrapper.get('button[data-export]').trigger('click')
      await flushPromises()

      expect(downloadStepListCsv).toHaveBeenCalledWith(
        'bmet',
        expect.objectContaining({ tab: 'cleared' }),
      )
      expect(toastMessages().some((m) => m.includes('Could not export'))).toBe(true)
      expect(wrapper.get('button[data-export]').text()).toBe('Export CSV')
    })
  })

  describe('searches', () => {
    it('sends the search, Filter by company and Filter by reference with the tab', async () => {
      const filter = (label: string) =>
        wrapper
          .findAllComponents({ name: 'SearchSelect' })
          .find((c) => (c.props() as Record<string, unknown>).label === label)!
      await mountStep('/visa?tab=rejected&q=karim')

      const search = wrapper.get('[role="search"]')
      expect(search.find('input[data-search-box="reference"]').exists()).toBe(false)
      expect(search.text()).not.toContain('Search reference')
      expect(filter('Filter by reference').props()).toMatchObject({
        placeholder: 'Search reference…',
        noneLabel: 'All references',
        clearable: true,
      })

      filter('Filter by company').vm.$emit('update:modelValue', {
        id: 3,
        name: 'Desert Co',
        country: { code: 'SA', name: 'Saudi Arabia' },
      })
      await flushPromises()
      filter('Filter by reference').vm.$emit('update:modelValue', {
        id: 8,
        type: 'agency',
        type_label: 'Agency',
        name: 'Sea Star',
      })
      await flushPromises()

      expect(router.currentRoute.value.query).toEqual({
        tab: 'rejected',
        q: 'karim',
        company_id: '3',
        reference_id: '8',
      })
      expect(lastListCall()).toEqual([
        'visa',
        expect.objectContaining({
          tab: 'rejected',
          search: 'karim',
          company_id: 3,
          reference_id: 8,
        }),
      ])

      // References of the chosen company only; "All references" removes the filter.
      const { searchReferences } = await import('@/api/references')
      await (
        filter('Filter by reference').props() as { fetch: (q: string) => Promise<unknown> }
      ).fetch('se')
      expect(searchReferences).toHaveBeenCalledWith({ q: 'se', company_id: 3 })
      filter('Filter by reference').vm.$emit('update:modelValue', null)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({
        tab: 'rejected',
        q: 'karim',
        company_id: '3',
      })
    })

    it('mentions company and reference when nothing matches', async () => {
      vi.mocked(listStepPassports).mockResolvedValue(page([]))
      await mountStep('/calling?company=nobody')

      expect(wrapper.get('[data-empty]').text()).toContain('company and reference searches')
    })
  })

  describe('Flight', () => {
    const tabKeys = () => wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))
    const selected = () => wrapper.get('[role="tab"][aria-selected="true"]').attributes('data-tab')
    const cell = (id: number, key: string) =>
      wrapper.get(`tr[data-row="${id}"] [data-cell="${key}"]`)
    const confirmButton = (id: number) =>
      wrapper.get<HTMLButtonElement>(`tr[data-row="${id}"] button[data-confirm]`)
    const bookingPopover = () => {
      const el = document.body.querySelector<HTMLElement>('[data-date-popover]')
      return el ? new DOMWrapper(el) : null
    }
    afterEach(() => {
      ROWS.confirmed = []
    })

    it('has exactly two tabs, Pending (default) and Flight confirmed', async () => {
      await mountStep('/flight')

      expect(tabKeys()).toEqual(['pending', 'confirmed'])
      expect(selected()).toBe('pending')
      expect(lastListCall()).toEqual(['flight', expect.objectContaining({ tab: 'pending' })])
      expect(wrapper.text()).not.toMatch(/Waiting for BMET|Ticket booked|Departed|Cancelled/)
    })

    it('Pending: visa expiry, BMET status, booking date and two buttons in order', async () => {
      flightPendingRows = [
        flightRow(70, { visa: addDays(TODAY, 10) }), // within 30 days
        flightRow(73, { clearance: '2026-10-11', booking: '2026-12-01', visa: addDays(TODAY, -1) }),
      ]
      await mountStep('/flight')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Visa expired date',
        'BMET status',
        'Flight booking date',
        'Actions',
      ])
      expect(cell(70, 'visa_valid_until').classes()).toContain('text-amber-700')
      expect(cell(73, 'visa_valid_until').classes()).toContain('text-red-700')
      expect(cell(70, 'bmet_status').get('[data-bmet="pending"]').classes()).toContain(
        'text-amber-700',
      )
      expect(cell(73, 'bmet_status').get('[data-bmet="cleared"]').text()).toBe('Cleared 11-10-2026')
      expect(cell(70, 'booking_date').text()).toBe('-')
      expect(cell(73, 'booking_date').text()).toBe('01-12-2026')
      const buttons = wrapper.findAll('tr[data-row="70"] [data-actions] button')
      expect(buttons.map((b) => b.text().replace(/\s+(for\s+)?FL\d+$/, ''))).toEqual([
        'Flight booking date',
        'Mark flight confirm',
      ])
      // With a date: a pencil instead of the text button.
      expect(wrapper.get('tr[data-row="73"] button[data-booking]').attributes()).toHaveProperty(
        'data-booking-edit',
      )
    })

    it.each([
      [70, 'BMET clearance and flight booking date are required'],
      [71, 'BMET clearance must be done first'],
      [72, 'Enter the flight booking date first'],
    ])('"Mark flight confirm" is disabled on row %i: %s', async (id, hint) => {
      await mountStep('/flight')

      expect(confirmButton(id).element.disabled).toBe(true)
      expect(confirmButton(id).element.parentElement!.getAttribute('title')).toBe(hint)
      await confirmButton(id).trigger('click')
      expect(confirmFlight).not.toHaveBeenCalled()
    })

    it('"Mark flight confirm" is enabled only with BMET cleared and a booking date', async () => {
      await mountStep('/flight')

      expect(confirmButton(73).element.disabled).toBe(false)
      expect(confirmButton(73).element.parentElement!.getAttribute('title')).toBeNull()
    })

    it('the booking popover (not a modal) saves the date; future dates allowed', async () => {
      await mountStep('/flight')
      await wrapper.get('tr[data-row="70"] button[data-booking]').trigger('click')
      await flushPromises()

      const p = bookingPopover()!
      expect(modal()).toBeNull()
      expect(p.attributes('style')).toContain('top:')
      expect(p.get('label').text()).toBe('Flight booking date *')
      expect(p.get('input').attributes('max')).toBeUndefined()
      expect(p.find('[data-date-clear]').exists()).toBe(false) // nothing to clear yet
      await p.get('button[data-date-save]').trigger('click')
      expect(p.get('[data-date-error]').text()).toBe('Enter the flight booking date.')

      const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length
      flightPendingRows = [flightRow(70, { booking: addDays(TODAY, 40) })]
      await p.get('input').setValue(addDays(TODAY, 40))
      await p.trigger('submit')
      await flushPromises()

      expect(bookFlight).toHaveBeenCalledWith(70, addDays(TODAY, 40))
      expect(bookingPopover()).toBeNull()
      expect(cell(70, 'booking_date').text()).toBe(toDisplay(addDays(TODAY, 40)))
      expect(wrapper.get('tr[data-row="70"] button[data-booking]').attributes()).toHaveProperty(
        'data-booking-edit',
      )
      expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)
      // Still BMET pending: the confirm stays disabled.
      expect(confirmButton(70).element.disabled).toBe(true)
    })

    it("shows the API's 422 under the date (e.g. before the visa issue date)", async () => {
      vi.mocked(bookFlight).mockRejectedValue(
        httpError(422, {
          message: 'Invalid.',
          errors: {
            booking_date: [
              'The flight booking date cannot be before the visa issue date (08-10-2026).',
            ],
          },
        }),
      )
      await mountStep('/flight')
      await wrapper.get('tr[data-row="70"] button[data-booking]').trigger('click')
      await flushPromises()
      const p = bookingPopover()!
      await p.get('input').setValue('2026-10-01')
      await p.trigger('submit')
      await flushPromises()

      expect(bookingPopover()!.get('[data-date-error]').text()).toBe(
        'The flight booking date cannot be before the visa issue date (08-10-2026).',
      )
    })

    it('data entry gets no undo: no Clear in the booking popover, no Undo after Flight confirm', async () => {
      await mountStep('/flight')
      await wrapper.get('tr[data-row="71"] button[data-booking-edit]').trigger('click')
      await flushPromises()
      expect(bookingPopover()!.find('button[data-date-clear]').exists()).toBe(false)

      vi.mocked(confirmFlight).mockResolvedValue(saved as never)
      await confirmButton(73).trigger('click')
      await flushPromises()
      const toast = useToast().toasts.value.find(
        (t) => t.message === 'FL0000073: Flight confirmed',
      )!
      expect(toast.action).toBeUndefined()
    })

    it('the pencil edits and clears the date (admin)', async () => {
      await mountStep('/flight', 'admin')
      await wrapper.get('tr[data-row="71"] button[data-booking-edit]').trigger('click')
      await flushPromises()
      let p = bookingPopover()!
      expect(p.get<HTMLInputElement>('input').element.value).toBe('2026-12-01')
      await p.get('input').setValue('2026-12-05')
      await p.trigger('submit')
      await flushPromises()
      expect(bookFlight).toHaveBeenCalledWith(71, '2026-12-05')

      await wrapper.get('tr[data-row="71"] button[data-booking-edit]').trigger('click')
      await flushPromises()
      p = bookingPopover()!
      flightPendingRows = [flightRow(71)]
      await p.get('button[data-date-clear]').trigger('click')
      await flushPromises()
      expect(clearFlightBooking).toHaveBeenCalledWith(71)
      expect(cell(71, 'booking_date').text()).toBe('-')
      expect(toastMessages()).toContain('FL0000071: Flight booking date cleared.')
    })

    it('one click confirms: the row moves at once, no double click, toast with Undo; Undo puts it back', async () => {
      let resolve!: (value: unknown) => void
      vi.mocked(confirmFlight).mockReturnValue(new Promise((r) => (resolve = r)) as never)
      await mountStep('/flight', 'admin')
      const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length

      await confirmButton(73).trigger('click')
      expect(wrapper.find('tr[data-row="73"]').exists()).toBe(false) // at once
      expect(document.body.querySelector('[data-top-modal], [data-date-popover]')).toBeNull()
      expect(confirmFlight).toHaveBeenCalledTimes(1)
      expect(confirmFlight).toHaveBeenCalledWith(73)

      flightPendingRows = flightPendingRows.filter((r) => r.id !== 73)
      ROWS.confirmed = [
        flightRow(73, { clearance: '2026-10-11', booking: '2026-12-01', confirmed: TODAY }),
      ]
      resolve(saved)
      await flushPromises()

      const toast = useToast().toasts.value.find(
        (t) => t.message === 'FL0000073: Flight confirmed',
      )!
      expect(toast.action?.label).toBe('Undo')
      expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)

      flightPendingRows = [
        ...flightPendingRows,
        flightRow(73, { clearance: '2026-10-11', booking: '2026-12-01' }),
      ]
      ROWS.confirmed = []
      toast.action!.run()
      await flushPromises()
      expect(undoFlightConfirm).toHaveBeenCalledWith(73)
      expect(toastMessages()).toContain('FL0000073: back in Pending.')
      // Back with its booking date kept.
      expect(cell(73, 'booking_date').text()).toBe('01-12-2026')
    })

    it("puts the row back and shows the API's 422 message in a toast", async () => {
      vi.mocked(confirmFlight).mockRejectedValue(
        httpError(422, {
          message: 'BMET clearance must be done before the flight is confirmed.',
        }),
      )
      await mountStep('/flight')
      await confirmButton(73).trigger('click')
      await flushPromises()

      expect(wrapper.find('tr[data-row="73"]').exists()).toBe(true)
      expect(useToast().toasts.value.find((t) => t.type === 'error')?.message).toBe(
        'BMET clearance must be done before the flight is confirmed.',
      )
    })

    it('shows API warnings without blocking', async () => {
      vi.mocked(confirmFlight).mockResolvedValue({
        ...saved,
        warnings: [{ code: 'visa_expires', message: 'The visa expires before the flight.' }],
      } as never)
      await mountStep('/flight')
      await confirmButton(73).trigger('click')
      await flushPromises()

      expect(
        useToast()
          .toasts.value.filter((t) => t.type === 'warning')
          .map((t) => t.message),
      ).toEqual(['The visa expires before the flight.'])
      expect(toastMessages()).toContain('FL0000073: Flight confirmed')
    })

    it('Flight confirmed: booking and confirmed dates, read-only (the booking is locked)', async () => {
      ROWS.confirmed = [
        flightRow(90, { clearance: '2026-10-11', booking: '2026-11-02', confirmed: '2026-10-13' }),
      ]
      await mountStep('/flight?tab=confirmed')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Flight booking date',
        'Confirmed date',
      ])
      expect(cell(90, 'booking_date').text()).toBe('02-11-2026')
      expect(cell(90, 'confirmed_date').text()).toBe('13-10-2026')
      expect(wrapper.findAll('tbody button')).toHaveLength(0)
      expect(wrapper.find('[data-booking], [data-date-popover]').exists()).toBe(false)
    })

    it('empty texts', async () => {
      flightPendingRows = []
      await mountStep('/flight')
      expect(wrapper.get('[data-empty]').text()).toContain(
        'Passports with an issued visa appear here.',
      )
      wrapper.unmount()
      await mountStep('/flight?tab=confirmed')
      expect(wrapper.get('[data-empty]').text()).toContain('No confirmed flights yet.')
    })

    it('has no Flight modal (no flight date dialog or extra fields)', async () => {
      await mountStep('/flight')
      for (const id of [70, 73]) {
        for (const b of wrapper.findAll(`tr[data-row="${id}"] button`)) {
          if ((b.element as HTMLButtonElement).disabled) continue
          await b.trigger('click')
          await flushPromises()
          expect(modal()).toBeNull()
        }
      }
      expect(document.body.textContent).not.toMatch(/Airline|Ticket PNR|Flight number/)
      const components = import.meta.glob('../../components/*.vue')
      expect(Object.keys(components).some((p) => /Flight.*(Modal|Dialog)/.test(p))).toBe(false)
    })

    it('accounts sees no buttons on either Flight tab', async () => {
      ROWS.confirmed = [flightRow(90, { booking: '2026-11-02', confirmed: '2026-10-13' })]
      for (const tab of ['pending', 'confirmed']) {
        await mountStep(`/flight?tab=${tab}`, 'accounts')
        expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0)
        expect(wrapper.findAll('tbody button')).toHaveLength(0)
        expect(headers()).not.toContain('Actions')
        wrapper.unmount()
      }
      await mountStep('/flight', 'accounts')
    })
  })

  describe('BMET Clearance', () => {
    const tabKeys = () => wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-tab'))
    const cell = (id: number, key: string) =>
      wrapper.get(`tr[data-row="${id}"] [data-cell="${key}"]`)
    const markButton = (id: number, key: string) =>
      wrapper.find<HTMLButtonElement>(`tr[data-row="${id}"] button[data-action="${key}"]`)
    afterEach(() => {
      ROWS.cleared = []
    })

    it('has exactly two tabs, Pending and BMET cleared; no "Enter BMET date"', async () => {
      await mountStep('/bmet')

      expect(tabKeys()).toEqual(['pending', 'cleared'])
      expect(wrapper.text()).not.toMatch(/Submitted|Rejected|Enter BMET date/)
      expect(wrapper.find('button[data-step-start], button[data-step-result]').exists()).toBe(false)
    })

    it('Pending: visa expiry and three action columns; clearance waits for training and finger', async () => {
      bmetPendingRows = [
        bmetRow(60, { visa: addDays(TODAY, 10) }), // within 30 days
        bmetRow(61, { training: '2026-10-05', visa: addDays(TODAY, -1) }), // expired
        bmetRow(62, { training: '2026-10-05', finger: '2026-10-06' }),
      ]
      await mountStep('/bmet')

      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Visa expired date',
        'Training',
        'Finger',
        'BMET clearance',
      ])
      expect(cell(60, 'visa_valid_until').classes()).toContain('text-amber-700')
      expect(cell(61, 'visa_valid_until').classes()).toContain('text-red-700')
      // Nothing done: Training and Finger can be marked, in any order; clearance waits.
      expect(markButton(60, 'training').element.disabled).toBe(false)
      expect(markButton(60, 'finger').element.disabled).toBe(false)
      expect(markButton(60, 'clearance').element.disabled).toBe(true)
      expect(markButton(60, 'clearance').element.parentElement!.getAttribute('title')).toBe(
        'Training and finger must be done first',
      )
      // Training done: its date, a pencil; clearance still waits.
      expect(cell(61, 'training').get('[data-action-done]').text()).toContain('05-10-2026')
      expect(cell(61, 'training').find('button[data-action-edit]').exists()).toBe(true)
      expect(markButton(61, 'clearance').element.disabled).toBe(true)
      // Both done: clearance can be marked.
      expect(markButton(62, 'clearance').element.disabled).toBe(false)
      expect(markButton(62, 'clearance').element.parentElement!.getAttribute('title')).toBeNull()
    })

    it('Mark done saves today in one click: the row changes at once, no double click, toast with Undo', async () => {
      let resolve!: (value: unknown) => void
      vi.mocked(markStepAction).mockReturnValue(new Promise((r) => (resolve = r)) as never)
      await mountStep('/bmet', 'admin')
      const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length

      await markButton(60, 'finger').trigger('click')
      // At once, before the API answers; the row's other buttons wait.
      expect(cell(60, 'finger').get('[data-action-done]').text()).toContain(toDisplay(TODAY))
      expect(markButton(60, 'training').element.disabled).toBe(true)
      await markButton(60, 'training').trigger('click')
      expect(markStepAction).toHaveBeenCalledTimes(1)
      expect(markStepAction).toHaveBeenCalledWith(60, 'bmet', 'finger', undefined)

      bmetPendingRows = [bmetRow(60, { finger: TODAY }), ...bmetPendingRows.slice(1)]
      resolve(saved)
      await flushPromises()

      const toast = useToast().toasts.value.find((t) => t.message === 'BM0000060: Finger done')!
      expect(toast.action?.label).toBe('Undo')
      expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)

      bmetPendingRows = [bmetRow(60), ...bmetPendingRows.slice(1)]
      toast.action!.run()
      await flushPromises()
      expect(undoStepAction).toHaveBeenCalledWith(60, 'bmet', 'finger')
      expect(toastMessages()).toContain('BM0000060: Finger undone.')
      expect(markButton(60, 'finger').exists()).toBe(true)
    })

    it('puts the row back and shows the API error when marking fails', async () => {
      vi.mocked(markStepAction).mockRejectedValue(new Error('The BMET step is not open.'))
      await mountStep('/bmet')
      await markButton(60, 'training').trigger('click')
      await flushPromises()

      expect(markButton(60, 'training').exists()).toBe(true)
      expect(useToast().toasts.value.some((t) => t.type === 'error')).toBe(true)
    })

    it('the pencil corrects a date in a top modal (not in the future)', async () => {
      await mountStep('/bmet')
      await cell(61, 'training').get('button[data-action-edit]').trigger('click')
      await flushPromises()

      const m = modal()!
      expect(m.get('h2').text()).toBe('Training date')
      const input = m.get<HTMLInputElement>('input[type="date"]')
      expect(input.element.value).toBe('2026-10-05')
      await input.setValue(addDays(TODAY, 1))
      await m.get('form').trigger('submit')
      expect(m.get('[data-action-date-error]').text()).toBe('The date cannot be in the future.')
      expect(markStepAction).not.toHaveBeenCalled()

      await input.setValue('2026-10-04')
      await m.get('form').trigger('submit')
      await flushPromises()
      expect(modal()).toBeNull()
      expect(markStepAction).toHaveBeenCalledWith(61, 'bmet', 'training', '2026-10-04')
      expect(toastMessages()).toContain('BM0000061: Training date changed to 04-10-2026.')
    })

    it('BMET clearance moves the row to BMET cleared and to Flight Pending', async () => {
      await mountStep('/bmet', 'admin')
      vi.mocked(markStepAction).mockImplementation(async () => {
        // The API: BMET cleared, and Flight Pending.
        bmetPendingRows = bmetPendingRows.filter((r) => r.id !== 62)
        ROWS.cleared = [
          bmetRow(62, { training: '2026-10-05', finger: '2026-10-06', clearance: TODAY }),
        ]
        flightPendingRows = [flightRow(62, { clearance: TODAY, booking: '2026-12-01' })]
        return saved as never
      })
      const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length
      await markButton(62, 'clearance').trigger('click')
      expect(wrapper.find('tr[data-row="62"]').exists()).toBe(false) // at once
      await flushPromises()

      expect(markStepAction).toHaveBeenCalledWith(62, 'bmet', 'clearance', undefined)
      const toast = useToast().toasts.value.find((t) => t.message.includes('BMET cleared'))!
      expect(toast.message).toBe('BM0000062: Moved to BMET cleared - now in Flight Pending')
      expect(toast.action?.label).toBe('Undo')
      expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)
      wrapper.unmount()

      await mountStep('/bmet?tab=cleared')
      expect(headers()).toEqual([
        'Passport name',
        'Passport number',
        'Reference',
        'Company',
        'Training date',
        'Finger date',
        'BMET clearance date',
      ])
      expect(cell(62, 'clearance').text()).toBe(toDisplay(TODAY))
      expect(cell(62, 'training').text()).toBe('05-10-2026')
      expect(wrapper.findAll('tbody button')).toHaveLength(0)
      // Flight in the same app (no reload): BMET cleared, and the confirm is enabled.
      await router.push('/flight')
      await flushPromises()
      expect(cell(62, 'bmet_status').text()).toBe(`Cleared ${toDisplay(TODAY)}`)
      expect(
        wrapper.get<HTMLButtonElement>('tr[data-row="62"] button[data-confirm]').element.disabled,
      ).toBe(false)
    })

    it('empty texts', async () => {
      bmetPendingRows = []
      await mountStep('/bmet')
      expect(wrapper.get('[data-empty]').text()).toContain(
        'Passports with an issued visa appear here.',
      )
      wrapper.unmount()
      await mountStep('/bmet?tab=cleared')
      expect(wrapper.get('[data-empty]').text()).toContain('No cleared passports yet.')
    })

    it('accounts sees the progress but no buttons', async () => {
      await mountStep('/bmet', 'accounts')

      expect(wrapper.findAll('tbody button')).toHaveLength(0)
      expect(cell(60, 'training').text()).toBe('Pending')
      expect(cell(61, 'training').text()).toContain('05-10-2026')
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

    it('Visa issued: Issue date, Expired date, then the optional Visa number (no Result date)', async () => {
      await mountStep('/visa')
      await wrapper.get('tr[data-row="51"] button[data-step-result="completed"]').trigger('click')
      await flushPromises()

      const m = modal()!
      expect(m.get('h2').text()).toBe('Mark KARIM UDDIN as Visa issued?')
      const dialog = m.get('[data-step-result-dialog]')
      expect(
        dialog.findAll('[data-step-field]').map((f) => f.attributes('data-step-field')),
      ).toEqual(['issue_date', 'valid_until', 'reference_no'])
      expect(dialog.findAll('label').map((l) => l.text())).toEqual([
        'Issue date *',
        'Expired date *',
        'Visa number',
      ])
      expect(dialog.text()).not.toContain('Result date')
      expect(dialog.get('[data-step-field="issue_date"] input').attributes('max')).toBe(TODAY)

      await dialog.get('form').trigger('submit')
      expect(dialog.text()).toContain('Enter the issue date.')
      expect(dialog.text()).toContain('Enter the expired date.')
      expect(dialog.text()).not.toContain('Enter the visa number.')

      await dialog.get('[data-step-field="issue_date"] input').setValue(addDays(TODAY, 1))
      await dialog.get('[data-step-field="valid_until"] input').setValue(addDays(TODAY, 1))
      await dialog.get('form').trigger('submit')
      expect(dialog.text()).toContain('The issue date cannot be in the future.')
      expect(dialog.text()).toContain('The expired date must be after the issue date.')
      expect(recordStepResult).not.toHaveBeenCalled()

      await dialog.get('[data-step-field="issue_date"] input').setValue('2026-10-08')
      await dialog.get('[data-step-field="valid_until"] input').setValue('2027-01-08')
      await dialog.get('form').trigger('submit')
      await flushPromises()

      expect(recordStepResult).toHaveBeenCalledWith(51, 'visa', {
        result: 'completed',
        result_date: '2026-10-08',
        valid_until: '2027-01-08',
        details: { issue_date: '2026-10-08' },
      })
      expect(toastMessages()).toContain(
        'VS0000051: Moved to Visa issued - now in BMET Clearance and Flight',
      )
    })

    it('Visa issued: the passport is under Visa issued, BMET Pending and Flight Pending', async () => {
      bmetPendingRows = []
      vi.mocked(recordStepResult).mockImplementation(async () => {
        visaPendingRows = []
        ROWS.issued = [visaPending(51, addDays(TODAY, 200), { status: 'completed' })]
        bmetPendingRows = [bmetRow(51)]
        flightPendingRows = [flightRow(51)]
        return saved as never
      })
      try {
        await mountStep('/visa')
        const summaryBefore = vi.mocked(fetchWorkflowSummary).mock.calls.length
        await wrapper.get('tr[data-row="51"] button[data-step-result="completed"]').trigger('click')
        await flushPromises()
        const dialog = modal()!.get('[data-step-result-dialog]')
        await dialog.get('[data-step-field="issue_date"] input').setValue('2026-10-08')
        await dialog.get('[data-step-field="valid_until"] input').setValue('2027-01-08')
        await dialog.get('form').trigger('submit')
        await flushPromises()

        expect(wrapper.find('tr[data-row="51"]').exists()).toBe(false)
        expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryBefore)
        expect(wrapper.get('[role="tab"][data-tab="issued"] [data-tab-count]').text()).toBe('4')
        for (const path of ['/visa?tab=issued', '/bmet', '/flight']) {
          wrapper.unmount()
          await mountStep(path)
          expect(wrapper.find('tr[data-row="51"]').exists()).toBe(true)
        }
      } finally {
        ROWS.issued = []
      }
    })

    it('Rejected: only the result date; it may not be in the future', async () => {
      await mountStep('/visa')
      await wrapper.get('tr[data-row="51"] button[data-step-result="rejected"]').trigger('click')
      await flushPromises()

      const dialog = modal()!.get('[data-step-result-dialog]')
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
        : el.matches('[data-page-header]')
          ? 'header'
          : el.tagName === 'SECTION'
            ? 'card'
            : el.tagName,
    )
    expect(order.slice(0, 3)).toEqual(['step bar', 'header', 'card'])
    // The header: title and subtitle on the left, Export CSV on the right (outside the card).
    const header = wrapper.get('[data-page-header]')
    expect(header.classes()).toContain('mt-6')
    expect(header.find('h1').exists()).toBe(true)
    expect(header.find('p').exists()).toBe(true)
    expect(header.find('button[data-export]').exists()).toBe(true)
    expect(wrapper.get('section.glass-card').find('[data-export]').exists()).toBe(false)
    const title = wrapper.get('h1')
    expect(title.text()).toBe('Visa')
    // Same classes as the Medical page's title and card.
    expect(title.classes()).toEqual(
      expect.arrayContaining(['text-2xl', 'font-bold', 'text-primary-900', 'sm:text-3xl']),
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
