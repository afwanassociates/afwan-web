import { searchReferences } from '@/api/references'
import { fetchReportReferences } from '@/api/reports'
import type { ReferenceSummary } from '@/types/passport'

/**
 * Options of a "Filter by reference" dropdown. Data-entry users and admins use the reference
 * lookup; accounts cannot, so they use the reports' reference options. `companyId` limits the
 * list to references with passports of that company.
 */
export function searchReferenceOptions(
  query: string,
  canUseLookup: boolean,
  companyId?: number,
): Promise<ReferenceSummary[]> {
  return canUseLookup
    ? searchReferences({ q: query, company_id: companyId })
    : fetchReportReferences({ q: query, company_id: companyId })
}

/** The dropdown's second line under a reference: Person or Agency. */
export const referenceSubtitle = (item: ReferenceSummary) => item.type_label
