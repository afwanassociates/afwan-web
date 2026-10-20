import { describe, expect, it } from 'vitest'
import { balanceClass, formatBalance, formatMoney, parseAmount } from '@/lib/accounts'

describe('accounts helpers', () => {
  it('formats money with lakh grouping and 2 decimals', () => {
    expect(formatMoney(1234567.5)).toBe('12,34,567.50')
    expect(formatMoney(0)).toBe('0.00')
  })

  it('shows the side of a balance: Dr when the party owes us, Cr when we owe them', () => {
    expect(formatBalance(1500)).toBe('1,500.00 Dr')
    expect(formatBalance(-750.25)).toBe('750.25 Cr')
    expect(formatBalance(0)).toBe('0.00')
    expect(balanceClass(10)).toContain('amber')
    expect(balanceClass(-10)).toContain('primary')
    expect(balanceClass(0)).toBe('text-muted')
  })

  it('parses typed amounts', () => {
    expect(parseAmount('1,250.5')).toEqual({ amount: 1250.5 })
    expect(parseAmount(' 99 ')).toEqual({ amount: 99 })
    expect(parseAmount('')).toEqual({ error: 'Enter the amount.' })
    expect(parseAmount('', { allowZero: true })).toEqual({ amount: 0 })
    expect(parseAmount('0').error).toBe('The amount must be more than 0.')
    expect(parseAmount('0', { allowZero: true })).toEqual({ amount: 0 })
    expect(parseAmount('1.234').error).toMatch(/2 decimal/)
    expect(parseAmount('-5').error).toMatch(/2 decimal/)
    expect(parseAmount('abc').error).toMatch(/2 decimal/)
    expect(parseAmount('99999999999999').error).toBe('The amount is too large.')
  })
})
