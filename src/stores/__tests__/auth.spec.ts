import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import api from '@/lib/api'
import { DEACTIVATED_MESSAGE, useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  CURRENT_USER_PATH: '/api/user',
}))

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
})

describe('auth store', () => {
  describe('login', () => {
    it('gets the CSRF cookie, posts the credentials and stores the user', async () => {
      const user = makeUser()
      get.mockResolvedValue({ status: 204 })
      post.mockResolvedValue({ data: { data: user } })
      const auth = useAuthStore()

      await auth.login('test@afwan.test', 'password')

      expect(get).toHaveBeenCalledWith('/sanctum/csrf-cookie')
      expect(post).toHaveBeenCalledWith('/api/login', {
        email: 'test@afwan.test',
        password: 'password',
      })
      expect(get.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]!)
      expect(auth.user).toEqual(user)
      expect(auth.isLoggedIn).toBe(true)
      expect(auth.isReady).toBe(true)
    })

    it('rethrows a 422 and stays logged out', async () => {
      const error = httpError(422, {
        message: 'These credentials do not match our records.',
        errors: { email: ['These credentials do not match our records.'] },
      })
      get.mockResolvedValue({ status: 204 })
      post.mockRejectedValue(error)
      const auth = useAuthStore()

      await expect(auth.login('test@afwan.test', 'wrong')).rejects.toBe(error)
      expect(auth.user).toBeNull()
      expect(auth.isLoggedIn).toBe(false)
    })

    it('clears a pending notice after a successful login', async () => {
      get.mockResolvedValue({ status: 204 })
      post.mockResolvedValue({ data: { data: makeUser() } })
      const auth = useAuthStore()
      auth.notice = DEACTIVATED_MESSAGE

      await auth.login('test@afwan.test', 'password')

      expect(auth.notice).toBeNull()
    })
  })

  describe('logout', () => {
    it('posts to /api/logout and clears the user', async () => {
      post.mockResolvedValue({ status: 204 })
      const auth = useAuthStore()
      auth.user = makeUser()

      await auth.logout()

      expect(post).toHaveBeenCalledWith('/api/logout')
      expect(auth.user).toBeNull()
      expect(auth.isLoggedIn).toBe(false)
    })

    it('still clears the user when the request fails', async () => {
      post.mockRejectedValue(httpError(500))
      const auth = useAuthStore()
      auth.user = makeUser()

      await expect(auth.logout()).rejects.toBeTruthy()
      expect(auth.user).toBeNull()
    })
  })

  describe('fetchUser', () => {
    it('stores the user on 200', async () => {
      const user = makeUser({ role: 'accounts' })
      get.mockResolvedValue({ data: { data: user } })
      const auth = useAuthStore()

      await auth.fetchUser()

      expect(get).toHaveBeenCalledWith('/api/user')
      expect(auth.user).toEqual(user)
      expect(auth.isReady).toBe(true)
    })

    it('treats 401 as logged out, not as an error', async () => {
      get.mockRejectedValue(httpError(401, { message: 'Unauthenticated.' }))
      const auth = useAuthStore()

      await expect(auth.fetchUser()).resolves.toBeUndefined()

      expect(auth.user).toBeNull()
      expect(auth.isLoggedIn).toBe(false)
      expect(auth.isReady).toBe(true)
      expect(auth.notice).toBeNull()
    })

    it('treats 403 as a deactivated account', async () => {
      get.mockRejectedValue(httpError(403, { message: 'Account deactivated.' }))
      const auth = useAuthStore()

      await auth.fetchUser()

      expect(auth.user).toBeNull()
      expect(auth.notice).toBe(DEACTIVATED_MESSAGE)
    })

    it('only asks the API once', async () => {
      get.mockResolvedValue({ data: { data: makeUser() } })
      const auth = useAuthStore()

      await Promise.all([auth.fetchUser(), auth.fetchUser()])
      await auth.fetchUser()

      expect(get).toHaveBeenCalledTimes(1)
    })
  })
})
