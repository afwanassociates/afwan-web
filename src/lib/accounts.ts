import { inject, type InjectionKey, type Ref } from 'vue'
import type { Role } from '@/types/auth'
import type {
  CashSettings,
  ExpenseCategory,
  MobileBankingProvider,
  PartyType,
} from '@/types/accounts'

/** Roles of the accounts screens (parties, cash): the accounts team only, not admins. */
export const ACCOUNTS_ROLES: readonly Role[] = ['accounts', 'accounts_head']

/** Roles that set the cash opening balance and delete parties. */
export const ACCOUNTS_MANAGER_ROLES: readonly Role[] = ['accounts_head']

/**
 * Roles that see the money summary cards (totals, closing balances): the accounts head on
 * Cash Management and the dashboard, admins on the dashboard only. Not accounts users.
 */
export const FINANCE_SUMMARY_ROLES: readonly Role[] = ['accounts_head', 'admin', 'super_admin']

/** Roles of the Approvals page: the accounts team (their own entries) and the approvers. */
export const APPROVALS_ROLES: readonly Role[] = [...ACCOUNTS_ROLES, 'admin', 'super_admin']

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  client: 'Party / Client',
  owner: 'Owner',
}

/** Bangladesh mobile banking (MFS) services, most used first. Same list as the API. */
export const MOBILE_BANKING_PROVIDERS: readonly { value: MobileBankingProvider; label: string }[] =
  [
    { value: 'bkash', label: 'bKash' },
    { value: 'nagad', label: 'Nagad' },
    { value: 'rocket', label: 'Rocket' },
    { value: 'upay', label: 'Upay' },
    { value: 'mcash', label: 'mCash' },
    { value: 'tap', label: 'Tap' },
    { value: 'ok_wallet', label: 'OK Wallet' },
    { value: 'surecash', label: 'SureCash' },
    { value: 'mycash', label: 'MYCash' },
    { value: 'firstcash', label: 'FirstCash' },
    { value: 'islamic_wallet', label: 'Islamic Wallet' },
    { value: 'meghna_pay', label: 'Meghna Pay' },
  ]

/** What an expense was spent on. Same list as the API. */
export const EXPENSE_CATEGORIES: readonly { value: ExpenseCategory; label: string }[] = [
  { value: 'office_rent', label: 'Office rent' },
  { value: 'utility_bill', label: 'Utility bill (electricity, water, gas)' },
  { value: 'internet_phone', label: 'Internet & mobile bill' },
  { value: 'salary', label: 'Salary & wages' },
  { value: 'tea_entertainment', label: 'Tea & entertainment' },
  { value: 'transport', label: 'Transport & conveyance' },
  { value: 'stationery', label: 'Stationery & printing' },
  { value: 'repair', label: 'Repair & maintenance' },
  { value: 'government_fee', label: 'Government & embassy fees' },
  { value: 'courier', label: 'Courier & postage' },
  { value: 'other', label: 'Other' },
]

/** A Bangladesh mobile number as the API stores it: 01XXXXXXXXX (11 digits). */
export const WALLET_NUMBER_PATTERN = /^01[3-9]\d{8}$/

/** "+880 1712-345678" → "01712345678": digits only, country code dropped. */
export function normalizeWalletNumber(value: string): string {
  return value.replace(/\D+/g, '').replace(/^880?(?=1)/, '0')
}

/** "bKash number", or "Mobile banking number" before a service is chosen. */
export function walletLabel(provider: MobileBankingProvider | ''): string {
  const found = MOBILE_BANKING_PROVIDERS.find((p) => p.value === provider)
  return `${found?.label ?? 'Mobile banking'} number`
}

/** The mobile banking part of a receipt or payment: field errors and the values to send. */
export function checkMobileBanking(
  provider: MobileBankingProvider | '',
  number: string,
): {
  errors: Record<string, string>
  mobile_provider: MobileBankingProvider | null
  mobile_number: string
} {
  const wallet = normalizeWalletNumber(number)
  const errors: Record<string, string> = {}
  if (!provider) errors.mobile_provider = 'Choose the mobile banking service.'
  if (!wallet) errors.mobile_number = `Enter the ${walletLabel(provider)}.`
  else if (!WALLET_NUMBER_PATTERN.test(wallet))
    errors.mobile_number = 'Enter an 11-digit mobile number, e.g. 01712345678.'
  return { errors, mobile_provider: provider || null, mobile_number: wallet }
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
