import api from '@/lib/api'
import type { PassportEntry } from '@/types/passport'

/*
 * Passport scan copy (data-entry routes; admin and super_admin use the same ones). The file
 * is only ever read through the API with the session cookie, never a public URL:
 *   GET  /api/data-entry/passports/{id}/scan              the file, inline
 *   GET  /api/data-entry/passports/{id}/scan?download=1   the file as a download
 *        404 "This passport has no scan copy yet.", 403 for accounts, 401 for guests
 *   POST /api/data-entry/passports/{id}/scan              multipart field "scan": upload or
 *        replace; returns the updated passport details (422 on a bad file)
 * Details responses carry has_scan, scan_original_name, scan_mime, scan_size and
 * scan_uploaded_at; lists only has_scan. The storage path is never sent.
 */
const url = (passportId: number) => `/api/data-entry/passports/${passportId}/scan`

/** What the API accepts: JPG, PNG or PDF (real content checked), up to 5 MB. */
export const SCAN_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'
export const SCAN_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const SCAN_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']
export const SCAN_MAX_BYTES = 5 * 1024 * 1024

/** A client-side check before uploading (the API checks again, including the real type). */
export function scanFileError(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!SCAN_EXTENSIONS.includes(extension) || (file.type && !SCAN_TYPES.includes(file.type)))
    return 'The scan must be a JPG, PNG or PDF file.'
  if (file.size > SCAN_MAX_BYTES) return 'The scan may not be larger than 5 MB.'
  if (file.size === 0) return 'The file is empty.'
  return null
}

/** Human file size, e.g. "240 KB", "1.5 MB". */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`
}

/** The scan as a Blob (cookies are sent: the axios client uses withCredentials). */
export async function fetchPassportScan(passportId: number, download = false): Promise<Blob> {
  const { data } = await api.get<Blob>(url(passportId), {
    responseType: 'blob',
    params: download ? { download: 1 } : undefined,
  })
  return data
}

/** Uploads or replaces the scan (multipart field "scan"). */
export async function uploadPassportScan(
  passportId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PassportEntry> {
  const body = new FormData()
  body.append('scan', file)
  const { data } = await api.post<{ data: PassportEntry }>(url(passportId), body, {
    onUploadProgress: onProgress
      ? (event) => {
          if (event.total) onProgress(Math.round((event.loaded / event.total) * 100))
        }
      : undefined,
  })
  return data.data
}

/** Shown when the web server refuses the upload body (HTTP 413) before the API sees it. */
export const SCAN_TOO_LARGE_FOR_SERVER =
  'The server refused the file because it is too large. Try a smaller file or ask an admin to check the upload limit.'
