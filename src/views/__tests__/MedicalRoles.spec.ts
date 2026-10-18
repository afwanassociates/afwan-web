import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import MedicalView from '../MedicalView.vue'
import PassportDetailView from '../PassportDetailView.vue'
import MedicalHistoryTable from '@/components/MedicalHistoryTable.vue'
import { listPassports, getPassport } from '@/api/passports'
import { listMedicals } from '@/api/medical'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser, notStartedPassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { MedicalRecord } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/passports', () => ({
  listPassports: vi.fn(),
  getPassport: vi.fn(),
  getPassportHistory: vi.fn(async () => [
    {
      key: 'medical-1',
      date: '2026-09-01',
      step_key: 'medical',
      step_label: 'Medical',
      title: 'Medical Unfit',
      tone: 'red',
      details: [],
      recorded_by: null,
      remarks: null,
    },
  ]),
}))
vi.mock('@/api/medical', () => ({
  listMedicals: vi.fn(),
  deleteMedical: vi.fn(),
  recordMedicalResult: vi.fn(),
  updateMedicalDate: vi.fn(),
  updateMedicalSlip: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
}))
vi.mock('@/api/steps', () => ({
  listStepRecords: vi.fn(async () => ({})),
  deleteStepRecord: vi.fn(),
  recordStep: vi.fn(),
  updateStepRecord: vi.fn(),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))

/** The API says yes to everything here, so these tests check the role rules on top. */
const UNFIT: PassportEntry = makePassport({
  medical_status: 'unfit',
  medical_status_label: 'Unfit',
  current_medical: {
    id: 9,
    medical_date: '2026-10-01',
    result: 'unfit',
    valid_until: null,
    days_left: null,
    remarks: 'Hepatitis B positive',
    recorded_by: { id: 5, name: 'Admin' },
    created_at: '',
  },
  can: { update: true, delete: true, record_medical: true },
})

function record(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 9,
    passport_entry_id: 42,
    medical_date: '2026-10-01',
    result: 'unfit',
    result_label: 'Unfit',
    valid_until: null,
    days_left: null,
    remarks: null,
    recorded_by: { id: 5, name: 'Admin' },
    created_at: '',
    updated_by: 5,
    updated_at: '',
    can: { update: true, delete: true },
    ...overrides,
  }
}

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

async function mountView(component: object, role: Role, path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/medical', name: 'medical', component },
      { path: '/process', name: 'process', component: { template: '<div />' } },
      { path: '/:step', name: 'step-page', component: { template: '<div />' } },
      { path: '/passports/:id', name: 'passport-detail', component },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/passports', name: 'passports', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPassports).mockResolvedValue(page([UNFIT]))
  vi.mocked(getPassport).mockResolvedValue(UNFIT)
  vi.mocked(listMedicals).mockResolvedValue([record()])
})
afterEach(() => wrapper.unmount())

describe('Medical → Unfit tab', () => {
  it('asks the API for unfit passports only', async () => {
    await mountView(MedicalView, 'admin', '/medical?tab=unfit')

    expect(listPassports).toHaveBeenCalledWith(expect.objectContaining({ medical_status: 'unfit' }))
    expect(wrapper.text()).toContain('Hepatitis B positive')
  })

  it('is a tab of the Medical page with its count', async () => {
    await mountView(MedicalView, 'admin', '/medical?tab=unfit')

    const tab = wrapper.get('#medical-tab-unfit')
    expect(tab.attributes('aria-selected')).toBe('true')
    expect(tab.text()).toContain('Unfit')
  })

  it.each(['data_entry', 'admin', 'super_admin'] as const)(
    'is read-only for %s: no result actions (no Re-test, Fit or Unfit)',
    async (role) => {
      await mountView(MedicalView, role, '/medical?tab=unfit')

      const row = wrapper.get('tr[data-row]')
      expect(row.find('[data-retest]').exists()).toBe(false)
      expect(row.find('button[data-result]').exists()).toBe(false)
      expect(row.find('[data-enter-medical-date]').exists()).toBe(false)
      const labels = row.findAll('button').map((b) => b.text())
      expect(labels.some((t) => /Re-test|Repeat|Fit|Unfit|medical date/.test(t))).toBe(false)
    },
  )
})

describe('Medical history buttons', () => {
  const buttons = (role: Role, records: MedicalRecord[]) =>
    mount(MedicalHistoryTable, { props: { records, role } })
      .findAll('button')
      .map((b) => b.text())

  it('data_entry never sees Delete, even when the API allows it', () => {
    const labels = buttons('data_entry', [record()])
    expect(labels.some((l) => l.startsWith('Delete'))).toBe(false)
    expect(labels.some((l) => l.startsWith('Edit'))).toBe(true)
  })

  it('admin sees Delete', () => {
    expect(buttons('admin', [record()]).some((l) => l.startsWith('Delete'))).toBe(true)
  })

  it('hides Edit when the API says no (another user’s record)', () => {
    const labels = buttons('data_entry', [record({ can: { update: false, delete: false } })])
    expect(labels).toEqual([])
  })
})

describe('Passport detail', () => {
  const action = () => wrapper.find('[data-medical-action]')

  it.each(['admin', 'data_entry'] as const)(
    'has no result action for an unfit passport (%s); history stays read-only',
    async (role) => {
      await mountView(PassportDetailView, role, '/passports/42')

      expect(action().exists()).toBe(false)
      const history = wrapper.get('[aria-labelledby="history-heading"]')
      expect(history.get('h2').text()).toBe('Passport history')
      expect(history.findAll('[data-history-event]').length).toBeGreaterThan(0)
      expect(history.findAll('button')).toHaveLength(0)
    },
  )

  it.each(['pending', 'expired', 'fit'] as const)(
    'a %s passport offers no Record / Repeat medical button',
    async (status) => {
      vi.mocked(getPassport).mockResolvedValue(
        makePassport({ medical_status: status, current_medical: null }),
      )
      vi.mocked(listMedicals).mockResolvedValue([])
      await mountView(PassportDetailView, 'data_entry', '/passports/42')

      expect(action().exists()).toBe(false)
    },
  )

  it('a not-started passport still offers "Add medical slip"', async () => {
    vi.mocked(getPassport).mockResolvedValue(makePassport(notStartedPassport()))
    vi.mocked(listMedicals).mockResolvedValue([])
    await mountView(PassportDetailView, 'data_entry', '/passports/42')

    expect(action().text()).toBe('Add medical slip')
  })
})

describe('Step bar placement', () => {
  it.each([
    ['Medical page', '/medical'],
    ['Unfit tab', '/medical?tab=unfit'],
  ] as const)(
    'the %s shows the step bar, without "Completed" or per-row steppers',
    async (_name, path) => {
      await mountView(MedicalView, 'data_entry', path)

      expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(true)
      expect(wrapper.find('[data-step="completed"]').exists()).toBe(false)
      expect(wrapper.find('[data-mode="compact"]').exists()).toBe(false)
    },
  )

  it('the passport detail page still shows its step bar', async () => {
    await mountView(PassportDetailView, 'data_entry', '/passports/42')

    expect(wrapper.find('nav[aria-label="Workflow steps"]').exists()).toBe(true)
  })
})
