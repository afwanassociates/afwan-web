import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/lib/api'
import { createPassport, updatePassport } from '../passports'
import { fetchPassportScan, uploadPassportScan } from '../passportScan'
import type { PassportPayload } from '@/types/passport'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const PAYLOAD: PassportPayload = {
  passport_name: 'MD RAHIM',
  passport_number: 'AB1234567',
  country_code: 'MY',
  date_of_birth: '1990-05-17',
  reference_id: 7,
  company_id: 3,
  passport_received_date: '2026-10-01',
  passport_expiry_date: '2031-10-04',
}
const FILE = new File(['\xFF\xD8\xFF'], 'scan.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 42 } } })
  vi.mocked(api.patch).mockResolvedValue({ data: { data: { id: 42 } } })
  vi.mocked(api.get).mockResolvedValue({ data: new Blob(['x']) })
})

/** The FormData sent in the latest call, as plain entries. */
const sentForm = (call: unknown[]) => Object.fromEntries((call[1] as FormData).entries())

describe('passport requests', () => {
  it('create: multipart with every field and the file as "scan"', async () => {
    await createPassport(PAYLOAD, FILE)

    const call = vi.mocked(api.post).mock.calls[0]!
    expect(call[0]).toBe('/api/data-entry/passports')
    expect(call[1]).toBeInstanceOf(FormData)
    const form = sentForm(call)
    expect(form.scan).toBe(FILE)
    expect(form.passport_number).toBe('AB1234567')
    expect(form.reference_id).toBe('7')
    expect(form._method).toBeUndefined()
    // No forced Content-Type: the browser sets multipart/form-data with its boundary.
    expect((call[2] as { headers?: unknown })?.headers).toBeUndefined()
  })

  it('update with a file: POST /passports/{id} with _method=PATCH (multipart)', async () => {
    await updatePassport(42, PAYLOAD, FILE)

    expect(api.patch).not.toHaveBeenCalled()
    const call = vi.mocked(api.post).mock.calls[0]!
    expect(call[0]).toBe('/api/data-entry/passports/42')
    const form = sentForm(call)
    expect(form._method).toBe('PATCH')
    expect(form.scan).toBe(FILE)
  })

  it('update without a file: a JSON PATCH with no scan field', async () => {
    await updatePassport(42, PAYLOAD, null)

    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).toHaveBeenCalledWith('/api/data-entry/passports/42', PAYLOAD)
    expect(vi.mocked(api.patch).mock.calls[0]![1]).not.toHaveProperty('scan')
  })

  it('reports upload progress', async () => {
    const onProgress = vi.fn()
    await createPassport(PAYLOAD, FILE, onProgress)

    const config = vi.mocked(api.post).mock.calls[0]![2] as {
      onUploadProgress: (e: { loaded: number; total: number }) => void
    }
    config.onUploadProgress({ loaded: 50, total: 200 })
    expect(onProgress).toHaveBeenCalledWith(25)
  })

  it('scan: GET as a blob (inline, or ?download=1) and POST multipart "scan"', async () => {
    await fetchPassportScan(20)
    expect(api.get).toHaveBeenLastCalledWith('/api/data-entry/passports/20/scan', {
      responseType: 'blob',
      params: undefined,
    })
    await fetchPassportScan(20, true)
    expect(api.get).toHaveBeenLastCalledWith('/api/data-entry/passports/20/scan', {
      responseType: 'blob',
      params: { download: 1 },
    })

    await uploadPassportScan(20, FILE)
    const call = vi.mocked(api.post).mock.calls[0]!
    expect(call[0]).toBe('/api/data-entry/passports/20/scan')
    expect(sentForm(call)).toEqual({ scan: FILE })
  })
})
