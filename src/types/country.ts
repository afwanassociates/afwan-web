/** Countries and app defaults (afwan-api /data-entry/countries, /data-entry/defaults, /admin/...). */

/** A country as embedded in a company or passport entry. Inactive countries still resolve. */
export interface CountrySummary {
  code: string
  name: string
}

/** An item of GET /data-entry/countries: active countries, pinned first. */
export interface CountryOption extends CountrySummary {
  is_pinned: boolean
}

/** An item of GET /admin/countries (admin only). */
export interface AdminCountry extends CountryOption {
  is_active: boolean
  sort_order: number
  companies_count: number
  passport_entries_count: number
  updated_by: number | null
  updated_at: string | null
}

/** GET /data-entry/defaults and GET/PUT /admin/settings. */
export interface AppDefaults {
  default_company_country_code: string
  default_passport_country_code: string | null
}

export interface NewCountry {
  code: string
  name: string
}

export type CountryChanges = Partial<
  Pick<AdminCountry, 'name' | 'is_active' | 'is_pinned' | 'sort_order'>
>
