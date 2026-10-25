import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PartiesView from '../PartiesView.vue'
import { createParty, deleteParty, listParties, updateParty } from '@/api/accounts'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { Party } from '@/types/accounts'

vi.mock('@/api/accounts', () => ({
  listParties: vi.fn(),
  createParty: vi.fn(),
  updateParty: vi.fn(),
  deleteParty: vi.fn(),
}))

function party(overrides: Partial<Party> = {}): Party {
  return {
    id: 1,
    code: 'PT-0001',
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
      refund: 200,
      loan: 0,
      capital: 0,
      loan_repayment: 0,
      drawing: 0,
      closing_balance: 3200,
    },
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const page = (data: Party[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: data.length,
    from: 1,
    to: data.length,
  },
})

let wrapper: VueWrapper
let router: Router

async function mountView(role: Role = 'accounts', path = '/accounts/parties') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/accounts/parties', name: 'accounts-parties', component: PartiesView },
      {
        path: '/accounts/parties/:id',
        name: 'accounts-party-ledger',
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
  vi.mocked(listParties).mockResolvedValue(page([party()]))
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('PartiesView', () => {
  it('lists clients with their totals and closing balance', async () => {
    await mountView()

    expect(listParties).toHaveBeenCalledWith(expect.objectContaining({ type: 'client', page: 1 }))
    const row = wrapper.find('[data-party="1"]')
    expect(row.text()).toContain('PT-0001')
    expect(row.text()).toContain('Karim Traders')
    expect(row.text()).toContain('1,000.00 Dr')
    expect(row.text()).toContain('5,000.00')
    expect(row.find('[data-closing]').text()).toBe('3,200.00 Dr')
    // Only admins may delete.
    expect(row.find('[data-delete]').exists()).toBe(false)
  })

  it('switches to the owners tab', async () => {
    await mountView()

    await wrapper.find('[data-tab="owner"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ type: 'owner' })
    expect(listParties).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'owner' }))
    expect(wrapper.find('[data-create]').text()).toBe('New owner')
  })

  it('creates a party with the form', async () => {
    vi.mocked(createParty).mockResolvedValue(party({ id: 2, code: 'PT-0002' }))
    await mountView()

    await wrapper.find('[data-create]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'PartyFormDialog' })
    await dialog.find('[data-field="name"] input').setValue('  Rahim   Uddin ')
    await dialog.find('[data-field="mobile"] input').setValue('01811-111111')
    await dialog.find('[data-field="address"] input').setValue('Feni')
    await dialog.find('[data-field="nid_passport"] input').setValue('ab 12 34')
    await dialog.find('[data-field="opening_balance"] input').setValue('500')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(createParty).toHaveBeenCalledWith({
      type: 'client',
      name: 'Rahim Uddin',
      mobile: '01811-111111',
      address: 'Feni',
      nid_passport: 'AB1234',
      tin_bin: null,
      opening_balance: 500,
      opening_balance_type: 'receivable',
    })
    expect(listParties).toHaveBeenCalledTimes(2)
  })

  it('checks the form before sending', async () => {
    await mountView()

    await wrapper.find('[data-create]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'PartyFormDialog' })
    await dialog.find('[data-field="mobile"] input').setValue('call me')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(createParty).not.toHaveBeenCalled()
    expect(dialog.find('[data-field="name"]').text()).toContain('Enter the name.')
    expect(dialog.find('[data-field="mobile"]').text()).toContain('valid mobile')
    expect(dialog.find('[data-field="nid_passport"]').text()).toContain('Enter the NID')
  })

  it('deactivates a party', async () => {
    vi.mocked(updateParty).mockResolvedValue(party({ is_active: false }))
    await mountView()

    await wrapper.find('[data-toggle-active="deactivate"]').trigger('click')
    await flushPromises()

    expect(updateParty).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('lets the accounts head delete, and offers to deactivate a party with transactions', async () => {
    vi.mocked(deleteParty).mockRejectedValue(httpError(422, { code: 'party_has_transactions' }))
    vi.mocked(updateParty).mockResolvedValue(party({ is_active: false }))
    await mountView('accounts_head')

    await wrapper.find('[data-delete]').trigger('click')
    await flushPromises()
    const confirm = () =>
      wrapper.findAll('dialog button').find((b) => /Delete|Deactivate instead/.test(b.text()))!
    await confirm().trigger('click')
    await flushPromises()

    expect(deleteParty).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-delete-blocked]').exists()).toBe(true)

    await confirm().trigger('click')
    await flushPromises()
    expect(updateParty).toHaveBeenCalledWith(1, { is_active: false })
  })
})
