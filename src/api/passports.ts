import api from '@/lib/api'
import { downloadCsv } from '@/api/reports'
import type { Paginated } from '@/types/auth'
import type {
  EntryMode,
  PassportEntry,
  PassportFilters,
  PassportHistoryEvent,
  PassportOverview,
  PassportPayload,
  PassportReturnPayload,
  ReturnedPassport,
  ReturnedPassportFilters,
} from '@/types/passport'

const BASE = '/api/data-entry/passports'

/** A page of passports. */
export type PassportPage = Paginated<PassportEntry>

export async function listPassports(filters: PassportFilters): Promise<PassportPage> {
  const { data } = await api.get<PassportPage>(BASE, { params: filters })
  return data
}

/**
 * Marks a fit passport Online: it leaves the Medical Fit tab for Calling / Work
 * Permit. null clears the mark (back to Fit). 422 once Calling has started or without a valid
 * fit medical; 403 for accounts.
 */
export async function updateEntryMode(id: number, mode: EntryMode | null): Promise<PassportEntry> {
  const { data } = await api.patch<{ data: PassportEntry }>(`${BASE}/${id}/entry-mode`, {
    entry_mode: mode,
  })
  return data.data
}

/**
 * Lean overview items with a latest status, for the All Passports screen. Read-only, so it
 * comes from /api/reports/passports, which accounts may read too.
 */
export async function listPassportOverview(
  filters: PassportFilters,
): Promise<Paginated<PassportOverview>> {
  const { data } = await api.get<Paginated<PassportOverview>>('/api/reports/passports', {
    params: { ...filters, view: 'overview' },
  })
  return data
}

/**
 * Downloads the All Passports overview as CSV (same searches, every page, newest first).
 * Returns the file name.
 */
export function downloadPassportOverviewCsv(
  filters: Omit<PassportFilters, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv('/api/reports/passports', { ...filters, view: 'overview' }, 'all-passports')
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

/**
 * Returns the passport to its owner (the operations head): it leaves every working list and
 * no step can be recorded on it until the return is undone. 422 when it is already returned.
 */
export async function returnPassport(
  id: number,
  payload: PassportReturnPayload,
): Promise<PassportEntry> {
  const { data } = await api.post<{ data: PassportEntry }>(`${BASE}/${id}/return`, payload)
  return data.data
}

/** Undoes the return: the passport goes back to the step it was at (the operations head). */
export async function undoPassportReturn(id: number): Promise<PassportEntry> {
  const { data } = await api.delete<{ data: PassportEntry }>(`${BASE}/${id}/return`)
  return data.data
}

/** Returned passports, newest return first (every role, read only). */
export async function listReturnedPassports(
  filters: ReturnedPassportFilters,
): Promise<Paginated<ReturnedPassport>> {
  const { data } = await api.get<Paginated<ReturnedPassport>>('/api/reports/returned-passports', {
    params: filters,
  })
  return data
}

/** Downloads the returned passports as CSV (same filters, every page). Returns the file name. */
export function downloadReturnedPassportsCsv(
  filters: Omit<ReturnedPassportFilters, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv('/api/reports/returned-passports', filters, 'returned-passports')
}

/** A passport's history from entry to flight, oldest first. */
export async function getPassportHistory(id: number): Promise<PassportHistoryEvent[]> {
  const { data } = await api.get<{ data: PassportHistoryEvent[] }>(`${BASE}/${id}/history`)
  return data.data
}
