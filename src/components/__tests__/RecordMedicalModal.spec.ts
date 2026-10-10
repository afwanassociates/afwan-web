import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RecordMedicalModal from '../RecordMedicalModal.vue'
import SearchSelect from '../SearchSelect.vue'
import { fetchMedicalQueue, recordMedical } from '@/api/medical'
import { getPassport } from '@/api/passports'
import { addDays, addMonthsNoOverflow, businessToday, toDisplayDate } from '@/lib/dates'
import { useAuthStore } from '@/stores/auth'
import { httpError, makePassport, makeUser } from '@/test/helpers'
import type { MedicalSaveResponse } from '@/types/medical'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/medical', () => ({
  recordMedical: vi.fn(),
  updateMedical: vi.fn(),
  fetchMedicalQueue: vi.fn(),
}))
vi.mock('@/api/passports', () => ({ getPassport: vi.fn() }))
vi.mock('@/api/medicalCenters', () => ({
  searchMedicalCenters: vi.fn(async () => []),
  createMedicalCenter: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({ fetchWorkflowSummary: vi.fn(async () => null) }))

const TODAY = businessToday()

function saveResponse(passportId: number, warnings: string[] = []): MedicalSaveResponse {
  return {
    data: {
      id: 1,
      passport_entry_id: passportId,
      medical_date: TODAY,
      result: 'fit',
      result_label: 'Fit',
      valid_until: addMonthsNoOverflow(TODAY, 3),
      days_left: 90,
      remarks: null,
      medical_center: null,
      slip_no: null,
      slip_date: null,
      recorded_by: { id: 5, name: 'Data Entry' },
      created_at: '',
      updated_by: 5,
      updated_at: '',
      can: { update: true, delete: false },
    },
    passport: {
      id: passportId,
      medical_status: 'fit',
      medical_status_label: 'Fit',
      current_medical_id: 1,
      workflow: { steps: [], current_step: null },
    },
    warnings: warnings.map((message) => ({ code: 'x', message })),
  }
}

let wrapper: VueWrapper

async function openModal(passport: PassportEntry, props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  wrapper = mount(RecordMedicalModal, {
    props: {
      open: false,
      passport,
      'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }),
      ...props,
    },
    attachTo: document.body,
  }) as unknown as VueWrapper
  await wrapper.setProps({ open: true })
  await flushPromises()
}

const resultButton = (value: 'fit' | 'unfit') => wrapper.get(`button[data-result="${value}"]`)
const dateInput = () => wrapper.get<HTMLInputElement>('input[type="date"]')
const submitWith = async (action: 'save' | 'next' = 'save') => {
  await wrapper.get(`button[data-action="${action}"]`).trigger('click')
  await flushPromises()
}
const isOpen = () => (wrapper.props() as Record<string, unknown>).open

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper.unmount())

describe('RecordMedicalModal', () => {
  describe('medical center and slip', () => {
    /** SearchSelect is generic, so test-utils cannot type its props; read them untyped. */
    const propsOf = (c: { props(): unknown }) => c.props() as Record<string, unknown>
    const centerSelect = () =>
      wrapper.findAllComponents(SearchSelect).find((c) => propsOf(c).label === 'Medical center')!

    it('sends the medical center, slip no and slip date', async () => {
      vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
      await openModal(makePassport())

      expect(wrapper.text()).toContain('Medical slip date')
      centerSelect().vm.$emit('update:modelValue', { id: 3, name: 'Gulf Medical Center' })
      await wrapper.get('[data-field="slip_no"]').setValue(' MG-5521 ')
      await wrapper.get('[data-field="slip_date"]').setValue('2026-10-02')
      await resultButton('fit').trigger('click')
      await submitWith()

      expect(recordMedical).toHaveBeenCalledWith(42, {
        medical_date: TODAY,
        result: 'fit',
        remarks: null,
        medical_center_id: 3,
        slip_no: 'MG-5521',
        slip_date: '2026-10-02',
      })
    })

    it('offers "Add new medical center" to admins only', async () => {
      await openModal(makePassport())
      useAuthStore().user = makeUser({ role: 'data_entry' })
      await flushPromises()
      expect(propsOf(centerSelect()).addLabel).toBeUndefined()

      useAuthStore().user = makeUser({ role: 'admin' })
      await flushPromises()
      expect(propsOf(centerSelect()).addLabel).toBe('Add new medical center')
    })
  })

  it('shows a read-only passport summary', async () => {
    await openModal(makePassport({ passport_expiry_date: addDays(TODAY, -3) }))

    const summary = wrapper.get('[data-passport-summary]').text()
    expect(summary).toContain('MD RAHIM')
    expect(summary).toContain('AB1234567')
    expect(summary).toContain('Bangladesh')
    expect(summary).toContain('Expired')
  })

  it('defaults the date to today and has no default result', async () => {
    await openModal(makePassport())

    expect(dateInput().element.value).toBe(TODAY)
    expect(dateInput().attributes('max')).toBe(TODAY)
    expect(resultButton('fit').attributes('aria-pressed')).toBe('false')
    expect(resultButton('unfit').attributes('aria-pressed')).toBe('false')

    await submitWith()

    expect(recordMedical).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choose Fit or Unfit.')
  })

  it('previews the valid-until date for Fit (3 months, no overflow)', async () => {
    await openModal(makePassport({ passport_received_date: '2025-11-01' }))
    await dateInput().setValue(addDays(TODAY, -1))
    await resultButton('fit').trigger('click')

    const expected = toDisplayDate(addMonthsNoOverflow(addDays(TODAY, -1), 3))
    expect(wrapper.get('[data-preview]').text()).toBe(`Valid until ${expected} (3 months)`)
    expect(wrapper.find('[data-unfit-notice]').exists()).toBe(false)
  })

  it('requires a confirmation click before saving Unfit', async () => {
    vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
    await openModal(makePassport())
    await resultButton('unfit').trigger('click')

    expect(wrapper.get('[data-unfit-notice]').text()).toBe(
      'This passport will move to the Unfit list and disappear from the Passport List.',
    )

    await submitWith()
    expect(recordMedical).not.toHaveBeenCalled()
    expect(wrapper.find('[data-confirm-unfit]').exists()).toBe(true)

    await wrapper.get('button[data-confirm]').trigger('click')
    await flushPromises()

    expect(recordMedical).toHaveBeenCalledWith(42, {
      medical_date: TODAY,
      result: 'unfit',
      remarks: null,
      medical_center_id: null,
      slip_no: null,
      slip_date: null,
    })
    expect(isOpen()).toBe(false)
  })

  describe('soft warnings (never blocking)', () => {
    const warningsText = () => wrapper.find('[data-warnings]').text()

    it('warns when the medical date is before the received date', async () => {
      await openModal(makePassport({ passport_received_date: addDays(TODAY, -2) }))
      await dateInput().setValue(addDays(TODAY, -5))

      expect(warningsText()).toContain('The medical date is before the passport received date.')
    })

    it('warns when the passport has expired', async () => {
      await openModal(makePassport({ passport_expiry_date: addDays(TODAY, -1) }))

      expect(warningsText()).toContain('The passport has already expired.')
    })

    it('warns when the passport expires before the medical is valid until', async () => {
      vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
      await openModal(makePassport({ passport_expiry_date: addDays(TODAY, 30) }))
      await resultButton('fit').trigger('click')

      expect(warningsText()).toContain('The passport expires before the medical valid-until date.')

      // A warning does not block saving.
      await submitWith()
      expect(recordMedical).toHaveBeenCalled()
    })
  })

  describe('"Save and next pending"', () => {
    it('saves, then loads the oldest other pending passport into the dialog', async () => {
      const next = makePassport({
        id: 43,
        passport_name: 'KARIM UDDIN',
        passport_number: 'CD7654321',
      })
      vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
      vi.mocked(fetchMedicalQueue).mockResolvedValue({
        data: [
          {
            id: 42,
            passport_name: 'MD RAHIM',
            passport_number: 'AB1234567',
            passport_received_date: '',
          },
          {
            id: 43,
            passport_name: 'KARIM UDDIN',
            passport_number: 'CD7654321',
            passport_received_date: '',
          },
        ],
        meta: { next_cursor: null },
      })
      vi.mocked(getPassport).mockResolvedValue(next)
      await openModal(makePassport(), { withNext: true })
      await dateInput().setValue(addDays(TODAY, -1))
      await resultButton('fit').trigger('click')

      await submitWith('next')

      expect(recordMedical).toHaveBeenCalledWith(42, expect.objectContaining({ result: 'fit' }))
      expect(wrapper.emitted('saved')).toHaveLength(1)
      expect(getPassport).toHaveBeenCalledWith(43)
      expect(isOpen()).toBe(true)
      expect(wrapper.get('[data-passport-summary]').text()).toContain('KARIM UDDIN')
      // The result starts empty again; the medical date is kept for the batch.
      expect(resultButton('fit').attributes('aria-pressed')).toBe('false')
      expect(dateInput().element.value).toBe(addDays(TODAY, -1))
    })

    it('closes when no other passport is waiting', async () => {
      vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
      vi.mocked(fetchMedicalQueue).mockResolvedValue({ data: [], meta: { next_cursor: null } })
      await openModal(makePassport(), { withNext: true })
      await resultButton('fit').trigger('click')

      await submitWith('next')

      expect(isOpen()).toBe(false)
    })

    it('is only offered when asked for', async () => {
      await openModal(makePassport())

      expect(wrapper.find('button[data-action="next"]').exists()).toBe(false)
    })
  })

  it('shows a clear message on 403 and keeps the dialog open', async () => {
    vi.mocked(recordMedical).mockRejectedValue(
      httpError(403, { message: 'This action is unauthorized.' }),
    )
    await openModal(makePassport({ medical_status: 'unfit' }))
    await resultButton('fit').trigger('click')

    await submitWith()

    expect(wrapper.get('[role="alert"]').text()).toBe('Only admins can re-test an unfit passport.')
    expect(isOpen()).toBe(true)
  })

  it('keeps the typed data on a network error', async () => {
    vi.mocked(recordMedical).mockRejectedValue(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    )
    await openModal(makePassport())
    await resultButton('fit').trigger('click')
    await wrapper.get('textarea').setValue('Clear chest X-ray')

    await submitWith()

    expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach the server')
    expect(resultButton('fit').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Clear chest X-ray')
  })
})
