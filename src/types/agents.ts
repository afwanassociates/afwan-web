/** recruitment agents (afwan-api App\Models\RecruitmentAgent and PassportAgentAssignment). */

/** The short shape embedded in passports, assignments and payments. */
export interface AgentSummary {
  id: number
  /** AG-001 */
  code: string
  name: string
  rl_number: string
  /** Our own company as an agent: same steps, never paid. */
  is_own?: boolean
}

/** An agent on the Recruitment Agents page (the operations head). */
export interface RecruitmentAgent extends AgentSummary {
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  /** Passports the agent has now. */
  current_count?: number
  /** Passports that count (are paid) for the agent. */
  counted_count?: number
  created_at: string
  updated_at: string
}

export interface RecruitmentAgentPayload {
  name: string
  rl_number: string
  phone: string | null
  address: string | null
  notes: string | null
  /** Only when adding: this agent is our own company (only one). */
  is_own?: boolean
}

/** none: no agent · pending: waiting for the operations head · returned: sent back for correction · approved */
export type AgentStatus = 'none' | 'pending' | 'returned' | 'approved'

export type AssignmentStatus = 'pending' | 'approved' | 'returned'

/** After a change of agent: does the passport still count for the old agent? */
export type CountDecision = 'waiting' | 'yes' | 'no'

/** Where a passport is, in the agent report. */
export type AgentBucket =
  'not_started' | 'medical_pending' | 'fit' | 'unfit' | 'calling_onwards' | 'returned'

interface Person {
  id: number
  name: string
}

/** One assignment: a history row, an approval row or an Agent Changes row. */
export interface AgentAssignment {
  id: number
  passport_entry_id: number
  agent?: AgentSummary
  /** YYYY-MM-DD */
  assigned_date: string
  /** YYYY-MM-DD: when a later approved change replaced it. */
  ended_date: string | null
  /** The remark of a first assignment, or the reason of a change. */
  remark: string | null
  status: AssignmentStatus
  status_label: string
  is_current: boolean
  assigned_by?: Person | null
  approved_by?: Person | null
  approved_at: string | null
  returned_by?: Person | null
  returned_at: string | null
  return_reason: string | null
  count_decision: CountDecision | null
  count_decision_label: string | null
  decision_note: string | null
  decided_by?: Person | null
  decided_at: string | null
  /** Whether the passport counts for this agent now (lists with the passport). */
  counted?: boolean
  passport?: {
    id: number
    entry_no: number
    passport_name: string
    passport_number: string
    medical_slip_date: string | null
    bucket: AgentBucket
  } | null
  /** Approvals: the agent the passport has now (a change replaces it). */
  current_agent?: AgentSummary | null
  /** Agent Changes: the assignment that replaced this one. */
  replaced_by?: {
    id: number
    assigned_date: string
    remark: string | null
    agent: AgentSummary | null
  } | null
  can: { approve: boolean }
  created_at: string
}

export interface AssignAgentPayload {
  recruitment_agent_id: number
  /** YYYY-MM-DD */
  assigned_date: string
  remark: string | null
}

/** A bulk action's result: the passports done and the ones skipped with the reason. */
export interface BulkAgentResult {
  updated: { id: number; passport_number: string | null; passport_name: string | null }[]
  skipped: {
    id: number
    passport_number: string | null
    passport_name: string | null
    reason: string
  }[]
}

export type BucketCounts = Record<AgentBucket, number>

export interface AgentReportRow extends AgentSummary {
  is_active: boolean
  current: number
  counted: number
  waiting_approval: number
  waiting_decision: number
  buckets: BucketCounts
}

export interface AgentReport {
  agents: AgentReportRow[]
  no_agent: { current: number; waiting_approval: number; buckets: BucketCounts }
  buckets: AgentBucket[]
}

/** One passport of an agent (or of "No agent") in the report. */
export interface AgentReportPassport {
  id: number
  entry_no: number
  passport_name: string
  passport_number: string
  reference: string | null
  company: string | null
  bucket: AgentBucket
  assignment: {
    id: number
    status: AssignmentStatus
    assigned_date: string
    ended_date: string | null
    is_current: boolean
    count_decision: CountDecision | null
    counted: boolean
  } | null
  agent_status?: AgentStatus
  pending_agent?: string | null
}

/** Money cards of an agent (accounts team). There is no rate, so no due. */
export interface AgentMoneyCards {
  counted_passports: number
  total_paid: number
  pending_amount: number
  pending_count: number
  /** total paid ÷ counted passports; null with no counted passport. */
  average_per_passport: number | null
}

export type AgentPaymentsRow = AgentSummary & AgentMoneyCards & { is_active: boolean }

/** The agent-wise tabs of a passport list: "No agent", then each agent (Own first). */
export interface AgentTabCounts {
  none: number
  approved: number
  agents: (AgentSummary & { is_active: boolean; count: number })[]
}
