import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/lib/api'
import {
  bookFlight,
  clearFlightBooking,
  confirmFlight,
  markStepAction,
  undoFlightConfirm,
  undoStepAction,
  updateCalling,
} from '../steps'

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn(), delete: vi.fn() },
}))

const BASE = '/api/data-entry'
const response = { data: { status: 'completed' }, passport: {}, warnings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.post).mockResolvedValue({ data: response })
  vi.mocked(api.delete).mockResolvedValue({ data: response })
})

describe('calling update', () => {
  it('posts the permit dates', async () => {
    const permit = {
      receive_date: '2026-10-07',
      issue_date: '2026-10-06',
      valid_until: '2027-10-06',
    }
    await updateCalling(53, 'calling', permit)

    expect(api.post).toHaveBeenCalledWith(`${BASE}/passports/53/steps/calling/update`, permit)
  })
})

describe('flight booking and confirm', () => {
  it('saves and clears the booking date', async () => {
    await bookFlight(70, '2026-12-01')
    expect(api.post).toHaveBeenCalledWith(`${BASE}/passports/70/steps/flight/booking`, {
      booking_date: '2026-12-01',
    })

    await clearFlightBooking(70)
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/passports/70/steps/flight/booking`)
  })

  it('confirms with an empty body and undoes with DELETE', async () => {
    await confirmFlight(70)
    expect(api.post).toHaveBeenLastCalledWith(`${BASE}/passports/70/steps/flight/confirm`, {})

    await undoFlightConfirm(70)
    expect(api.delete).toHaveBeenLastCalledWith(`${BASE}/passports/70/steps/flight/confirm`)
  })
})

describe('milestone actions (BMET)', () => {
  it('marks an action done today (no date) or on a corrected date', async () => {
    await markStepAction(20, 'bmet', 'training')
    expect(api.post).toHaveBeenLastCalledWith(`${BASE}/passports/20/steps/bmet/training`, {})

    await markStepAction(20, 'bmet', 'finger', '2026-10-05')
    expect(api.post).toHaveBeenLastCalledWith(`${BASE}/passports/20/steps/bmet/finger`, {
      date: '2026-10-05',
    })
  })

  it('undoes an action with DELETE', async () => {
    await undoStepAction(20, 'bmet', 'clearance')
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/passports/20/steps/bmet/clearance`)
  })
})
