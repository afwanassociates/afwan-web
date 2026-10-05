import { describe, it, expect } from 'vitest'
import {
  normalizePassportName,
  normalizePassportNameInput,
  normalizePassportNumber,
  validatePassportForm,
  type PassportFormValues,
} from '@/lib/passportRules'

const TODAY = '2026-10-05'

const valid: PassportFormValues = {
  passport_name: 'MD RAHIM',
  passport_number: 'AB1234567',
  reference_id: 1,
  company_id: 2,
  passport_received_date: TODAY,
}

const validate = (changes: Partial<PassportFormValues>) =>
  validatePassportForm({ ...valid, ...changes }, TODAY)

describe('normalizePassportNumber', () => {
  it.each([
    [' ab 12 345 ', 'AB12345'],
    ['ab\t12\n34 56', 'AB123456'],
    ['A1B2C3', 'A1B2C3'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizePassportNumber(input)).toBe(expected)
  })
})

describe('passport name normalization', () => {
  it('only uppercases while typing, so spaces can still be typed', () => {
    expect(normalizePassportNameInput('md ')).toBe('MD ')
    expect(normalizePassportNameInput('md  rahim')).toBe('MD  RAHIM')
  })

  it('trims and collapses spaces before saving', () => {
    expect(normalizePassportName('  md   rahim  uddin ')).toBe('MD RAHIM UDDIN')
  })
})

describe('validatePassportForm', () => {
  it('accepts a valid form', () => {
    expect(validatePassportForm(valid, TODAY)).toEqual({})
  })

  it('requires every field', () => {
    expect(
      validatePassportForm(
        {
          passport_name: '  ',
          passport_number: '',
          reference_id: null,
          company_id: null,
          passport_received_date: '',
        },
        TODAY,
      ),
    ).toEqual({
      passport_name: 'Enter the passport name.',
      passport_number: 'Enter the passport number.',
      reference_id: 'Select a reference.',
      company_id: 'Select a company.',
      passport_received_date: 'Enter the received date.',
    })
  })

  describe('passport name', () => {
    it('allows 150 characters but not 151', () => {
      expect(validate({ passport_name: 'A'.repeat(150) }).passport_name).toBeUndefined()
      expect(validate({ passport_name: 'A'.repeat(151) }).passport_name).toBe(
        'The passport name must be at most 150 characters.',
      )
    })

    it('counts the length after collapsing spaces', () => {
      expect(validate({ passport_name: `${'A'.repeat(150)}    ` }).passport_name).toBeUndefined()
    })
  })

  describe('passport number', () => {
    it.each(['AB1234', 'A'.repeat(20), 'ab 12 34', '123456'])('accepts %j', (number) => {
      expect(validate({ passport_number: number }).passport_number).toBeUndefined()
    })

    it.each(['AB123', 'A'.repeat(21), 'AB-12345', 'AB12345É'])('rejects %j', (number) => {
      expect(validate({ passport_number: number }).passport_number).toBe(
        'The passport number must be 6 to 20 letters and digits.',
      )
    })
  })

  describe('received date', () => {
    it('allows today and past dates', () => {
      expect(validate({ passport_received_date: TODAY }).passport_received_date).toBeUndefined()
      expect(
        validate({ passport_received_date: '2020-02-29' }).passport_received_date,
      ).toBeUndefined()
    })

    it('rejects future dates', () => {
      expect(validate({ passport_received_date: '2026-10-06' }).passport_received_date).toBe(
        'The passport received date cannot be in the future.',
      )
    })

    it('rejects impossible dates', () => {
      expect(validate({ passport_received_date: '2026-02-30' }).passport_received_date).toBe(
        'Enter a valid date.',
      )
    })
  })
})
