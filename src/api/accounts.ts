import api from '@/lib/api'
import type { Paginated } from '@/types/auth'
import { downloadCsv } from '@/api/reports'
import type {
  ApprovalItem,
  Expense,
  ExpenseFilters,
  ExpenseTotals,
  ApprovalStatus,
  ApprovalType,
  PendingTotals,
  CashBook,
  CashBookKind,
  CashPayment,
  CashPaymentPayload,
  CashPaymentTotals,
  CashPaymentType,
  CashReceipt,
  CashReceiptPayload,
  CashReceiptTotals,
  CashReceiptType,
  Party,
  PartyLedger,
  PartyPayload,
  PartyTransaction,
  PartyTransactionPayload,
  PartyType,
  PayeeType,
  PaymentMethod,
  ReceiptOptions,
  OwnerLoanBill,
  OwnerLoanBillPayload,
  OwnerLoanReport,
  CashSettings,
  FinanceSummary,
  CashTransfer,
  CashTransferPayload,
  CashTransferTotals,
  TransferDirection,
} from '@/types/accounts'

/** Accounts area: accounts, admin and super_admin. Deleting is admin-only (403 otherwise). */
const BASE = '/api/accounts'

/* ---------- Parties ---------- */

export interface PartyListParams {
  q?: string
  type?: PartyType
  /** 1 = active only, 0 = inactive only; omit for all. */
  is_active?: 0 | 1
  page?: number
  per_page?: number
}

/** Parties with their ledger totals, newest party ID first. */
export async function listParties(params: PartyListParams): Promise<Paginated<Party>> {
  const { data } = await api.get<Paginated<Party>>(`${BASE}/parties`, { params })
  return data
}

/** Up to 20 active parties of a type matching `q` (name, ID, mobile or NID). */
export async function searchParties(type: PartyType, q?: string): Promise<Party[]> {
  const page = await listParties({ type, q: q || undefined, is_active: 1, per_page: 20 })
  return page.data
}

export async function fetchParty(id: number): Promise<Party> {
  const { data } = await api.get<{ data: Party }>(`${BASE}/parties/${id}`)
  return data.data
}

/** 422 with errors.nid_passport when the NID/passport is already used. */
export async function createParty(payload: PartyPayload): Promise<Party> {
  const { data } = await api.post<{ data: Party }>(`${BASE}/parties`, payload)
  return data.data
}

/** Edit or (de)activate. The type and party ID never change. */
export async function updateParty(
  id: number,
  changes: Partial<Omit<PartyPayload, 'type'>> & { is_active?: boolean },
): Promise<Party> {
  const { data } = await api.patch<{ data: Party }>(`${BASE}/parties/${id}`, changes)
  return data.data
}

/**
 * The accounts head only, and only a party or owner with no passports and nothing in accounts
 * (`can_delete`). 422 with code party_has_passports or party_has_accounts otherwise.
 */
export async function deleteParty(id: number): Promise<void> {
  await api.delete(`${BASE}/parties/${id}`)
}

/** The ledger for an optional date range (from/to inclusive, 'YYYY-MM-DD'). */
export async function fetchPartyLedger(
  id: number,
  range: { from?: string; to?: string } = {},
): Promise<PartyLedger> {
  const { data } = await api.get<PartyLedger>(`${BASE}/parties/${id}/ledger`, {
    params: { from: range.from || undefined, to: range.to || undefined },
  })
  return data
}

/* ---------- Hand-entered ledger lines (receivable, refund) ---------- */

export async function createPartyTransaction(
  partyId: number,
  payload: PartyTransactionPayload,
): Promise<PartyTransaction> {
  const { data } = await api.post<{ data: PartyTransaction }>(
    `${BASE}/parties/${partyId}/transactions`,
    payload,
  )
  return data.data
}

export async function updatePartyTransaction(
  id: number,
  payload: PartyTransactionPayload,
): Promise<PartyTransaction> {
  const { data } = await api.patch<{ data: PartyTransaction }>(
    `${BASE}/party-transactions/${id}`,
    payload,
  )
  return data.data
}

export async function deletePartyTransaction(id: number): Promise<void> {
  await api.delete(`${BASE}/party-transactions/${id}`)
}

/* ---------- Cash receipts ---------- */

export interface CashReceiptListParams {
  q?: string
  status?: ApprovalStatus
  from?: string
  to?: string
  party_id?: number
  party_type?: PartyType
  receipt_type?: CashReceiptType
  payment_method?: PaymentMethod
  page?: number
  per_page?: number
}

export type CashReceiptPage = Paginated<CashReceipt> & {
  meta: Paginated<CashReceipt>['meta'] & {
    totals: CashReceiptTotals
    pending: PendingTotals
  }
}

/** Receipts, newest first; meta.totals sums every receipt matching the filters. */
export async function listCashReceipts(params: CashReceiptListParams): Promise<CashReceiptPage> {
  const { data } = await api.get<CashReceiptPage>(`${BASE}/cash-receipts`, { params })
  return data
}

export async function createCashReceipt(payload: CashReceiptPayload): Promise<CashReceipt> {
  const { data } = await api.post<{ data: CashReceipt }>(`${BASE}/cash-receipts`, payload)
  return data.data
}

/** The whole form is sent again; the receipt number never changes. */
export async function updateCashReceipt(
  id: number,
  payload: CashReceiptPayload,
): Promise<CashReceipt> {
  const { data } = await api.put<{ data: CashReceipt }>(`${BASE}/cash-receipts/${id}`, payload)
  return data.data
}

export async function deleteCashReceipt(id: number): Promise<void> {
  await api.delete(`${BASE}/cash-receipts/${id}`)
}

/** Business types, active countries and the default country for the cash receive form. */
export async function fetchReceiptOptions(): Promise<ReceiptOptions> {
  const { data } = await api.get<{ data: ReceiptOptions }>(`${BASE}/receipt-options`)
  return data.data
}

/* ---------- Cash payments ---------- */

export interface CashPaymentListParams {
  q?: string
  status?: ApprovalStatus
  from?: string
  to?: string
  party_id?: number
  payee_type?: PayeeType
  payment_type?: CashPaymentType
  payment_method?: PaymentMethod
  page?: number
  per_page?: number
}

export type CashPaymentPage = Paginated<CashPayment> & {
  meta: Paginated<CashPayment>['meta'] & {
    totals: CashPaymentTotals
    pending: PendingTotals
  }
}

/** Payments, newest first; meta.totals sums every payment matching the filters. */
export async function listCashPayments(params: CashPaymentListParams): Promise<CashPaymentPage> {
  const { data } = await api.get<CashPaymentPage>(`${BASE}/cash-payments`, { params })
  return data
}

/** 422 on `amount` when it would make cash in hand negative on some day. */
export async function createCashPayment(payload: CashPaymentPayload): Promise<CashPayment> {
  const { data } = await api.post<{ data: CashPayment }>(`${BASE}/cash-payments`, payload)
  return data.data
}

export async function updateCashPayment(
  id: number,
  payload: CashPaymentPayload,
): Promise<CashPayment> {
  const { data } = await api.put<{ data: CashPayment }>(`${BASE}/cash-payments/${id}`, payload)
  return data.data
}

export async function deleteCashPayment(id: number): Promise<void> {
  await api.delete(`${BASE}/cash-payments/${id}`)
}

/* ---------- Cash transfers (cash ↔ bank) ---------- */

export interface CashTransferListParams {
  q?: string
  status?: ApprovalStatus
  from?: string
  to?: string
  direction?: TransferDirection
  page?: number
  per_page?: number
}

export type CashTransferPage = Paginated<CashTransfer> & {
  meta: Paginated<CashTransfer>['meta'] & {
    totals: CashTransferTotals
    pending: PendingTotals
  }
}

export async function listCashTransfers(params: CashTransferListParams): Promise<CashTransferPage> {
  const { data } = await api.get<CashTransferPage>(`${BASE}/cash-transfers`, { params })
  return data
}

/** 422 on `amount` when a deposit would take more cash than is in hand. */
export async function createCashTransfer(payload: CashTransferPayload): Promise<CashTransfer> {
  const { data } = await api.post<{ data: CashTransfer }>(`${BASE}/cash-transfers`, payload)
  return data.data
}

export async function updateCashTransfer(
  id: number,
  payload: CashTransferPayload,
): Promise<CashTransfer> {
  const { data } = await api.put<{ data: CashTransfer }>(`${BASE}/cash-transfers/${id}`, payload)
  return data.data
}

export async function deleteCashTransfer(id: number): Promise<void> {
  await api.delete(`${BASE}/cash-transfers/${id}`)
}

/* ---------- Cash book and opening balance ---------- */

/** One book's entries grouped by day (cash in hand by default; "all" for the three together). */
export async function fetchCashBook(
  range: { from?: string; to?: string; book?: CashBookKind } = {},
): Promise<CashBook> {
  const { data } = await api.get<CashBook>(`${BASE}/cash-book`, {
    params: {
      book: range.book && range.book !== 'cash' ? range.book : undefined,
      from: range.from || undefined,
      to: range.to || undefined,
    },
  })
  return data
}

export async function fetchCashSettings(): Promise<CashSettings> {
  const { data } = await api.get<{ data: CashSettings }>(`${BASE}/cash-settings`)
  return data.data
}

/** Admin only. 422 on opening_date (cash entries before it) or opening_balance (too low). */
/** The money summary for the dashboard: the accounts head, admin and super admin. */
export async function fetchFinanceSummary(): Promise<FinanceSummary> {
  const { data } = await api.get<{ data: FinanceSummary }>('/api/finance/summary')
  return data.data
}

/* ---------- Approval (Prepared → Approved) ---------- */

/** The queue: every pending (or returned) entry, oldest first. */
export async function fetchApprovals(
  status: 'pending' | 'rejected' = 'pending',
  type?: ApprovalType,
): Promise<ApprovalItem[]> {
  const { data } = await api.get<{ data: ApprovalItem[] }>(`${BASE}/approvals`, {
    params: { status, type: type || undefined },
  })
  return data.data
}

export interface ApprovalSummary {
  /** Entries waiting: everyone's for an approver, one's own for the accounts team. */
  pending: number
  /** One's own entries returned for correction. */
  returned_mine: number
  is_approver: boolean
}

/** Counts for the menu badge. */
export async function fetchApprovalSummary(): Promise<ApprovalSummary> {
  const { data } = await api.get<{ data: ApprovalSummary }>(`${BASE}/approvals/summary`)
  return data.data
}

/** 403 with a message (e.g. you prepared it); 422 when cash in hand would go negative. */
export async function approveEntry(type: ApprovalType, id: number): Promise<void> {
  await api.post(`${BASE}/approvals/${type}/${id}/approve`)
}

/** Back to the preparer with a reason. An approved entry: admins only. */
export async function returnEntry(type: ApprovalType, id: number, reason: string): Promise<void> {
  await api.post(`${BASE}/approvals/${type}/${id}/return`, { reason })
}

/* ---------- Owner loans ---------- */

/**
 * Loans the company gave owners, with what is returned, settled by bills and outstanding, and
 * the owners' capital. `for_receipt`: the loan return being edited, left out of what waits.
 */
export async function getOwnerLoans(
  params: { party_id?: number; status?: 'open' | 'settled'; for_receipt?: number } = {},
): Promise<OwnerLoanReport> {
  const { data } = await api.get<OwnerLoanReport>(`${BASE}/owner-loans`, { params })
  return data
}

/** The bill form as multipart: the fields, plus the bill copy when one is chosen. */
function billForm(payload: OwnerLoanBillPayload, copy: File | null): FormData {
  const body = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) body.append(key, String(value))
  }
  if (copy) body.append('bill_copy', copy)
  return body
}

/** Record a bill the owner paid with the loan, with its copy; it waits for approval. */
export async function createOwnerLoanBill(
  loanId: number,
  payload: OwnerLoanBillPayload,
  copy: File,
): Promise<OwnerLoanBill> {
  const { data } = await api.post<{ data: OwnerLoanBill }>(
    `${BASE}/owner-loans/${loanId}/bills`,
    billForm(payload, copy),
  )
  return data.data
}

/** Edit a waiting or returned bill; a new copy replaces the old one. */
export async function updateOwnerLoanBill(
  id: number,
  payload: OwnerLoanBillPayload,
  copy: File | null,
): Promise<OwnerLoanBill> {
  const { data } = await api.post<{ data: OwnerLoanBill }>(
    `${BASE}/owner-loan-bills/${id}`,
    billForm(payload, copy),
  )
  return data.data
}

export async function deleteOwnerLoanBill(id: number): Promise<void> {
  await api.delete(`${BASE}/owner-loan-bills/${id}`)
}

/** The bill copy as a Blob (cookies are sent: the axios client uses withCredentials). */
export async function fetchOwnerLoanBillCopy(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`${BASE}/owner-loan-bills/${id}/copy`, {
    responseType: 'blob',
  })
  return data
}

/* ---------- Expenses ---------- */

/** What the company spent (expense payments and approved owner loan bills), newest first. */
export async function listExpenses(
  filters: ExpenseFilters,
): Promise<Paginated<Expense> & { meta: { totals: ExpenseTotals } }> {
  const { data } = await api.get<Paginated<Expense> & { meta: { totals: ExpenseTotals } }>(
    `${BASE}/expenses`,
    { params: filters },
  )
  return data
}

/** Downloads every matching expense as CSV. Returns the file name. */
export function downloadExpensesCsv(
  filters: Omit<ExpenseFilters, 'page' | 'per_page'>,
): Promise<string> {
  return downloadCsv(`${BASE}/expenses`, filters, 'expenses')
}
