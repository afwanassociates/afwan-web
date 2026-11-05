import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ReferencesAdminView from '../ReferencesAdminView.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  createAdminReference,
  deleteAdminReference,
  listAdminReferences,
  updateAdminReference,
} from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Reference } from '@/types/passport'

vi.mock('@/api/references', () => ({
  listAdminReferences: vi.fn(),
  createAdminReference: vi.fn(),
  updateAdminReference: vi.fn(),
  deleteAdminReference: vi.fn(),
  searchReferences: vi.fn(async () => []),
}))

function reference(overrides: Partial<Reference> = {}): Reference {
  return {
    id: 1,
    code: 'PT-0001',
    type: 'agency',
    type_label: 'Agency',
    name: 'Sea Star Overseas',
    phone: '01711-000000',
    rl_number: 'RL 1234',
    notes: null,
    is_active: true,
    passports_count: 3,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const page = (data: Reference[]) => ({
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

async function mountView(path = '/admin/references') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'operation_head' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/references', name: 'admin-references', component: ReferencesAdminView },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    },
  )
  await flushPromises()
}

/** The dialog's last button is its confirm button. */
const confirmButton = () => {
  const buttons = wrapper.findComponent(ConfirmDialog).findAll('button')
  return buttons[buttons.length - 1]!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listAdminReferences).mockResolvedValue(page([reference()]))
})
afterEach(() => wrapper.unmount())

describe('References (operations head)', () => {
  it('lists every reference with its type, phone, passports and status', async () => {
    await mountView()

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual(['Reference', 'Phone', 'Passports', 'Status', 'Actions'])
    const row = wrapper.get('[data-reference="1"]')
    expect(row.text()).toContain('Sea Star Overseas')
    expect(row.text()).toContain('PT-0001 · Agency · RL RL 1234')
    expect(row.text()).toContain('01711-000000')
    expect(row.text()).toContain('3')
    expect(row.get('[data-active]').text()).toBe('Active')
  })

  it('filters by search, type and active status through the URL', async () => {
    await mountView('/admin/references?q=sea&type=agency&status=inactive')

    expect(listAdminReferences).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'sea', type: 'agency', is_active: 0, page: 1 }),
    )
    await wrapper.get('select[data-type-filter]').setValue('person')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      q: 'sea',
      type: 'person',
      status: 'inactive',
    })
    expect(listAdminReferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'person', is_active: 0 }),
    )
  })

  it('creates a reference with its type, name, phone and notes', async () => {
    vi.mocked(createAdminReference).mockResolvedValue(reference({ id: 2, name: 'Abdul Karim' }))
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-field="type"] input[value="person"]').setValue(true)
    await wrapper.get('[data-field="name"] input').setValue('  Abdul   Karim ')
    await wrapper.get('[data-field="phone"] input').setValue('01811-111111')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createAdminReference).toHaveBeenCalledWith({
      type: 'person',
      name: 'Abdul Karim',
      phone: '01811-111111',
      rl_number: null,
      notes: null,
    })
  })

  it('asks an agency for its RL number, and a person for none', async () => {
    vi.mocked(createAdminReference).mockResolvedValue(reference({ id: 2 }))
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-field="rl_number"]').exists()).toBe(false)
    await wrapper.get('[data-field="type"] input[value="agency"]').setValue(true)
    await wrapper.get('[data-field="name"] input').setValue('Sea Star')
    await wrapper.get('[data-field="phone"] input').setValue('01811-111111')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-field="rl_number"]').text()).toContain(
      'Enter the RL number of the agency.',
    )
    expect(createAdminReference).not.toHaveBeenCalled()

    await wrapper.get('[data-field="rl_number"] input').setValue(' RL 9 ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(createAdminReference).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agency', rl_number: 'RL 9' }),
    )
  })

  it('requires the name', async () => {
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-field="name"]').text()).toContain('Enter the reference name.')
    expect(wrapper.get('[data-field="phone"]').text()).toContain('Enter the phone number.')
    expect(createAdminReference).not.toHaveBeenCalled()
  })

  it('edits a reference, keeping its values in the form', async () => {
    vi.mocked(updateAdminReference).mockResolvedValue(reference({ phone: '01911-222222' }))
    await mountView()

    await wrapper.get('button[data-edit]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-field="name"] input').element as HTMLInputElement).value).toBe(
      'Sea Star Overseas',
    )
    expect((wrapper.get('[data-field="rl_number"] input').element as HTMLInputElement).value).toBe(
      'RL 1234',
    )
    await wrapper.get('[data-field="phone"] input').setValue('01911-222222')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateAdminReference).toHaveBeenCalledWith(1, {
      type: 'agency',
      name: 'Sea Star Overseas',
      phone: '01911-222222',
      rl_number: 'RL 1234',
      notes: null,
    })
  })

  it('deactivates a reference', async () => {
    vi.mocked(updateAdminReference).mockResolvedValue(reference({ is_active: false }))
    await mountView()

    await wrapper.get('[data-toggle-active="deactivate"]').trigger('click')
    await flushPromises()

    expect(updateAdminReference).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('offers Delete only for a reference without passports or accounts records', async () => {
    vi.mocked(listAdminReferences).mockResolvedValue(
      page([
        reference({ id: 1, can_delete: false }),
        reference({ id: 2, name: 'Unused', passports_count: 0, can_delete: true }),
      ]),
    )
    vi.mocked(deleteAdminReference).mockResolvedValue()
    await mountView()

    expect(wrapper.find('[data-reference="1"] [data-delete]').exists()).toBe(false)
    await wrapper.get('[data-reference="2"] [data-delete]').trigger('click')
    await confirmButton().trigger('click')
    await flushPromises()

    expect(deleteAdminReference).toHaveBeenCalledWith(2)
    expect(listAdminReferences).toHaveBeenCalledTimes(2)
  })

  it('explains a refused delete and offers to deactivate instead', async () => {
    vi.mocked(listAdminReferences).mockResolvedValue(page([reference({ can_delete: true })]))
    vi.mocked(deleteAdminReference).mockRejectedValue(
      httpError(422, {
        message:
          'This party has records in accounts, so it cannot be deleted. Deactivate it instead.',
        code: 'reference_has_accounts',
      }),
    )
    vi.mocked(updateAdminReference).mockResolvedValue(reference({ is_active: false }))
    await mountView()

    await wrapper.get('button[data-delete]').trigger('click')
    await confirmButton().trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-delete-blocked]').text()).toContain('records in accounts')
    expect(confirmButton().text()).toBe('Deactivate instead')
    await confirmButton().trigger('click')
    await flushPromises()
    expect(updateAdminReference).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('shows an error with a retry button', async () => {
    vi.mocked(listAdminReferences).mockRejectedValueOnce(httpError(500))
    await mountView()

    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.get('[data-error] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-reference="1"]').exists()).toBe(true)
  })
})
