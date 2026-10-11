import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type {
  PassportEntry,
  PassportFilters,
  PassportOverview,
  PassportPayload,
} from '@/types/passport'

const BASE = '/api/data-entry/passports'

export async function listPassports(filters: PassportFilters): Promise<Paginated<PassportEntry>> {
  const { data } = await api.get<Paginated<PassportEntry>>(BASE, { params: filters })
  return data
}

/** Lean overview items with a latest status (view=overview), for the All Passports screen. */
export async function listPassportOverview(
  filters: PassportFilters,
): Promise<Paginated<PassportOverview>> {
  const { data } = await api.get<Paginated<PassportOverview>>(BASE, {
    params: { ...filters, view: 'overview' },
  })
  return data
}

export async function getPassport(id: number): Promise<PassportEntry> {
  const { data } = await api.get<{ data: PassportEntry }>(`${BASE}/${id}`)
  return data.data
}

/** Upload progress, 0–100 (multipart requests only). */
export type ProgressHandler = (percent: number) => void

/**
 * The payload as multipart form data, with the scan file as field "scan". Empty values are
 * left out (except null, sent as an empty string so it clears). No Content-Type header is
 * set: the browser adds multipart/form-data with its boundary.
 */
function toFormData(payload: Partial<PassportPayload>, scan: File, method?: 'PATCH'): FormData {
  const body = new FormData()
  if (method) body.append('_method', method)
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    body.append(key, value === null ? '' : String(value))
  }
  body.append('scan', scan)
  return body
}

function progressOf(onProgress?: ProgressHandler) {
  return onProgress
    ? (event: { loaded: number; total?: number }) => {
        if (event.total) onProgress(Math.round((event.loaded / event.total) * 100))
      }
    : undefined
}

/** Creates a passport: multipart, with the required scan copy (field "scan"). */
export async function createPassport(
  payload: PassportPayload,
  scan: File,
  onProgress?: ProgressHandler,
): Promise<PassportEntry> {
  const { data } = await api.post<{ data: PassportEntry }>(BASE, toFormData(payload, scan), {
    onUploadProgress: progressOf(onProgress),
  })
  return data.data
}

/**
 * Updates a passport. With a new scan file: POST with _method=PATCH as multipart (PHP does
 * not read multipart bodies on PATCH). Without one: a normal JSON PATCH (no scan field).
 */
export async function updatePassport(
  id: number,
  payload: Partial<PassportPayload>,
  scan?: File | null,
  onProgress?: ProgressHandler,
): Promise<PassportEntry> {
  if (scan) {
    const { data } = await api.post<{ data: PassportEntry }>(
      `${BASE}/${id}`,
      toFormData(payload, scan, 'PATCH'),
      { onUploadProgress: progressOf(onProgress) },
    )
    return data.data
  }
  const { data } = await api.patch<{ data: PassportEntry }>(`${BASE}/${id}`, payload)
  return data.data
}

export async function deletePassport(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`)
}
