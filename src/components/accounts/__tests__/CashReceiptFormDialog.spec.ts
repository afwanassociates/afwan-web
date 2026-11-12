import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CashReceiptFormDialog from '../CashReceiptFormDialog.vue'
import {
  createCashReceipt,
  fetchPartyPassports,
  fetchReceiptOptions,
  getOwnerLoans,
  searchParties,
  updateCashReceipt,
} from '@/api/accounts'
import { httpError } from '@/test/helpers'
import type {
  CashReceipt,
  OwnerLoan,
  Party,
  PartyPassport,
  PartyPassportGroups,
} from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  searchParties: vi.fn(),
  createCashReceipt: vi.fn(),
  updateCashReceipt: vi.fn(),
  fetchReceiptOptions: vi.fn(),
  getOwnerLoans: vi.fn(),
  fetchPartyPassports: vi.fn(),
}))

/** A 50,000 loan the company gave the owner: 30,000 settled by a bill, 5,000 waiting. */
const LOAN: OwnerLoan = {
  id: 21,
  payment_no: 'CP-2026-0021',
  date: '2026-10-05',
  owner: { id: 9, code: 'OW-001', name: 'Chairman', mobile: '01900000000', address: 'Gulshan' },
  payment_method: 'cash',
  payment_method_label: 'Cash in hand',
  amount: 50000,
  returned: 0,
  billed: 30000,
  outstanding: 20000,
  pending_returned: 0,
  pending_billed: 5000,
  status: 'open',
  note: null,
  returns: [],
  bills: [],
}

function party(overrides: Partial<Party> = {}): Party {
  return {
    id: 7,
    code: 'PT-0007',
    type: 'client',
    type_label: 'Party / Client',
    kind: 'agency',
    kind_label: 'Agency',
    rl_number: null,
    name: 'Karim Traders',
    agency_owner_name: null,
    designation: null,
    designation_label: null,
    mobile: '01711000000',
    address: 'Mirpur, Dhaka',
    nid_passport: 'N1',
    tin_bin: null,
    notes: null,
    opening_balance: 0,
    opening_balance_type: 'receivable',
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const OWNER = party({
  id: 9,
  code: 'OW-001',
  type: 'owner',
  name: 'Chairman',
  mobile: '01900000000',
})

function receipt(overrides: Partial<CashReceipt> = {}): CashReceipt {
  const p = party()
  return {
    id: 3,
    receipt_no: 'CR-2026-0003',
    date: '2026-10-05',
    party: {
      id: p.id,
      code: p.code,
      type: p.type,
      name: p.name,
      mobile: p.mobile,
      address: p.address,
    },
    receipt_type: 'cash',
    receipt_type_label: 'Cash',
    business_type: 'recruitment',
    business_type_label: 'Recruitment',
    country: { code: 'MY', name: 'Malaysia' },
    amount: 2500,
    payment_method: 'bank',
    payment_method_label: 'Bank',
    status: 'pending',
    status_label: 'Pending approval',
    approved_at: null,
    returned_at: null,
    return_reason: null,
    can: { update: true, delete: true, approve: false, send_back: false },
    bank_name: 'Sonali Bank',
    bank_branch: 'Motijheel',
    bank_account_name: 'Afwan Associates',
    bank_account_number: '0123456789',
    mobile_provider: null,
    mobile_provider_label: null,
    mobile_number: null,
    note: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

let wrapper: VueWrapper

async function mountDialog(
  props: { receipt?: CashReceipt | null; presetParty?: Party | null; presetLoanId?: number } = {},
) {
  wrapper = mount(CashReceiptFormDialog, {
    props: { open: false, receipt: null, ...props },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
}

async function choosePayer(name: string) {
  const input = wrapper.find('input[role="combobox"]')
  await input.trigger('focus')
  await flushPromises()
  const option = wrapper.findAll('[role="option"]').find((o) => o.text().includes(name))
  await option!.trigger('mousedown')
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(searchParties).mockImplementation(async (type) =>
    type === 'owner' ? [OWNER] : [party()],
  )
  vi.mocked(fetchReceiptOptions).mockResolvedValue({
    business_types: [],
    default_business_type: 'recruitment',
    countries: [
      { code: 'MY', name: 'Malaysia', is_pinned: true },
      { code: 'SA', name: 'Saudi Arabia', is_pinned: false },
    ],
    default_country: { code: 'MY', name: 'Malaysia' },
  })
  vi.mocked(createCashReceipt).mockResolvedValue(receipt())
  vi.mocked(updateCashReceipt).mockResolvedValue(receipt())
  vi.mocked(fetchPartyPassports).mockResolvedValue({
    data: [],
    meta: { counts: { total: 0, paid: 0, pending: 0, part_paid: 0, unpaid: 0 } },
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('CashReceiptFormDialog', () => {
  it('fills the payer details from the chosen party and saves a cash receipt', async () => {
    await mountDialog()

    await choosePayer('Karim Traders')
    const payer = wrapper.find('[data-payer]').text()
    expect(payer).toContain('PT-0007')
    expect(payer).toContain('01711000000')
    expect(payer).toContain('Mirpur, Dhaka')
    expect(wrapper.find('[data-effect]').text()).toMatch(/payment against what the party owes/)

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('2,500')
    await wrapper.find('[data-field="note"] input').setValue('  first  instalment ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        party_type: 'client',
        party_id: 7,
        receipt_type: 'cash',
        business_type: 'recruitment',
        country_code: 'MY',
        amount: 2500,
        payment_method: 'cash',
        bank_name: null,
        bank_branch: null,
        bank_account_name: null,
        bank_account_number: null,
        mobile_provider: null,
        mobile_number: null,
        note: 'first instalment',
      }),
    )
    expect(wrapper.emitted('saved')?.[0]).toEqual([receipt(), true])
    expect(wrapper.emitted('update:open')?.slice(-1)[0]).toEqual([false])
  })

  it('switches to owners and records their money as capital by bank', async () => {
    await mountDialog()

    await wrapper.find('[data-party-type="owner"]').trigger('click')
    await choosePayer('Chairman')

    expect(searchParties).toHaveBeenLastCalledWith('owner', '')
    // An owner's money is capital unless it returns a loan.
    expect(wrapper.find('input[value="cash"]').element).toHaveProperty('checked', true)
    expect(wrapper.find('[data-effect]').text()).toMatch(/capital/)

    await wrapper.find('[data-method="bank"]').trigger('click')
    await wrapper.find('[data-field="bank_name"] input').setValue('DBBL')
    await wrapper.find('[data-field="bank_branch"] input').setValue('Uttara')
    await wrapper.find('[data-field="bank_account_name"] input').setValue('  Afwan  Associates ')
    await wrapper.find('[data-field="bank_account_number"] input').setValue('0123 4567 89')
    await wrapper.find('[data-field="amount"] input').setValue('100')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        party_type: 'owner',
        party_id: 9,
        receipt_type: 'cash',
        business_type: null,
        country_code: null,
        bank_name: 'DBBL',
        bank_branch: 'Uttara',
        bank_account_name: 'Afwan Associates',
        bank_account_number: '0123456789',
      }),
    )
  })
  it('starts a party receipt at recruitment for the default country; land, solar and railway are inactive', async () => {
    await mountDialog()

    expect(wrapper.find('[data-business="recruitment"]').attributes('aria-pressed')).toBe('true')
    const country = wrapper.find('[data-field="country_code"] select')
    expect((country.element as HTMLSelectElement).value).toBe('MY')
    await country.setValue('SA')

    await choosePayer('Karim Traders')
    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('100')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ business_type: 'recruitment', country_code: 'SA' }),
    )

    // A new receipt cannot pick an inactive business.
    await mountDialog()
    for (const type of ['land', 'solar', 'railway']) {
      const button = wrapper.get(`[data-business="${type}"]`)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
    }
    await wrapper.get('[data-business="solar"]').trigger('click')
    expect(wrapper.get('[data-business="recruitment"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-field="country_code"]').exists()).toBe(true)
  })

  it('keeps the inactive business of a receipt saved with it, without a country', async () => {
    await mountDialog({ receipt: receipt({ business_type: 'land', country: null }) })

    const land = wrapper.get('[data-business="land"]')
    expect((land.element as HTMLButtonElement).disabled).toBe(false)
    expect(land.attributes('aria-pressed')).toBe('true')
    expect((wrapper.get('[data-business="solar"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(wrapper.find('[data-field="country_code"]').exists()).toBe(false)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updateCashReceipt).toHaveBeenLastCalledWith(
      3,
      expect.objectContaining({ business_type: 'land', country_code: null }),
    )
  })

  it('hides business and country for an owner', async () => {
    await mountDialog()
    await wrapper.find('[data-party-type="owner"]').trigger('click')
    expect(wrapper.find('[data-field="business_type"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="country_code"]').exists()).toBe(false)
  })

  it('offers an owner Capital or Loan return; a party has no choice', async () => {
    await mountDialog()

    expect(wrapper.find('[data-field="receipt_type"]').exists()).toBe(false)
    expect(wrapper.find('[data-effect]').text()).toMatch(/payment against what the party owes/)

    await wrapper.find('[data-party-type="owner"]').trigger('click')
    expect(wrapper.find('[data-field="receipt_type"]').text()).toContain('Capital')
    expect(wrapper.find('[data-field="receipt_type"]').text()).toContain('Loan return')
    expect(wrapper.find('[data-effect]').text()).toMatch(/owner puts into the company/)
  })

  it('takes a loan return of an open loan, up to what is outstanding', async () => {
    vi.mocked(getOwnerLoans).mockResolvedValue({
      summary: {
        total_capital: 0,
        loans_outstanding: 20000,
        open_count: 1,
        settled_count: 0,
        owners: [],
      },
      data: [LOAN],
    })
    await mountDialog()

    await wrapper.find('[data-party-type="owner"]').trigger('click')
    await choosePayer('Chairman')
    await wrapper.find('input[value="loan_return"]').setValue(true)
    await flushPromises()

    expect(getOwnerLoans).toHaveBeenLastCalledWith({ party_id: 9, for_receipt: undefined })
    // The only open loan is chosen; 5,000 waits for approval, so 15,000 can come back.
    expect(wrapper.find('[data-field="owner_loan_id"] select').element).toHaveProperty(
      'value',
      '21',
    )
    expect(wrapper.find('[data-loan-hint]').text()).toContain('Up to ৳ 15,000.00')

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('15001')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="amount"]').text()).toContain(
      'Only ৳ 15,000.00 is outstanding on loan CP-2026-0021.',
    )

    await wrapper.find('[data-field="amount"] input').setValue('15000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        party_type: 'owner',
        receipt_type: 'loan_return',
        owner_loan_id: 21,
        amount: 15000,
      }),
    )
  })

  it('says so when the owner has no open loans to return', async () => {
    vi.mocked(getOwnerLoans).mockResolvedValue({
      summary: {
        total_capital: 0,
        loans_outstanding: 0,
        open_count: 0,
        settled_count: 0,
        owners: [],
      },
      data: [],
    })
    await mountDialog({ presetParty: OWNER, presetLoanId: 21 })
    await flushPromises()

    expect(wrapper.find('input[value="loan_return"]').element).toHaveProperty('checked', true)
    expect(wrapper.find('[data-no-loans]').text()).toContain('Chairman has no open loans')
  })
  it('requires Received via, and shows Amount below it once a method is chosen', async () => {
    await mountDialog({ presetParty: party() })

    expect(wrapper.find('[data-field="payment_method"] legend').text()).toContain('*')
    expect(wrapper.find('[aria-pressed="true"][data-method]').exists()).toBe(false)
    expect(wrapper.find('[data-field="amount"]').exists()).toBe(false)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="payment_method"]').text()).toContain(
      'Choose how the money was received.',
    )

    for (const method of ['cash', 'bank', 'mobile_banking']) {
      await wrapper.find(`[data-method="${method}"]`).trigger('click')
      const fields = wrapper.findAll('[data-field]').map((f) => f.attributes('data-field'))
      expect(fields.indexOf('amount')).toBeGreaterThan(fields.indexOf('payment_method'))
    }
  })

  it('takes a mobile banking receipt with the service and wallet number', async () => {
    await mountDialog({ presetParty: OWNER })

    await wrapper.find('[data-method="mobile_banking"]').trigger('click')
    expect(wrapper.find('[data-field="bank_name"]').exists()).toBe(false)
    await wrapper.find('[data-field="amount"] input').setValue('500')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="mobile_provider"]').text()).toContain(
      'Choose the mobile banking service.',
    )
    expect(wrapper.find('[data-field="mobile_number"]').text()).toContain(
      'Enter the Mobile banking number.',
    )

    await wrapper.find('[data-field="mobile_provider"] select').setValue('bkash')
    expect(wrapper.find('[data-field="mobile_number"] label').text()).toContain('bKash number')
    const providers = wrapper.findAll('[data-field="mobile_provider"] option').map((o) => o.text())
    expect(providers).toEqual(expect.arrayContaining(['bKash', 'Nagad', 'Rocket', 'mCash', 'Upay']))

    await wrapper.find('[data-field="mobile_number"] input').setValue('0171234')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-field="mobile_number"]').text()).toContain('11-digit')

    await wrapper.find('[data-field="mobile_number"] input').setValue('+880 1712-345678')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        party_type: 'owner',
        payment_method: 'mobile_banking',
        mobile_provider: 'bkash',
        mobile_number: '01712345678',
        bank_name: null,
        bank_branch: null,
      }),
    )
  })

  it('requires a payer and an amount, and the bank, branch and account for a bank deposit', async () => {
    await mountDialog()

    await wrapper.find('[data-method="bank"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.find('[data-field="party_id"]').text()).toContain('Choose the party.')
    expect(wrapper.find('[data-field="amount"]').text()).toContain('Enter the amount.')
    expect(wrapper.find('[data-field="bank_name"]').text()).toContain('Enter the bank name.')
    expect(wrapper.find('[data-field="bank_branch"]').text()).toContain('Enter the branch name.')
    expect(wrapper.find('[data-field="bank_account_name"]').text()).toContain(
      'Enter the bank account name.',
    )
    expect(wrapper.find('[data-field="bank_account_number"]').text()).toContain(
      'Enter the bank account number.',
    )

    await wrapper.find('[data-field="bank_account_number"] input').setValue('12/34')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-field="bank_account_number"]').text()).toContain(
      'Use only digits, letters and dashes.',
    )
  })

  it('shows the API validation errors', async () => {
    vi.mocked(createCashReceipt).mockRejectedValue(
      httpError(422, { message: 'x', errors: { party_id: ['Choose an active party.'] } }),
    )
    await mountDialog({ presetParty: party() })

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('[data-field="amount"] input').setValue('10')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-field="party_id"]').text()).toContain('Choose an active party.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('edits a receipt with its saved values', async () => {
    await mountDialog({ receipt: receipt() })

    expect(wrapper.find('[data-payer]').text()).toContain('Karim Traders')
    expect((wrapper.find('[data-field="amount"] input').element as HTMLInputElement).value).toBe(
      '2500.00',
    )
    expect((wrapper.find('[data-field="bank_name"] input').element as HTMLInputElement).value).toBe(
      'Sonali Bank',
    )

    await wrapper.find('[data-method="cash"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateCashReceipt).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ payment_method: 'cash', bank_name: null, date: '2026-10-05' }),
    )
  })
})

function passport(id: number, overrides: Partial<PartyPassport> = {}): PartyPassport {
  return {
    id,
    entry_no: id,
    passport_name: `Worker ${id}`,
    passport_number: `A${id}`,
    country_code: 'MY',
    stage: 'Visa',
    is_deleted: false,
    status: 'unpaid',
    receipts: [],
    on_this_receipt: false,
    can_tick: true,
    ...overrides,
  }
}

/** Al Noor: 1 paid, 2 unpaid · Gulf Star: 1 unpaid. */
function passportGroups(onThisReceipt: number[] = []): PartyPassportGroups {
  const mark = (p: PartyPassport) =>
    onThisReceipt.includes(p.id)
      ? {
          ...p,
          status: 'pending' as const,
          receipts: [
            { id: 3, receipt_no: 'CR-2026-0003', is_full_payment: true, is_approved: false },
          ],
          on_this_receipt: true,
        }
      : p
  return {
    data: [
      {
        company: { id: 1, name: 'Al Noor', country_code: 'MY' },
        counts: { total: 3, paid: 1, pending: 0, part_paid: 0, unpaid: 2 },
        passports: [
          passport(11, {
            status: 'paid',
            receipts: [
              { id: 2, receipt_no: 'CR-2026-0002', is_full_payment: true, is_approved: true },
            ],
            can_tick: false,
          }),
          mark(passport(12)),
          mark(passport(13)),
        ],
      },
      {
        company: { id: 2, name: 'Gulf Star', country_code: 'MY' },
        counts: { total: 1, paid: 0, pending: 0, part_paid: 0, unpaid: 1 },
        passports: [mark(passport(21))],
      },
    ],
    meta: { counts: { total: 4, paid: 1, pending: 0, part_paid: 0, unpaid: 3 } },
  }
}

const tick = (id: number) =>
  wrapper.get(`[data-passport="${id}"] input[type="checkbox"]`).setValue(true)

describe('CashReceiptFormDialog: passports the money pays for', () => {
  beforeEach(() => {
    vi.mocked(fetchPartyPassports).mockResolvedValue(passportGroups())
  })

  it("lists the party's passports of the country by company, paid ones not tickable", async () => {
    await mountDialog()
    expect(wrapper.find('[data-passport-picker]').exists()).toBe(false)

    await choosePayer('Karim Traders')
    expect(fetchPartyPassports).toHaveBeenLastCalledWith(7, { country_code: 'MY' })
    const picker = wrapper.get('[data-passport-picker]')
    expect(picker.get('[data-company="1"] [data-counts]').text()).toContain('2 unpaid')
    expect(picker.get('[data-passport="11"] [data-status]').text()).toBe('Paid · CR-2026-0002')
    expect((picker.get('[data-passport="11"] input').element as HTMLInputElement).disabled).toBe(
      true,
    )
    expect(picker.get('[data-passport="12"] [data-status]').text()).toBe('Unpaid')

    // Another country: that country's passports.
    await wrapper.get('[data-field="country_code"] select').setValue('SA')
    await flushPromises()
    expect(fetchPartyPassports).toHaveBeenLastCalledWith(7, { country_code: 'SA' })

    // Other businesses are inactive: the picker stays.
    await wrapper.get('[data-business="land"]').trigger('click')
    expect(wrapper.find('[data-passport-picker]').exists()).toBe(true)
  })

  it('asks the amount per company and saves the total with the ticked passports', async () => {
    await mountDialog()
    await choosePayer('Karim Traders')
    await wrapper.get('[data-method="cash"]').trigger('click')

    await tick(12)
    await tick(13)
    await tick(21)
    expect(wrapper.get('[data-company="1"] [data-company-amount]').text()).toContain(
      'Amount for 2 passports',
    )
    // The receipt amount is the total of the companies (read only).
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).not.toHaveBeenCalled()
    expect(wrapper.get('[data-company="1"] [data-company-error]').text()).toBe('Enter the amount.')

    await wrapper.get('[data-company="1"] [data-company-amount] input').setValue('40,000')
    await wrapper.get('[data-company="2"] [data-company-amount] input').setValue('20000')
    // Part payment unless changed: Al Noor is paid off, Gulf Star is half now, half later.
    expect(
      (wrapper.get('[data-company="2"] [data-part]').element as HTMLInputElement).checked,
    ).toBe(true)
    await wrapper.get('[data-company="1"] [data-full]').setValue(true)
    expect(
      (wrapper.get('[data-field="amount"] input[data-lines-total]').element as HTMLInputElement)
        .value,
    ).toBe('60,000.00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 60000,
        companies: [
          { company_id: 1, amount: 40000, is_full_payment: true, passport_ids: [12, 13] },
          { company_id: 2, amount: 20000, is_full_payment: false, passport_ids: [21] },
        ],
      }),
    )
  })

  it('lets a part-paid passport be ticked again and shows its earlier receipts', async () => {
    vi.mocked(fetchPartyPassports).mockResolvedValue({
      data: [
        {
          company: { id: 1, name: 'Al Noor', country_code: 'MY' },
          counts: { total: 1, paid: 0, pending: 0, part_paid: 1, unpaid: 0 },
          passports: [
            passport(12, {
              status: 'part_paid',
              receipts: [
                { id: 5, receipt_no: 'CR-2026-0005', is_full_payment: false, is_approved: true },
              ],
            }),
          ],
        },
      ],
      meta: { counts: { total: 1, paid: 0, pending: 0, part_paid: 1, unpaid: 0 } },
    })
    await mountDialog()
    await choosePayer('Karim Traders')

    expect(wrapper.get('[data-company="1"] [data-counts]').text()).toContain('1 part paid')
    expect(wrapper.get('[data-passport="12"] [data-status]').text()).toBe(
      'Part paid · CR-2026-0005',
    )
    await tick(12)
    expect(wrapper.find('[data-company="1"] [data-company-amount]').exists()).toBe(true)
  })

  it('ticks every passport not paid off of a company at once', async () => {
    await mountDialog()
    await choosePayer('Karim Traders')

    await wrapper.get('[data-company="1"] [data-tick-all]').setValue(true)
    expect(wrapper.get('[data-company="1"] [data-company-amount]').text()).toContain(
      'Amount for 2 passports',
    )
    await wrapper.get('[data-company="1"] [data-tick-all]').setValue(false)
    expect(wrapper.find('[data-company="1"] [data-company-amount]').exists()).toBe(false)
  })

  it('sends no passports without ticks, and shows API errors under the company', async () => {
    await mountDialog()
    await choosePayer('Karim Traders')
    await wrapper.get('[data-method="cash"]').trigger('click')
    await wrapper.get('[data-field="amount"] input').setValue('500')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(createCashReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 500, companies: [] }),
    )

    vi.mocked(createCashReceipt).mockRejectedValueOnce(
      httpError(422, {
        message: 'x',
        errors: { 'companies.0.passport_ids': ['Passport #21 is already paid on CR-2026-0009.'] },
      }),
    )
    await tick(21)
    await wrapper.get('[data-company="2"] [data-company-amount] input').setValue('100')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-company="2"] [data-company-error]').text()).toBe(
      'Passport #21 is already paid on CR-2026-0009.',
    )
  })

  it("starts an edited receipt with its own passports ticked and asks for them as that receipt's", async () => {
    vi.mocked(fetchPartyPassports).mockResolvedValue(passportGroups([12, 21]))
    await mountDialog({
      receipt: receipt({
        amount: 3000,
        companies: [
          {
            company_id: 1,
            company_name: 'Al Noor',
            amount: 1000,
            is_full_payment: true,
            passports: [
              { id: 12, entry_no: 12, passport_name: 'Worker 12', passport_number: 'A12' },
            ],
          },
          {
            company_id: 2,
            company_name: 'Gulf Star',
            amount: 2000,
            is_full_payment: false,
            passports: [
              { id: 21, entry_no: 21, passport_name: 'Worker 21', passport_number: 'A21' },
            ],
          },
        ],
      }),
    })

    expect(fetchPartyPassports).toHaveBeenLastCalledWith(7, { country_code: 'MY', receipt_id: 3 })
    const box = wrapper.get('[data-passport="12"] input').element as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(false)
    expect(wrapper.get('[data-passport="12"] [data-status]').text()).toBe('On this receipt')

    await wrapper.get('[data-passport="21"] input').setValue(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(updateCashReceipt).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        amount: 1000,
        companies: [{ company_id: 1, amount: 1000, is_full_payment: true, passport_ids: [12] }],
      }),
    )
  })
})
