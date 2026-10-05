import { describe, it, expect } from 'vitest'
import { toApiDate, toDisplayDate } from '@/lib/dates'

describe('toDisplayDate', () => {
  it('formats YYYY-MM-DD as DD-MM-YYYY', () => {
    expect(toDisplayDate('2026-10-05')).toBe('05-10-2026')
  })

  it.each([null, undefined, '', '05-10-2026', '2026-13-01', '2026-02-30'])(
    'returns "" for %j',
    (value) => {
      expect(toDisplayDate(value)).toBe('')
    },
  )
})

describe('toApiDate', () => {
  it('converts DD-MM-YYYY', () => {
    expect(toApiDate('05-10-2026')).toBe('2026-10-05')
  })

  it('keeps a valid YYYY-MM-DD', () => {
    expect(toApiDate('2024-02-29')).toBe('2024-02-29')
  })

  it('formats a Date in local time', () => {
    expect(toApiDate(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it.each(['', '31-02-2026', '2025-02-29', 'yesterday', '5-10-2026'])('returns "" for %j', (v) => {
    expect(toApiDate(v)).toBe('')
  })
})
