import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import MedicalView from '../MedicalView.vue'
import PassportListView from '../PassportListView.vue'
import { listPassports } from '@/api/passports'
import { updateMedicalSlip } from '@/api/medical'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { httpError, makePassport, makeUser, notStartedPassport } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { PassportEntry, PassportFilters } from '@/types/passport'

vi.mock('@/api/passports', () => ({
  listPassports: vi.fn(),
  getPassport: vi.fn(),
  deletePassport: vi.fn(),
}))
vi.mock('@/api/medical', () => ({
  updateMedicalSlip: vi.fn(),
  recordMedical: vi.fn(),
  updateMedical: vi.fn(),
  fetchMedicalQueue: vi.fn(),
}))
vi.mock('@/api/medicalCenters', () => ({
  searchMedicalCenters: vi.fn(async () => []),
  createMedicalCenter: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
  fetchWorkflowSummary: vi.fn(async () => ({
    steps: [],
    step1: { total_all: 2, total_active: 2, incomplete: 0 },
    step2: { not_started: 1, pending: 1, fit: 0, expiring_soon: 0, expired: 0, unfit: 0 },
    step3: { enabled: false, ready: 0 },
  })),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/references', () => ({ searchReferences: vi.fn(async () => []) }))

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

/** Just created: no medical slip, so medical "not started". */
const NEW_PASSPORT = makePassport({ id: 50, passport_number: 'NW5000001', ...notStartedPassport() })
/** After the slip date is saved: medical pending. */
const WITH_SLIP = makePassport({
  id: 50,
  passport_number: 'NW5000001',
  medical_slip: { date: '2026-10-05', no: 'MG-77', medical_center: null },
  medical_status: 'pending',
  current_stage: 'medical',
  stage_status: 'pending',
})

let wrapper: VueWrapper

async function mountAt(path: string, role: Role = 'data_entry') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports', name: 'passports', component: PassportListView },
      { path: '/medical', name: 'medical', component: MedicalView },
      { path: '/passports/new', name: 'passport-new', component: Empty },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/all-passports', name: 'all-passports', component: Empty },
      { path: '/process', name: 'process', component: Empty },
    ],
  })
  await router.push(path)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

const row = (id: number) =>
  wrapper.findAll('tr[data-row]').find((r) => r.find(`[data-slip-action="${id}"]`).exists())

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('a new passport', () => {
  it('appears in the Passport list as "Passport entered" with "Add medical slip"', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([NEW_PASSPORT]))
    await mountAt('/passports')

    expect(listPassports).toHaveBeenCalledWith(expect.objectContaining({ stage: 'passport' }))
    expect(wrapper.get('tr[data-row] [data-stage-badge]').text()).toBe('Passport entered')
    expect(row(50)!.get('[data-slip-action="50"]').text()).toContain('Add medical slip')
  })

  it('is not listed in Medical → Pending', async () => {
    // Pending asks the API for slip-entered passports only…
    vi.mocked(listPassports).mockImplementation(async (filters: PassportFilters) =>
      // …and even if a not-started passport came back, the tab would not show it.
      filters.medical_status === 'pending' ? page([NEW_PASSPORT]) : page([]),
    )
    await mountAt('/medical')

    expect(listPassports).toHaveBeenCalledWith(
      expect.objectContaining({ medical_status: 'pending' }),
    )
    expect(wrapper.text()).not.toContain('NW5000001')
    expect(wrapper.find('[data-empty]').exists()).toBe(true)
    // The tab counts Pending only; not-started passports get a grey hint instead.
    expect(wrapper.get('#medical-tab-pending [data-tab-count]').text()).toBe('1')
    expect(wrapper.get('[data-not-started-hint]').text()).toContain('1 not started')
  })

  it('lists slip-entered passports in Medical → Pending with "Record medical result"', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([WITH_SLIP]))
    await mountAt('/medical')

    const pending = wrapper.get('tr[data-row]')
    expect(pending.text()).toContain('NW5000001')
    expect(pending.text()).toContain('05-10-2026') // the slip date
    expect(pending.text()).toContain('Record medical result')
  })
})

describe('"Add medical slip" in the Passport list', () => {
  async function openSlipModal() {
    await wrapper.get('[data-slip-action="50"]').trigger('click')
    await flushPromises()
  }
  const slipForm = () =>
    wrapper.findAll('form').find((f) => f.find('[data-field="medical_slip_date"]').exists())!

  it('requires the "Medical slip date (MYGRAM)"', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([NEW_PASSPORT]))
    await mountAt('/passports')
    await openSlipModal()

    expect(slipForm().get('[data-field="medical_slip_date"] label').text()).toContain(
      'Medical slip date (MYGRAM)',
    )
    await slipForm().trigger('submit')
    await flushPromises()

    expect(updateMedicalSlip).not.toHaveBeenCalled()
    expect(slipForm().text()).toContain('Enter the medical slip date.')
  })

  it('saves the slip; the row leaves the list, counts refresh and a toast says so', async () => {
    const { fetchWorkflowSummary } = await import('@/api/workflow')
    vi.mocked(listPassports)
      .mockResolvedValueOnce(page([NEW_PASSPORT]))
      // Reloaded: it is no longer at the "Passport entered" stage.
      .mockResolvedValue(page([]))
    vi.mocked(updateMedicalSlip).mockResolvedValue(WITH_SLIP)
    await mountAt('/passports')
    const summaryCalls = vi.mocked(fetchWorkflowSummary).mock.calls.length
    await openSlipModal()

    await slipForm().get('[data-field="medical_slip_date"] input').setValue('2026-10-05')
    await slipForm().get('[data-field="medical_slip_no"] input').setValue(' MG-77 ')
    await slipForm().trigger('submit')
    await flushPromises()

    expect(updateMedicalSlip).toHaveBeenCalledWith(50, {
      medical_slip_date: '2026-10-05',
      medical_slip_no: 'MG-77',
      medical_center_id: null,
    })
    expect(listPassports).toHaveBeenCalledTimes(2)
    expect(listPassports).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'passport' }))
    expect(wrapper.find('[data-slip-action="50"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-row]')).toHaveLength(0)
    expect(wrapper.find('[data-empty]').exists()).toBe(true)
    expect(vi.mocked(fetchWorkflowSummary).mock.calls.length).toBeGreaterThan(summaryCalls)
    expect(useToast().toasts.value.map((t) => t.message)).toContain('Moved to Medical Pending')
  })

  it('keeps the dialog open with the server error on 422', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([NEW_PASSPORT]))
    vi.mocked(updateMedicalSlip).mockRejectedValue(
      httpError(422, { errors: { medical_slip_date: ['The medical slip date is required.'] } }),
    )
    await mountAt('/passports')
    await openSlipModal()

    await slipForm().get('[data-field="medical_slip_date"] input').setValue('2026-10-05')
    await slipForm().trigger('submit')
    await flushPromises()

    expect(slipForm().text()).toContain('The medical slip date is required.')
  })
})

describe('other pages keep their filters (only All Passports lost them)', () => {
  it('Medical keeps Company, Company country and Sort by', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([WITH_SLIP]))
    await mountAt('/medical')

    const labels = wrapper.findAll('label').map((l) => l.text().trim())
    expect(labels).toEqual(expect.arrayContaining(['Company', 'Company country', 'Sort by']))
  })

  it('Medical keeps its tabs and the Company dropdown search', async () => {
    vi.mocked(listPassports).mockResolvedValue(page([WITH_SLIP]))
    await mountAt('/medical')

    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    expect(wrapper.find('input[role="combobox"]').exists()).toBe(true)
  })
})
