import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ApprovalsView from '../ApprovalsView.vue'
import { approveEntry, fetchApprovals, returnEntry } from '@/api/accounts'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { ApprovalItem } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  fetchApprovals: vi.fn(),
  approveEntry: vi.fn(),
  returnEntry: vi.fn(),
  fetchApprovalSummary: vi.fn(async () => ({ pending: 0, returned_mine: 1, is_approver: true })),
}))

function item(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    type: 'cash-receipts',
    id: 5,
    kind: 'Cash receive',
    reference: 'CR-2026-0005',
    title: 'From Karim (PT-0001)',
    detail: 'Cash · Cash in hand',
    party_id: 1,
    direction: 'in',
    date: '2026-10-20',
    amount: 2500,
    note: null,
    status: 'pending',
    status_label: 'Pending approval',
    prepared_by: 'Rina',
    updated_by: 'Rina',
    returned_by: null,
    return_reason: null,
    created_at: '2026-10-20T08:00:00Z',
    can: { approve: true, send_back: true },
    approve_denied: null,
    ...overrides,
  }
}

let wrapper: VueWrapper
let router: Router

async function mountView(role: Role = 'accounts_head', path = '/accounts/approvals') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/accounts/approvals', name: 'accounts-approvals', component: ApprovalsView },
      { path: '/accounts/cash/receive', name: 'accounts-cash-receipts', component: Empty },
      { path: '/accounts/cash/payment', name: 'accounts-cash-payments', component: Empty },
      { path: '/accounts/cash/transfer', name: 'accounts-cash-transfers', component: Empty },
      { path: '/accounts/parties/:id', name: 'accounts-party-ledger', component: Empty },
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
  vi.mocked(fetchApprovals).mockResolvedValue([
    item(),
    item({
      type: 'cash-payments',
      id: 6,
      kind: 'Cash payment',
      reference: 'CP-2026-0002',
      direction: 'out',
      amount: 900,
      prepared_by: 'Head',
      can: { approve: false, send_back: true },
      approve_denied: 'You prepared or edited this entry, so someone else must approve it.',
    }),
  ])
  vi.mocked(approveEntry).mockResolvedValue()
  vi.mocked(returnEntry).mockResolvedValue()
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('ApprovalsView', () => {
  it('lists the pending entries with their totals', async () => {
    await mountView()

    expect(fetchApprovals).toHaveBeenCalledWith('pending', undefined)
    expect(wrapper.find('[data-summary]').text()).toContain('2 entries')
    expect(wrapper.find('[data-summary]').text()).toContain('3,400.00')
    const receipt = wrapper.find('[data-item="cash-receipts-5"]')
    expect(receipt.text()).toContain('CR-2026-0005')
    expect(receipt.text()).toContain('+ 2,500.00')
    expect(receipt.find('a').attributes('href')).toBe('/accounts/cash/receive?q=CR-2026-0005')
    // Your own entry: no Approve button, and the reason why.
    const own = wrapper.find('[data-item="cash-payments-6"]')
    expect(own.find('[data-approve]').exists()).toBe(false)
    expect(own.find('[data-approve-denied]').text()).toContain('someone else must approve')
  })

  it('approves an entry and reloads', async () => {
    await mountView()

    await wrapper.find('[data-item="cash-receipts-5"] [data-approve]').trigger('click')
    await flushPromises()

    expect(approveEntry).toHaveBeenCalledWith('cash-receipts', 5)
    expect(fetchApprovals).toHaveBeenCalledTimes(2)
  })

  it('shows why approving was refused', async () => {
    vi.mocked(approveEntry).mockRejectedValue(
      httpError(422, {
        message: 'Not enough cash in hand: the balance would be −৳400.00 on 06-10-2026.',
      }),
    )
    await mountView()

    await wrapper.find('[data-item="cash-receipts-5"] [data-approve]').trigger('click')
    await flushPromises()

    expect(useToast().toasts.value.map((t) => t.message)).toContain(
      'Not enough cash in hand: the balance would be −৳400.00 on 06-10-2026.',
    )
  })

  it('returns an entry with a reason', async () => {
    await mountView()

    await wrapper.find('[data-item="cash-payments-6"] [data-return]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'ReturnReasonDialog' })
    await dialog.find('form').trigger('submit')
    expect(dialog.text()).toContain('Write why it is returned')
    expect(returnEntry).not.toHaveBeenCalled()

    await dialog.find('textarea').setValue('  Wrong   payee ')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(returnEntry).toHaveBeenCalledWith('cash-payments', 6, 'Wrong payee')
  })

  it('shows the returned tab with the reason', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue([
      item({
        status: 'rejected',
        status_label: 'Returned',
        return_reason: 'Slip missing',
        returned_by: 'Head',
        can: { approve: false, send_back: false },
      }),
    ])
    await mountView('accounts', '/accounts/approvals?status=rejected')

    expect(fetchApprovals).toHaveBeenCalledWith('rejected', undefined)
    expect(wrapper.find('[data-reason]').text()).toBe('“Slip missing” — Head')
    expect(wrapper.find('[data-approve]').exists()).toBe(false)
  })

  it('is "My entries" for the accounts team, opening on what was returned to them', async () => {
    await mountView('accounts')

    expect(wrapper.find('h1').text()).toBe('My entries')
    expect(fetchApprovals).toHaveBeenCalledWith('rejected', undefined)
    expect(wrapper.findAll('[data-tab]').map((t) => t.text())).toEqual([
      'Returned to me',
      'Waiting for approval',
    ])

    await wrapper.find('[data-tab="pending"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ status: 'pending' })
    expect(fetchApprovals).toHaveBeenLastCalledWith('pending', undefined)
  })

  it('opens the approvers on the queue', async () => {
    await mountView('admin')

    expect(wrapper.find('h1').text()).toBe('Approvals')
    expect(fetchApprovals).toHaveBeenCalledWith('pending', undefined)
  })
})
