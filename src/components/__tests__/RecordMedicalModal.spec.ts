import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RecordMedicalModal from '../RecordMedicalModal.vue'
import MedicalSlipModal from '../MedicalSlipModal.vue'
import { fetchMedicalQueue, recordMedical } from '@/api/medical'
import { getPassport } from '@/api/passports'
import { addDays, addMonthsNoOverflow, businessToday, toDisplayDate } from '@/lib/dates'
import { httpError, makePassport, notStartedPassport } from '@/test/helpers'
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
  describe('medical slip (saved on the passport)', () => {
    const slipModal = () => wrapper.findComponent(MedicalSlipModal)
    /** The result form (the slip dialog has a form of its own). */
    const resultForm = () => wrapper.findAll('form').find((f) => f.find('[data-result]').exists())

    it('pre-fills the slip read-only and does not send it with the result', async () => {
      vi.mocked(recordMedical).mockResolvedValue(saveResponse(42))
      await openModal(
        makePassport({
          medical_slip: {
            date: '2026-10-02',
            no: 'MG-5521',
            medical_center: { id: 3, name: 'Gulf Medical Center' },
          },
        }),
      )

      const summary = wrapper.get('[data-slip-summary]')
      expect(summary.get('[data-slip-date]').text()).toBe('02-10-2026')
      expect(summary.get('[data-slip-no]').text()).toBe('MG-5521')
      expect(summary.get('[data-slip-center]').text()).toBe('Gulf Medical Center')
      // Read-only here: no slip inputs in the result form.
      expect(resultForm()!.find('[data-field="medical_slip_date"]').exists()).toBe(false)
      expect(resultForm()!.find('input[type="text"]').exists()).toBe(false)

      await resultButton('fit').trigger('click')
      await submitWith()
      expect(recordMedical).toHaveBeenCalledWith(42, {
        medical_date: TODAY,
        result: 'fit',
        remarks: null,
      })
    })

    it('changes the slip only through "Edit slip"', async () => {
      await openModal(makePassport())
      expect((slipModal().props() as { open: boolean }).open).toBe(false)

      await wrapper.get('[data-edit-slip]').trigger('click')

      expect((slipModal().props() as { open: boolean }).open).toBe(true)
    })

    it('refuses to record a result without a slip date', async () => {
      await openModal(makePassport(notStartedPassport()))

      expect(wrapper.get('[data-missing-slip]').text()).toContain('No medical slip date yet.')
      // No result form at all.
      expect(resultForm()).toBeUndefined()
      expect(recordMedical).not.toHaveBeenCalled()

      await wrapper.get('[data-add-slip]').trigger('click')
      expect((slipModal().props() as { open: boolean }).open).toBe(true)
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
