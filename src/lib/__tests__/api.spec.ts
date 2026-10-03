import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import api, { setAuthHandlers } from '@/lib/api'
import { httpError } from '@/test/helpers'

/** Fake transport: answers each request with the next status queued for its URL. */
function useFakeServer(statuses: Record<string, number[]>) {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? ''
    calls.push(`${config.method?.toUpperCase()} ${url}`)
    const status = statuses[url]?.shift() ?? 200
    if (status >= 400) throw httpError(status, { message: `status ${status}` }, config)
    const response: AxiosResponse = {
      status,
      statusText: '',
      data: { ok: true },
      headers: {},
      config,
    }
    return response
  }
  api.defaults.adapter = adapter
  return calls
}

const onUnauthenticated = vi.fn()
const onDeactivated = vi.fn()
const originalAdapter = api.defaults.adapter

beforeEach(() => {
  vi.resetAllMocks()
  setAuthHandlers({ onUnauthenticated, onDeactivated })
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  setAuthHandlers(null)
})

describe('api response interceptor', () => {
  it('on 419 refreshes the CSRF cookie and retries once', async () => {
    const calls = useFakeServer({ '/api/admin/users': [419, 201] })

    const response = await api.post('/api/admin/users', { name: 'x' })

    expect(response.status).toBe(201)
    expect(calls).toEqual([
      'POST /api/admin/users',
      'GET /sanctum/csrf-cookie',
      'POST /api/admin/users',
    ])
  })

  it('does not retry a second 419', async () => {
    const calls = useFakeServer({ '/api/logout': [419, 419] })

    await expect(api.post('/api/logout')).rejects.toMatchObject({ response: { status: 419 } })
    expect(calls).toHaveLength(3)
  })

  it('on 401 calls onUnauthenticated', async () => {
    useFakeServer({ '/api/admin/users': [401] })

    await expect(api.get('/api/admin/users')).rejects.toBeTruthy()
    expect(onUnauthenticated).toHaveBeenCalledTimes(1)
  })

  it('ignores 401 from the GET /api/user check', async () => {
    useFakeServer({ '/api/user': [401] })

    await expect(api.get('/api/user')).rejects.toBeTruthy()
    expect(onUnauthenticated).not.toHaveBeenCalled()
    expect(onDeactivated).not.toHaveBeenCalled()
  })

  it('on 403 from GET /api/user calls onDeactivated', async () => {
    useFakeServer({ '/api/user': [403] })

    await expect(api.get('/api/user')).rejects.toBeTruthy()
    expect(onDeactivated).toHaveBeenCalledTimes(1)
  })

  it('leaves other 403s to the caller', async () => {
    useFakeServer({ '/api/super-admin/dashboard': [403] })

    await expect(api.get('/api/super-admin/dashboard')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(onDeactivated).not.toHaveBeenCalled()
    expect(onUnauthenticated).not.toHaveBeenCalled()
  })
})
