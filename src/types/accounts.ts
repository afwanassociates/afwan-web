import type { ReferenceSummary } from '@/types/passport'
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
  'cash-receipts' | 'cash-payments' | 'cash-transfers' | 'party-transactions' | 'owner-loan-bills'

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
  /** An owner loan bill (fixed on the Owner loans page). */
  owner_loan?: boolean
  /** An owner loan bill with a copy of the bill to look at. */
  has_copy?: boolean
}

/** Entries waiting in a list: how many and their amount (not in the totals). */
export interface PendingTotals {
  count: number
  amount: number
}

/** A party is a client, or an owner of the company (own ID series: PT-0001, OW-001). */
export type PartyType = 'client' | 'owner'

/** An owner's position in the company; clients have none. */
export type OwnerDesignation = 'chairman' | 'managing_director' | 'director'

/** Side of the opening balance: receivable (they owe us, Dr) or payable (we owe them, Cr). */
export type BalanceType = 'receivable' | 'payable'

/**
 * Ledger line types. Receivable, refund and owner_loan are debits; the others credits. An
 * owner loan is money the company lent an owner; loan_return and loan_bill settle it.
 */
export type PartyTransactionType =
  'receivable' | 'payment' | 'refund' | 'capital' | 'owner_loan' | 'loan_return' | 'loan_bill'

/** The line types entered by hand on the ledger (payments come from cash receipts). */
/** Only a receivable is entered by hand; refunds are cash payments. */
export type ManualTransactionType = 'receivable'

/** Cash (a party's payment, an owner's capital) or an owner returning a company loan. */
export type CashReceiptType = 'cash' | 'loan_return'

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
  capital: number
  owner_loan: number
  loan_return: number
  loan_bill: number
  closing_balance: number
}

/** What kind of client a party is (also a passport's reference type). */
export type PartyKind = 'agency' | 'person'

/**
 * A client is also the reference of the passports it gives; data entry quick-adds clients
 * with only a name and phone (plus the RL number for an agency), so a client's mobile,
 * address and NID / passport may be empty until the accounts team fills them in.
 */
export interface Party {
  id: number
  code: string
  type: PartyType
  type_label: string
  /** Clients only: agency or person. */
  kind: PartyKind | null
  kind_label: string | null
  /** Agencies only. */
  rl_number: string | null
  name: string
  /** Agencies only: the agency's owner, whose NID / passport is nid_passport. */
  agency_owner_name: string | null
  /** Owners only; null for clients and for owners added before it was asked. */
  designation: OwnerDesignation | null
  designation_label: string | null
  mobile: string | null
  address: string | null
  nid_passport: string | null
  tin_bin: string | null
  notes: string | null
  opening_balance: number
  opening_balance_type: BalanceType
  is_active: boolean
  totals?: PartyTotals
  /** In the list and responses: no passports and nothing in accounts (only these may be deleted). */
  can_delete?: boolean
  created_at: string
  updated_at: string
}

/** Body of POST /parties (type only on create) and PATCH /parties/{id}. */
export interface PartyPayload {
  type?: PartyType
  /** Clients only (required); left out for owners. */
  kind?: PartyKind
  /** Agencies only (required); null for persons and owners. */
  rl_number: string | null
  name: string
  /** Agencies only (optional); null for persons and owners. */
  agency_owner_name: string | null
  /** Owners only (required on create); left out for clients. */
  designation?: OwnerDesignation
  mobile: string
  /** Required for owners, optional for clients. */
  address: string | null
  nid_passport: string | null
  tin_bin: string | null
  notes?: string | null
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
  /** A passport's price line (kept by the passport's price; not edited by hand). */
  passport_entry_id?: number | null
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
  /** A loan return: the owner loan (a cash payment) it settles. */
  owner_loan?: { id: number; payment_no: string } | null
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
  /** A party's recruitment cash: what it pays for, per company. */
  companies?: CashReceiptCompany[]
  /** How many passports it pays for. */
  passport_count?: number
  created_by?: string | null
  created_at: string
  updated_at: string
}

/** One company on a receipt: the typed amount and the passports it pays. */
export interface CashReceiptCompany {
  company_id: number
  company_name: string | null
  amount: number
  /** Full payment: its passports are paid off. Part payment: more receipts may follow. */
  is_full_payment: boolean
  passports: { id: number; entry_no: number; passport_name: string; passport_number: string }[]
}

/**
 * paid: an approved receipt paid it off · pending: the receipt paying it off waits for approval
 * (or was returned) · part_paid: only part payments so far · unpaid: no receipt yet.
 */
export type PassportPaymentStatus = 'paid' | 'pending' | 'part_paid' | 'unpaid'

export interface PassportPaymentCounts {
  total: number
  paid: number
  pending: number
  part_paid: number
  unpaid: number
}

/** A party's passport as the cash receive form and the ledger see it. */
export interface PartyPassport {
  id: number
  entry_no: number
  passport_name: string
  passport_number: string
  /** The holder's nationality (the destination is the company's country). */
  country_code: string
  /** The current step's label, or "Returned". */
  stage: string | null
  is_deleted: boolean
  status: PassportPaymentStatus
  /** Every receipt that paid toward it, oldest first. */
  receipts: { id: number; receipt_no: string; is_full_payment: boolean; is_approved: boolean }[]
  /** Paid by the receipt being edited (may be unticked). */
  on_this_receipt: boolean
  /** Not paid off by another receipt, and priced: may be ticked. */
  can_tick: boolean
  /** The locked price (null: no standard or party rate yet; cannot be ticked). */
  price?: number | null
  price_source?: PriceSource | null
  /** Paid toward it on other receipts (approved or waiting). */
  paid?: number
  /** price - paid (null without a price). */
  due?: number | null
}

/** GET /parties/{id}/passports: the party's passports by company. */
export interface PartyPassportGroups {
  data: {
    /** country_code: the destination (the company's country). */
    company: { id: number; name: string | null; country_code: string | null }
    counts: PassportPaymentCounts
    passports: PartyPassport[]
  }[]
  meta: { counts: PassportPaymentCounts }
}

export interface CashReceiptPayload {
  date: string
  party_type: PartyType
  party_id: number
  receipt_type: CashReceiptType
  /** The owner loan a loan return settles. */
  owner_loan_id?: number | null
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
  /** A party's recruitment cash only: per company the amount and the ticked passports. */
  companies?: {
    company_id: number
    amount: number
    is_full_payment: boolean
    passport_ids: number[]
  }[]
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

/** Party: refund · owner: owner_loan (the company lends the owner money) · other: expense. */
export type CashPaymentType = 'refund' | 'owner_loan' | 'expense'

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
  /** All cash book only: the money it went through (e.g. "Bank", "Cash in hand → Bank"). */
  via?: string
  /** All cash book only: a deposit or withdrawal's amount (moved, not in or out). */
  contra?: number
}

export interface CashBookDay {
  date: string
  opening: number
  lines: CashBookLine[]
  in: number
  out: number
  closing: number
}

/** Which book: cash in hand (the hand cash book), the bank, mobile banking, or all three. */
export type CashBookKind = 'cash' | 'bank' | 'mobile_banking' | 'all'

export interface CashBook {
  book: CashBookKind
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
  /** Today's opening cash: yesterday's closing cash on hand + bank + mobile banking (worked out). */
  opening_today: number
  /** Approved receipts / payments up to today, any method (transfers not counted). */
  total_received: number
  total_paid: number
  /** What total_paid was for (they add up to it): a loan to an owner is not spending. */
  paid_breakdown: { expenses: number; refunds: number; owner_loans: number }
  /** What the company spent: expense payments plus approved owner loan bills. */
  total_expenses: number
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

/** A company bill an owner paid with a loan, with a copy of the bill; settles that much. */
export interface OwnerLoanBill {
  id: number
  owner_loan_id: number
  date: string
  expense_category: ExpenseCategory
  expense_category_label: string
  purpose: string
  bill_no: string | null
  amount: number
  note: string | null
  has_copy: boolean
  copy_name: string | null
  status: ApprovalStatus
  status_label: string
  returned_by: string | null
  return_reason: string | null
  can: { update: boolean; delete: boolean }
}

/** Money the owner gave back on a loan (a loan return cash receipt). */
export interface OwnerLoanReturn {
  id: number
  receipt_no: string
  date: string
  amount: number
  payment_method_label: string
  status: Exclude<ApprovalStatus, 'rejected'>
  status_label: string
}

/**
 * An approved loan the company gave an owner (a cash payment): open until the approved returns
 * and bills cover it, then settled.
 */
export interface OwnerLoan {
  id: number
  payment_no: string
  date: string
  owner: Pick<Party, 'id' | 'code' | 'name' | 'mobile' | 'address'>
  payment_method: PaymentMethod
  payment_method_label: string
  amount: number
  /** Approved returns and bills only. */
  returned: number
  billed: number
  outstanding: number
  /** Waiting for approval (not counting the receipt being edited). */
  pending_returned: number
  pending_billed: number
  status: 'open' | 'settled'
  note: string | null
  returns: OwnerLoanReturn[]
  bills: OwnerLoanBill[]
}

export interface OwnerCapital {
  id: number
  code: string
  name: string
  /** Capital the owner paid in. */
  capital: number
  /** What the owner still owes on loans. */
  loan_outstanding: number
}

export interface OwnerLoanReport {
  summary: {
    total_capital: number
    loans_outstanding: number
    open_count: number
    settled_count: number
    owners: OwnerCapital[]
  }
  data: OwnerLoan[]
}

/** Fields of the owner loan bill form (sent as multipart, with the copy as "bill_copy"). */
export interface OwnerLoanBillPayload {
  date: string
  expense_category: ExpenseCategory
  purpose: string
  bill_no: string | null
  amount: number
  note: string | null
}

/* ---------- Expenses ---------- */

/** Paid directly (an expense payment) or a company bill an owner paid with a loan. */
export type ExpenseSource = 'direct' | 'owner_loan'

/** One row of GET /accounts/expenses. */
export interface Expense {
  key: string
  id: number
  source: ExpenseSource
  /** "Paid directly" or "Owner loan CP-2026-0005". */
  source_label: string
  date: string
  expense_category: ExpenseCategory
  expense_category_label: string
  purpose: string | null
  bill_no: string | null
  paid_to: string | null
  /** The payment number, or the loan an owner bill settles. */
  reference: string
  payment_method_label: string
  /** An owner loan bill with a copy of the bill. */
  has_copy: boolean
  amount: number
}

/** meta.totals of the expense list: every matching expense, all pages. */
export interface ExpenseTotals {
  count: number
  amount: number
  direct: number
  owner_loan: number
  by_category: { category: ExpenseCategory; label: string; count: number; amount: number }[]
}

export interface ExpenseFilters {
  q?: string
  from?: string
  to?: string
  category?: ExpenseCategory
  source?: ExpenseSource
  page?: number
  per_page?: number
}

/* ---------- Payment report (accounts head and super admin) ---------- */

/** One receipt behind a passport: its company line's amount split over the line's passports. */
export interface PaymentReportReceipt {
  id: number
  receipt_no: string
  date: string
  status: ApprovalStatus
  is_full_payment: boolean
  line_amount: number
  line_passports: number
  /** Split by the line's passport prices (else evenly). */
  split_by_price: boolean
  /** This passport's share of line_amount. */
  share: number
}

/** company: the company's standard rate · reference: the reference's rate · special: this passport only. */
export type PriceSource = 'company' | 'reference' | 'special'

/** A passport on the payment report, under its reference and company. */
export interface PaymentReportPassport {
  id: number
  entry_no: number
  passport_name: string
  passport_number: string
  stage: string | null
  status: PassportPaymentStatus
  /** Returned to its owner: costs nothing. */
  is_returned: boolean
  /** Locked price (null: no rate when entered). */
  price: number | null
  price_source: PriceSource | null
  /** Shares on approved receipts. */
  paid_amount: number
  /** Shares on receipts waiting for approval or returned. */
  pending_amount: number
  /** price - paid - pending (negative: credit); null without a price. */
  due: number | null
  /** Marked fully paid for less than its price. */
  short: boolean
  receipts: PaymentReportReceipt[]
}

/** What a reference paid for one company: its receipts' lines for that company. */
export interface PaymentReportCompany {
  company: { id: number; name: string | null; country_code: string | null }
  /** Every passport of the reference for this company (any status). */
  counts: PassportPaymentCounts
  /** Approved receipt lines. */
  paid_amount: number
  /** Lines waiting for approval or returned. */
  pending_amount: number
  receipt_count: number
  /** The rates now (passports keep the price they were given). */
  company_rate: number | null
  reference_rate: number | null
  price_total: number
  /** Passports without a price (not counted in price_total). */
  no_price: number
  /** The passports' dues added up (null when none has a price). */
  due: number | null
  /** The passports listed (the status filter applies). */
  passports: PaymentReportPassport[]
}

export interface PaymentReportReference {
  reference: {
    id: number
    code: string | null
    name: string
    type_label: string | null
    mobile: string | null
  }
  counts: PassportPaymentCounts
  paid_amount: number
  pending_amount: number
  price_total: number
  due: number | null
  no_price: number
  companies: PaymentReportCompany[]
}

export interface PaymentReportParams {
  q?: string
  reference_id?: number
  company_id?: number
  status?: PassportPaymentStatus
  page?: number
}

/** GET /api/payment-report, by reference. `summary` covers every filter except status. */
export interface PaymentReport {
  data: PaymentReportReference[]
  summary: PassportPaymentCounts & {
    paid_amount: number
    pending_amount: number
    receipt_count: number
    price_total: number
    no_price: number
    due: number | null
  }
  filters: {
    reference: ReferenceSummary | null
    company: { id: number; name: string; country_code: string | null } | null
  }
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/** GET /api/payment-report/rates. */
export interface PassportRates {
  companies: {
    id: number
    name: string
    country_code: string | null
    is_active: boolean
    rate: number | null
    /** Passports with a reference (not deleted), and how many have no price. */
    passports: number
    no_price: number
  }[]
  references: {
    reference: { id: number; code: string | null; name: string }
    company: { id: number; name: string; country_code: string | null }
    rate: number
    company_rate: number | null
  }[]
}

/** What saving a rate did: priced passports that had none, changed ones, ones that kept theirs. */
export interface RateSaveResult {
  filled: number
  updated: number
  kept: number
}
