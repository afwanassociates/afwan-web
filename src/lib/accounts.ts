import { inject, type InjectionKey, type Ref } from 'vue'
import type { Role } from '@/types/auth'
import type { CashSettings, PartyType } from '@/types/accounts'

/** Roles of the accounts screens (parties, cash, approvals). */
export const ACCOUNTS_ROLES: readonly Role[] = ['accounts', 'accounts_head', 'admin', 'super_admin']

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  client: 'Party / Client',
  owner: 'Owner',
}

/** Largest amount the API stores (decimal 15,2). */
export const MAX_AMOUNT = 9_999_999_999_999.99

/** Same pattern as the API: digits, spaces and dashes, optional leading +. */
export const MOBILE_PATTERN = /^\+?[0-9][0-9 -]{5,28}$/

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234567.5 → "12,34,567.50" (lakh grouping, as used in Bangladesh). */
export function formatMoney(value: number): string {
  return money.format(value)
}

/**
 * A balance with its side: positive "Dr" (the party owes us), negative "Cr" (we owe them).
 * 0 → "0.00".
 */
export function formatBalance(value: number): string {
  if (Math.abs(value) < 0.005) return formatMoney(0)
  return `${formatMoney(Math.abs(value))} ${value > 0 ? 'Dr' : 'Cr'}`
}

/** Text colour of a balance: receivable amber, payable blue, zero muted. */
export function balanceClass(value: number): string {
  if (Math.abs(value) < 0.005) return 'text-muted'
  return value > 0 ? 'text-amber-800' : 'text-primary-800'
}

/**
 * Parses a typed amount: a positive number with at most 2 decimals, commas allowed.
 * `allowZero` accepts 0 (opening balances).
 */
export function parseAmount(
  value: string | number,
  { allowZero = false }: { allowZero?: boolean } = {},
): { amount?: number; error?: string } {
  const text = String(value).replace(/,/g, '').trim()
  if (text === '') return allowZero ? { amount: 0 } : { error: 'Enter the amount.' }
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    return { error: 'Enter a number with at most 2 decimal places.' }
  const amount = Number(text)
  if (!allowZero && amount <= 0) return { error: 'The amount must be more than 0.' }
  if (amount > MAX_AMOUNT) return { error: 'The amount is too large.' }
  return { amount }
}

/** What the Cash section layout shares with its pages: today's cash in hand and a reload. */
export interface CashContext {
  settings: Ref<CashSettings | null>
  refresh: () => Promise<void>
}

export const CASH_CONTEXT: InjectionKey<CashContext> = Symbol('cash-context')

/** Reloads the cash-in-hand header after a cash write (a no-op outside the Cash section). */
export function useCashRefresh(): () => void {
  const context = inject(CASH_CONTEXT, null)
  return () => {
    void context?.refresh()
  }
}
