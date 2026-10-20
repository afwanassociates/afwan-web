import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PartyLedgerView from '../PartyLedgerView.vue'
import {
  approveEntry,
  createPartyTransaction,
  fetchPartyLedger,
  updatePartyTransaction,
} from '@/api/accounts'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { PartyLedger } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  fetchPartyLedger: vi.fn(),
  approveEntry: vi.fn(),
  returnEntry: vi.fn(),
  fetchApprovalSummary: vi.fn(async () => ({ pending: 0, returned_mine: 1, is_approver: true })),
  createPartyTransaction: vi.fn(),
  updatePartyTransaction: vi.fn(),
  deletePartyTransaction: vi.fn(),
}))

function ledger(overrides: Partial<PartyLedger> = {}): PartyLedger {
  return {
    party: {
      id: 5,
      code: 'PT-0005',
      type: 'client',
      type_label: 'Party / Client',
      name: 'Karim Traders',
      mobile: '01711000000',
      address: 'Dhaka',
      nid_passport: 'N1',
      tin_bin: null,
      opening_balance: 1000,
      opening_balance_type: 'receivable',
      is_active: true,
      totals: {
        receivable: 5000,
        payment: 3000,
        refund: 0,
        loan: 0,
        capital: 0,
        loan_repayment: 0,
        drawing: 0,
        closing_balance: 3000,
      },
      created_at: '',
      updated_at: '',
    },
    from: null,
    to: null,
    opening_balance: 1000,
    lines: [
      {
        id: 11,
        date: '2026-10-02',
        type: 'receivable',
        type_label: 'Receivable',
        note: 'Visa processing',
        reference: null,
        cash_receipt_id: null,
        cash_payment_id: null,
        is_manual: true,
        debit: 5000,
        credit: 0,
        balance: 6000,
        can: { update: false, delete: false, approve: false, send_back: false },
      },
      {
        id: 12,
        date: '2026-10-05',
        type: 'payment',
        type_label: 'Payment received',
        note: null,
        reference: 'CR-2026-0001',
        cash_receipt_id: 1,
        cash_payment_id: null,
        is_manual: false,
        debit: 0,
        credit: 3000,
        balance: 3000,
        can: { update: false, delete: false, approve: false, send_back: false },
      },
    ],
    totals: { debit: 5000, credit: 3000 },
    closing_balance: 3000,
    pending: [],
    ...overrides,
  }
}

let wrapper: VueWrapper
let router: Router

async function mountView(path = '/accounts/parties/5') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'accounts' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/accounts/parties', name: 'accounts-parties', component: { template: '<div />' } },
      { path: '/accounts/parties/:id', name: 'accounts-party-ledger', component: PartyLedgerView },
      {
        path: '/accounts/cash/receive',
        name: 'accounts-cash-receipts',
        component: { template: '<div />' },
      },
      {
        path: '/accounts/cash/payment',
        name: 'accounts-cash-payments',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

beforeEach(() => {
  vi.mocked(fetchPartyLedger).mockResolvedValue(ledger())
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('PartyLedgerView', () => {
  it('shows the party, the summary and each line with its running balance', async () => {
    await mountView()

    expect(fetchPartyLedger).toHaveBeenCalledWith(5, { from: '', to: '' })
    expect(wrapper.find('h1').text()).toContain('Karim Traders')
    expect(wrapper.find('[data-card="receivable"]').text()).toContain('5,000.00')
    expect(wrapper.find('[data-card="closing"]').text()).toContain('3,000.00 Dr')
    expect(wrapper.find('[data-opening-row]').text()).toContain('1,000.00 Dr')

    const manual = wrapper.find('[data-line="11"]')
    expect(manual.text()).toContain('02-10-2026')
    expect(manual.text()).toContain('6,000.00 Dr')
    // Approved lines are locked: no edit or delete.
    expect(manual.find('[data-edit]').exists()).toBe(false)
    expect(manual.find('[data-delete]').exists()).toBe(false)
    expect(wrapper.find('[data-pending]').exists()).toBe(false)
    // Refunds are cash payments, never entered on the ledger.
    expect(wrapper.find('[data-add="refund"]').exists()).toBe(false)

    const fromReceipt = wrapper.find('[data-line="12"]')
    expect(fromReceipt.text()).toContain('CR-2026-0001')
    expect(fromReceipt.find('[data-edit]').exists()).toBe(false)
    expect(fromReceipt.find('[data-voucher]').text()).toBe('Receipt')
    expect(wrapper.find('[data-pay]').attributes('href')).toContain('new=1&party=5')

    expect(wrapper.find('[data-total-debit]').text()).toBe('5,000.00')
    expect(wrapper.find('[data-total-credit]').text()).toBe('3,000.00')
    expect(wrapper.find('tfoot [data-closing]').text()).toBe('3,000.00 Dr')
  })

  it('loads a date range from the URL', async () => {
    await mountView('/accounts/parties/5?from=2026-10-05&to=2026-10-31')

    expect(fetchPartyLedger).toHaveBeenCalledWith(5, { from: '2026-10-05', to: '2026-10-31' })
    expect(wrapper.find('[data-opening-row]').text()).toContain('Balance brought forward')
  })

  it('adds a receivable and reloads', async () => {
    vi.mocked(createPartyTransaction).mockResolvedValue({} as never)
    await mountView()

    await wrapper.find('[data-add="receivable"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'PartyTransactionDialog' })
    await dialog.find('[data-field="amount"] input').setValue('1500')
    await dialog.find('[data-field="note"] input').setValue('Medical fee')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(createPartyTransaction).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ type: 'receivable', amount: 1500, note: 'Medical fee' }),
    )
    expect(fetchPartyLedger).toHaveBeenCalledTimes(2)
  })

  it('lists entries waiting for approval apart, and edits or approves them', async () => {
    vi.mocked(updatePartyTransaction).mockResolvedValue({} as never)
    vi.mocked(approveEntry).mockResolvedValue()
    vi.mocked(fetchPartyLedger).mockResolvedValue(
      ledger({
        pending: [
          {
            id: 21,
            date: '2026-10-09',
            type: 'receivable',
            type_label: 'Receivable',
            note: 'Medical fee',
            reference: null,
            cash_receipt_id: null,
            cash_payment_id: null,
            is_manual: true,
            debit: 1500,
            credit: 0,
            status: 'rejected',
            status_label: 'Returned',
            prepared_by: 'Rina',
            returned_by: 'Head',
            return_reason: 'Wrong amount',
            can: { update: true, delete: true, approve: false, send_back: false },
          },
          {
            id: 22,
            date: '2026-10-10',
            type: 'payment',
            type_label: 'Payment received',
            note: null,
            reference: 'CR-2026-0009',
            cash_receipt_id: 9,
            cash_payment_id: null,
            is_manual: false,
            debit: 0,
            credit: 800,
            status: 'pending',
            status_label: 'Pending approval',
            prepared_by: 'Rina',
            returned_by: null,
            return_reason: null,
            can: { update: false, delete: false, approve: false, send_back: false },
          },
        ],
      }),
    )
    await mountView()

    const returned = wrapper.find('[data-pending-line="21"]')
    expect(returned.text()).toContain('Returned')
    expect(returned.find('[data-reason]').text()).toBe('“Wrong amount” — Head')
    expect(wrapper.find('[data-pending-line="22"] [data-voucher]').text()).toBe('Receipt')
    // Pending lines are not in the balance.
    expect(wrapper.find('tfoot [data-closing]').text()).toBe('3,000.00 Dr')

    await returned.find('[data-edit]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'PartyTransactionDialog' })
    expect((dialog.find('[data-field="amount"] input').element as HTMLInputElement).value).toBe(
      '1500.00',
    )
    await dialog.find('[data-field="amount"] input').setValue('1200')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(updatePartyTransaction).toHaveBeenCalledWith(21, {
      date: '2026-10-09',
      type: 'receivable',
      amount: 1200,
      note: 'Medical fee',
    })
  })

  it('lets an approver approve a pending hand-entered line', async () => {
    vi.mocked(approveEntry).mockResolvedValue()
    const line = {
      id: 31,
      date: '2026-10-11',
      type: 'receivable' as const,
      type_label: 'Receivable',
      note: null,
      reference: null,
      cash_receipt_id: null,
      cash_payment_id: null,
      is_manual: true,
      debit: 100,
      credit: 0,
      status: 'pending' as const,
      status_label: 'Pending approval',
      prepared_by: 'Rina',
      returned_by: null,
      return_reason: null,
      can: { update: true, delete: true, approve: true, send_back: true },
    }
    vi.mocked(fetchPartyLedger).mockResolvedValue(ledger({ pending: [line] }))
    await mountView()

    await wrapper.find('[data-pending-line="31"] [data-approve]').trigger('click')
    await flushPromises()

    expect(approveEntry).toHaveBeenCalledWith('party-transactions', 31)
    expect(fetchPartyLedger).toHaveBeenCalledTimes(2)
  })

  it('says when the party does not exist', async () => {
    vi.mocked(fetchPartyLedger).mockRejectedValue(httpError(404))
    await mountView()

    expect(wrapper.find('[data-error]').text()).toContain('This party does not exist.')
  })
})
