/** Types matching the afwan-api accounts contract (/api/accounts/…). */

import type { CountryOption, CountrySummary } from '@/types/country'

/* ---------- Approval (Prepared → Approved) ---------- */

/** Only approved entries count in the cash book, cash in hand and ledgers. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

/** What the current user may do with an entry (decided by the API). */
export interface EntryPermissions {
  update: boolean
  delete: boolean
  approve: boolean
  send_back: boolean
}

/** The approval part of a cash receipt, payment, transfer or hand-entered ledger line. */
export interface ApprovalFields {
  status: ApprovalStatus
  status_label: string
  prepared_by?: string | null
  updated_by?: string | null
  approved_by?: string | null
  approved_at: string | null
  returned_by?: string | null
  returned_at: string | null
  return_reason: string | null
  can: EntryPermissions
}

/** URL segment of an entry type in /api/accounts/approvals/{type}/{id}/… */
export type ApprovalType =
  'cash-receipts' | 'cash-payments' | 'cash-transfers' | 'party-transactions'

/** One row of the approval queue. */
export interface ApprovalItem {
  type: ApprovalType
  id: number
  kind: string
  reference: string | null
  title: string
  detail: string
  party_id: number | null
  /** Cash in or out of hand; null for a ledger entry. */
  direction: 'in' | 'out' | null
  date: string
  amount: number
  note: string | null
  status: ApprovalStatus
  status_label: string
  prepared_by: string | null
  updated_by: string | null
  returned_by: string | null
  return_reason: string | null
  created_at: string | null
  can: { approve: boolean; send_back: boolean }
  /** Why approving is refused for this user (e.g. they prepared it). */
  approve_denied: string | null
}

/** Entries waiting in a list: how many and their amount (not in the totals). */
export interface PendingTotals {
  count: number
  amount: number
}

/** A party is a client, or an owner of the company (own ID series: PT-0001, OW-001). */
export type PartyType = 'client' | 'owner'

/** Side of the opening balance: receivable (they owe us, Dr) or payable (we owe them, Cr). */
export type BalanceType = 'receivable' | 'payable'

/** Ledger line types. Receivable, refund, loan_repayment and drawing are debits; the others credits. */
export type PartyTransactionType =
  'receivable' | 'payment' | 'refund' | 'loan' | 'capital' | 'loan_repayment' | 'drawing'

/** The line types entered by hand on the ledger (payments come from cash receipts). */
/** Only a receivable is entered by hand; refunds are cash payments. */
export type ManualTransactionType = 'receivable'

export type CashReceiptType = 'cash' | 'loan'

/** Which business a party's money is for; only recruitment has a country (for now). */
export type BusinessType = 'recruitment' | 'land' | 'solar' | 'railway'

/** GET /accounts/receipt-options: what the cash receive form offers a party. */
export interface ReceiptOptions {
  business_types: { value: BusinessType; label: string }[]
  default_business_type: BusinessType
  countries: CountryOption[]
  default_country: CountrySummary
}

/** How money came in or went out; only approved cash (not bank or mobile banking) counts in cash in hand. */
export type PaymentMethod = 'cash' | 'bank' | 'mobile_banking'

/** Bangladesh mobile financial services (MFS); labels in MOBILE_BANKING_PROVIDERS. */
export type MobileBankingProvider =
  | 'bkash'
  | 'nagad'
  | 'rocket'
  | 'upay'
  | 'mcash'
  | 'tap'
  | 'ok_wallet'
  | 'surecash'
  | 'mycash'
  | 'firstcash'
  | 'islamic_wallet'
  | 'meghna_pay'

/** What an expense (payment to an "other" payee) was spent on; labels in EXPENSE_CATEGORIES. */
export type ExpenseCategory =
  | 'office_rent'
  | 'utility_bill'
  | 'internet_phone'
  | 'salary'
  | 'tea_entertainment'
  | 'transport'
  | 'stationery'
  | 'repair'
  | 'government_fee'
  | 'courier'
  | 'other'

/** Ledger totals of a party; closing_balance is positive when the party owes us. */
export interface PartyTotals {
  receivable: number
  payment: number
  refund: number
  loan: number
  capital: number
  loan_repayment: number
  drawing: number
  closing_balance: number
}

export interface Party {
  id: number
  code: string
  type: PartyType
  type_label: string
  rl_number: string | null
  name: string
  mobile: string
  address: string
  nid_passport: string
  tin_bin: string | null
  opening_balance: number
  opening_balance_type: BalanceType
  is_active: boolean
  totals?: PartyTotals
  created_at: string
  updated_at: string
}

/** Body of POST /parties (type only on create) and PATCH /parties/{id}. */
export interface PartyPayload {
  type?: PartyType
  rl_number: string | null
  name: string
  mobile: string
  address: string
  nid_passport: string
  tin_bin: string | null
  opening_balance: number
  opening_balance_type: BalanceType
}

export interface LedgerLine {
  id: number
  date: string
  type: PartyTransactionType
  type_label: string
  note: string | null
  /** Voucher number of a line written by a cash receipt or payment. */
  reference: string | null
  cash_receipt_id: number | null
  cash_payment_id: number | null
  is_manual: boolean
  debit: number
  credit: number
  balance: number
  can: EntryPermissions
}

/** A ledger line waiting for approval or returned; it does not count in the balance. */
export interface PendingLedgerLine extends Omit<LedgerLine, 'balance'> {
  status: ApprovalStatus
  status_label: string
  prepared_by: string | null
  returned_by: string | null
  return_reason: string | null
}

export interface PartyLedger {
  party: Party
  from: string | null
  to: string | null
  opening_balance: number
  lines: LedgerLine[]
  totals: { debit: number; credit: number }
  closing_balance: number
  /** Lines waiting for approval or returned, any date. */
  pending: PendingLedgerLine[]
}

export interface PartyTransactionPayload {
  date: string
  type: ManualTransactionType
  amount: number
  note: string | null
}

export interface PartyTransaction extends PartyTransactionPayload, ApprovalFields {
  id: number
  party_id: number
  type_label: string
  is_manual: boolean
}

export interface CashReceipt extends ApprovalFields {
  id: number
  receipt_no: string
  date: string
  party: Pick<Party, 'id' | 'code' | 'type' | 'name' | 'mobile' | 'address'>
  receipt_type: CashReceiptType
  receipt_type_label: string
  /** Party receipts only (null for owners). */
  business_type: BusinessType | null
  business_type_label: string | null
  /** Recruitment receipts only. */
  country: CountrySummary | null
  amount: number
  payment_method: PaymentMethod
  payment_method_label: string
  bank_name: string | null
  bank_branch: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  mobile_provider: MobileBankingProvider | null
  mobile_provider_label: string | null
  mobile_number: string | null
  note: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface CashReceiptPayload {
  date: string
  party_type: PartyType
  party_id: number
  receipt_type: CashReceiptType
  business_type: BusinessType | null
  country_code: string | null
  amount: number
  payment_method: PaymentMethod
  bank_name: string | null
  bank_branch: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  mobile_provider: MobileBankingProvider | null
  mobile_number: string | null
  note: string | null
}

/** meta.totals of the receipt list: every receipt matching the filters, all pages. */
export interface CashReceiptTotals {
  count: number
  amount: number
  cash: number
  bank: number
  mobile_banking: number
}

/* ---------- Cash payments ---------- */

/** Who a cash payment goes to: a party, an owner, or any other payee typed by name. */
export type PayeeType = 'client' | 'owner' | 'other'

/** Party: refund / loan_repayment · owner: drawing / loan_repayment · other: expense. */
export type CashPaymentType = 'refund' | 'loan_repayment' | 'drawing' | 'expense'

export interface CashPayment extends ApprovalFields {
  id: number
  payment_no: string
  date: string
  payee_type: PayeeType
  payee_type_label: string
  /** The party or owner paid; null for another payee. */
  party: Pick<Party, 'id' | 'code' | 'type' | 'name' | 'mobile' | 'address'> | null
  /** The party's name, or the typed payee name. */
  payee_name: string
  payment_type: CashPaymentType
  payment_type_label: string
  /** The owner loan a loan repayment pays back. */
  loan_receipt?: { id: number; receipt_no: string } | null
  expense_category: ExpenseCategory | null
  expense_category_label: string | null
  purpose: string | null
  bill_no: string | null
  amount: number
  payment_method: PaymentMethod
  payment_method_label: string
  bank_name: string | null
  bank_branch: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  mobile_provider: MobileBankingProvider | null
  mobile_provider_label: string | null
  mobile_number: string | null
  note: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface CashPaymentPayload {
  date: string
  payee_type: PayeeType
  party_id: number | null
  payee_name: string | null
  payment_type: CashPaymentType
  loan_receipt_id: number | null
  expense_category: ExpenseCategory | null
  purpose: string | null
  bill_no: string | null
  amount: number
  payment_method: PaymentMethod
  bank_name: string | null
  bank_branch: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  mobile_provider: MobileBankingProvider | null
  mobile_number: string | null
  note: string | null
}

/** meta.totals of the payment list (same shape as the receipts). */
export type CashPaymentTotals = CashReceiptTotals

/* ---------- Cash transfers ---------- */

/** deposit: cash in hand → bank or wallet (cash in) · withdrawal: back into cash in hand (cash out). */
export type TransferDirection = 'deposit' | 'withdrawal'

/** Where the cash goes to or comes from: a bank, or a mobile banking wallet. */
export type TransferChannel = 'bank' | 'mobile_banking'

export interface CashTransfer extends ApprovalFields {
  id: number
  transfer_no: string
  date: string
  direction: TransferDirection
  direction_label: string
  channel: TransferChannel
  channel_label: string
  amount: number
  /** Bank transfers only. */
  bank_name: string | null
  bank_branch: string | null
  /** Mobile banking transfers only. */
  mobile_provider: MobileBankingProvider | null
  mobile_provider_label: string | null
  mobile_number: string | null
  /** Withdrawals only. */
  cheque_no: string | null
  /* Deposits only. */
  deposit_slip_no: string | null
  reference_name: string | null
  reference_mobile: string | null
  reference_nid_passport: string | null
  note: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface CashTransferPayload {
  date: string
  direction: TransferDirection
  channel: TransferChannel
  amount: number
  bank_name: string | null
  bank_branch: string | null
  mobile_provider: MobileBankingProvider | null
  mobile_number: string | null
  cheque_no: string | null
  deposit_slip_no: string | null
  reference_name: string | null
  reference_mobile: string | null
  reference_nid_passport: string | null
  note: string | null
}

export interface CashTransferTotals {
  count: number
  deposit: number
  withdrawal: number
}

/* ---------- Cash book ---------- */

export interface CashBookLine {
  date: string
  kind: 'receipt' | 'payment' | 'transfer'
  id: number
  reference: string
  particulars: string
  detail: string | null
  party_id: number | null
  in: number
  out: number
  balance: number
}

export interface CashBookDay {
  date: string
  opening: number
  lines: CashBookLine[]
  in: number
  out: number
  closing: number
}

export interface CashBook {
  from: string | null
  to: string | null
  opening_balance: number
  days: CashBookDay[]
  totals: { in: number; out: number }
  closing_balance: number
}

/**
 * The money summary: total received and paid so far, today's closing cash, bank and mobile
 * banking balances (approved entries only) and the cash opening balance. Seen by the accounts
 * head (Cash Management and dashboard) and admins (dashboard only); not by accounts users.
 */
export interface FinanceSummary {
  opening_balance: number
  opening_date: string | null
  today: string
  /** Today's opening cash: yesterday's closing cash on hand (worked out, never typed). */
  opening_today: number
  /** Approved receipts / payments up to today, any method (transfers not counted). */
  total_received: number
  total_paid: number
  cash_in_hand: number
  /** Bank receipts and deposits minus bank payments and withdrawals (starts at zero). */
  bank_balance: number
  /** Mobile banking receipts minus mobile banking payments (starts at zero). */
  mobile_banking_balance: number
}

/**
 * GET /accounts/cash-settings. Accounts users get the opening date and today only; the
 * accounts head also gets the money summary and the pending entries.
 */
export interface CashSettings extends Partial<FinanceSummary> {
  opening_date: string | null
  today: string
  /** Cash entries waiting for approval (not in cash in hand yet). */
  pending?: { count: number; in: number; out: number }
}

/* ---------- Owner loans ---------- */

/** An approved loan from an owner: open while something is still owed, then settled. */
export interface OwnerLoan {
  id: number
  receipt_no: string
  date: string
  owner: Pick<Party, 'id' | 'code' | 'name'>
  amount: number
  /** Approved repayments only. */
  repaid: number
  still_owed: number
  /** Repayments waiting for approval (not counting the payment being edited). */
  pending_repaid: number
  status: 'open' | 'settled'
  note: string | null
}

export interface OwnerCapital {
  id: number
  code: string
  name: string
  /** Capital paid in, less payments to the owner. */
  capital: number
  loan_owed: number
}

export interface OwnerLoanReport {
  summary: {
    total_capital: number
    loans_owed: number
    open_count: number
    settled_count: number
    owners: OwnerCapital[]
  }
  data: OwnerLoan[]
}
