import { useCountriesStore } from '@/stores/countries'
import type {
  CompanyCounts,
  CompanyReportRow,
  CompanyReportSortKey,
  ReferenceReportRow,
  ReferenceReportSortKey,
} from '@/types/report'

/** Roles that may open the Company and Reference reports (the API's viewReport policies). */
export const REPORT_ROLES = [
  'data_entry',
  'operation_head',
  'accounts',
  'accounts_head',
  'admin',
  'super_admin',
] as const

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
  { key: 'returned', label: 'Returned' },
]

export const SORTABLE: readonly CompanyReportSortKey[] = [
  'name',
  'quota',
  ...COUNT_COLUMNS.map((c) => c.key),
  'balance',
]

/** Sortable columns of the reference report (no quota or balance). */
export const REFERENCE_SORTABLE: readonly ReferenceReportSortKey[] = [
  'name',
  'type',
  ...COUNT_COLUMNS.map((c) => c.key),
]

/**
 * Parses ?sort= ('-total' → total, descending) against a report's sortable columns (the
 * company report's by default). Unknown values fall back to name A–Z.
 */
export function parseSort<K extends string = CompanyReportSortKey>(
  value: unknown,
  sortable: readonly K[] = SORTABLE as readonly K[],
): { key: K; desc: boolean } {
  const text = typeof value === 'string' ? value : ''
  const desc = text.startsWith('-')
  const key = text.replace(/^-/, '') as K
  return sortable.includes(key) ? { key, desc } : { key: 'name' as K, desc: false }
}

/** Next sort when a header is clicked: names and types start A–Z, numbers largest first. */
export function nextSort<K extends string = CompanyReportSortKey>(
  current: string,
  key: K,
  sortable: readonly K[] = SORTABLE as readonly K[],
): string {
  const { key: active, desc } = parseSort(current, sortable)
  if (active === key) return desc ? key : `-${key}`
  return key === 'name' || key === 'type' ? key : `-${key}`
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

/* The same for the reference report: its rows, for the reference page's header. */
const seenReferenceRows = new Map<number, ReferenceReportRow>()

export function rememberReferenceRows(rows: readonly ReferenceReportRow[]) {
  for (const row of rows) seenReferenceRows.set(row.id, row)
}

export function rememberedReferenceRow(id: number): ReferenceReportRow | undefined {
  return seenReferenceRows.get(id)
}
