/** Mirrors afwan-api StoreCompanyRequest. */
export const COMPANY_NAME_MAX = 150
const QUOTA_MAX = 4294967295

/** Checks the quota (required, a whole number of at least 1). Returns it, or the error. */
export function validateQuota(input: string | number | null | undefined): {
  quota: number | null
  error?: string
} {
  const text = String(input ?? '').trim()
  if (!text)
    return { quota: null, error: 'Enter the quota (the number of workers the company needs).' }
  const quota = Number(text)
  if (!/^\d+$/.test(text) || quota > QUOTA_MAX)
    return { quota: null, error: 'The quota must be a whole number.' }
  if (quota < 1) return { quota: null, error: 'The quota must be at least 1.' }
  return { quota }
}
