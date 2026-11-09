import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DateRulesSettingsView from '../DateRulesSettingsView.vue'
import {
  deleteCountryDateRules,
  fetchDateRules,
  updateDateRules,
  type DateRule,
  type DateRulesPage,
} from '@/api/dateRules'
import { fetchDefaults } from '@/api/countries'
import { fetchWorkflowConfig } from '@/api/workflow'
import { DATE_RULE_DEFAULTS, resolveDateRules, useDateRules } from '@/lib/dateRules'
import { latestBirthDate, validatePassportForm } from '@/lib/passportRules'
import { SETTINGS_PAGES, settingsPagesFor } from '@/lib/settingsPages'
import { useCountriesStore } from '@/stores/countries'
import { httpError } from '@/test/helpers'

vi.mock('@/api/dateRules', () => ({
  fetchDateRules: vi.fn(),
  updateDateRules: vi.fn(),
  deleteCountryDateRules: vi.fn(),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => []),
  fetchDefaults: vi.fn(async () => ({ default_company_country_code: 'MY' })),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowConfig: vi.fn(async () => ({ steps: [] })),
  fetchWorkflowSummary: vi.fn(),
}))

const rule = (overrides: Partial<DateRule> & Pick<DateRule, 'key'>): DateRule => ({
  group: 'Medical',
  label: overrides.key,
  help: 'Help.',
  unit: 'days',
  min: 1,
  max: 730,
  value: null,
  ...overrides,
})

/** The rules with no values (a country without rules). */
const EMPTY: DateRule[] = [
  rule({ key: 'medical_validity_days', label: 'Fit result validity' }),
  rule({ key: 'medical_expiring_soon_days', label: 'Medical "expiring soon"', min: 0, max: 365 }),
  rule({ key: 'visa_warning_days', group: 'Expiry warnings', label: 'Visa', min: 0, max: 365 }),
  rule({
    key: 'minimum_age_years',
    group: 'Passport',
    label: 'Minimum age',
    unit: 'years',
    min: 0,
    max: 100,
  }),
]
const MY_VALUES: Record<string, number> = {
  medical_validity_days: 90,
  medical_expiring_soon_days: 14,
  visa_warning_days: 30,
  minimum_age_years: 18,
}
const MALAYSIA = { code: 'MY', name: 'Malaysia', complete: true, companies: 6 }

const myPage = (): DateRulesPage => ({
  rules: EMPTY.map((r) => ({ ...r, value: MY_VALUES[r.key]! })),
  country: { code: 'MY', name: 'Malaysia' },
  countries: [MALAYSIA],
  missing: [{ code: 'QA', name: 'Qatar', companies: 2 }],
})
const emptyPage = (code: string, name: string): DateRulesPage => ({
  rules: EMPTY,
  country: { code, name },
  countries: [MALAYSIA],
  missing: [{ code: 'QA', name: 'Qatar', companies: 2 }],
})

let wrapper: VueWrapper

async function mountView() {
  setActivePinia(createPinia())
  wrapper = mount(DateRulesSettingsView, { attachTo: document.body })
  await flushPromises()
}

const input = (key: string) => wrapper.get<HTMLInputElement>(`[data-rule="${key}"] input`)
const saveButton = () => wrapper.get('[data-save]')

beforeEach(() => {
  vi.mocked(fetchDateRules).mockImplementation(async (country) => {
    if (country === 'MY') return myPage()
    if (country === 'SG') return emptyPage('SG', 'Singapore')
    if (country === 'QA') return emptyPage('QA', 'Qatar')
    // Nothing chosen: the list of countries only.
    return { ...myPage(), rules: EMPTY, country: null }
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('DateRulesSettingsView', () => {
  it('opens Malaysia: its rules by group, no "All countries"', async () => {
    await mountView()

    expect(fetchDateRules).toHaveBeenLastCalledWith('MY')
    expect(
      wrapper.findAll('[data-country-tab]').map((t) => t.attributes('data-country-tab')),
    ).toEqual(['MY'])
    expect(wrapper.text()).not.toMatch(/all countries/i)
    expect(wrapper.findAll('[data-group]').map((g) => g.attributes('data-group'))).toEqual([
      'Medical',
      'Expiry warnings',
      'Passport',
    ])
    expect(input('medical_validity_days').element.value).toBe('90')
    expect(wrapper.get('[data-rule="minimum_age_years"] [data-limits]').text()).toBe(
      'Allowed 0–100 years',
    )
    expect(saveButton().attributes('disabled')).toBeDefined()
  })

  it('saves only the changed rules of the country', async () => {
    vi.mocked(updateDateRules).mockResolvedValue(myPage())
    await mountView()
    const defaultsCalls = vi.mocked(fetchDefaults).mock.calls.length

    await input('medical_validity_days').setValue('120')
    expect(wrapper.get('[data-changed]').text()).toBe('1 change not saved')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateDateRules).toHaveBeenCalledWith({ medical_validity_days: 120 }, 'MY')
    // This session's forms and step pages get the new values at once.
    expect(vi.mocked(fetchDefaults).mock.calls.length).toBeGreaterThan(defaultsCalls)
    expect(fetchWorkflowConfig).toHaveBeenCalled()
  })

  it('checks the limits before sending', async () => {
    await mountView()

    await input('medical_validity_days').setValue('0')
    await input('minimum_age_years').setValue('101')
    await wrapper.get('form').trigger('submit')

    expect(updateDateRules).not.toHaveBeenCalled()
    expect(wrapper.get('[data-rule="medical_validity_days"]').text()).toContain('At least 1 day.')
    expect(wrapper.get('[data-rule="minimum_age_years"]').text()).toContain('At most 100 years.')
  })

  it("shows the API's 422 message next to the rule", async () => {
    vi.mocked(updateDateRules).mockRejectedValue(
      httpError(422, { errors: { visa_warning_days: ['Visa may not be more than 365 days.'] } }),
    )
    await mountView()

    await input('visa_warning_days').setValue('45')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-rule="visa_warning_days"]').text()).toContain(
      'Visa may not be more than 365 days.',
    )
  })

  it('Discard puts the saved values back', async () => {
    await mountView()

    await input('medical_validity_days').setValue('120')
    await wrapper.get('[data-discard]').trigger('click')

    expect(input('medical_validity_days').element.value).toBe('90')
    expect(wrapper.get('[data-changed]').text()).toBe('No changes')
  })

  it('tells anyone but the super admin that the page is not for them', async () => {
    vi.mocked(fetchDateRules).mockRejectedValue(httpError(403, { message: 'Forbidden' }))
    await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain('Only the super admin')
  })

  describe('a new country', () => {
    async function openSingapore() {
      await mountView()
      wrapper
        .findAllComponents({ name: 'CountrySelect' })[0]!
        .vm.$emit('update:modelValue', { code: 'SG', name: 'Singapore' })
      await flushPromises()
    }

    it('"Set rules for a country" opens an empty form, every rule required', async () => {
      await openSingapore()

      expect(fetchDateRules).toHaveBeenLastCalledWith('SG')
      expect(wrapper.get('[data-country-tab="SG"]').text()).toContain('(new)')
      expect(EMPTY.map((r) => input(r.key).element.value)).toEqual(['', '', '', ''])
      expect(input('medical_validity_days').attributes('required')).toBeDefined()
      expect(wrapper.get('[data-country-note]').text()).toContain('0 of 4 done')
      expect(wrapper.find('[data-remove-country]').exists()).toBe(false)
    })

    it('cannot be saved until every rule is filled in, then sends them all', async () => {
      vi.mocked(updateDateRules).mockResolvedValue(myPage())
      await openSingapore()

      await input('medical_validity_days').setValue('60')
      await input('minimum_age_years').setValue('21')
      await wrapper.get('form').trigger('submit')
      expect(updateDateRules).not.toHaveBeenCalled()
      expect(wrapper.get('[data-rule="visa_warning_days"]').text()).toContain(
        'Enter a number of days.',
      )
      expect(wrapper.get('[role="alert"]').text()).toContain('Fill in every rule')

      await input('medical_expiring_soon_days').setValue('14')
      await input('visa_warning_days').setValue('30')
      expect(wrapper.get('[data-country-note]').text()).toContain('4 of 4 done')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updateDateRules).toHaveBeenCalledWith(
        {
          medical_validity_days: 60,
          medical_expiring_soon_days: 14,
          visa_warning_days: 30,
          minimum_age_years: 21,
        },
        'SG',
      )
    })
  })

  it('warns about company countries without rules and opens them', async () => {
    await mountView()

    expect(wrapper.get('[data-missing]').text()).toContain('Qatar · 2 companies')
    await wrapper.get('[data-missing-country="QA"]').trigger('click')
    await flushPromises()

    expect(fetchDateRules).toHaveBeenLastCalledWith('QA')
    expect(input('medical_validity_days').element.value).toBe('')
  })

  it("removes a country's rules after confirming", async () => {
    vi.mocked(deleteCountryDateRules).mockResolvedValue()
    await mountView()

    await wrapper.get('[data-remove-country]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Malaysia has 6 companies')
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Remove',
    )!
    confirm.click()
    await flushPromises()

    expect(deleteCountryDateRules).toHaveBeenCalledWith('MY')
  })

  it('asks before leaving unsaved changes for another country', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await mountView()

    await input('medical_validity_days').setValue('120')
    await wrapper.get('[data-missing-country="QA"]').trigger('click')
    await flushPromises()

    expect(ask).toHaveBeenCalled()
    expect(fetchDateRules).not.toHaveBeenCalledWith('QA')
    expect(input('medical_validity_days').element.value).toBe('120')
    ask.mockRestore()
  })

  it('without any country with rules, asks to choose one', async () => {
    vi.mocked(fetchDateRules).mockResolvedValue({
      rules: EMPTY,
      country: null,
      countries: [],
      missing: [],
    })
    await mountView()

    expect(wrapper.find('[data-no-countries]').exists()).toBe(true)
    expect(wrapper.find('[data-choose-country]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

describe('Date rules settings page', () => {
  it('is only for the super admin', () => {
    expect(SETTINGS_PAGES.map((p) => p.name)).toContain('settings-date-rules')
    expect(settingsPagesFor('super_admin').map((p) => p.name)).toContain('settings-date-rules')
    for (const role of ['admin', 'accounts_head', 'accounts', 'data_entry'] as const) {
      expect(settingsPagesFor(role).map((p) => p.name)).not.toContain('settings-date-rules')
    }
  })
})

describe('date rule values', () => {
  it('uses the saved values and keeps the built-in ones for anything missing or invalid', () => {
    expect(resolveDateRules(null)).toEqual(DATE_RULE_DEFAULTS)
    expect(
      resolveDateRules({
        medical_validity_days: 60,
        visa_warning_days: -1,
        minimum_age_years: 1.5,
      }),
    ).toEqual({ ...DATE_RULE_DEFAULTS, medical_validity_days: 60 })
  })

  it("uses the company country's rules, else the built-in values", () => {
    setActivePinia(createPinia())
    useCountriesStore().defaults = {
      default_company_country_code: 'MY',
      default_passport_country_code: null,
      date_rules: { ...DATE_RULE_DEFAULTS },
      date_rules_by_country: {
        MY: { ...DATE_RULE_DEFAULTS, minimum_age_years: 18 },
        SG: { ...DATE_RULE_DEFAULTS, minimum_age_years: 21 },
      },
    }

    expect(useDateRules('SG').value.minimum_age_years).toBe(21)
    expect(useDateRules('sg').value.minimum_age_years).toBe(21)
    expect(useDateRules('MY').value.minimum_age_years).toBe(18)
    // A country without rules, or no company yet: the built-in values.
    expect(useDateRules('QA').value).toEqual(DATE_RULE_DEFAULTS)
    expect(useDateRules().value).toEqual(DATE_RULE_DEFAULTS)
  })

  it('the passport form checks the minimum age and validity it is given', () => {
    const values = {
      passport_name: 'MD RAHIM',
      passport_number: 'AB1234567',
      reference_id: 1,
      country_code: 'BD',
      company_id: 1,
      date_of_birth: '2005-10-26',
      passport_received_date: '2026-10-24',
      passport_expiry_date: '2028-10-23',
    }
    const errors = validatePassportForm(values as never, '2026-10-25', {
      minValidityMonths: 24,
      minimumAgeYears: 21,
    })
    expect(errors.date_of_birth).toBe('The person must be at least 21 years old.')
    expect(errors.passport_expiry_date).toBe(
      'The passport must be valid for at least 24 months after the received date.',
    )
    // No age check at 0.
    expect(
      validatePassportForm({ ...values, date_of_birth: '2020-01-01' } as never, '2026-10-25', {
        minValidityMonths: 18,
        minimumAgeYears: 0,
      }).date_of_birth,
    ).toBeUndefined()
    // 29 February: the same no-overflow count as the API.
    expect(latestBirthDate('2028-02-29', 18)).toBe('2010-02-28')
  })
})
