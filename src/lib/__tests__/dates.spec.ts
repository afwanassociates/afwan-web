import { describe, it, expect } from 'vitest'
import { addMonthsNoOverflow, businessToday, daysLeft, toApiDate, toDisplayDate } from '@/lib/dates'

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

describe('addMonthsNoOverflow', () => {
  it.each([
    ['2026-11-30', 3, '2027-02-28'], // 30 Nov + 3 months: no overflow into March
    ['2027-11-30', 3, '2028-02-29'], // …29 Feb in a leap year
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'], // leap year
    ['2028-02-29', 12, '2029-02-28'], // 29 Feb + 1 year
    ['2028-02-29', 3, '2028-05-29'],
    ['2026-10-07', 3, '2027-01-07'], // across a year end
    ['2026-03-31', -1, '2026-02-28'], // negative months
  ])('%s + %i months = %s', (date, months, expected) => {
    expect(addMonthsNoOverflow(date, months)).toBe(expected)
  })

  it('returns "" for an invalid date', () => {
    expect(addMonthsNoOverflow('2026-02-30', 3)).toBe('')
  })
})

describe('daysLeft', () => {
  it.each([
    ['2026-10-21', '2026-10-07', 14],
    ['2026-10-07', '2026-10-07', 0], // last valid day
    ['2026-10-06', '2026-10-07', -1], // expired yesterday
    ['2027-01-07', '2026-10-07', 92],
    ['2028-03-01', '2028-02-28', 2], // across 29 Feb
  ])('until %s from %s is %i', (until, today, expected) => {
    expect(daysLeft(until, today)).toBe(expected)
  })

  it('returns null for invalid input', () => {
    expect(daysLeft('', '2026-10-07')).toBeNull()
  })
})

describe('businessToday', () => {
  it('is the calendar date in Dhaka (UTC+6), not UTC', () => {
    // 20:30 UTC on 7 Oct is already 02:30 on 8 Oct in Dhaka.
    expect(businessToday(new Date('2026-10-07T20:30:00Z'))).toBe('2026-10-08')
    expect(businessToday(new Date('2026-10-07T12:00:00Z'))).toBe('2026-10-07')
  })
})
