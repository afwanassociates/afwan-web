import type { CompanyAgentDetails } from '@/types/passport'

/** Mirrors afwan-api StoreCompanyRequest. */
export const COMPANY_NAME_MAX = 150
const PHONE_MAX = 30
const QUOTA_MAX = 4294967295
const PHONE_PATTERN = /^[0-9+\-\s()]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The optional agent fields of a company, in form order (`quota` is separate). */
export const AGENT_FIELDS = [
  { name: 'agent_name', label: 'Agent name', type: 'text', max: COMPANY_NAME_MAX },
  { name: 'agent_phone', label: 'Agent phone', type: 'tel', max: PHONE_MAX },
  { name: 'agent_email', label: 'Agent email', type: 'email', max: COMPANY_NAME_MAX },
  { name: 'bd_agency_name', label: 'Bangladesh agency name', type: 'text', max: COMPANY_NAME_MAX },
] as const
export type AgentField = (typeof AGENT_FIELDS)[number]['name']

/** Form values of the agent fields and quota (as typed). */
export type AgentFormValues = Record<AgentField, string> & { quota: string | number }

export function emptyAgentValues(from?: Partial<CompanyAgentDetails> | null): AgentFormValues {
  return {
    agent_name: from?.agent_name ?? '',
    agent_phone: from?.agent_phone ?? '',
    agent_email: from?.agent_email ?? '',
    bd_agency_name: from?.bd_agency_name ?? '',
    quota: from?.quota ?? '',
  }
}

/**
 * Checks the agent fields and quota. Returns the values trimmed (empty as null) and the
 * field errors, keyed by API field name.
 */
export function validateAgentValues(input: AgentFormValues): {
  values: CompanyAgentDetails
  errors: Record<string, string>
} {
  const errors: Record<string, string> = {}
  const v = Object.fromEntries(
    AGENT_FIELDS.map((f) => [f.name, input[f.name].trim() || null]),
  ) as Record<AgentField, string | null>
  for (const f of AGENT_FIELDS) {
    if ((v[f.name]?.length ?? 0) > f.max)
      errors[f.name] = `The ${f.label.toLowerCase()} must be at most ${f.max} characters.`
  }
  if (v.agent_phone && !errors.agent_phone && !PHONE_PATTERN.test(v.agent_phone))
    errors.agent_phone = 'The agent phone may only contain digits, spaces, +, - and brackets.'
  if (v.agent_email && !errors.agent_email && !EMAIL_PATTERN.test(v.agent_email))
    errors.agent_email = 'Enter a valid email address.'

  const quotaText = String(input.quota ?? '').trim()
  let quota: number | null = null
  if (quotaText) {
    quota = Number(quotaText)
    if (!/^\d+$/.test(quotaText) || quota > QUOTA_MAX)
      errors.quota = 'The quota must be a whole number of 0 or more.'
  }
  return { values: { ...v, quota }, errors }
}
