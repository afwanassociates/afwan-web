import { useCountriesStore } from '@/stores/countries'
import type { CompanyCounts, CompanyReportRow, CompanyReportSortKey } from '@/types/report'

/** Roles that may open the Companies report (the API's CompanyPolicy::viewReport). */
export const REPORT_ROLES = ['data_entry', 'accounts', 'admin', 'super_admin'] as const

/** Count columns of the report table, in order. */
export const COUNT_COLUMNS: readonly { key: keyof CompanyCounts; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'medical_fit', label: 'Medical fit' },
  { key: 'medical_unfit', label: 'Unfit' },
  { key: 'calling_done', label: 'Calling' },
  { key: 'visa_done', label: 'Visa' },
  { key: 'bmet_done', label: 'BMET' },
  { key: 'flight_done', label: 'Flight done' },
  { key: 'in_process', label: 'In process' },
]

export const SORTABLE: readonly CompanyReportSortKey[] = [
  'name',
  'quota',
  ...COUNT_COLUMNS.map((c) => c.key),
  'balance',
]

/** Parses ?sort= ('-total' → total, descending). Unknown values fall back to name A–Z. */
export function parseSort(value: unknown): { key: CompanyReportSortKey; desc: boolean } {
  const text = typeof value === 'string' ? value : ''
  const desc = text.startsWith('-')
  const key = text.replace(/^-/, '') as CompanyReportSortKey
  return SORTABLE.includes(key) ? { key, desc } : { key: 'name', desc: false }
}

/** Next sort when a header is clicked: names start A–Z, numbers start largest first. */
export function nextSort(current: string, key: CompanyReportSortKey): string {
  const { key: active, desc } = parseSort(current)
  if (active === key) return desc ? key : `-${key}`
  return key === 'name' ? key : `-${key}`
}

/** Colour of a count cell: zero is muted, "in process" is amber. */
export function countClass(key: keyof CompanyCounts, value: number): string {
  if (value === 0) return 'text-slate-400'
  if (key === 'in_process') return 'font-semibold text-amber-700'
  return 'text-ink'
}

/** Colour of a balance: red when over quota, muted when zero or no quota. */
export function balanceClass(balance: number | null): string {
  if (balance === null || balance === 0) return 'text-slate-400'
  if (balance < 0) return 'font-semibold text-red-700'
  return 'text-ink'
}

/** The balance as text; "—" when the company has no quota. */
export function formatBalance(balance: number | null): string {
  return balance === null ? '—' : String(balance)
}

let regionNames: Intl.DisplayNames | null = null

/** A country's name from its code: the loaded country list first, then the browser's names. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—'
  const known = useCountriesStore().byCode(code)?.name
  if (known) return known
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/*
 * Rows seen on the report page, so the company page can show its header at once.
 * The company page looks the row up again when it is opened directly.
 */
const seenRows = new Map<number, CompanyReportRow>()

export function rememberRows(rows: readonly CompanyReportRow[]) {
  for (const row of rows) seenRows.set(row.id, row)
}

export function rememberedRow(id: number): CompanyReportRow | undefined {
  return seenRows.get(id)
}
