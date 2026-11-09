import api from '@/lib/api'
import type { DateRuleKey } from '@/lib/dateRules'

/** Settings → Date rules, per company country. Super admin only (403 for everyone else). */
const BASE = '/api/super-admin/date-rules'

export type DateRuleUnit = 'days' | 'months' | 'years'

export interface DateRule {
  key: DateRuleKey
  group: string
  label: string
  help: string
  unit: DateRuleUnit
  min: number
  max: number
  /** The country's value; null when it has none (a new country). */
  value: number | null
}

export interface DateRuleCountry {
  code: string
  name: string
  /** Every rule has a value. */
  complete: boolean
  /** Active companies in the country. */
  companies: number
}

export interface DateRulesPage {
  rules: DateRule[]
  /** The country shown; null when none is chosen. */
  country: { code: string; name: string } | null
  /** Countries with rules. */
  countries: DateRuleCountry[]
  /** Countries that have companies but no (complete) rules yet. */
  missing: { code: string; name: string; companies: number }[]
}

interface Response {
  data: DateRule[]
  meta: Omit<DateRulesPage, 'rules'>
}

const page = ({ data, meta }: Response): DateRulesPage => ({ rules: data, ...meta })

/** The rules of a company country (every value null for a country without rules). */
export async function fetchDateRules(country?: string | null): Promise<DateRulesPage> {
  const { data } = await api.get<Response>(BASE, { params: country ? { country } : {} })
  return page(data)
}

/**
 * Saves a country's rules. A country without rules must send every rule; one with rules
 * may send only what changes. 422 for a missing value or one out of range.
 */
export async function updateDateRules(
  values: Partial<Record<DateRuleKey, number>>,
  country: string,
): Promise<DateRulesPage> {
  const { data } = await api.put<Response>(BASE, { ...values, country })
  return page(data)
}

/** Removes a country's rules (its passports use the built-in defaults until set again). */
export async function deleteCountryDateRules(code: string): Promise<void> {
  await api.delete(`${BASE}/countries/${encodeURIComponent(code)}`)
}
