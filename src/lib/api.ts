import axios, { isAxiosError, type InternalAxiosRequestConfig } from 'axios'

/**
 * Shared HTTP client for the backend API (Laravel Sanctum SPA cookie auth).
 * baseURL has no /api suffix, so every path starts with /api (except /sanctum/csrf-cookie).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

/** The "who is logged in" endpoint; its 401/403 responses are handled specially. */
export const CURRENT_USER_PATH = '/api/user'

export interface AuthHandlers {
  /** Session expired or missing (401 on any request except GET /api/user). */
  onUnauthenticated: () => void
  /** GET /api/user returned 403: the account was deactivated. */
  onDeactivated: () => void
}

let handlers: AuthHandlers | null = null

/** Called once from main.ts, so this module does not depend on the store or router. */
export function setAuthHandlers(value: AuthHandlers | null) {
  handlers = value
}

type RetriableConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean }

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || !error.response || !error.config) throw error

    const config = error.config as RetriableConfig
    const status = error.response.status
    const isCurrentUserCheck =
      config.url === CURRENT_USER_PATH && (config.method ?? 'get').toLowerCase() === 'get'

    // CSRF token expired: get a fresh cookie and retry the request once.
    if (status === 419 && !config._csrfRetried) {
      config._csrfRetried = true
      await api.get('/sanctum/csrf-cookie')
      return api.request(config)
    }

    if (status === 401 && !isCurrentUserCheck) handlers?.onUnauthenticated()
    if (status === 403 && isCurrentUserCheck) handlers?.onDeactivated()

    throw error
  },
)

export default api
