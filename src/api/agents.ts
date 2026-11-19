import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import type { CashPayment } from '@/types/accounts'
import type {
  AgentAssignment,
  AgentMoneyCards,
  AgentPaymentsRow,
  AgentReport,
  AgentReportPassport,
  AgentSummary,
  AgentTabCounts,
  AssignAgentPayload,
  AssignmentStatus,
  BulkAgentResult,
  RecruitmentAgent,
  RecruitmentAgentPayload,
} from '@/types/agents'

/* ---------- The agent list (the operations head) ---------- */

const ADMIN = '/api/admin/recruitment-agents'

export async function listAgents(
  params: { q?: string; is_active?: 0 | 1 } = {},
): Promise<RecruitmentAgent[]> {
  const { data } = await api.get<{ data: RecruitmentAgent[] }>(ADMIN, { params })
  return data.data
}

/** 422 with errors.rl_number when another agent has the RL number. */
export async function createAgent(payload: RecruitmentAgentPayload): Promise<RecruitmentAgent> {
  const { data } = await api.post<{ data: RecruitmentAgent }>(ADMIN, payload)
  return data.data
}

export async function updateAgent(
  id: number,
  changes: Partial<RecruitmentAgentPayload> & { is_active?: boolean },
): Promise<RecruitmentAgent> {
  const { data } = await api.patch<{ data: RecruitmentAgent }>(`${ADMIN}/${id}`, changes)
  return data.data
}

/**
 * Up to 20 active agents, Own first (the passport team and the accounts team). partners: only
 * the partner agents (cash payments: the company never pays its Own agent).
 */
export async function searchAgents(q?: string, partners = false): Promise<AgentSummary[]> {
  const { data } = await api.get<{ data: AgentSummary[] }>('/api/recruitment-agents/lookup', {
    params: { q: q || undefined, partners: partners ? 1 : undefined },
  })
  return data.data
}

/* ---------- Assigning (data entry) ---------- */

const DATA_ENTRY = '/api/data-entry'

/** The passport's assignments, oldest first (returned ones included). */
export async function listAgentAssignments(passportId: number): Promise<AgentAssignment[]> {
  const { data } = await api.get<{ data: AgentAssignment[] }>(
    `${DATA_ENTRY}/passports/${passportId}/agent-assignments`,
  )
  return data.data
}

/** Assign or change the agent: it waits for the operations head. A change needs a reason (remark). */
export async function assignAgent(
  passportId: number,
  payload: AssignAgentPayload,
): Promise<AgentAssignment> {
  const { data } = await api.post<{ data: AgentAssignment }>(
    `${DATA_ENTRY}/passports/${passportId}/agent-assignments`,
    payload,
  )
  return data.data
}

/** One agent and date for many passports without an agent. */
export async function bulkAssignAgent(
  passportIds: number[],
  payload: AssignAgentPayload,
): Promise<BulkAgentResult> {
  const { data } = await api.post<{ data: BulkAgentResult }>(
    `${DATA_ENTRY}/agent-assignments/bulk`,
    {
      ...payload,
      passport_ids: passportIds,
    },
  )
  return data.data
}

/* ---------- Agent Approvals (the operations head) ---------- */

const APPROVALS = '/api/operation-head/agent-approvals'

export async function listAgentApprovals(params: {
  status?: AssignmentStatus
  q?: string
  page?: number
  per_page?: number
}): Promise<Paginated<AgentAssignment>> {
  const { data } = await api.get<Paginated<AgentAssignment>>(APPROVALS, { params })
  return data
}

export async function fetchAgentApprovalCount(): Promise<number> {
  const { data } = await api.get<{ data: { pending: number } }>(`${APPROVALS}/summary`)
  return data.data.pending
}

export async function approveAgentAssignment(id: number): Promise<AgentAssignment> {
  const { data } = await api.post<{ data: AgentAssignment }>(`${APPROVALS}/${id}/approve`)
  return data.data
}

export async function returnAgentAssignment(id: number, reason: string): Promise<AgentAssignment> {
  const { data } = await api.post<{ data: AgentAssignment }>(`${APPROVALS}/${id}/return`, {
    reason,
  })
  return data.data
}

export async function bulkApproveAgentAssignments(ids: number[]): Promise<BulkAgentResult> {
  const { data } = await api.post<{ data: BulkAgentResult }>(`${APPROVALS}/bulk-approve`, { ids })
  return data.data
}

/* ---------- Agent Changes (the accounts head) ---------- */

const CHANGES = '/api/accounts-head/agent-changes'

export async function listAgentChanges(params: {
  decision?: 'waiting' | 'decided'
  page?: number
  per_page?: number
}): Promise<Paginated<AgentAssignment>> {
  const { data } = await api.get<Paginated<AgentAssignment>>(CHANGES, { params })
  return data
}

export async function fetchAgentChangeCount(): Promise<number> {
  const { data } = await api.get<{ data: { waiting: number } }>(`${CHANGES}/summary`)
  return data.data.waiting
}

/** Yes: the passport still counts (is paid) for the old agent. */
export async function decideAgentChange(
  id: number,
  counts: boolean,
  note: string | null,
): Promise<AgentAssignment> {
  const { data } = await api.post<{ data: AgentAssignment }>(`${CHANGES}/${id}/decide`, {
    counts,
    note,
  })
  return data.data
}

/* ---------- Agent report (the operations head and the accounts head) ---------- */

export async function fetchAgentReport(): Promise<AgentReport> {
  const { data } = await api.get<{ data: AgentReport }>('/api/agent-report')
  return data.data
}

/** An agent's passports, or "none" for the passports without an agent. */
export async function fetchAgentReportPassports(
  agent: number | 'none',
): Promise<{ data: AgentReportPassport[]; agent: AgentSummary | null }> {
  const { data } = await api.get<{ data: AgentReportPassport[]; agent: AgentSummary | null }>(
    `/api/agent-report/${agent}/passports`,
  )
  return data
}

/* ---------- Agent payments (the accounts team) ---------- */

export async function listAgentPayments(): Promise<AgentPaymentsRow[]> {
  const { data } = await api.get<{ data: AgentPaymentsRow[] }>('/api/accounts/recruitment-agents')
  return data.data
}

export interface AgentLedger extends AgentMoneyCards {
  agent: AgentSummary & { is_active: boolean; phone: string | null }
  payments: (CashPayment & { running_total: number })[]
  pending_payments: CashPayment[]
}

export async function fetchAgentLedger(id: number): Promise<AgentLedger> {
  const { data } = await api.get<{ data: AgentLedger }>(`/api/accounts/recruitment-agents/${id}`)
  return data.data
}

/** The Passport Entry List tabs: passports without an approved agent, and per agent. */
export type { AgentTabCounts } from '@/types/agents'

export async function fetchAgentTabCounts(stage?: string): Promise<AgentTabCounts> {
  const { data } = await api.get<{ data: AgentTabCounts }>('/api/data-entry/agent-counts', {
    params: { stage },
  })
  return data.data
}
