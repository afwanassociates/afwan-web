import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api, { CURRENT_USER_PATH } from '@/lib/api'
import { errorStatus } from '@/lib/errors'
import type { User } from '@/types/auth'

export const DEACTIVATED_MESSAGE = 'Your account has been deactivated.'

/**
 * Who is logged in. Kept in memory only: the Sanctum session cookie is the source of truth,
 * so nothing here is ever written to localStorage/sessionStorage.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  /** True once the first GET /api/user has finished. */
  const isReady = ref(false)
  /** One-off message for the login page (e.g. account deactivated). */
  const notice = ref<string | null>(null)

  const isLoggedIn = computed(() => user.value !== null)

  let pending: Promise<void> | null = null

  /** Asks the API who is logged in. Concurrent and repeated calls share one request. */
  function fetchUser(): Promise<void> {
    if (isReady.value) return Promise.resolve()
    pending ??= (async () => {
      try {
        const { data } = await api.get<{ data: User }>(CURRENT_USER_PATH)
        user.value = data.data
      } catch (error) {
        // 401 simply means "not logged in". Any other failure also leaves us logged out.
        user.value = null
        if (errorStatus(error) === 403) notice.value = DEACTIVATED_MESSAGE
      } finally {
        isReady.value = true
        pending = null
      }
    })()
    return pending
  }

  /** Throws the axios error on failure (422 bad credentials, 429 throttled) for the form to show. */
  async function login(email: string, password: string) {
    await api.get('/sanctum/csrf-cookie')
    const { data } = await api.post<{ data: User }>('/api/login', { email, password })
    user.value = data.data
    isReady.value = true
    notice.value = null
  }

  async function logout() {
    try {
      await api.post('/api/logout')
    } finally {
      clear()
    }
  }

  /** Forgets the user locally (session already gone on the server). */
  function clear() {
    user.value = null
    isReady.value = true
  }

  return { user, isReady, notice, isLoggedIn, fetchUser, login, logout, clear }
})
