import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import type { Role, User } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'

/** Test-only helpers (not imported by app code). */

export function makeUser(overrides: Partial<User> = {}): User {
  const role: Role = overrides.role ?? 'admin'
  return {
    id: 2,
    name: 'Test User',
    email: 'test@afwan.test',
    role,
    role_label: role,
    is_active: true,
    created_by: null,
    created_at: '2026-10-01T10:00:00.000000Z',
    updated_at: '2026-10-01T10:00:00.000000Z',
    ...overrides,
  }
}

/** An axios error carrying an HTTP response, like the ones the API returns. */
export function httpError(
  status: number,
  data: unknown = {},
  config: Partial<InternalAxiosRequestConfig> = {},
): AxiosError {
  const fullConfig = { headers: new AxiosHeaders(), ...config } as InternalAxiosRequestConfig
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    fullConfig,
    null,
    {
      status,
      statusText: '',
      data,
      headers: {},
      config: fullConfig,
    },
  )
}

/** A complete passport entry for tests; pending medical by default. */
export function makePassport(overrides: Partial<PassportEntry> = {}): PassportEntry {
  return {
    id: 42,
    passport_name: 'MD RAHIM',
    passport_number: 'AB1234567',
    country: { code: 'BD', name: 'Bangladesh' },
    date_of_birth: '1990-05-17',
    passport_received_date: '2026-09-30',
    passport_expiry_date: '2031-09-29',
    reference: { id: 8, type: 'agency', type_label: 'Agency', name: 'Star' },
    company: { id: 3, name: 'Gulf Builders', country: { code: 'MY', name: 'Malaysia' } },
    medical_status: 'pending',
    medical_status_label: 'Medical Pending',
    current_medical: null,
    workflow: {
      steps: [
        { key: 'passport', label: 'Passport', enabled: true, state: 'done' },
        { key: 'medical', label: 'Medical', enabled: true, state: 'pending' },
        { key: 'step3', label: 'Step 3', enabled: false, state: 'locked' },
      ],
      current_step: 'medical',
    },
    created_by: 5,
    updated_by: 5,
    created_at: '',
    updated_at: '',
    can: { update: true, delete: false, record_medical: true },
    ...overrides,
  }
}
