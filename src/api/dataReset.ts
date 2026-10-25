import api from '@/lib/api'

/** Settings → Danger zone: delete all data. Super admin only (403 for everyone else). */
const BASE = '/api/super-admin/data-reset'

export type DataGroupKey = 'passports' | 'companies' | 'accounts'

export interface DataGroup {
  key: DataGroupKey
  label: string
  description: string
  tables: { name: string; rows: number }[]
  rows: number
  /** Uploaded passport scan files (passports group only). */
  files: number | null
}

export interface DataBackup {
  name: string
  size: number
  created_at: string | null
  created_by: string | null
  groups: DataGroupKey[]
  rows: number | null
  files: number | null
}

export interface DataResetOverview {
  groups: DataGroup[]
  backups: DataBackup[]
  /** The exact words to type, "DELETE ALL DATA". */
  confirmation: string
}

export interface DataResetResult {
  deleted: Record<string, number>
  files: number
  backup: string
  groups: DataGroup[]
  backups: DataBackup[]
}

export async function fetchDataReset(): Promise<DataResetOverview> {
  const { data } = await api.get<{ data: DataResetOverview }>(BASE)
  return data.data
}

/**
 * Back up, then delete the groups. 422 on confirmation / password / groups (companies need
 * passports); 429 after 5 tries a minute.
 */
export async function resetData(payload: {
  groups: DataGroupKey[]
  confirmation: string
  password: string
}): Promise<DataResetResult> {
  const { data } = await api.post<{ data: DataResetResult }>(BASE, payload)
  return data.data
}

/** Saves the backup file in the browser's downloads. */
export async function downloadBackup(name: string): Promise<void> {
  const response = await api.get<Blob>(`${BASE}/backups/${encodeURIComponent(name)}`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function deleteBackup(name: string): Promise<void> {
  await api.delete(`${BASE}/backups/${encodeURIComponent(name)}`)
}
