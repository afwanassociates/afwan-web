import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '@/types/auth'

/** HTTP status of a failed request, or undefined for network/other errors. */
export function errorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined
}

/**
 * Turns a 422 response into one message per field, e.g. { email: 'The email has already been taken.' }.
 * Returns {} for any other error.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isAxiosError<ApiErrorBody>(error) || error.response?.status !== 422) return {}
  const errors = error.response.data?.errors ?? {}
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [field, messages.join(' ')]),
  )
}

/** A readable message for any failed request. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.'
    const message = error.response.data?.message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
