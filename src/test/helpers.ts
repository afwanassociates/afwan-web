import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import type { Role, User } from '@/types/auth'

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
