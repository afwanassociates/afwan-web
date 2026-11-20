import type { Role } from '@/types/auth'
import type { AgentBucket, AgentStatus } from '@/types/agents'

/** Assign or change a passport's recruitment agent (the API: PassportAgentAssignmentPolicy::assign). */
export const AGENT_ASSIGNER_ROLES: readonly Role[] = ['data_entry']

/** Agent list, Agent Approvals: the operations head. */
export const AGENT_MANAGER_ROLES: readonly Role[] = ['operation_head']

/** The agent report (passport counts, no money): also data entry. */
export const AGENT_REPORT_ROLES: readonly Role[] = ['operation_head', 'accounts_head', 'data_entry']

/** Agent Changes: does a moved passport still count for the old agent? */
export const AGENT_DECIDER_ROLES: readonly Role[] = ['accounts_head']

/** Agent payments and ledgers (money): the accounts team. */
export const AGENT_PAYMENT_ROLES: readonly Role[] = ['accounts', 'accounts_head']

export const BUCKET_LABELS: Record<AgentBucket, string> = {
  not_started: 'No slip yet',
  medical_pending: 'Medical pending',
  fit: 'Fit',
  unfit: 'Unfit',
  calling: 'Calling',
  visa: 'Visa',
  bmet: 'BMET',
  flight: 'Flight pending',
  completed: 'Flight done',
  returned: 'Returned',
}

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  none: 'No agent',
  pending: 'Waiting for approval',
  returned: 'Returned for correction',
  approved: 'Approved',
}

/** Badge colours per status. */
export const AGENT_STATUS_CLASSES: Record<AgentStatus, string> = {
  none: 'bg-slate-100 text-slate-700 ring-slate-300',
  pending: 'bg-amber-50 text-amber-900 ring-amber-300',
  returned: 'bg-red-50 text-red-800 ring-red-300',
  approved: 'bg-green-50 text-green-800 ring-green-300',
}
