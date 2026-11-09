import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { AppDefaults } from '@/types/country'
import { useCountriesStore } from '@/stores/countries'

/**
 * The date rules the super admin sets per company country in Settings → Date rules (GET
 * /data-entry/defaults sends them as `date_rules_by_country`; a passport uses its company's
 * country, where the worker goes). Each is a whole number of days, months or years.
 *
 * These built-in values (also sent as `date_rules`) are only a safety net: for a country
 * that has no rules yet, and until the settings have loaded.
 */
export const DATE_RULE_DEFAULTS = {
  medical_validity_days: 90,
  medical_expiring_soon_days: 14,
  calling_validity_months: 3,
  visa_validity_months: 3,
  calling_warning_days: 30,
  visa_warning_days: 30,
  bmet_warning_days: 30,
  flight_warning_days: 30,
  passport_min_validity_months: 18,
  passport_expiry_warning_months: 6,
  minimum_age_years: 18,
} as const

export type DateRuleKey = keyof typeof DATE_RULE_DEFAULTS
export type DateRuleValues = Record<DateRuleKey, number>

/** The saved values over the defaults; anything missing or not a number keeps its default. */
export function resolveDateRules(
  saved: Partial<Record<string, unknown>> | null | undefined,
): DateRuleValues {
  const values = { ...DATE_RULE_DEFAULTS } as DateRuleValues
  for (const key of Object.keys(DATE_RULE_DEFAULTS) as DateRuleKey[]) {
    const value = saved?.[key]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) values[key] = value
  }
  return values
}

/** Each company country's rules, over the built-in values (from GET /data-entry/defaults). */
function rulesFrom(defaults: AppDefaults | null | undefined) {
  // The two medical values are also sent on their own (older responses have only those).
  const all = resolveDateRules({
    medical_validity_days: defaults?.medical_validity_days,
    medical_expiring_soon_days: defaults?.medical_expiring_soon_days,
    ...defaults?.date_rules,
  })
  const byCountry = defaults?.date_rules_by_country ?? {}
  return (country: string | null | undefined): DateRuleValues => {
    const own = country ? byCountry[country.toUpperCase()] : undefined
    return own ? resolveDateRules({ ...all, ...own }) : all
  }
}

/**
 * The date rules of a company country (the built-in values for a country without rules),
 * shared through the countries store (which loads them once per session).
 */
export function useDateRules(
  country?: MaybeRefOrGetter<string | null | undefined>,
): ComputedRef<DateRuleValues> {
  const rulesFor = useDateRulesFor()
  return computed(() => rulesFor.value(toValue(country)))
}

/** For lists: a function giving the rules of any company country (e.g. per row). */
export function useDateRulesFor(): ComputedRef<
  (country: string | null | undefined) => DateRuleValues
> {
  const countries = useCountriesStore()
  void countries.load()
  return computed(() => rulesFrom(countries.defaults))
}
