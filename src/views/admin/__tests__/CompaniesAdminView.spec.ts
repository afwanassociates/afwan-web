import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import CompaniesAdminView from '../CompaniesAdminView.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  createAdminCompany,
  deleteAdminCompany,
  listAdminCompanies,
  updateAdminCompany,
} from '@/api/companies'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { Company } from '@/types/passport'

vi.mock('@/api/companies', () => ({
  listAdminCompanies: vi.fn(),
  createAdminCompany: vi.fn(),
  updateAdminCompany: vi.fn(),
  deleteAdminCompany: vi.fn(),
  searchCompanies: vi.fn(async () => []),
}))
vi.mock('@/api/countries', () => ({
  fetchCountries: vi.fn(async () => [{ code: 'MY', name: 'Malaysia', is_pinned: true }]),
  fetchDefaults: vi.fn(async () => ({
    default_company_country_code: 'MY',
    default_passport_country_code: null,
  })),
}))

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 1,
    name: 'ABC Sdn Bhd',
    country: { code: 'MY', name: 'Malaysia' },
    quota: 10,
    is_active: true,
    passports_count: 4,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const page = (data: Company[]) => ({
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

async function mountView(path = '/admin/companies') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'admin' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/companies', name: 'admin-companies', component: CompaniesAdminView },
      { path: '/reports/companies', name: 'companies', component: { template: '<div />' } },
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
  vi.mocked(listAdminCompanies).mockResolvedValue(page([company()]))
})
afterEach(() => wrapper.unmount())

describe('Admin › Companies', () => {
  it('lists every company with its quota, passports and status (no agent columns)', async () => {
    await mountView()

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual(['Company', 'Quota', 'Passports', 'Status', 'Actions'])
    const row = wrapper.get('[data-company="1"]')
    expect(row.text()).toContain('ABC Sdn Bhd')
    expect(row.text()).toContain('10')
    expect(row.get('[data-active]').text()).toBe('Active')
  })

  it('filters by search and active status through the URL', async () => {
    await mountView('/admin/companies?q=abc&status=inactive')

    expect(listAdminCompanies).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'abc', is_active: 0, page: 1 }),
    )
    await wrapper.get('select[data-status-filter]').setValue('active')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'abc', status: 'active' })
    expect(listAdminCompanies).toHaveBeenLastCalledWith(expect.objectContaining({ is_active: 1 }))
  })

  it('creates a company with only the name, country and quota', async () => {
    vi.mocked(createAdminCompany).mockResolvedValue(company({ id: 2, name: 'New Co' }))
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    const fields = wrapper.findAll('form label').map((l) => l.text().replace(/\s+/g, ' ').trim())
    expect(fields).toEqual(['Company name *', 'Quota *', 'Country *'])
    expect(wrapper.find('[data-field="is_active"]').exists()).toBe(false)
    await wrapper.get('[data-field="name"] input').setValue('New Co')
    await wrapper.get('[data-field="quota"] input').setValue('5')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createAdminCompany).toHaveBeenCalledWith({
      name: 'New Co',
      country_code: 'MY',
      quota: 5,
    })
  })

  it.each([
    ['', 'Enter the quota (the number of workers the company needs).'],
    ['0', 'The quota must be at least 1.'],
    ['2.5', 'The quota must be a whole number.'],
  ])('requires a valid quota (%j)', async (value, message) => {
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-field="name"] input').setValue('New Co')
    await wrapper.get('[data-field="quota"] input').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-field="quota"]').text()).toContain(message)
    expect(createAdminCompany).not.toHaveBeenCalled()
  })

  it('deactivates a company', async () => {
    vi.mocked(updateAdminCompany).mockResolvedValue(company({ is_active: false }))
    await mountView()

    await wrapper.get('[data-toggle-active="deactivate"]').trigger('click')
    await flushPromises()

    expect(updateAdminCompany).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('explains a blocked delete and offers to deactivate instead', async () => {
    vi.mocked(deleteAdminCompany).mockRejectedValue(
      httpError(422, {
        message: 'This company has passports, so it cannot be deleted. Deactivate it instead.',
        code: 'company_has_passports',
      }),
    )
    vi.mocked(updateAdminCompany).mockResolvedValue(company({ is_active: false }))
    await mountView()

    await wrapper.get('button[data-delete]').trigger('click')
    await confirmButton().trigger('click')
    await flushPromises()

    const message = wrapper.get('[data-delete-blocked]').text()
    expect(message).toContain("has passports, so it can't be deleted")
    expect(confirmButton().text()).toBe('Deactivate instead')

    await confirmButton().trigger('click')
    await flushPromises()
    expect(updateAdminCompany).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('shows an error with a retry button', async () => {
    vi.mocked(listAdminCompanies).mockRejectedValueOnce(httpError(500))
    await mountView()

    expect(wrapper.find('[data-error]').exists()).toBe(true)
    await wrapper.get('[data-error] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-company="1"]').exists()).toBe(true)
  })
})
